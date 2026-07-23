import type { CutoutParams } from '@/algorithm/types'
import {
  paidToolReceiptSchema,
  paidToolExecutionPrompt,
  planPaidTool,
  type MoneyEstimate,
  type PaidToolExecutorCapability,
  type PaidToolPolicy,
  type PaidToolReceipt,
  type PaidToolRequest,
} from '@/control-protocol/paid-tool-contract'
import { createRunEvent, type AgentRunEvent } from '@/agent-runtime/run-events'
import type { GeneratedAsset } from '@/services/ai/types'
import type { CutoutSlice, ServiceRegistry } from '@/services/types'
import type { PermissionBroker } from '@/tool-sandbox/broker'

export interface DesktopToolArtifact {
  readonly id: string
  readonly mediaType: string
  readonly bytes: Uint8Array
}

export interface DesktopToolArtifactStore {
  read(id: string): Promise<DesktopToolArtifact | null>
  write(input: {
    readonly mediaType: string
    readonly bytes: Uint8Array
    readonly source: 'generate-image' | 'edit-image' | 'cutout'
    readonly runId: string
  }): Promise<string>
  /** Optional atomic batch. Implementations must publish all ids or none. */
  writeBatch?(inputs: readonly {
    readonly mediaType: string
    readonly bytes: Uint8Array
    readonly source: 'generate-image' | 'edit-image' | 'cutout'
    readonly runId: string
  }[]): Promise<readonly string[]>
}

export interface CutoutResultSink {
  /**
   * Publish a completed cutout to the product state in one transaction.
   * The executor calls this only after output artifacts exist and a final
   * revision/abort guard passes.
   */
  commit(input: {
    readonly execution: DesktopToolExecution
    readonly slices: readonly CutoutSlice[]
    readonly outputArtifactIds: readonly string[]
    readonly maskArtifactId?: string
    readonly providerRoute?: string
  }): void | Promise<void>
}

export interface DesktopToolExecution {
  readonly requestId: string
  readonly runId: string
  readonly toolCallId: string
  readonly label: string
  readonly stepId?: string
  readonly expectedRevision: number
  readonly request: PaidToolRequest
  readonly approvalGranted: boolean
  readonly policy: PaidToolPolicy
  readonly signal?: AbortSignal
  readonly cutoutParams?: CutoutParams
  readonly capabilityLeaseId?: string
  readonly requestDigest?: string
  readonly expectedSourceImageId?: string
}

export type DesktopToolExecutionResult =
  | { readonly ok: true; readonly receipt: PaidToolReceipt; readonly events: readonly AgentRunEvent[] }
  | { readonly ok: false; readonly error: string; readonly receipt?: PaidToolReceipt; readonly events: readonly AgentRunEvent[] }

export interface ToolExecutor {
  capabilities(): Promise<readonly PaidToolExecutorCapability[]>
  execute(input: DesktopToolExecution): Promise<DesktopToolExecutionResult>
}

export interface ToolExecutorRegistry {
  executor(capability: PaidToolRequest['capability']): Promise<ToolExecutor | undefined>
  execute(input: DesktopToolExecution): Promise<DesktopToolExecutionResult>
}

export interface DesktopToolExecutorDependencies {
  readonly services: Pick<
    ServiceRegistry,
    'providers' | 'generation' | 'cutout' | 'foregroundSegmentation'
  >
  readonly artifacts: DesktopToolArtifactStore
  readonly capabilities: () => Promise<readonly PaidToolExecutorCapability[]>
  readonly currentRevision: () => number
  readonly now?: () => number
  readonly id?: () => string
  readonly decodeBitmap?: (artifact: DesktopToolArtifact) => Promise<ImageBitmap>
  readonly cutoutResultSink?: CutoutResultSink
  /** Host-owned authorization boundary. When configured, every paid action
   * must present a short-lived lease bound to this exact request digest. */
  readonly permissionBroker?: PermissionBroker
}

export function createDesktopToolExecutor(
  dependencies: DesktopToolExecutorDependencies,
): ToolExecutor {
  const now = dependencies.now ?? Date.now
  const id = dependencies.id ?? (() => crypto.randomUUID())

  return {
    capabilities: dependencies.capabilities,
    async execute(input) {
      const startedAt = now()
      if (dependencies.permissionBroker) {
        if (!input.capabilityLeaseId || !input.requestDigest) {
          return failure(input, 'A capability lease bound to this request is required.', startedAt)
        }
        const authorization = dependencies.permissionBroker.authorize(input.capabilityLeaseId, {
          subject: input.runId,
          requestDigest: input.requestDigest,
          requiredScopes: isLocalCutout(input.request.capability) ? ['paid'] : ['paid', 'credential'],
        })
        if (authorization.decision !== 'allowed') {
          return failure(input, authorization.reason ?? 'Capability authorization failed.', startedAt)
        }
      }
      const capability = (await dependencies.capabilities()).find((item) =>
        item.capability === input.request.capability
        && (!input.request.providerId || item.providerId === input.request.providerId)
        && (!input.request.model || item.model === input.request.model))
      const plan = planPaidTool(input.request, capability, input.policy, input.approvalGranted)
      if (!plan.executable || !capability) return failure(input, plan.reason ?? 'Tool execution is not authorized.', startedAt)
      if (dependencies.currentRevision() !== input.expectedRevision) {
        return failure(input, `Expected revision ${input.expectedRevision}, current revision is ${dependencies.currentRevision()}.`, startedAt)
      }
      if (input.signal?.aborted) return cancelled(input, capability, startedAt, now(), id())

      if (capability.model !== (input.request.model ?? capability.model)) {
        return failure(input, 'The selected model does not match the approved route.', startedAt)
      }
      if (!isLocalCutout(input.request.capability)) {
        const providers = await dependencies.services.providers.list()
        const provider = providers.find((item) => item.id === capability.providerId && item.enabled)
        if (!provider || (input.request.providerId && provider.id !== input.request.providerId)) {
          return failure(input, 'The selected provider is unavailable.', startedAt)
        }
        const keyStatus = await dependencies.services.providers.status(provider.id)
        if (!keyStatus.hasKey) return failure(input, 'The selected provider requires a configured credential.', startedAt)
      }

      const started = createRunEvent(input.runId, {
        type: 'tool-started', toolCallId: input.toolCallId, tool: input.request.capability,
        label: input.label, stepId: input.stepId,
        model: { providerId: capability.providerId, model: capability.model },
      }, { eventId: `event:${input.requestId}:tool-started`, at: startedAt })

      try {
        const executionOutput = await executeCapability(dependencies, input, capability)
        if (input.signal?.aborted) return cancelled(input, capability, startedAt, now(), id(), [started])
        if (dependencies.currentRevision() !== input.expectedRevision) {
          return failure(input, 'The project changed while the paid tool was running; its output was not published.', startedAt, [started], capability, now(), id())
        }
        const evidenceRefs = executionOutput.evidenceAssets
          ? await writeAssets(dependencies.artifacts, executionOutput.evidenceAssets, input, 'cutout')
          : []
        const outputRefs = await writeAssets(
          dependencies.artifacts,
          executionOutput.assets,
          input,
          artifactSource(input.request.capability),
        )
        if (input.signal?.aborted) return cancelled(input, capability, startedAt, now(), id(), [started])
        if (dependencies.currentRevision() !== input.expectedRevision) {
          return failure(input, 'The project changed while the tool output was being prepared; its result was not published.', startedAt, [started], capability, now(), id())
        }
        if (executionOutput.cutoutSlices && dependencies.cutoutResultSink) {
          await dependencies.cutoutResultSink.commit({
            execution: input,
            slices: executionOutput.cutoutSlices,
            outputArtifactIds: outputRefs,
            maskArtifactId: evidenceRefs[0],
            providerRoute: executionOutput.providerRoute,
          })
        }
        const receipt = receiptFor(input, capability, 'succeeded', capability.estimatedCost, outputRefs, startedAt, now(), id())
        const succeeded = createRunEvent(input.runId, {
          type: 'tool-succeeded', toolCallId: input.toolCallId, tool: input.request.capability,
          label: input.label, stepId: input.stepId, outputRefs, receipt,
        }, { eventId: `event:${input.requestId}:tool-succeeded`, at: receipt.completedAt })
        const materialKind = isLocalCutout(input.request.capability) ? 'cutout-slice' as const : 'prototype-page' as const
        const materials = outputRefs.map((outputRef, index) => createRunEvent(input.runId, {
          type: 'material-recorded', material: {
            id: outputRef, kind: materialKind, label: `${input.label} ${index + 1}`,
            source: isLocalCutout(input.request.capability) ? 'algorithm' as const : 'agent' as const,
            evidenceKey: input.toolCallId,
          },
        }, { eventId: `event:${input.requestId}:material:${index}`, at: receipt.completedAt }))
        return { ok: true, receipt, events: [started, succeeded, ...materials] }
      } catch (error) {
        if (input.signal?.aborted || isAbort(error)) return cancelled(input, capability, startedAt, now(), id(), [started])
        return failure(input, errorText(error), startedAt, [started], capability, now(), id())
      }
    },
  }
}

export function createToolExecutorRegistry(executors: readonly ToolExecutor[]): ToolExecutorRegistry {
  return {
    async executor(capability) {
      for (const executor of executors) {
        if ((await executor.capabilities()).some((item) => item.capability === capability)) return executor
      }
      return undefined
    },
    async execute(input) {
      const executor = await this.executor(input.request.capability)
      if (executor) return executor.execute(input)
      return failure(input, `No desktop executor is registered for ${input.request.capability}.`, Date.now())
    },
  }
}

async function executeCapability(
  dependencies: DesktopToolExecutorDependencies,
  input: DesktopToolExecution,
  capability: PaidToolExecutorCapability,
): Promise<{
  readonly assets: readonly GeneratedAsset[]
  readonly cutoutSlices?: readonly CutoutSlice[]
  readonly evidenceAssets?: readonly GeneratedAsset[]
  readonly providerRoute?: string
}> {
  if (input.request.capability === 'generate-image') {
    const result = await dependencies.services.generation.generateImages({
      providerId: capability.providerId, model: capability.model, prompt: paidToolExecutionPrompt(input.request), signal: input.signal,
    })
    if (!result.ok) throw new Error(result.error)
    return { assets: result.data }
  }
  const source = await firstArtifact(dependencies.artifacts, input.request.inputArtifactIds)
  if (!source) throw new Error('The paid tool requires an input image artifact.')
  if (input.request.capability === 'edit-image') {
    const result = await dependencies.services.generation.editImage({
      providerId: capability.providerId, model: capability.model, prompt: paidToolExecutionPrompt(input.request),
      images: [source.bytes], signal: input.signal,
    })
    if (!result.ok) throw new Error(result.error)
    return { assets: result.data }
  }
  let cutoutSource = source
  let evidenceAssets: readonly GeneratedAsset[] | undefined
  let providerRoute = 'local/cutout-v1'
  if (input.request.capability === 'semantic-cutout') {
    const segmentation = dependencies.services.foregroundSegmentation
    if (!segmentation) {
      throw new Error('capability-required: foreground segmentation is unavailable on this host.')
    }
    const capabilities = await segmentation.capabilities()
    if (!capabilities.ok || !capabilities.data.available) {
      throw new Error(capabilities.ok
        ? capabilities.data.reason ?? 'capability-required: foreground segmentation is unavailable on this host.'
        : capabilities.error)
    }
    const segmented = await segmentation.segment({ bytes: source.bytes, signal: input.signal })
    if (!segmented.ok) throw new Error(segmented.error)
    const bytes = new Uint8Array(await segmented.data.png.arrayBuffer())
    cutoutSource = { id: `${source.id}:foreground`, mediaType: 'image/png', bytes }
    evidenceAssets = [{ mediaType: 'image/png', bytes }]
    providerRoute = 'local/apple-vision-foreground-v1'
  }
  const decode = dependencies.decodeBitmap ?? defaultDecodeBitmap
  const bitmap = await decode(cutoutSource)
  const result = await dependencies.services.cutout.run({
    bitmap, params: input.cutoutParams ?? defaultCutoutParams(), signal: input.signal,
  })
  if (!result.ok) throw new Error(result.error)
  const assets = await Promise.all(result.data.slices.map(async (slice) => ({
    mediaType: 'image/png', bytes: new Uint8Array(await slice.png.arrayBuffer()),
  })))
  return { assets, cutoutSlices: result.data.slices, evidenceAssets, providerRoute }
}

async function writeAssets(store: DesktopToolArtifactStore, assets: readonly GeneratedAsset[], input: DesktopToolExecution, source: 'generate-image' | 'edit-image' | 'cutout') {
  if (assets.length === 0) throw new Error('The tool returned no material output.')
  const writes = assets.map((asset) => ({ ...asset, source, runId: input.runId }))
  const refs = store.writeBatch
    ? [...await store.writeBatch(writes)]
    : await Promise.all(writes.map((asset) => store.write(asset)))
  if (refs.length !== assets.length) throw new Error('The artifact store did not commit the complete tool output.')
  if (refs.length === 0) throw new Error('The tool returned no material output.')
  return refs
}

async function firstArtifact(store: DesktopToolArtifactStore, ids: readonly string[]) {
  for (const id of ids) {
    const artifact = await store.read(id)
    if (artifact) return artifact
  }
  return null
}

async function defaultDecodeBitmap(artifact: DesktopToolArtifact): Promise<ImageBitmap> {
  const bytes = artifact.bytes.slice()
  return createImageBitmap(new Blob([bytes], { type: artifact.mediaType }))
}

function defaultCutoutParams(): CutoutParams {
  return { threshold: 246, minArea: 900, mergeGap: 18, padding: 10 }
}

function receiptFor(input: DesktopToolExecution, capability: PaidToolExecutorCapability, status: PaidToolReceipt['status'], charged: MoneyEstimate, outputArtifactIds: readonly string[], startedAt: number, completedAt: number, receiptId: string): PaidToolReceipt {
  return paidToolReceiptSchema.parse({ receiptId, requestId: input.requestId, capability: input.request.capability, providerId: capability.providerId, model: capability.model, status, charged, outputArtifactIds, startedAt, completedAt })
}

function failure(input: DesktopToolExecution, error: string, startedAt: number, preceding: readonly AgentRunEvent[] = [], capability?: PaidToolExecutorCapability, completedAt = startedAt, receiptId = `receipt:${input.requestId}`): DesktopToolExecutionResult {
  const receipt = capability ? receiptFor(input, capability, 'failed', { currency: capability.estimatedCost.currency, amount: 0, credits: 0 }, [], startedAt, completedAt, receiptId) : undefined
  const event = createRunEvent(input.runId, { type: 'tool-failed', toolCallId: input.toolCallId, tool: input.request.capability, label: input.label, stepId: input.stepId, detail: error, receipt }, { eventId: `event:${input.requestId}:tool-failed`, at: completedAt })
  return { ok: false, error, receipt, events: [...preceding, event] }
}

function cancelled(input: DesktopToolExecution, capability: PaidToolExecutorCapability, startedAt: number, completedAt: number, receiptId: string, preceding: readonly AgentRunEvent[] = []): DesktopToolExecutionResult {
  const receipt = receiptFor(input, capability, 'cancelled', { currency: capability.estimatedCost.currency, amount: 0, credits: 0 }, [], startedAt, completedAt, receiptId)
  const event = createRunEvent(input.runId, { type: 'tool-cancelled', toolCallId: input.toolCallId, tool: input.request.capability, label: input.label, stepId: input.stepId, detail: 'Tool execution was cancelled.', receipt }, { eventId: `event:${input.requestId}:tool-cancelled`, at: completedAt })
  return { ok: false, error: 'Tool execution was cancelled.', receipt, events: [...preceding, event] }
}

function isAbort(error: unknown): boolean { return error instanceof DOMException && error.name === 'AbortError' }
function errorText(error: unknown): string { return error instanceof Error ? error.message : String(error) }
function isLocalCutout(capability: PaidToolRequest['capability']): boolean {
  return capability === 'cutout' || capability === 'semantic-cutout'
}
function artifactSource(
  capability: PaidToolRequest['capability'],
): 'generate-image' | 'edit-image' | 'cutout' {
  switch (capability) {
    case 'cutout':
    case 'semantic-cutout':
      return 'cutout'
    case 'generate-image':
    case 'edit-image':
      return capability
  }
}

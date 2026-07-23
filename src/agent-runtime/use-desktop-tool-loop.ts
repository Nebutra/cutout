import { useCallback, useEffect, useMemo, useRef } from 'react'
import { createDesktopToolLoop, type DesktopToolLoop } from './desktop-tool-loop'
import {
  composerRouteToPaidToolRequest,
  desktopPaidToolCapabilities,
  type MoneyEstimate,
  type PaidToolCapability,
  type PaidToolExecutorCapability,
  type PaidToolPolicy,
  type PaidToolRequest,
} from '@/control-protocol/paid-tool-contract'
import { createDesktopToolExecutor, createToolExecutorRegistry, type CutoutResultSink, type DesktopToolArtifact } from '@/services/desktop-tool-executor'
import type { ModelAssignment, ModelAssignments } from '@/services/ai/model-assignment-types'
import type { ProviderConfig } from '@/services/ai/provider-types'
import type { ServiceRegistry } from '@/services/types'
import type { AgentRunEvent } from './run-events'
import { ContentAddressedDesktopArtifactStore, parseArtifactId } from '@/services/content-addressed-desktop-artifacts'
import { approveFirstVisualCandidate, createDesktopVisualToolInvoker, createStorageVisualExecutionStore, createVisualTaskRuntime } from '@/visual-generation'
import { PermissionBroker } from '@/tool-sandbox/broker'
import { getAuthorizedWorkspace } from '@/platform/authorized-workspace'
import { createTauriAgentHostService } from '@/agent-host/tauri-service'
import { runDurableHostEffect } from '@/agent-host/durable-effect'

const DESKTOP_TOOL_TIMEOUT_MS = 300_000
const ZERO_USD_ESTIMATE: MoneyEstimate = { currency: 'USD', amount: 0 }
const DESKTOP_PAID_TOOL_POLICY: PaidToolPolicy = { allowPaid: true }

function capabilityEstimate(
  capabilities: readonly PaidToolExecutorCapability[],
  capability: PaidToolCapability,
): MoneyEstimate | undefined {
  return capabilities.find((candidate) =>
    candidate.capability === capability && candidate.available
  )?.estimatedCost
}

export function createExplicitDesktopVisualBudget(
  capabilities: readonly PaidToolExecutorCapability[],
): { readonly ceiling: MoneyEstimate } {
  const generate = capabilityEstimate(capabilities, 'generate-image')
  const edit = capabilityEstimate(capabilities, 'edit-image')
  if (!generate || !edit || generate.currency !== edit.currency) {
    return { ceiling: ZERO_USD_ESTIMATE }
  }
  return {
    ceiling: {
      currency: generate.currency,
      amount: generate.amount + edit.amount,
      ...(
        generate.credits !== undefined || edit.credits !== undefined
          ? { credits: (generate.credits ?? 0) + (edit.credits ?? 0) }
          : {}
      ),
    },
  }
}

export interface DesktopToolInvocation {
  readonly runId: string
  readonly toolCallId: string
  readonly label: string
  readonly capability: PaidToolCapability
  readonly intent: string
  readonly prompt?: string
  readonly image: ModelAssignment
  readonly inputs?: readonly { readonly id: string; readonly mediaType: string; readonly bytes: Uint8Array }[]
  readonly signal?: AbortSignal
  readonly expectedSourceImageId?: string
}

export function createExplicitDesktopPaidToolRequest(input: {
  readonly capability: PaidToolCapability
  readonly intent: string
  readonly prompt?: string
  readonly image: ModelAssignment
  readonly inputArtifactIds?: readonly string[]
  readonly capabilities: readonly PaidToolExecutorCapability[]
}): PaidToolRequest {
  const budgetCeiling = input.capabilities.find((candidate) =>
    candidate.capability === input.capability
    && candidate.providerId === input.image.providerId
    && candidate.model === input.image.model
  )?.estimatedCost ?? ZERO_USD_ESTIMATE

  return composerRouteToPaidToolRequest({
    capability: input.capability,
    intent: input.intent,
    prompt: input.prompt,
    image: input.image,
    inputArtifactIds: input.inputArtifactIds,
    budgetCeiling,
    approvalPolicy: 'explicit',
  })
}

export function useDesktopToolLoop(input: {
  readonly services: Pick<
    ServiceRegistry,
    'providers' | 'generation' | 'cutout' | 'foregroundSegmentation'
  >
  readonly providers: readonly ProviderConfig[]
  readonly assignments: ModelAssignments
  readonly revision: number
  readonly append: (events: readonly AgentRunEvent[]) => void
  readonly cutoutResultSink?: CutoutResultSink
}) {
  const state = useRef(input)
  state.current = input
  const artifacts = useRef<ContentAddressedDesktopArtifactStore | null>(null)
  if (!artifacts.current) artifacts.current = new ContentAddressedDesktopArtifactStore(indexedDB)
  const permissionBroker = useMemo(() => new PermissionBroker({ capabilities: {
    canonicalWorkspaceRoot: true, symlinkBoundary: true, commandAllowlist: true,
    environmentAllowlist: true, wallClockTimeout: true, byteLimit: true,
    processTreeCancellation: 'supported', cpuLimit: 'capability-required',
    networkIsolation: 'capability-required',
  } }), [])
  const semanticCutoutAvailable = useRef(false)
  useEffect(() => {
    let current = true
    void input.services.foregroundSegmentation?.capabilities().then((result) => {
      if (current) semanticCutoutAvailable.current = result.ok && result.data.available
    })
    return () => { current = false }
  }, [input.services.foregroundSegmentation])
  const authorize = useCallback(async (runId: string, requestId: string, request: PaidToolRequest, approvalId: string) => {
    const requestDigest = await digestRequest({ runId, requestId, revision: state.current.revision, request })
    const issuedAt = Date.now(), lease = permissionBroker.issue({ version: 'cutout.capability-lease.v1', leaseId: `lease:${requestId}`, approvalId, subject: runId, requestDigest, scopes: isLocalCutout(request.capability) ? ['paid'] : ['paid', 'credential'], workspaceRoot: 'authorized-workspace', allowedPaths: [], allowedCommands: [], allowedHosts: [], limits: { maxDurationMs: 600_000, maxBytes: 100_000_000, maxProcesses: 1 }, issuedAt, expiresAt: issuedAt + 600_000 })
    return { capabilityLeaseId: lease.leaseId, requestDigest }
  }, [permissionBroker])
  const capabilities = useCallback((): readonly PaidToolExecutorCapability[] => [
    ...desktopPaidToolCapabilities(state.current.providers, state.current.assignments),
    { capability: 'cutout', providerId: 'local', model: 'cutout-v1', available: true, estimatedCost: ZERO_USD_ESTIMATE },
    { capability: 'semantic-cutout', providerId: 'local', model: 'apple-vision-foreground-v1', available: semanticCutoutAvailable.current, estimatedCost: ZERO_USD_ESTIMATE },
  ], [])
  const loop = useMemo<DesktopToolLoop>(() => {
    const store = artifacts.current!
    const executor = createDesktopToolExecutor({
      services: state.current.services,
      artifacts: store,
      capabilities: async () => capabilities(),
      currentRevision: () => state.current.revision,
      cutoutResultSink: state.current.cutoutResultSink,
      permissionBroker,
    })
    return createDesktopToolLoop({
      executors: createToolExecutorRegistry([executor]),
      currentRevision: () => state.current.revision,
      policy: () => DESKTOP_PAID_TOOL_POLICY,
      append: (events) => state.current.append(events),
      timeoutMs: DESKTOP_TOOL_TIMEOUT_MS,
      authorize: (request, approvalId) => authorize(
        request.runId,
        request.requestId,
        request.request,
        approvalId,
      ),
    })
  }, [authorize, capabilities, permissionBroker])

  const visualRuntime = useMemo(() => {
    const visualCapabilities = desktopPaidToolCapabilities(input.providers, input.assignments)
    const estimate = (capability: 'generate-image' | 'edit-image') => capabilityEstimate(visualCapabilities, capability) ?? ZERO_USD_ESTIMATE
    return createVisualTaskRuntime({
      tools: createDesktopVisualToolInvoker({ loop, expectedRevision: () => state.current.revision, estimateFor: estimate,
        resolveArtifact: async (artifactId) => { const artifact = await artifacts.current!.read(artifactId), sha256 = parseArtifactId(artifactId); if (!artifact || !sha256) throw new Error('Promoted visual artifact is unavailable.'); return { artifactId, sha256, mediaType: artifact.mediaType, provenanceId: `provenance:${sha256}` } },
      }),
      reviewer: approveFirstVisualCandidate('agent'), store: createStorageVisualExecutionStore(localStorage), estimates: { generate: estimate('generate-image'), edit: estimate('edit-image') }, append: (events) => state.current.append(events),
    })
  }, [input.assignments, input.providers, loop])

  async function invoke(invocation: DesktopToolInvocation): Promise<readonly DesktopToolArtifact[]> {
    invocation.signal?.throwIfAborted()
    if (invocation.capability === 'semantic-cutout') {
      const availability = await state.current.services.foregroundSegmentation?.capabilities()
      semanticCutoutAvailable.current = Boolean(availability?.ok && availability.data.available)
      if (!availability?.ok || !availability.data.available) {
        throw new Error(availability?.ok
          ? availability.data.reason ?? 'capability-required: foreground segmentation is unavailable on this host.'
          : availability?.error ?? 'capability-required: foreground segmentation is unavailable on this host.')
      }
    }
    invocation.signal?.throwIfAborted()
    const inputIds = await Promise.all((invocation.inputs ?? []).map((artifact) => artifacts.current!.write({ ...artifact, source: 'edit-image', runId: invocation.runId })))
    invocation.signal?.throwIfAborted()
    const requestId = crypto.randomUUID()
    const request = createExplicitDesktopPaidToolRequest({
      capability: invocation.capability,
      intent: invocation.intent,
      prompt: invocation.prompt,
      image: isLocalCutout(invocation.capability)
        ? {
            providerId: 'local',
            model: invocation.capability === 'semantic-cutout'
              ? 'apple-vision-foreground-v1'
              : 'cutout-v1',
          }
        : invocation.image,
      inputArtifactIds: inputIds,
      capabilities: capabilities(),
    })
    const execute=async()=>{await loop.request({
      runId: invocation.runId,
      toolCallId: invocation.toolCallId,
      requestId,
      label: invocation.label,
      expectedRevision: state.current.revision,
      request,
      signal: invocation.signal,
      expectedSourceImageId: invocation.expectedSourceImageId,
    });return loop.settled(invocation.toolCallId, requestId)}
    const workspace=getAuthorizedWorkspace()
    const result=workspace?await runDurableHostEffect({host:createTauriAgentHostService({workspaceHandle:workspace.handle,instanceId:'desktop.effect'}),runId:invocation.runId,nodeId:invocation.toolCallId,effectKey:`paid:${invocation.toolCallId}`,execute:async()=>{const value=await execute();if(!value.receipt)throw new Error(value.ok?'Paid tool receipt is missing.':value.error);return{value,receiptId:value.receipt.receiptId}}}):await execute()
    if (!result.ok) throw new Error(result.error)
    return (await Promise.all(result.receipt.outputArtifactIds.map((id) => artifacts.current!.read(id))))
      .filter((item): item is DesktopToolArtifact => Boolean(item))
  }

  return {
    loop,
    invoke,
    visualRuntime,
    resolveArtifact: (id: string) => artifacts.current!.read(id),
    persistReference: (bytes: Uint8Array, mediaType: string, runId: string) =>
      artifacts.current!.write({ bytes, mediaType, source: 'edit-image', runId }),
    persistCutout: async (bytes: Uint8Array, mediaType: string, runId: string) => {
      const artifactId = await artifacts.current!.write({
        bytes,
        mediaType,
        source: 'cutout',
        runId,
      })
      const sha256 = parseArtifactId(artifactId)
      if (!sha256) throw new Error('Persisted cutout artifact has an invalid content address.')
      return { artifactId, sha256 }
    },
    visualBudget: () => createExplicitDesktopVisualBudget(capabilities()),
  }
}

async function digestRequest(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function isLocalCutout(capability: PaidToolCapability): boolean {
  return capability === 'cutout' || capability === 'semantic-cutout'
}

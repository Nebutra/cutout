import { useCallback, useMemo, useRef } from 'react'
import { createDesktopToolLoop, type DesktopToolLoop } from './desktop-tool-loop'
import { applyPaidToolPreferences, loadPaidToolPreferences, paidToolPolicy } from './paid-tool-preferences'
import { composerRouteToPaidToolRequest, desktopPaidToolCapabilities, type PaidToolCapability, type PaidToolRequest } from '@/control-protocol/paid-tool-contract'
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

export interface DesktopToolInvocation {
  readonly runId: string
  readonly toolCallId: string
  readonly label: string
  readonly capability: PaidToolCapability
  readonly intent: string
  readonly prompt?: string
  readonly image: ModelAssignment
  readonly inputs?: readonly { readonly id: string; readonly mediaType: string; readonly bytes: Uint8Array }[]
}

export function useDesktopToolLoop(input: {
  readonly services: Pick<ServiceRegistry, 'providers' | 'generation' | 'cutout'>
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
  const authorize = useCallback(async (runId: string, requestId: string, request: PaidToolRequest, approvalId: string) => {
    const requestDigest = await digestRequest({ runId, requestId, revision: state.current.revision, request })
    const issuedAt = Date.now(), lease = permissionBroker.issue({ version: 'cutout.capability-lease.v1', leaseId: `lease:${requestId}`, approvalId, subject: runId, requestDigest, scopes: request.capability === 'cutout' ? ['paid'] : ['paid', 'credential'], workspaceRoot: 'authorized-workspace', allowedPaths: [], allowedCommands: [], allowedHosts: [], limits: { maxDurationMs: 600_000, maxBytes: 100_000_000, maxProcesses: 1 }, issuedAt, expiresAt: issuedAt + 600_000 })
    return { capabilityLeaseId: lease.leaseId, requestDigest }
  }, [permissionBroker])
  const loop = useMemo<DesktopToolLoop>(() => {
    const store = artifacts.current!
    const executor = createDesktopToolExecutor({
      services: state.current.services,
      artifacts: store,
      capabilities: async () => [
        ...desktopPaidToolCapabilities(state.current.providers, state.current.assignments),
        { capability: 'cutout' as const, providerId: 'local', model: 'cutout-v1', available: true, estimatedCost: { currency: 'USD', amount: 0 } },
      ],
      currentRevision: () => state.current.revision,
      cutoutResultSink: state.current.cutoutResultSink,
      permissionBroker,
    })
    return createDesktopToolLoop({
      executors: createToolExecutorRegistry([executor]),
      currentRevision: () => state.current.revision,
      policy: () => paidToolPolicy(loadPaidToolPreferences()),
      append: (events) => state.current.append(events),
      authorize: (request, approvalId) => authorize(
        request.runId,
        request.requestId,
        request.request,
        approvalId,
      ),
    })
  }, [authorize, permissionBroker])

  const visualRuntime = useMemo(() => {
    const capabilities = desktopPaidToolCapabilities(state.current.providers, state.current.assignments)
    const estimate = (capability: 'generate-image' | 'edit-image') => capabilities.find((item) => item.capability === capability)?.estimatedCost ?? { currency: 'USD', amount: 0 }
    return createVisualTaskRuntime({
      tools: createDesktopVisualToolInvoker({ loop, expectedRevision: () => state.current.revision, estimateFor: estimate,
        resolveArtifact: async (artifactId) => { const artifact = await artifacts.current!.read(artifactId), sha256 = parseArtifactId(artifactId); if (!artifact || !sha256) throw new Error('Promoted visual artifact is unavailable.'); return { artifactId, sha256, mediaType: artifact.mediaType, provenanceId: `provenance:${sha256}` } },
      }),
      reviewer: approveFirstVisualCandidate('agent'), store: createStorageVisualExecutionStore(localStorage), estimates: { generate: estimate('generate-image'), edit: estimate('edit-image') }, append: (events) => state.current.append(events),
    })
  }, [loop])

  async function invoke(invocation: DesktopToolInvocation): Promise<readonly DesktopToolArtifact[]> {
    const inputIds = await Promise.all((invocation.inputs ?? []).map((artifact) => artifacts.current!.write({ ...artifact, source: 'edit-image', runId: invocation.runId })))
    const preferences = loadPaidToolPreferences()
    const requestId = crypto.randomUUID()
    const request = applyPaidToolPreferences(composerRouteToPaidToolRequest({
      capability: invocation.capability,
      intent: invocation.intent,
      prompt: invocation.prompt,
      image: invocation.capability === 'cutout' ? { providerId: 'local', model: 'cutout-v1' } : invocation.image,
      inputArtifactIds: inputIds,
      budgetCeiling: preferences.budgetCeiling,
      approvalPolicy: preferences.approvalPolicy,
    }), preferences)
    const execute=async()=>{await loop.request({
      runId: invocation.runId,
      toolCallId: invocation.toolCallId,
      requestId,
      label: invocation.label,
      expectedRevision: state.current.revision,
      request,
    });return loop.settled(invocation.toolCallId, requestId)}
    const workspace=getAuthorizedWorkspace()
    const result=workspace?await runDurableHostEffect({host:createTauriAgentHostService({workspaceHandle:workspace.handle,instanceId:'desktop.effect'}),runId:invocation.runId,nodeId:invocation.toolCallId,effectKey:`paid:${invocation.toolCallId}`,execute:async()=>{const value=await execute();if(!value.receipt)throw new Error(value.ok?'Paid tool receipt is missing.':value.error);return{value,receiptId:value.receipt.receiptId}}}):await execute()
    if (!result.ok) throw new Error(result.error)
    return (await Promise.all(result.receipt.outputArtifactIds.map((id) => artifacts.current!.read(id))))
      .filter((item): item is DesktopToolArtifact => Boolean(item))
  }

  return { loop, invoke, visualRuntime, resolveArtifact: (id: string) => artifacts.current!.read(id), persistReference: (bytes: Uint8Array, mediaType: string, runId: string) => artifacts.current!.write({ bytes, mediaType, source: 'edit-image', runId }), visualPreferences: () => loadPaidToolPreferences() }
}

async function digestRequest(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

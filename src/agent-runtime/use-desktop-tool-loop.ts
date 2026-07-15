import { useMemo, useRef } from 'react'
import { createDesktopToolLoop, type DesktopToolLoop } from './desktop-tool-loop'
import { applyPaidToolPreferences, loadPaidToolPreferences, paidToolPolicy } from './paid-tool-preferences'
import { composerRouteToPaidToolRequest, desktopPaidToolCapabilities, type PaidToolCapability } from '@/control-protocol/paid-tool-contract'
import { createDesktopToolExecutor, createToolExecutorRegistry, type CutoutResultSink, type DesktopToolArtifact } from '@/services/desktop-tool-executor'
import type { ModelAssignment, ModelAssignments } from '@/services/ai/model-assignment-types'
import type { ProviderConfig } from '@/services/ai/provider-types'
import type { ServiceRegistry } from '@/services/types'
import type { AgentRunEvent } from './run-events'

export interface DesktopToolInvocation {
  readonly runId: string
  readonly toolCallId: string
  readonly label: string
  readonly capability: PaidToolCapability
  readonly intent: string
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
  const artifacts = useRef(new Map<string, DesktopToolArtifact>())
  const sequence = useRef(0)
  const loop = useMemo<DesktopToolLoop>(() => {
    const store = {
      async read(id: string) { return artifacts.current.get(id) ?? null },
      async write(asset: Omit<DesktopToolArtifact, 'id'>) {
        const id = `desktop-artifact:${++sequence.current}`
        artifacts.current.set(id, { id, mediaType: asset.mediaType, bytes: asset.bytes })
        return id
      },
      async writeBatch(assets: readonly Omit<DesktopToolArtifact, 'id'>[]) {
        const staged = assets.map((asset) => ({
          id: `desktop-artifact:${++sequence.current}`,
          artifact: asset,
        }))
        for (const item of staged) artifacts.current.set(item.id, { id: item.id, ...item.artifact })
        return staged.map((item) => item.id)
      },
    }
    const executor = createDesktopToolExecutor({
      services: state.current.services,
      artifacts: store,
      capabilities: async () => [
        ...desktopPaidToolCapabilities(state.current.providers, state.current.assignments),
        { capability: 'cutout' as const, providerId: 'local', model: 'cutout-v1', available: true, estimatedCost: { currency: 'USD', amount: 0 } },
      ],
      currentRevision: () => state.current.revision,
      cutoutResultSink: state.current.cutoutResultSink,
    })
    return createDesktopToolLoop({
      executors: createToolExecutorRegistry([executor]),
      currentRevision: () => state.current.revision,
      policy: () => paidToolPolicy(loadPaidToolPreferences()),
      append: (events) => state.current.append(events),
    })
  }, [])

  async function invoke(invocation: DesktopToolInvocation): Promise<readonly DesktopToolArtifact[]> {
    for (const artifact of invocation.inputs ?? []) artifacts.current.set(artifact.id, artifact)
    const preferences = loadPaidToolPreferences()
    const requestId = crypto.randomUUID()
    await loop.request({
      runId: invocation.runId,
      toolCallId: invocation.toolCallId,
      requestId,
      label: invocation.label,
      expectedRevision: state.current.revision,
      request: applyPaidToolPreferences(composerRouteToPaidToolRequest({
        capability: invocation.capability,
        intent: invocation.intent,
        image: invocation.capability === 'cutout' ? { providerId: 'local', model: 'cutout-v1' } : invocation.image,
        inputArtifactIds: invocation.inputs?.map((item) => item.id),
        budgetCeiling: preferences.budgetCeiling,
        approvalPolicy: preferences.approvalPolicy,
      }), preferences),
    })
    const result = await loop.settled(invocation.toolCallId, requestId)
    if (!result.ok) throw new Error(result.error)
    return result.receipt.outputArtifactIds
      .map((id) => artifacts.current.get(id))
      .filter((item): item is DesktopToolArtifact => Boolean(item))
  }

  return { loop, invoke }
}

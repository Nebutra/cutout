import {
  assetProductionSnapshotSchema,
  sha256Bytes,
  type AssetProductionRun,
  type AssetProductionSnapshot,
} from '@/asset-production'
import type { PersistedPrototypeResourcePack } from '@/workspace/workspace-snapshot'

const RESOURCE_PACK_RUN_PREFIX = 'resource-pack:'

export function resourcePackRunId(resourcePackId: string): string | undefined {
  if (!resourcePackId.startsWith(RESOURCE_PACK_RUN_PREFIX)) return undefined
  const runId = resourcePackId.slice(RESOURCE_PACK_RUN_PREFIX.length)
  return runId || undefined
}

export interface VerifiedResourcePackArtifact {
  readonly manifestItemId: string
  readonly artifactId: string
  readonly sha256: string
  readonly mediaType: string
  readonly width: number
  readonly height: number
  readonly byteLength: number
}

export function resolveResourcePackProductionRun(
  snapshot: AssetProductionSnapshot,
  resourcePack: PersistedPrototypeResourcePack,
): AssetProductionRun | undefined {
  const runId = resourcePackRunId(resourcePack.id)
  if (!runId) return undefined
  const run = snapshot.runs[runId]
  return run && completedRunMatchesResourcePack(run, resourcePack)
    ? run
    : undefined
}

export function selectResourcePackProductionAuthority(
  snapshot: AssetProductionSnapshot,
  resourcePack: PersistedPrototypeResourcePack,
): AssetProductionSnapshot {
  const current = assetProductionSnapshotSchema.parse(snapshot)
  const run = resolveResourcePackProductionRun(current, resourcePack)
  if (!run) {
    throw new Error(`Resource production authority is unavailable for ${resourcePack.id}.`)
  }
  if (current.activePlanId === run.planId && current.activeRunId === run.runId) {
    return current
  }
  return assetProductionSnapshotSchema.parse({
    ...current,
    revision: current.revision + 1,
    activePlanId: run.planId,
    activeRunId: run.runId,
  })
}

export async function verifyResourcePackProductionArtifacts(input: {
  readonly snapshot: AssetProductionSnapshot
  readonly resourcePack: PersistedPrototypeResourcePack
  readonly resolveArtifact: (artifactId: string) => Promise<{
    readonly id: string
    readonly mediaType: string
    readonly bytes: Uint8Array
  } | null>
}): Promise<readonly VerifiedResourcePackArtifact[]> {
  const snapshot = assetProductionSnapshotSchema.parse(input.snapshot)
  const run = resolveResourcePackProductionRun(snapshot, input.resourcePack)
  if (!run) {
    throw new Error(`Resource production authority is unavailable for ${input.resourcePack.id}.`)
  }
  const plan = snapshot.plans[run.planId]
  if (!plan) {
    throw new Error(`Resource production plan is unavailable for ${input.resourcePack.id}.`)
  }
  const taskByManifestItem = new Map(plan.tasks.map((task) => [task.manifestItemId, task]))

  return Promise.all(input.resourcePack.assets.map(async (binding) => {
    const task = taskByManifestItem.get(binding.manifestItemId)
    const state = task ? run.tasks[task.taskId] : undefined
    const output = state?.output ?? state?.candidate
    if (
      !task
      || !state
      || !output
      || !['ready', 'waived'].includes(state.status)
      || output.artifactId !== binding.artifactId
    ) {
      throw new Error(`Resource artifact authority is unavailable for ${binding.manifestItemId}.`)
    }
    const stored = await input.resolveArtifact(binding.artifactId)
    if (!stored || stored.id !== binding.artifactId || stored.mediaType !== output.mediaType) {
      throw new Error(`Resource bytes are unavailable for ${binding.manifestItemId}.`)
    }
    const digest = await sha256Bytes(stored.bytes)
    if (digest !== output.sha256) {
      throw new Error(`Resource bytes failed digest verification for ${binding.manifestItemId}.`)
    }
    return {
      manifestItemId: binding.manifestItemId,
      artifactId: binding.artifactId,
      sha256: digest,
      mediaType: stored.mediaType,
      width: output.width,
      height: output.height,
      byteLength: stored.bytes.byteLength,
    }
  }))
}

function completedRunMatchesResourcePack(
  run: AssetProductionRun,
  resourcePack: PersistedPrototypeResourcePack,
): boolean {
  if (run.status !== 'completed') return false
  const expected = new Set(resourcePack.assets.map(({ artifactId }) => artifactId))
  const actual = new Set(Object.values(run.tasks).flatMap((task) => {
    if (task.status !== 'ready' && task.status !== 'waived') return []
    const artifact = task.output ?? task.candidate
    return artifact ? [artifact.artifactId] : []
  }))
  return actual.size === expected.size && [...expected].every((id) => actual.has(id))
}

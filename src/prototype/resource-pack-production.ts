import {
  assetProductionSnapshotSchema,
  type AssetProductionRun,
  type AssetProductionSnapshot,
} from '@/asset-production'
import type { PersistedPrototypeResourcePack } from '@/workspace/workspace-snapshot'

const RESOURCE_PACK_RUN_PREFIX = 'resource-pack:'

export function resolveResourcePackProductionRun(
  snapshot: AssetProductionSnapshot,
  resourcePack: PersistedPrototypeResourcePack,
): AssetProductionRun | undefined {
  const exactRunId = resourcePack.id.startsWith(RESOURCE_PACK_RUN_PREFIX)
    ? resourcePack.id.slice(RESOURCE_PACK_RUN_PREFIX.length)
    : undefined
  const exactRun = exactRunId ? snapshot.runs[exactRunId] : undefined
  if (exactRunId !== undefined) {
    return exactRun && completedRunMatchesResourcePack(exactRun, resourcePack)
      ? exactRun
      : undefined
  }

  if (resourcePack.assets.length === 0) return undefined
  return Object.values(snapshot.runs)
    .filter((run) => completedRunMatchesResourcePack(run, resourcePack))
    .sort((left, right) =>
      right.startedAt - left.startedAt || right.runId.localeCompare(left.runId),
    )[0]
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

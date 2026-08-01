import { describe, expect, it } from 'vitest'
import {
  emptyAssetProductionSnapshot,
  reduceAssetProduction,
  sha256Bytes,
  type AssetProductionSnapshot,
} from '@/asset-production'
import { compileAssetProductionPlan } from '@/asset-production/planner'
import type { PersistedPrototypeResourcePack } from '@/workspace/workspace-snapshot'
import {
  resolveResourcePackProductionRun,
  selectResourcePackProductionAuthority,
  verifyResourcePackProductionArtifacts,
} from './resource-pack-production'

describe('prototype resource-pack production authority', () => {
  it('selects the exact completed run named by the resource pack', async () => {
    const first = await completedRun('run:first', 'artifact:first', 1)
    const second = await completedRun('run:second', 'artifact:second', 20, first)
    const pack = resourcePack('run:first', 'artifact:first')

    expect(resolveResourcePackProductionRun(second, pack)?.runId).toBe('run:first')
    const selected = selectResourcePackProductionAuthority(second, pack)
    expect(selected.activeRunId).toBe('run:first')
    expect(selected.activePlanId).toBe(selected.runs['run:first']!.planId)
    expect(selected.revision).toBe(second.revision + 1)
  })

  it('rejects a pack whose named run does not contain the complete artifact set', async () => {
    const snapshot = await completedRun('run:first', 'artifact:first', 1)
    expect(() => selectResourcePackProductionAuthority(
      snapshot,
      resourcePack('run:first', 'artifact:other'),
    )).toThrow('Resource production authority is unavailable')
  })

  it('does not substitute a sibling run when the exact named authority mismatches', async () => {
    const first = await completedRun('run:first', 'artifact:first', 1)
    const second = await completedRun('run:second', 'artifact:second', 20, first)
    const mismatched = resourcePack('run:first', 'artifact:second')

    expect(resolveResourcePackProductionRun(second, mismatched)).toBeUndefined()
    expect(() => selectResourcePackProductionAuthority(second, mismatched))
      .toThrow('Resource production authority is unavailable')
  })

  it('retains artifact-set authority resolution for legacy unprefixed packs', async () => {
    const first = await completedRun('run:first', 'artifact:first', 1)
    const second = await completedRun('run:second', 'artifact:second', 20, first)
    const legacyPack = {
      ...resourcePack('run:missing', 'artifact:second'),
      id: 'legacy-resource-pack',
    }

    expect(resolveResourcePackProductionRun(second, legacyPack)?.runId).toBe('run:second')
    expect(selectResourcePackProductionAuthority(second, legacyPack).activeRunId)
      .toBe('run:second')
  })

  it('verifies every bound artifact against its completed task and stored bytes', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    const digest = await sha256Bytes(bytes)
    const snapshot = await completedRun(
      'run:first',
      'artifact:first',
      1,
      emptyAssetProductionSnapshot(),
      digest,
    )
    const pack = resourcePack('run:first', 'artifact:first', 'asset:run:first')
    const verified = await verifyResourcePackProductionArtifacts({
      snapshot,
      resourcePack: pack,
      resolveArtifact: async (id) => ({ id, mediaType: 'image/png', bytes }),
    })

    expect(verified).toEqual([expect.objectContaining({
      manifestItemId: 'asset:run:first',
      artifactId: 'artifact:first',
      sha256: digest,
      byteLength: 4,
    })])
    await expect(verifyResourcePackProductionArtifacts({
      snapshot,
      resourcePack: pack,
      resolveArtifact: async (id) => ({
        id,
        mediaType: 'image/png',
        bytes: new Uint8Array([9]),
      }),
    })).rejects.toThrow(/digest verification/i)
    await expect(verifyResourcePackProductionArtifacts({
      snapshot,
      resourcePack: pack,
      resolveArtifact: async () => null,
    })).rejects.toThrow(/bytes are unavailable/i)
  })
})

async function completedRun(
  runId: string,
  artifactId: string,
  at: number,
  initial: AssetProductionSnapshot = emptyAssetProductionSnapshot(),
  sha256Override?: string,
): Promise<AssetProductionSnapshot> {
  const plan = await compileAssetProductionPlan({
    sourceRevision: { projectRevisionId: `revision:${runId}`, pageArtifacts: [] },
    items: [{
      manifestItemId: `asset:${runId}`,
      pageId: 'home',
      regionId: 'hero',
      route: 'direct-generate',
      label: 'Hero',
    }],
    createdAt: at,
  })
  const taskId = plan.tasks[0]!.taskId
  const artifact = {
    artifactId,
    sha256: sha256Override ?? (artifactId.endsWith('first') ? 'a' : 'b').repeat(64),
    mediaType: 'image/png',
    width: 100,
    height: 80,
  }
  let snapshot = reduceAssetProduction(initial, { type: 'plan-registered', plan })
  snapshot = reduceAssetProduction(snapshot, {
    type: 'run-started', planId: plan.planId, runId, at: at + 1,
  })
  snapshot = reduceAssetProduction(snapshot, {
    type: 'task-started', runId, taskId, at: at + 2,
  })
  snapshot = reduceAssetProduction(snapshot, {
    type: 'candidate-recorded', runId, taskId, artifact, at: at + 3,
  })
  snapshot = reduceAssetProduction(snapshot, {
    type: 'review-started', runId, taskId, at: at + 4,
  })
  snapshot = reduceAssetProduction(snapshot, {
    type: 'review-recorded', runId, taskId, issues: [], at: at + 5,
  })
  snapshot = reduceAssetProduction(snapshot, {
    type: 'verification-started', runId, taskId, at: at + 6,
  })
  snapshot = reduceAssetProduction(snapshot, {
    type: 'output-verified', runId, taskId, artifact, issues: [], at: at + 7,
  })
  return reduceAssetProduction(snapshot, { type: 'run-finalized', runId, at: at + 8 })
}

function resourcePack(
  runId: string,
  artifactId: string,
  manifestItemId = 'asset:hero',
): PersistedPrototypeResourcePack {
  return {
    id: `resource-pack:${runId}`,
    manifest: { version: 'asset-manifest.v0', product: 'Test', pages: [], assets: [] },
    manifestProvenanceId: 'provenance:manifest',
    assets: [{
      manifestItemId,
      artifactId,
      provenanceIds: ['provenance:artifact'],
    }],
  }
}

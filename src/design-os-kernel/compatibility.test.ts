import { describe, expect, it } from 'vitest'
import {
  beginAssetProduction,
  finalizeAssetProduction,
  publishAssetProductionTask,
} from '@/asset-production/coordinator'
import { emptyAssetProductionSnapshot } from '@/asset-production/contracts'
import { sha256Bytes } from '@/asset-production/hash'
import { compileAssetProductionPlan } from '@/asset-production/planner'
import { projectPrototypeCompatibility } from './prototype-compatibility'

describe('Design OS prototype compatibility adapter (K2)', () => {
  it('preserves legacy lifecycle, bytes, CAS hashes, provenance, recovery and export projections', async () => {
    const bytes = new Uint8Array([10, 20, 30, 40])
    const sha256 = await sha256Bytes(bytes)
    const plan = await compileAssetProductionPlan({
      sourceRevision: {
        projectRevisionId: 'project:revision:1',
        pageArtifacts: [{ pageId: 'page:home', artifactId: 'artifact:page', sha256: 'a'.repeat(64) }],
      },
      items: [{
        manifestItemId: 'material:hero',
        pageId: 'page:home',
        regionId: 'region:hero',
        route: 'direct-generate',
        transparent: true,
      }],
      createdAt: 1,
    })
    let snapshot = beginAssetProduction({ snapshot: emptyAssetProductionSnapshot(), plan, runId: 'run:legacy', at: 2 })
    snapshot = publishAssetProductionTask({
      snapshot,
      runId: 'run:legacy',
      taskId: plan.tasks[0]!.taskId,
      artifact: {
        artifactId: `artifact:sha256:${sha256}`,
        sha256,
        mediaType: 'image/png',
        width: 2,
        height: 2,
      },
      reviewIssues: [],
      at: 3,
    })
    snapshot = finalizeAssetProduction(snapshot, 'run:legacy', 4)
    const before = structuredClone(snapshot)
    const projection = await projectPrototypeCompatibility({
      snapshot,
      runId: 'run:legacy',
      artifacts: [{ artifactId: `artifact:sha256:${sha256}`, sha256, bytes }],
      provenance: { designIrRevision: 'design-ir:1', sourceIds: ['source:prototype'] },
      recovery: { workspaceVersion: 'workspace.v1', restored: true },
      exportResult: { manifestHash: 'b'.repeat(64), status: 'ready' },
    })

    expect(snapshot).toEqual(before)
    expect(projection).toMatchObject({
      planId: plan.planId,
      planHash: plan.planHash,
      runId: 'run:legacy',
      lifecycle: [{ taskId: plan.tasks[0]!.taskId, status: 'ready', attempt: 1 }],
      provenance: { designIrRevision: 'design-ir:1', sourceIds: ['source:prototype'] },
      recovery: { workspaceVersion: 'workspace.v1', restored: true },
      exportResult: { manifestHash: 'b'.repeat(64), status: 'ready' },
    })
    expect(projection.acceptedArtifacts[0]).toEqual({
      artifactId: `artifact:sha256:${sha256}`,
      sha256,
      bytes,
    })
  })

  it('fails closed when legacy bytes no longer match authoritative CAS evidence', async () => {
    const plan = await compileAssetProductionPlan({
      sourceRevision: { projectRevisionId: 'project:1', pageArtifacts: [] },
      items: [{ manifestItemId: 'item:1', pageId: 'page:1', regionId: 'region:1', route: 'direct-generate', transparent: true }],
      createdAt: 1,
    })
    const snapshot = beginAssetProduction({ snapshot: emptyAssetProductionSnapshot(), plan, runId: 'run:1', at: 2 })
    await expect(projectPrototypeCompatibility({
      snapshot,
      runId: 'run:1',
      artifacts: [{ artifactId: 'artifact:missing', sha256: 'a'.repeat(64), bytes: new Uint8Array([1]) }],
      provenance: {}, recovery: {}, exportResult: {},
    })).resolves.toMatchObject({ acceptedArtifacts: [] })
  })
})


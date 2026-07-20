import { describe, expect, it } from 'vitest'
import { emptyAssetProductionSnapshot } from './contracts'
import { migrateLegacySlicesToAssetProduction } from './migration'
import { compileAssetProductionPlan } from './planner'
import { projectProductionMaterials, projectProductionReviewQueue } from './projection'
import { integrityIssue, qualityIssue } from './quality-policy'
import { reduceAssetProduction, supersedeActiveProduction } from './reducer'

describe('asset production projections', () => {
  it('projects grandfathered legacy output honestly and omits non-consumable tasks', async () => {
    const snapshot = await migrateLegacySlicesToAssetProduction({
      projectId: 'project:1', projectRevisionId: 'revision:1', createdAt: 1,
      slices: [{
        id: 'slice:1', name: 'hero.png', blob: new Blob(['hero'], { type: 'image/png' }),
        width: 20, height: 20, box: { x: 0, y: 0, width: 20, height: 20 },
        assetManifestItemId: 'asset:hero', pageId: 'home', regionId: 'hero',
      }],
    })
    expect(projectProductionMaterials(snapshot)).toEqual([
      expect.objectContaining({
        manifestItemId: 'asset:hero', status: 'legacy-ready', legacyUnverified: true,
      }),
    ])
    expect(projectProductionReviewQueue(snapshot)).toEqual([])
    const superseded = supersedeActiveProduction(snapshot, 2)
    expect(projectProductionMaterials(superseded)).toEqual([])
  })

  it('projects review and failed tasks even when no image can be projected', async () => {
    const plan = await compileAssetProductionPlan({
      sourceRevision: { projectRevisionId: 'revision:1', pageArtifacts: [] },
      items: [
        { manifestItemId: 'asset:review', pageId: 'home', regionId: 'hero', route: 'direct-generate', label: 'Hero' },
        { manifestItemId: 'asset:failed', pageId: 'home', regionId: 'logo', route: 'direct-generate', label: 'Logo' },
      ],
      createdAt: 1,
    })
    const reviewTask = plan.tasks.find((task) => task.manifestItemId === 'asset:review')
    const failedTask = plan.tasks.find((task) => task.manifestItemId === 'asset:failed')
    let snapshot = reduceAssetProduction(emptyAssetProductionSnapshot(), { type: 'plan-registered', plan })
    snapshot = reduceAssetProduction(snapshot, { type: 'run-started', planId: plan.planId, runId: 'run:1', at: 2 })
    snapshot = reduceAssetProduction(snapshot, { type: 'task-started', runId: 'run:1', taskId: reviewTask!.taskId, at: 3 })
    snapshot = reduceAssetProduction(snapshot, {
      type: 'candidate-recorded', runId: 'run:1', taskId: reviewTask!.taskId,
      artifact: { artifactId: 'artifact:hero', sha256: 'a'.repeat(64), mediaType: 'image/png', width: 100, height: 80 }, at: 4,
    })
    snapshot = reduceAssetProduction(snapshot, { type: 'review-started', runId: 'run:1', taskId: reviewTask!.taskId, at: 5 })
    snapshot = reduceAssetProduction(snapshot, {
      type: 'review-recorded', runId: 'run:1', taskId: reviewTask!.taskId,
      issues: [qualityIssue('edge-halo', 'Edge halo detected.', 'deterministic-check', 6)], at: 6,
    })
    snapshot = reduceAssetProduction(snapshot, { type: 'task-started', runId: 'run:1', taskId: failedTask!.taskId, at: 7 })
    snapshot = reduceAssetProduction(snapshot, {
      type: 'task-failed', runId: 'run:1', taskId: failedTask!.taskId,
      issues: [integrityIssue('empty-output', 'No output was produced.', 8)], at: 8,
    })

    expect(projectProductionReviewQueue(snapshot)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        taskId: reviewTask!.taskId, manifestItemId: 'asset:review', pageId: 'home',
        regionId: 'hero', label: 'Hero', status: 'needs-review',
      }),
      expect.objectContaining({
        taskId: failedTask!.taskId, manifestItemId: 'asset:failed', pageId: 'home',
        regionId: 'logo', label: 'Logo', status: 'failed', artifact: undefined,
      }),
    ]))
    expect(projectProductionReviewQueue(snapshot)).toHaveLength(2)
  })
})

import { describe, expect, it } from 'vitest'
import { emptyAssetProductionSnapshot } from './contracts'
import { compileAssetProductionPlan } from './planner'
import { qualityIssue, integrityIssue } from './quality-policy'
import { reduceAssetProduction } from './reducer'
import { approveProductionQualityIssues } from './decisions'

const artifact = {
  artifactId: `artifact:sha256:${'a'.repeat(64)}`,
  sha256: 'a'.repeat(64),
  mediaType: 'image/png',
  width: 20,
  height: 20,
}

async function reviewed(issue: ReturnType<typeof qualityIssue> | ReturnType<typeof integrityIssue>) {
  const plan = await compileAssetProductionPlan({
    sourceRevision: { projectRevisionId: 'revision:1', pageArtifacts: [] },
    items: [{ manifestItemId: 'asset:1', pageId: 'page', regionId: 'region', route: 'direct-generate' }],
    createdAt: 1,
  })
  const taskId = plan.tasks[0]!.taskId
  let snapshot = reduceAssetProduction(emptyAssetProductionSnapshot(), { type: 'plan-registered', plan })
  snapshot = reduceAssetProduction(snapshot, { type: 'run-started', planId: plan.planId, runId: 'run:1', at: 2 })
  snapshot = reduceAssetProduction(snapshot, { type: 'task-started', runId: 'run:1', taskId, at: 3 })
  snapshot = reduceAssetProduction(snapshot, { type: 'candidate-recorded', runId: 'run:1', taskId, artifact, at: 4 })
  snapshot = reduceAssetProduction(snapshot, { type: 'review-started', runId: 'run:1', taskId, at: 5 })
  snapshot = reduceAssetProduction(snapshot, { type: 'review-recorded', runId: 'run:1', taskId, issues: [issue], at: 6 })
  return { snapshot, taskId }
}

describe('production review decisions', () => {
  it('binds a human approval to the current artifact and project revision', async () => {
    const { snapshot, taskId } = await reviewed(qualityIssue('qa-rejected', 'Rejected.', 'model-review', 6))
    const approved = approveProductionQualityIssues({
      snapshot,
      runId: 'run:1',
      taskId,
      actorId: 'local.user',
      receiptId: 'decision:1',
      at: 7,
    })
    expect(approved.runs['run:1']?.tasks[taskId]).toMatchObject({
      status: 'waived',
      decision: {
        artifactSha256: artifact.sha256,
        projectRevisionId: 'revision:1',
        issueCodes: ['qa-rejected'],
      },
    })
  })

  it('cannot approve an integrity failure', async () => {
    const { snapshot, taskId } = await reviewed(integrityIssue('source-drift', 'Changed.', 6))
    expect(() => approveProductionQualityIssues({
      snapshot,
      runId: 'run:1',
      taskId,
      actorId: 'local.user',
      receiptId: 'decision:2',
      at: 7,
    })).toThrow()
  })
})

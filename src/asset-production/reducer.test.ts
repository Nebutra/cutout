import { describe, expect, it } from 'vitest'
import { emptyAssetProductionSnapshot, type AssetProductionSnapshot, type ProductionArtifactRef } from './contracts'
import { compileAssetProductionPlan } from './planner'
import { integrityIssue, qualityIssue, warningIssue } from './quality-policy'
import { reduceAssetProduction } from './reducer'

const artifact = (seed: string): ProductionArtifactRef => ({
  artifactId: `artifact:${seed}`,
  sha256: seed.repeat(64).slice(0, 64),
  mediaType: 'image/png',
  width: 100,
  height: 100,
})

async function setup(taskCount = 1) {
  const plan = await compileAssetProductionPlan({
    sourceRevision: { projectRevisionId: 'revision:1', pageArtifacts: [] },
    items: Array.from({ length: taskCount }, (_, index) => ({
      manifestItemId: `asset:${index}`,
      pageId: 'page',
      regionId: 'region',
      route: 'direct-generate' as const,
    })),
    createdAt: 1,
  })
  let snapshot = reduceAssetProduction(emptyAssetProductionSnapshot(), { type: 'plan-registered', plan })
  snapshot = reduceAssetProduction(snapshot, { type: 'run-started', planId: plan.planId, runId: 'run:1', at: 2 })
  return { plan, snapshot }
}

function dispatch(
  snapshot: AssetProductionSnapshot,
  action: Parameters<typeof reduceAssetProduction>[1],
): AssetProductionSnapshot {
  return reduceAssetProduction(snapshot, action)
}

describe('asset production reducer', () => {
  it('requires explicit transitions before a task and run become ready', async () => {
    const { plan, snapshot: initial } = await setup()
    const taskId = plan.tasks[0]!.taskId
    let state = dispatch(initial, { type: 'task-started', runId: 'run:1', taskId, at: 3 })
    state = dispatch(state, { type: 'candidate-recorded', runId: 'run:1', taskId, artifact: artifact('a'), at: 4 })
    state = dispatch(state, { type: 'review-started', runId: 'run:1', taskId, at: 5 })
    state = dispatch(state, { type: 'review-recorded', runId: 'run:1', taskId, issues: [warningIssue('name', 'Naming is pending.', 6)], at: 6 })
    state = dispatch(state, { type: 'verification-started', runId: 'run:1', taskId, at: 7 })
    state = dispatch(state, { type: 'output-verified', runId: 'run:1', taskId, artifact: artifact('b'), issues: [], at: 8 })
    state = dispatch(state, { type: 'run-finalized', runId: 'run:1', at: 9 })

    expect(state.runs['run:1']?.tasks[taskId]?.status).toBe('ready')
    expect(state.runs['run:1']?.status).toBe('completed')
    expect(state.activeRunId).toBeUndefined()
  })

  it('cancels an unfinished active run when its source is superseded', async () => {
    const { plan, snapshot } = await setup()
    const next = reduceAssetProduction(snapshot, {
      type: 'authority-superseded',
      at: 9,
    })
    expect(next.activeRunId).toBeUndefined()
    expect(next.activePlanId).toBeUndefined()
    expect(next.runs['run:1']?.status).toBe('cancelled')
    expect(Object.values(next.runs['run:1']?.tasks ?? {}).every(
      (task) => task.status === 'cancelled',
    )).toBe(true)
    expect(next.plans[plan.planId]).toEqual(plan)
  })

  it('never promotes rejected QA without a revision-bound decision', async () => {
    const { plan, snapshot: initial } = await setup()
    const taskId = plan.tasks[0]!.taskId
    let state = dispatch(initial, { type: 'task-started', runId: 'run:1', taskId, at: 3 })
    state = dispatch(state, { type: 'candidate-recorded', runId: 'run:1', taskId, artifact: artifact('a'), at: 4 })
    state = dispatch(state, { type: 'review-started', runId: 'run:1', taskId, at: 5 })
    state = dispatch(state, { type: 'review-recorded', runId: 'run:1', taskId, issues: [qualityIssue('qa-rejected', 'Model review rejected the output.', 'model-review', 6)], at: 6 })

    expect(state.runs['run:1']?.status).toBe('needs-review')
    expect(() => dispatch(state, { type: 'verification-started', runId: 'run:1', taskId, at: 7 })).toThrow('Illegal asset task transition')

    state = dispatch(state, {
      type: 'task-waived',
      runId: 'run:1',
      taskId,
      decision: {
        version: 'asset-production-decision.v1',
        receiptId: 'decision:1',
        taskId,
        artifactSha256: artifact('a').sha256,
        projectRevisionId: 'revision:1',
        decision: 'waive',
        issueCodes: ['qa-rejected'],
        actor: { kind: 'human', id: 'user' },
        decidedAt: 7,
      },
      at: 7,
    })
    expect(state.runs['run:1']?.tasks[taskId]?.status).toBe('waived')
    expect(state.runs['run:1']?.status).toBe('completed')
  })

  it('rejects stale decisions and all integrity waivers', async () => {
    const { plan, snapshot: initial } = await setup()
    const taskId = plan.tasks[0]!.taskId
    let state = dispatch(initial, { type: 'task-started', runId: 'run:1', taskId, at: 3 })
    state = dispatch(state, { type: 'candidate-recorded', runId: 'run:1', taskId, artifact: artifact('a'), at: 4 })
    state = dispatch(state, { type: 'review-started', runId: 'run:1', taskId, at: 5 })
    state = dispatch(state, { type: 'review-recorded', runId: 'run:1', taskId, issues: [integrityIssue('source-drift', 'Source changed.', 6)], at: 6 })
    expect(state.runs['run:1']?.tasks[taskId]?.status).toBe('failed')
    expect(() => dispatch(state, {
      type: 'task-waived', runId: 'run:1', taskId, at: 7,
      decision: {
        version: 'asset-production-decision.v1', receiptId: 'decision:bad', taskId,
        artifactSha256: 'f'.repeat(64), projectRevisionId: 'revision:1', decision: 'waive',
        issueCodes: ['source-drift'], actor: { kind: 'human', id: 'user' }, decidedAt: 7,
      },
    })).toThrow('Illegal asset task transition')
  })

  it('keeps cancellation terminal even when finalize runs during cleanup', async () => {
    const { plan, snapshot: initial } = await setup(2)
    const first = plan.tasks[0]!.taskId
    let state = dispatch(initial, { type: 'task-started', runId: 'run:1', taskId: first, at: 3 })
    state = dispatch(state, { type: 'run-cancelled', runId: 'run:1', at: 4 })
    const afterFinalize = dispatch(state, { type: 'run-finalized', runId: 'run:1', at: 5 })

    expect(afterFinalize).toStrictEqual(state)
    expect(afterFinalize.runs['run:1']?.status).toBe('cancelled')
    expect(Object.values(afterFinalize.runs['run:1']!.tasks).every((task) => task.status === 'cancelled')).toBe(true)
  })

  it('reports partial instead of completed when one required task fails', async () => {
    const { plan, snapshot: initial } = await setup(2)
    const [first, second] = plan.tasks.map((task) => task.taskId)
    let state = initial
    state = dispatch(state, { type: 'task-started', runId: 'run:1', taskId: first!, at: 3 })
    state = dispatch(state, { type: 'candidate-recorded', runId: 'run:1', taskId: first!, artifact: artifact('a'), at: 4 })
    state = dispatch(state, { type: 'review-started', runId: 'run:1', taskId: first!, at: 5 })
    state = dispatch(state, { type: 'review-recorded', runId: 'run:1', taskId: first!, issues: [], at: 6 })
    state = dispatch(state, { type: 'verification-started', runId: 'run:1', taskId: first!, at: 7 })
    state = dispatch(state, { type: 'output-verified', runId: 'run:1', taskId: first!, artifact: artifact('b'), issues: [], at: 8 })
    state = dispatch(state, { type: 'task-started', runId: 'run:1', taskId: second!, at: 9 })
    state = dispatch(state, { type: 'task-failed', runId: 'run:1', taskId: second!, issues: [integrityIssue('empty', 'No output.', 10)], at: 10 })
    state = dispatch(state, { type: 'run-finalized', runId: 'run:1', at: 11 })
    expect(state.runs['run:1']?.status).toBe('partial')
  })
})

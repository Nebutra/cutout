import type { AssetProductionSnapshot } from './contracts'
import { reduceAssetProduction } from './reducer'

export function approveProductionQualityIssues(input: {
  readonly snapshot: AssetProductionSnapshot
  readonly runId: string
  readonly taskId: string
  readonly actorId: string
  readonly receiptId: string
  readonly at: number
}): AssetProductionSnapshot {
  const run = input.snapshot.runs[input.runId]
  if (!run) throw new Error(`Unknown asset production run: ${input.runId}`)
  const plan = input.snapshot.plans[run.planId]
  if (!plan) throw new Error(`Unknown asset production plan: ${run.planId}`)
  const task = run.tasks[input.taskId]
  const artifact = task?.output ?? task?.candidate
  if (!task || !artifact) {
    throw new Error(`Production task has no reviewable artifact: ${input.taskId}`)
  }
  return reduceAssetProduction(input.snapshot, {
    type: 'task-waived',
    runId: input.runId,
    taskId: input.taskId,
    at: input.at,
    decision: {
      version: 'asset-production-decision.v1',
      receiptId: input.receiptId,
      taskId: input.taskId,
      artifactSha256: artifact.sha256,
      projectRevisionId: plan.sourceRevision.projectRevisionId,
      decision: 'approve',
      issueCodes: task.issues.map((issue) => issue.code),
      actor: { kind: 'human', id: input.actorId },
      decidedAt: input.at,
    },
  })
}

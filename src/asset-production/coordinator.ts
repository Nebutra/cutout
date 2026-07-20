import type {
  AssetProductionPlan,
  AssetProductionSnapshot,
  ProductionArtifactRef,
  ProductionIssue,
  ProductionTaskEvidence,
} from './contracts'
import { reduceAssetProduction } from './reducer'

export function beginAssetProduction(input: {
  readonly snapshot: AssetProductionSnapshot
  readonly plan: AssetProductionPlan
  readonly runId: string
  readonly at: number
}): AssetProductionSnapshot {
  const existing = input.snapshot.runs[input.runId]
  if (existing) {
    if (existing.planHash !== input.plan.planHash) {
      throw new Error(`Asset production run ${input.runId} is bound to another plan.`)
    }
    return input.snapshot
  }
  let next = input.snapshot
  if (next.activeRunId && next.activeRunId !== input.runId) {
    next = reduceAssetProduction(next, {
      type: 'authority-superseded',
      at: input.at,
    })
  }
  next = reduceAssetProduction(next, {
    type: 'plan-registered',
    plan: input.plan,
  })
  return reduceAssetProduction(next, {
    type: 'run-started',
    planId: input.plan.planId,
    runId: input.runId,
    at: input.at,
  })
}

export function startAssetProductionTask(input: {
  readonly snapshot: AssetProductionSnapshot
  readonly runId: string
  readonly taskId: string
  readonly at: number
}): AssetProductionSnapshot {
  return reduceAssetProduction(input.snapshot, {
    type: 'task-started',
    runId: input.runId,
    taskId: input.taskId,
    at: input.at,
  })
}

export function publishStartedAssetProductionTask(input: {
  readonly snapshot: AssetProductionSnapshot
  readonly runId: string
  readonly taskId: string
  readonly artifact: ProductionArtifactRef
  readonly candidate?: ProductionArtifactRef
  readonly reviewIssues: readonly ProductionIssue[]
  readonly verificationIssues?: readonly ProductionIssue[]
  readonly evidence?: ProductionTaskEvidence
  readonly cutBeforeVerification?: boolean
  readonly at: number
}): AssetProductionSnapshot {
  let next = reduceAssetProduction(input.snapshot, {
    type: 'candidate-recorded',
    runId: input.runId,
    taskId: input.taskId,
    artifact: input.candidate ?? input.artifact,
    evidence: input.evidence,
    at: input.at,
  })
  next = reduceAssetProduction(next, {
    type: 'review-started',
    runId: input.runId,
    taskId: input.taskId,
    at: input.at,
  })
  next = reduceAssetProduction(next, {
    type: 'review-recorded',
    runId: input.runId,
    taskId: input.taskId,
    issues: input.reviewIssues,
    at: input.at,
  })
  if (next.runs[input.runId]?.tasks[input.taskId]?.status !== 'accepted') return next
  if (input.cutBeforeVerification) {
    next = reduceAssetProduction(next, {
      type: 'cut-started',
      runId: input.runId,
      taskId: input.taskId,
      at: input.at,
    })
  }
  next = reduceAssetProduction(next, {
    type: 'verification-started',
    runId: input.runId,
    taskId: input.taskId,
    at: input.at,
  })
  return reduceAssetProduction(next, {
    type: 'output-verified',
    runId: input.runId,
    taskId: input.taskId,
    artifact: input.artifact,
    issues: input.verificationIssues ?? [],
    at: input.at,
  })
}

export function publishAssetProductionTask(input: Parameters<
  typeof publishStartedAssetProductionTask
>[0]): AssetProductionSnapshot {
  const started = startAssetProductionTask(input)
  return publishStartedAssetProductionTask({ ...input, snapshot: started })
}

export function failAssetProductionTask(input: {
  readonly snapshot: AssetProductionSnapshot
  readonly runId: string
  readonly taskId: string
  readonly issues: readonly ProductionIssue[]
  readonly at: number
}): AssetProductionSnapshot {
  return reduceAssetProduction(input.snapshot, {
    type: 'task-failed',
    runId: input.runId,
    taskId: input.taskId,
    issues: input.issues,
    at: input.at,
  })
}

export function finalizeAssetProduction(
  snapshot: AssetProductionSnapshot,
  runId: string,
  at: number,
): AssetProductionSnapshot {
  return reduceAssetProduction(snapshot, { type: 'run-finalized', runId, at })
}

export function cancelAssetProduction(
  snapshot: AssetProductionSnapshot,
  runId: string,
  at: number,
): AssetProductionSnapshot {
  return reduceAssetProduction(snapshot, { type: 'run-cancelled', runId, at })
}

export function carryAssetProductionTask(input: {
  readonly snapshot: AssetProductionSnapshot
  readonly fromRunId: string
  readonly toRunId: string
  readonly taskId: string
  readonly at: number
}): AssetProductionSnapshot {
  const sourceRun = input.snapshot.runs[input.fromRunId]
  const targetRun = input.snapshot.runs[input.toRunId]
  if (!sourceRun || !targetRun || sourceRun.planHash !== targetRun.planHash) {
    throw new Error('Carry-forward requires runs bound to the same production plan.')
  }
  const sourceTask = sourceRun.tasks[input.taskId]
  const artifact = sourceTask?.output ?? sourceTask?.candidate
  if (
    !sourceTask
    || !artifact
    || !['ready', 'waived', 'needs-review'].includes(sourceTask.status)
  ) {
    throw new Error(`Task cannot be carried forward: ${input.taskId}`)
  }
  let next = publishAssetProductionTask({
    snapshot: input.snapshot,
    runId: input.toRunId,
    taskId: input.taskId,
    artifact,
    reviewIssues: sourceTask.issues,
    evidence: {
      ...sourceTask.evidence,
      lineage: {
        previousRunId: input.fromRunId,
        previousTaskId: input.taskId,
        previousArtifactSha256: artifact.sha256,
      },
    },
    at: input.at,
  })
  if (sourceTask.status === 'waived') {
    if (!sourceTask.decision) throw new Error(`Waived task has no decision: ${input.taskId}`)
    next = reduceAssetProduction(next, {
      type: 'task-waived',
      runId: input.toRunId,
      taskId: input.taskId,
      decision: sourceTask.decision,
      at: input.at,
    })
  }
  return next
}

import {
  assetProductionPlanSchema,
  assetProductionSnapshotSchema,
  productionArtifactRefSchema,
  productionDecisionReceiptSchema,
  productionIssueSchema,
  productionTaskEvidenceSchema,
  type AssetProductionPlan,
  type AssetProductionRun,
  type AssetProductionSnapshot,
  type ProductionArtifactRef,
  type ProductionDecisionReceipt,
  type ProductionIssue,
  type ProductionRunStatus,
  type ProductionTaskEvidence,
  type ProductionTaskState,
} from './contracts'
import {
  assertDecisionMatches,
  hasIntegrityBlocker,
  hasQualityBlocker,
} from './quality-policy'

export type AssetProductionAction =
  | { readonly type: 'plan-registered'; readonly plan: AssetProductionPlan }
  | { readonly type: 'run-started'; readonly planId: string; readonly runId: string; readonly at: number }
  | { readonly type: 'task-started'; readonly runId: string; readonly taskId: string; readonly at: number }
  | { readonly type: 'candidate-recorded'; readonly runId: string; readonly taskId: string; readonly artifact: ProductionArtifactRef; readonly evidence?: ProductionTaskEvidence; readonly at: number }
  | { readonly type: 'review-started'; readonly runId: string; readonly taskId: string; readonly at: number }
  | { readonly type: 'review-recorded'; readonly runId: string; readonly taskId: string; readonly issues: readonly ProductionIssue[]; readonly at: number }
  | { readonly type: 'cut-started'; readonly runId: string; readonly taskId: string; readonly at: number }
  | { readonly type: 'verification-started'; readonly runId: string; readonly taskId: string; readonly at: number }
  | { readonly type: 'output-verified'; readonly runId: string; readonly taskId: string; readonly artifact: ProductionArtifactRef; readonly issues: readonly ProductionIssue[]; readonly at: number }
  | { readonly type: 'task-failed'; readonly runId: string; readonly taskId: string; readonly issues: readonly ProductionIssue[]; readonly at: number }
  | { readonly type: 'task-cancelled'; readonly runId: string; readonly taskId: string; readonly at: number }
  | { readonly type: 'task-waived'; readonly runId: string; readonly taskId: string; readonly decision: ProductionDecisionReceipt; readonly at: number }
  | { readonly type: 'run-cancelled'; readonly runId: string; readonly at: number }
  | { readonly type: 'run-finalized'; readonly runId: string; readonly at: number }
  | { readonly type: 'authority-superseded'; readonly at: number }

export function reduceAssetProduction(
  snapshot: AssetProductionSnapshot,
  action: AssetProductionAction,
): AssetProductionSnapshot {
  const current = assetProductionSnapshotSchema.parse(snapshot)
  let next: AssetProductionSnapshot
  switch (action.type) {
    case 'plan-registered': {
      const plan = assetProductionPlanSchema.parse(action.plan)
      next = {
        ...current,
        plans: { ...current.plans, [plan.planId]: plan },
        activePlanId: plan.planId,
      }
      break
    }
    case 'run-started': {
      const plan = requirePlan(current, action.planId)
      if (current.runs[action.runId]) throw new Error(`Asset production run already exists: ${action.runId}`)
      const tasks = Object.fromEntries(plan.tasks.map((task) => [task.taskId, {
        taskId: task.taskId,
        status: 'queued' as const,
        attempt: 0,
        issues: [],
        origin: 'native' as const,
        updatedAt: action.at,
      }]))
      const run: AssetProductionRun = {
        runId: action.runId,
        planId: plan.planId,
        planHash: plan.planHash,
        status: 'running',
        tasks,
        startedAt: action.at,
      }
      next = {
        ...current,
        runs: { ...current.runs, [run.runId]: run },
        activePlanId: plan.planId,
        activeRunId: run.runId,
      }
      break
    }
    case 'run-cancelled': {
      const run = requireRun(current, action.runId)
      assertRunMutable(run)
      const tasks = Object.fromEntries(Object.entries(run.tasks).map(([taskId, task]) => [
        taskId,
        taskIsSettled(task) ? task : { ...task, status: 'cancelled' as const, updatedAt: action.at },
      ]))
      next = replaceRun(current, { ...run, tasks, status: 'cancelled', completedAt: action.at })
      break
    }
    case 'run-finalized': {
      const run = requireRun(current, action.runId)
      if (run.status === 'cancelled') return current
      const status = deriveRunStatus(requirePlan(current, run.planId), run.tasks)
      next = replaceRun(current, {
        ...run,
        status,
        completedAt: runIsTerminal(status) ? action.at : undefined,
      })
      break
    }
    case 'authority-superseded': {
      const activeRun = current.activeRunId
        ? current.runs[current.activeRunId]
        : undefined
      if (!activeRun || runIsTerminal(activeRun.status)) {
        next = { ...current, activeRunId: undefined, activePlanId: undefined }
        break
      }
      const tasks = Object.fromEntries(Object.entries(activeRun.tasks).map(([taskId, task]) => [
        taskId,
        taskIsSettled(task) ? task : { ...task, status: 'cancelled' as const, updatedAt: action.at },
      ]))
      next = {
        ...current,
        runs: {
          ...current.runs,
          [activeRun.runId]: {
            ...activeRun,
            tasks,
            status: 'cancelled',
            completedAt: action.at,
          },
        },
        activeRunId: undefined,
        activePlanId: undefined,
      }
      break
    }
    default:
      next = reduceTaskAction(current, action)
      break
  }
  return assetProductionSnapshotSchema.parse({ ...next, revision: current.revision + 1 })
}

export function supersedeActiveProduction(
  snapshot: AssetProductionSnapshot,
  at = Date.now(),
): AssetProductionSnapshot {
  if (!snapshot.activeRunId && !snapshot.activePlanId) return snapshot
  return reduceAssetProduction(snapshot, { type: 'authority-superseded', at })
}

function reduceTaskAction(
  snapshot: AssetProductionSnapshot,
  action: Exclude<AssetProductionAction, {
    type: 'plan-registered' | 'run-started' | 'run-cancelled' | 'run-finalized' | 'authority-superseded'
  }>,
): AssetProductionSnapshot {
  const run = requireRun(snapshot, action.runId)
  assertRunMutable(run)
  const task = requireTask(run, action.taskId)
  let updated: ProductionTaskState

  switch (action.type) {
    case 'task-started':
      assertTaskStatus(task, ['queued', 'failed', 'needs-review'])
      updated = {
        ...task,
        status: 'generating',
        attempt: task.attempt + 1,
        candidate: undefined,
        output: undefined,
        issues: [],
        decision: undefined,
        evidence: undefined,
        updatedAt: action.at,
      }
      break
    case 'candidate-recorded':
      assertTaskStatus(task, ['generating'])
      updated = {
        ...task,
        status: 'candidate-ready',
        candidate: productionArtifactRefSchema.parse(action.artifact),
        evidence: action.evidence
          ? productionTaskEvidenceSchema.parse(action.evidence)
          : task.evidence,
        updatedAt: action.at,
      }
      break
    case 'review-started':
      assertTaskStatus(task, ['candidate-ready'])
      updated = { ...task, status: 'reviewing', updatedAt: action.at }
      break
    case 'review-recorded': {
      assertTaskStatus(task, ['reviewing'])
      const issues = action.issues.map((issue) => productionIssueSchema.parse(issue))
      const status = hasIntegrityBlocker(issues)
        ? 'failed'
        : hasQualityBlocker(issues)
          ? 'needs-review'
          : 'accepted'
      updated = { ...task, status, issues, updatedAt: action.at }
      break
    }
    case 'cut-started':
      assertTaskStatus(task, ['accepted'])
      updated = { ...task, status: 'cutting', updatedAt: action.at }
      break
    case 'verification-started':
      assertTaskStatus(task, ['accepted', 'cutting'])
      updated = { ...task, status: 'verifying', updatedAt: action.at }
      break
    case 'output-verified': {
      assertTaskStatus(task, ['verifying'])
      const artifact = productionArtifactRefSchema.parse(action.artifact)
      const issues = action.issues.map((issue) => productionIssueSchema.parse(issue))
      const status = hasIntegrityBlocker(issues)
        ? 'failed'
        : hasQualityBlocker(issues)
          ? 'needs-review'
          : 'ready'
      updated = { ...task, status, output: artifact, issues, decision: undefined, updatedAt: action.at }
      break
    }
    case 'task-failed': {
      assertTaskStatus(task, ['queued', 'generating', 'candidate-ready', 'reviewing', 'accepted', 'cutting', 'verifying', 'needs-review'])
      const issues = action.issues.map((issue) => productionIssueSchema.parse(issue))
      if (issues.length === 0) throw new Error('A failed production task requires evidence.')
      updated = { ...task, status: 'failed', issues, updatedAt: action.at }
      break
    }
    case 'task-cancelled':
      if (taskIsSettled(task)) throw new Error(`Settled task cannot be cancelled: ${task.taskId}`)
      updated = { ...task, status: 'cancelled', updatedAt: action.at }
      break
    case 'task-waived': {
      assertTaskStatus(task, ['needs-review'])
      const decision = productionDecisionReceiptSchema.parse(action.decision)
      const plan = requirePlan(snapshot, run.planId)
      assertDecisionMatches(task, decision, plan.sourceRevision.projectRevisionId)
      updated = { ...task, status: 'waived', decision, updatedAt: action.at }
      break
    }
  }

  return replaceRun(snapshot, {
    ...run,
    tasks: { ...run.tasks, [updated.taskId]: updated },
    status: deriveRunStatus(requirePlan(snapshot, run.planId), { ...run.tasks, [updated.taskId]: updated }),
  })
}

export function deriveRunStatus(
  plan: AssetProductionPlan,
  tasks: Readonly<Record<string, ProductionTaskState>>,
): ProductionRunStatus {
  const required = plan.tasks.filter((task) => task.required).map((task) => tasks[task.taskId])
  if (required.some((task) => !task)) return 'failed'
  if (required.length === 0) return 'completed'
  if (required.every((task) => task && taskIsConsumable(task))) return 'completed'
  if (required.some((task) => task?.status === 'needs-review')) return 'needs-review'
  const hasReady = required.some((task) => task && taskIsConsumable(task))
  const hasFailed = required.some((task) => task?.status === 'failed' || task?.status === 'cancelled')
  if (hasReady && hasFailed) return 'partial'
  if (required.every((task) => task?.status === 'failed' || task?.status === 'cancelled')) return 'failed'
  return 'running'
}

function taskIsConsumable(task: ProductionTaskState): boolean {
  return task.status === 'ready' || task.status === 'waived' || task.status === 'legacy-ready'
}

function taskIsSettled(task: ProductionTaskState): boolean {
  return taskIsConsumable(task) || task.status === 'failed' || task.status === 'cancelled'
}

function runIsTerminal(status: ProductionRunStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

function assertRunMutable(run: AssetProductionRun): void {
  if (run.status === 'completed' || run.status === 'cancelled') {
    throw new Error(`Asset production run is immutable after ${run.status}: ${run.runId}`)
  }
}

function assertTaskStatus(task: ProductionTaskState, allowed: readonly ProductionTaskState['status'][]): void {
  if (!allowed.includes(task.status)) {
    throw new Error(`Illegal asset task transition from ${task.status}: ${task.taskId}`)
  }
}

function requirePlan(snapshot: AssetProductionSnapshot, planId: string): AssetProductionPlan {
  const plan = snapshot.plans[planId]
  if (!plan) throw new Error(`Unknown asset production plan: ${planId}`)
  return plan
}

function requireRun(snapshot: AssetProductionSnapshot, runId: string): AssetProductionRun {
  const run = snapshot.runs[runId]
  if (!run) throw new Error(`Unknown asset production run: ${runId}`)
  return run
}

function requireTask(run: AssetProductionRun, taskId: string): ProductionTaskState {
  const task = run.tasks[taskId]
  if (!task) throw new Error(`Unknown asset production task: ${taskId}`)
  return task
}

function replaceRun(snapshot: AssetProductionSnapshot, run: AssetProductionRun): AssetProductionSnapshot {
  return {
    ...snapshot,
    runs: { ...snapshot.runs, [run.runId]: run },
    activeRunId: run.status === 'running' || run.status === 'partial' || run.status === 'needs-review'
      ? run.runId
      : snapshot.activeRunId === run.runId
        ? undefined
        : snapshot.activeRunId,
  }
}

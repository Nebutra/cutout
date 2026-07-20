import type {
  AssetProductionPlan,
  AssetProductionRun,
  AssetProductionSnapshot,
  ProductionArtifactRef,
  ProductionIssue,
  ProductionTaskStatus,
} from './contracts'
import { isConsumableTask } from './quality-policy'

export interface ProductionMaterialProjection {
  readonly taskId: string
  readonly runId: string
  readonly planId: string
  readonly manifestItemId: string
  readonly pageId: string
  readonly regionId: string
  readonly status: ProductionTaskStatus
  readonly artifact: ProductionArtifactRef
  readonly issues: readonly ProductionIssue[]
  readonly legacyUnverified: boolean
}

export interface ProductionReviewProjection {
  readonly runId: string
  readonly planId: string
  readonly taskId: string
  readonly manifestItemId: string
  readonly pageId: string
  readonly regionId: string
  readonly label?: string
  readonly status: Extract<ProductionTaskStatus, 'needs-review' | 'failed'>
  readonly artifact?: ProductionArtifactRef
  readonly issues: readonly ProductionIssue[]
}

export function projectProductionMaterials(
  snapshot: AssetProductionSnapshot,
  runId = currentProductionRunId(snapshot),
): readonly ProductionMaterialProjection[] {
  if (!runId) return []
  const run = snapshot.runs[runId]
  if (!run) return []
  const plan = snapshot.plans[run.planId]
  if (!plan) return []
  const taskById = new Map(plan.tasks.map((task) => [task.taskId, task]))
  return Object.values(run.tasks).flatMap((state) => {
    const task = taskById.get(state.taskId)
    const artifact = state.output ?? state.candidate
    if (!task || !artifact || !isConsumableTask(state)) return []
    return [{
      taskId: task.taskId,
      runId: run.runId,
      planId: plan.planId,
      manifestItemId: task.manifestItemId,
      pageId: task.pageId,
      regionId: task.regionId,
      status: state.status,
      artifact,
      issues: state.issues,
      legacyUnverified: state.status === 'legacy-ready',
    }]
  })
}

export function projectProductionReviewQueue(
  snapshot: AssetProductionSnapshot,
  runId = currentProductionRunId(snapshot),
): readonly ProductionReviewProjection[] {
  if (!runId) return []
  const run = snapshot.runs[runId]
  if (!run) return []
  const plan = snapshot.plans[run.planId]
  if (!plan) return []
  const taskById = new Map(plan.tasks.map((task) => [task.taskId, task]))
  return Object.values(run.tasks)
    .flatMap((state): readonly ProductionReviewProjection[] => {
      if (state.status !== 'needs-review' && state.status !== 'failed') return []
      const task = taskById.get(state.taskId)
      if (!task) return []
      return [{
        runId,
        planId: plan.planId,
        taskId: task.taskId,
        manifestItemId: task.manifestItemId,
        pageId: task.pageId,
        regionId: task.regionId,
        label: task.label,
        status: state.status,
        artifact: state.output ?? state.candidate,
        issues: state.issues,
      }]
    })
}

export function latestRunId(snapshot: AssetProductionSnapshot): string | undefined {
  return Object.values(snapshot.runs)
    .sort(compareRuns)
    .at(-1)?.runId
}

export function currentProductionRunId(
  snapshot: AssetProductionSnapshot,
): string | undefined {
  if (snapshot.activeRunId) return snapshot.activeRunId
  if (!snapshot.activePlanId) return undefined
  return Object.values(snapshot.runs)
    .filter((run) => run.planId === snapshot.activePlanId)
    .sort(compareRuns)
    .at(-1)?.runId
}

function compareRuns(left: AssetProductionRun, right: AssetProductionRun): number {
  return left.startedAt - right.startedAt || left.runId.localeCompare(right.runId)
}

export function taskForManifest(
  plan: AssetProductionPlan,
  manifestItemId: string,
) {
  return plan.tasks.find((task) => task.manifestItemId === manifestItemId)
}

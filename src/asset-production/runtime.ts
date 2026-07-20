import {
  assetProductionPlanSchema,
  type AssetProductionPlan,
  type AssetProductionRun,
  type AssetProductionTask,
  type ProductionArtifactRef,
  type ProductionIssue,
  type ProductionTaskEvidence,
} from './contracts'
import {
  beginAssetProduction,
  cancelAssetProduction,
  failAssetProductionTask,
  finalizeAssetProduction,
  publishStartedAssetProductionTask,
  startAssetProductionTask,
} from './coordinator'
import { integrityIssue } from './quality-policy'
import type { AssetProductionRepository } from './repository'

export interface AssetProductionExecutionResult {
  readonly candidate: ProductionArtifactRef
  readonly reviewIssues: readonly ProductionIssue[]
  readonly output?: ProductionArtifactRef
  readonly verificationIssues?: readonly ProductionIssue[]
  readonly evidence?: ProductionTaskEvidence
}

export interface AssetProductionExecutor {
  execute(input: {
    readonly plan: AssetProductionPlan
    readonly task: AssetProductionTask
    readonly runId: string
    readonly attempt: number
    readonly signal?: AbortSignal
  }): Promise<AssetProductionExecutionResult>
}

export interface AssetProductionRuntimeOptions {
  readonly repository: AssetProductionRepository
  readonly executors: Readonly<Partial<Record<AssetProductionTask['route'], AssetProductionExecutor>>>
  readonly now?: () => number
  readonly id?: () => string
}

export interface ExecuteAssetProductionOptions {
  readonly runId?: string
  readonly taskIds?: readonly string[]
  readonly signal?: AbortSignal
}

export function createAssetProductionRuntime(options: AssetProductionRuntimeOptions) {
  const now = options.now ?? Date.now
  const id = options.id ?? (() => crypto.randomUUID())

  async function execute(
    inputPlan: AssetProductionPlan,
    executeOptions: ExecuteAssetProductionOptions = {},
  ): Promise<AssetProductionRun> {
    const plan = assetProductionPlanSchema.parse(inputPlan)
    const runId = executeOptions.runId ?? `asset-run:${id()}`
    let snapshot = await options.repository.load()
    const existing = snapshot.runs[runId]
    if (existing) {
      if (existing.planHash !== plan.planHash) {
        throw new Error(`Asset production run ${runId} is bound to another plan.`)
      }
      return existing
    }

    snapshot = beginAssetProduction({ snapshot, plan, runId, at: now() })
    await options.repository.save(snapshot)
    const selected = executeOptions.taskIds?.length
      ? new Set(executeOptions.taskIds)
      : null

    try {
      for (const task of plan.tasks) {
        if (selected && !selected.has(task.taskId)) continue
        executeOptions.signal?.throwIfAborted()
        const executor = options.executors[task.route]
        if (!executor) {
          snapshot = failAssetProductionTask({
            snapshot,
            runId,
            taskId: task.taskId,
            issues: [integrityIssue('executor-unavailable', `No executor is registered for ${task.route}.`, now())],
            at: now(),
          })
          await options.repository.save(snapshot)
          continue
        }

        snapshot = startAssetProductionTask({ snapshot, runId, taskId: task.taskId, at: now() })
        await options.repository.save(snapshot)
        const attempt = snapshot.runs[runId]!.tasks[task.taskId]!.attempt
        try {
          const result = await executor.execute({
            plan,
            task,
            runId,
            attempt,
            signal: executeOptions.signal,
          })
          executeOptions.signal?.throwIfAborted()
          snapshot = publishStartedAssetProductionTask({
            snapshot,
            runId,
            taskId: task.taskId,
            artifact: result.output ?? result.candidate,
            candidate: result.candidate,
            reviewIssues: result.reviewIssues,
            verificationIssues: result.verificationIssues,
            evidence: result.evidence,
            cutBeforeVerification: task.route === 'board-cutout' || task.route === 'import-cutout',
            at: now(),
          })
          await options.repository.save(snapshot)
        } catch (error) {
          if (executeOptions.signal?.aborted || isAbort(error)) throw error
          const issues = errorIssues(error)
          snapshot = failAssetProductionTask({
            snapshot,
            runId,
            taskId: task.taskId,
            issues: issues.length > 0
              ? issues
              : [integrityIssue('executor-failed', errorText(error), now())],
            at: now(),
          })
          await options.repository.save(snapshot)
        }
      }
    } catch (error) {
      if (executeOptions.signal?.aborted || isAbort(error)) {
        snapshot = cancelAssetProduction(snapshot, runId, now())
        await options.repository.save(snapshot)
      } else {
        throw error
      }
    }

    snapshot = finalizeAssetProduction(snapshot, runId, now())
    await options.repository.save(snapshot)
    return snapshot.runs[runId]!
  }

  return { execute }
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function errorIssues(error: unknown): readonly ProductionIssue[] {
  if (!error || typeof error !== 'object' || !('issues' in error)) return []
  const issues = (error as { issues?: unknown }).issues
  return Array.isArray(issues) ? issues as ProductionIssue[] : []
}

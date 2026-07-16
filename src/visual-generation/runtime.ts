import type { AgentRunEvent } from '@/agent-runtime/run-events'
import type { MoneyEstimate } from '@/control-protocol/paid-tool-contract'
import { executeVisualGeneration, type VisualExecutionResult, type VisualExecutionStore, type VisualReviewer, type VisualToolInvoker, type VisualToolResult } from './executor'
import { planVisualGeneration } from './planner'
import { visualGenerationTaskSchema, type VisualGenerationPlan, type VisualGenerationTask } from './contracts'

export interface VisualTaskRuntime {
  plan(task: VisualGenerationTask): VisualGenerationPlan
  execute(runId: string, task: VisualGenerationTask, signal?: AbortSignal): Promise<VisualExecutionResult>
  executePlan(runId: string, plan: VisualGenerationPlan, signal?: AbortSignal): Promise<VisualExecutionResult>
}

export function createVisualTaskRuntime(input: {
  readonly tools: VisualToolInvoker
  readonly reviewer: VisualReviewer
  readonly store: VisualExecutionStore
  readonly estimates: { readonly generate: MoneyEstimate; readonly edit: MoneyEstimate }
  readonly append: (events: readonly AgentRunEvent[]) => void
  readonly now?: () => number
}): VisualTaskRuntime {
  const executePlan = (runId: string, plan: VisualGenerationPlan, signal?: AbortSignal) => executeVisualGeneration(runId, plan, { tools: input.tools, reviewer: input.reviewer, store: input.store, append: input.append, now: input.now, signal })
  return {
    plan: (task) => planVisualGeneration(visualGenerationTaskSchema.parse(task), input.estimates),
    execute: (runId, task, signal) => executePlan(runId, planVisualGeneration(visualGenerationTaskSchema.parse(task), input.estimates), signal),
    executePlan,
  }
}

interface StoredExecutionState { readonly version: 'visual-execution-store.v1'; readonly results: Readonly<Record<string, VisualExecutionResult>>; readonly attempts: Readonly<Record<string, VisualToolResult>> }

export function createStorageVisualExecutionStore(storage: Pick<Storage, 'getItem' | 'setItem'>, key = 'cutout.visual-execution.v1'): VisualExecutionStore {
  const read = (): StoredExecutionState => {
    const value = storage.getItem(key)
    if (!value) return { version: 'visual-execution-store.v1', results: {}, attempts: {} }
    const parsed = JSON.parse(value) as StoredExecutionState
    if (parsed.version !== 'visual-execution-store.v1' || !parsed.results || !parsed.attempts) throw new Error('Stored visual execution checkpoint is invalid.')
    return parsed
  }
  const update = (change: (state: StoredExecutionState) => StoredExecutionState) => storage.setItem(key, JSON.stringify(change(read())))
  return {
    get: (id) => read().results[id],
    put: (id, result) => update((state) => ({ ...state, results: { ...state.results, [id]: result } })),
    getAttempt: (id) => read().attempts[id],
    putAttempt: (id, result) => update((state) => ({ ...state, attempts: { ...state.attempts, [id]: result } })),
  }
}

export function approveFirstVisualCandidate(reviewer: 'agent' | 'deterministic-check' = 'agent', now = Date.now): VisualReviewer {
  return { async review({ gate, candidates }) { const selected = candidates[0]; if (!selected) return { ...gate, status: 'rejected', reviewer, evidence: ['No candidate was available.'], decidedAt: now() }; return { ...gate, status: 'approved', selectedCandidateId: selected.variantId, reviewer, evidence: ['Selected by the configured visual review policy.'], decidedAt: now() } } }
}

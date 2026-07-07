/**
 * Intent-driven plan orchestration (spec §6) — the decision between planning
 * autonomously and pausing for clarification, in ONE pure, testable function.
 *
 * From a brief on the **chat** slot it runs `recognizeIntent` → then, per
 * `intentNeedsClarification`:
 *   - low confidence / open questions → `{ kind: 'clarify', intent }` and STOPS
 *     (no graph is planned; the caller surfaces the questions).
 *   - otherwise → `planGraph({ brief, intent })` → `{ kind: 'planned', intent,
 *     graph }`, so the caller can run the graph.
 *
 * It deliberately does NOT run the graph (that is the Executor's job, already
 * tested) nor touch the store — it stays pure across the service seam and
 * returns a `Result`, mirroring `planGraph` / `recognizeIntent`. The mutation
 * hook (`hooks/queries/dag.ts`) records the intent + either stops or executes.
 */
import type { Result } from '@/services/types'
import { isErr, ok } from '@/services/types'
import type { GenerationService } from '@/services/ai/types'
import type { ReasoningEffort } from '@/services/ai/reasoning'
import type { GraphSpec } from './graph-spec'
import type { IntentProfile } from './intent-types'
import { intentNeedsClarification, recognizeIntent } from './intent'
import { planGraph } from './planner'

/** Inputs the caller resolves (chat model slot + the requirement brief). */
export interface PlanFromBriefParams {
  readonly providerId: string
  /** The resolved chat/vision model slug (Settings chat slot). */
  readonly model: string
  /** The vague product brief that drives recognition + planning. */
  readonly brief: string
  /** Thinking strength for the chat model (from its Settings assignment). */
  readonly effort?: ReasoningEffort
  readonly signal?: AbortSignal
}

/**
 * The outcome of the intent-driven plan step: either a clarification pause
 * (questions to answer, no graph) or a planned graph ready to run. The
 * recognized `intent` is carried on BOTH so the UI can always show the derived
 * understanding.
 */
export type PlanOutcome =
  | { readonly kind: 'clarify'; readonly intent: IntentProfile }
  | {
      readonly kind: 'planned'
      readonly intent: IntentProfile
      readonly graph: GraphSpec
    }

/**
 * Recognize the intent behind `brief`, then either pause for clarification or
 * plan a graph from the enriched intent. Returns the {@link PlanOutcome} on
 * success; a clear error otherwise (recognition failure or an invalid graph).
 */
export async function planFromBrief(
  generation: GenerationService,
  params: PlanFromBriefParams,
): Promise<Result<PlanOutcome>> {
  const recognized = await recognizeIntent(generation, params)
  if (isErr(recognized)) return recognized
  const intent = recognized.data

  // Open-world safety valve: don't guess when unsure — surface the questions.
  if (intentNeedsClarification(intent)) {
    return ok({ kind: 'clarify', intent })
  }

  const planned = await planGraph(generation, {
    providerId: params.providerId,
    model: params.model,
    brief: params.brief,
    intent,
    effort: params.effort,
    signal: params.signal,
  })
  if (isErr(planned)) return planned

  return ok({ kind: 'planned', intent, graph: planned.data })
}

/**
 * Planner (spec §4/§C + §6) — turn a requirement into a validated {@link GraphSpec}.
 *
 * Rides the Settings **chat** slot: `GenerationService.generateObject` resolves +
 * renders the `ui-graph-planner` prompt, sends the requirement as a call-time
 * text part, and enforces `graphSpecSchema` structurally at the model boundary.
 * We then run `validateGraph` (unique ids, no dangling edges, `inputs ⊆ edges`,
 * ACYCLIC) so a shape-valid-but-cyclic reply is rejected BEFORE the Executor
 * ever sees it — the Planner is re-promptable on failure.
 *
 * INTENT-DRIVEN (spec §6): when the caller supplies an enriched
 * {@link IntentProfile}, the requirement text is composed from the reconstructed
 * goal + self-derived strategy + mined dimensions + assumptions, so the graph is
 * shaped from the RECOGNIZED intent rather than the raw brief. When no intent is
 * supplied the planner falls back to the raw brief unchanged (the "skip intent"
 * path when no chat model recognized one upstream).
 *
 * Pure across the service seam: it never throws — it returns a `Result` and the
 * caller (a mutation hook) decides how to surface failures.
 */
import type { Result } from '@/services/types'
import { err, isErr, ok } from '@/services/types'
import type { GenerationService } from '@/services/ai/types'
import type { ReasoningEffort } from '@/services/ai/reasoning'
import { graphSpecSchema, type GraphSpec } from './graph-spec'
import type { IntentProfile } from './intent-types'
import { validateGraph } from './validate'

/** Inputs the caller resolves (chat model slot + the requirement + optional intent). */
export interface PlanGraphParams {
  readonly providerId: string
  /** The resolved chat/vision model slug (Settings chat slot). */
  readonly model: string
  /** The product requirement the Planner turns into a graph. */
  readonly brief: string
  /**
   * The enriched, self-derived understanding of the brief (spec §3). When
   * present the requirement is composed from it; when absent the planner uses
   * the raw brief (skip-intent fallback).
   */
  readonly intent?: IntentProfile
  /** Thinking strength for the chat model (from its Settings assignment). */
  readonly effort?: ReasoningEffort
  readonly signal?: AbortSignal
}

/**
 * Compose the requirement text the Planner reads. With an {@link IntentProfile}
 * it serializes the reconstructed goal, self-derived strategy + rationale, the
 * mined dimensions and the stated assumptions into a compact block (the original
 * brief is kept as context); without one it returns the trimmed brief verbatim.
 */
export function composePlannerRequirement(
  brief: string,
  intent?: IntentProfile,
): string {
  if (!intent) return brief

  const lines: string[] = [
    'Reconstructed intent — shape the graph from THIS understanding:',
    '',
    `GOAL: ${intent.goal}`,
    `STRATEGY: ${intent.strategy}`,
    `RATIONALE: ${intent.rationale}`,
  ]

  if (intent.dimensions.length > 0) {
    lines.push('DIMENSIONS:')
    for (const d of intent.dimensions) lines.push(`- ${d.aspect}: ${d.value}`)
  }
  if (intent.assumptions.length > 0) {
    lines.push('ASSUMPTIONS:')
    for (const a of intent.assumptions) lines.push(`- ${a}`)
  }

  lines.push('', `ORIGINAL BRIEF: ${brief}`)
  return lines.join('\n')
}

/**
 * Ask the chat model to plan a graph for the requirement. Returns the validated
 * {@link GraphSpec} on success; a clear error otherwise (empty brief, generation
 * failure, or a structurally invalid graph). When `params.intent` is set the
 * requirement is composed from the recognized intent (spec §6).
 */
export async function planGraph(
  generation: GenerationService,
  params: PlanGraphParams,
): Promise<Result<GraphSpec>> {
  const brief = params.brief.trim()
  if (brief.length === 0) return err('A requirement brief is required.')

  const requirement = composePlannerRequirement(brief, params.intent)

  const result = await generation.generateObject(
    {
      providerId: params.providerId,
      model: params.model,
      promptRef: { id: 'ui-graph-planner' },
      input: [{ type: 'text', text: requirement }],
      reasoningEffort: params.effort,
      signal: params.signal,
    },
    graphSpecSchema,
  )
  if (isErr(result)) return result

  const validation = validateGraph(result.data)
  if (isErr(validation)) {
    return err(`The planner produced an invalid graph: ${validation.error}`)
  }

  return ok(result.data)
}

/**
 * Planner (spec §4/§C) — turn a requirement into a validated {@link GraphSpec}.
 *
 * Rides the Settings **chat** slot: `GenerationService.generateObject` resolves +
 * renders the `ui-graph-planner` prompt, sends the brief as a call-time text
 * part, and enforces `graphSpecSchema` structurally at the model boundary. We
 * then run `validateGraph` (unique ids, no dangling edges, `inputs ⊆ edges`,
 * ACYCLIC) so a shape-valid-but-cyclic reply is rejected BEFORE the Executor
 * ever sees it — the Planner is re-promptable on failure.
 *
 * Pure across the service seam: it never throws — it returns a `Result` and the
 * caller (a mutation hook) decides how to surface failures.
 */
import type { Result } from '@/services/types'
import { err, isErr, ok } from '@/services/types'
import type { GenerationService } from '@/services/ai/types'
import { graphSpecSchema, type GraphSpec } from './graph-spec'
import { validateGraph } from './validate'

/** Inputs the caller resolves (chat model slot + the requirement brief). */
export interface PlanGraphParams {
  readonly providerId: string
  /** The resolved chat/vision model slug (Settings chat slot). */
  readonly model: string
  /** The product requirement the Planner turns into a graph. */
  readonly brief: string
  readonly signal?: AbortSignal
}

/**
 * Ask the chat model to plan a graph for `brief`. Returns the validated
 * {@link GraphSpec} on success; a clear error otherwise (empty brief, generation
 * failure, or a structurally invalid graph).
 */
export async function planGraph(
  generation: GenerationService,
  params: PlanGraphParams,
): Promise<Result<GraphSpec>> {
  const brief = params.brief.trim()
  if (brief.length === 0) return err('A requirement brief is required.')

  const result = await generation.generateObject(
    {
      providerId: params.providerId,
      model: params.model,
      promptRef: { id: 'ui-graph-planner' },
      input: [{ type: 'text', text: brief }],
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

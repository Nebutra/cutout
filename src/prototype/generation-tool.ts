/**
 * `proceed_with_generation` — the model's explicit "run the design pipeline"
 * decision, plus an optional refined brief it composes from a messy/rambling
 * user message before the expensive generation runs.
 *
 * This is a PURE decision tool (the pattern the other tool-gate tools use, and
 * the RIGHT way to tool-ify generation — see memory
 * `agent-generation-execution-not-tool-ified`): `execute()` has no side
 * effects, does no generation, and never touches the lease/checkpoint
 * machinery. It returns a decision that `createAssets()` folds into the SAME,
 * unmodified `researchedBrief`/`planPrototypeSuite`/`generatePrototypeSuite`
 * call. Because it can never fire concurrently with a paid generation (it runs
 * in the pre-generation tool gate), there is no paid-generation race.
 */
import { z } from 'zod'
import type { AgentToolDefinition } from '@/agent-runtime/tool-loop'
import { generatedPrototypePlanningSeedSchema } from './prototype-plan'

// A complete multi-suite seed carries route topology plus heterogeneous material
// plans. This is a transport ceiling only; it never determines suite, page, or
// material counts. The former generic 6k tool-gate ceiling truncated valid
// three-suite seeds and silently forced a second Planner pass.
export const GENERATION_DECISION_MAX_OUTPUT_TOKENS = 16_000

export const generationDecisionSchema = z.object({
  refinedBrief: z
    .string()
    .min(1)
    .describe(
      'A clean, self-contained restatement of exactly what to design/build, distilled from the ' +
        "user's message (resolve rambling, contradictions, or asides into one clear brief). Keep the " +
        "user's intent and every concrete requirement; do not invent scope they did not ask for.",
    ),
  planningSeed: generatedPrototypePlanningSeedSchema.describe(
    'A compact, complete Agent-authored planning seed. Author one suite per requested Design System '
      + 'direction. Each suite owns a distinct route graph derived from the business domain, content '
      + 'model, platform conventions, and complete user journeys. A user-mentioned page count is scope '
      + 'context, not authority to pad or truncate the graph. Use rationale to justify a materially '
      + 'different topology. For every route, list zero or more non-UI visual materials genuinely worth '
      + 'reusing and choose board-cutout or direct-generate from the material itself. Assign stable '
      + 'boardGroupId values so only coherent atomic materials share a board; split unrelated or dense '
      + 'sets into multiple groups. Never invent a fixed per-page quantity or classify code-reproducible '
      + 'UI as material.',
  ),
})

export type GenerationDecision = z.infer<typeof generationDecisionSchema>

export function proceedWithGenerationTool(): AgentToolDefinition<
  GenerationDecision,
  GenerationDecision
> {
  return {
    name: 'proceed_with_generation',
    description:
      'Proceed to generate the design/prototype from the user\'s request, optionally distilling a '
      + 'clearer brief first. Call this when the message IS a request to design or build something and '
      + 'is clear enough to proceed — especially when the phrasing is rambling or buried in asides and '
      + 'a cleaned-up brief would produce a better result. Do NOT call this for a greeting, a question, '
      + 'or a request that is too vague to plan from (use reply_conversationally or '
      + 'ask_clarifying_question instead). Ask before calling when an unresolved choice would materially '
      + 'change the route topology. Otherwise the planning seed is authoritative for creative direction '
      + 'and route identity: derive each complete suite from its domain and journeys, include one suite '
      + 'per requested Design System direction, and justify any material difference from a user-mentioned '
      + 'page count in the seed rationale. Board grouping is also an Agent planning decision, not one '
      + 'implicit board per page.',
    inputSchema: generationDecisionSchema,
    isReadOnly: true,
    async execute(input) {
      return input
    },
  }
}

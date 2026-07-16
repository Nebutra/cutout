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

export const generationDecisionSchema = z.object({
  refinedBrief: z
    .string()
    .min(1)
    .describe(
      'A clean, self-contained restatement of exactly what to design/build, distilled from the ' +
        "user's message (resolve rambling, contradictions, or asides into one clear brief). Keep the " +
        "user's intent and every concrete requirement; do not invent scope they did not ask for.",
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
      + 'ask_clarifying_question instead).',
    inputSchema: generationDecisionSchema,
    isReadOnly: true,
    async execute(input) {
      return input
    },
  }
}

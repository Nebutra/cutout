/**
 * Exposes control over the prototype suite's regeneration strategy as a
 * tool — today "regenerate the design system from scratch vs. reuse it" and
 * "generate pages serially vs. in parallel" are decided by pure heuristics
 * (`isPrototypeSuiteComplete`, a page-count threshold) with no natural-
 * language path at all. This tool doesn't do any generation itself — it's a
 * pure decision the model makes from the brief; the caller feeds that
 * decision into the SAME, unmodified `generatePrototypeSuite(...)` call
 * that already exists, so none of its checkpoint/lease/store-coupled
 * machinery is touched.
 */
import { z } from 'zod'
import type { AgentToolDefinition } from '@/agent-runtime/tool-loop'

export const regenerationDecisionSchema = z.object({
  forceRegenerateDesignSystem: z.boolean()
    .describe('True to regenerate the design system from scratch even if a complete one already exists; false to keep the existing one unchanged.'),
  parallelPageGeneration: z.enum(['auto', 'parallel', 'serial']).default('auto')
    .describe('"parallel" to generate pages concurrently, "serial" to generate them one at a time, "auto" to keep the default page-count-based choice.'),
})

export type RegenerationDecision = z.infer<typeof regenerationDecisionSchema>

export function configureRegenerationTool(): AgentToolDefinition<RegenerationDecision, RegenerationDecision> {
  return {
    name: 'configure_prototype_regeneration',
    description:
      'Decide how to regenerate the current prototype suite. Call this ONLY when the user is '
      + 'explicitly asking to redo/regenerate the design system, or to control whether pages '
      + 'generate in parallel or one at a time. Do not call this for a request to design '
      + 'something new from scratch, or any request unrelated to regeneration strategy.',
    inputSchema: regenerationDecisionSchema,
    isReadOnly: true,
    async execute(input) {
      return input
    },
  }
}

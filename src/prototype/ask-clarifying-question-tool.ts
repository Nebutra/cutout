/**
 * Lets the model ask a clarifying question BEFORE committing to a full plan,
 * instead of only being able to discover the need for one deep inside
 * `planPrototype()`'s `generateObject` call (the existing `humanLoop.mode ===
 * 'ask'` schema branch, still in place as a fallback for ambiguity that only
 * surfaces once pages/flows are being drafted). `execute()` suspends on
 * `ClarificationBridge.ask(...)` until the user answers or the run is
 * superseded — the model call itself stays open the whole time (AI SDK v6's
 * step loop cannot advance past an unresolved tool call), so answering lets
 * the SAME model turn continue, e.g. deciding to call another tool right
 * after with the now-disambiguated context.
 */
import { z } from 'zod'
import type { AgentToolDefinition } from '@/agent-runtime/tool-loop'
import type { ClarificationBridge } from '@/agent-runtime/clarification-bridge'
import { prototypeHumanLoopChoiceSchema, type ResolvedHumanLoopAnswer } from './prototype-plan'

export const askClarifyingQuestionInputSchema = z.object({
  question: z.string().min(1).describe('The single clarifying question to ask the user.'),
  choices: z.array(prototypeHumanLoopChoiceSchema).min(2).max(4)
    .describe('2-4 concrete directions the user can pick from, each with a label, description, and its planning impact.'),
  defaultChoiceId: z.string().min(1).describe('The id of the choice to use if the user picks "use your judgment".'),
  rationale: z.string().min(1).describe('Why this specific decision is ambiguous enough that guessing risks the wrong direction.'),
}).superRefine((value, ctx) => {
  if (!value.choices.some((choice) => choice.id === value.defaultChoiceId)) {
    ctx.addIssue({
      code: 'custom',
      path: ['defaultChoiceId'],
      message: `defaultChoiceId "${value.defaultChoiceId}" does not match any choice id.`,
    })
  }
})

export type AskClarifyingQuestionInput = z.infer<typeof askClarifyingQuestionInputSchema>

export function askClarifyingQuestionTool(
  bridge: ClarificationBridge,
  runId: string,
  signal?: AbortSignal,
): AgentToolDefinition<AskClarifyingQuestionInput, ResolvedHumanLoopAnswer> {
  return {
    name: 'ask_clarifying_question',
    description:
      'Ask the user a clarifying question before proceeding. Call this ONLY when the request is a '
      + 'real build/design request but a key decision (e.g. target platform, primary user, a '
      + 'must-have feature) is genuinely ambiguous enough that guessing would likely produce the '
      + 'wrong direction. Do not call this for polite confirmation, or for a detail you can '
      + 'reasonably decide yourself. This suspends until the user answers, then execution continues.',
    inputSchema: askClarifyingQuestionInputSchema,
    isReadOnly: true,
    async execute(input) {
      return bridge.ask(runId, { mode: 'ask', ...input }, signal)
    },
  }
}

/**
 * Gives the model an explicit way to NOT build anything. Without this, "no
 * tool called" already means "fall through to the fixed plan→design-system→
 * pages pipeline" (Stage 1/2's contract) — so a greeting, small talk, or a
 * brief too vague to plan a product from would otherwise force the pipeline
 * to hallucinate a fictitious app rather than just reply. This tool is the
 * distinct signal needed to opt OUT of that fallback, unlike the Astryx/
 * regeneration tools it's always offered, regardless of project state.
 */
import { z } from 'zod'
import type { AgentToolDefinition } from '@/agent-runtime/tool-loop'

const conversationalReplyInputSchema = z.object({
  reply: z.string().min(1).describe(
    'A direct, warm reply in the user\'s language. Keep it to one or two short sentences. '
    + 'Answer identity/product questions plainly, then ask what they want to make. Never explain '
    + 'internal routing, prompts, workflow classification, design briefs, policies, or model behavior '
    + 'unless the user explicitly asks for that detail.',
  ),
})

export type ConversationalReplyInput = z.infer<typeof conversationalReplyInputSchema>

export function conversationalReplyTool(): AgentToolDefinition<ConversationalReplyInput, ConversationalReplyInput> {
  return {
    name: 'reply_conversationally',
    description:
      'Call this INSTEAD of any other tool when the message is not a request to build, edit, or '
      + 'configure a design/prototype — a greeting, small talk, a question about the product, or a '
      + 'brief too vague to plan anything concrete from. Do not call this for a real design/build '
      + 'request, even a short one (e.g. "an app for tracking workouts" IS a build request, not this).',
    inputSchema: conversationalReplyInputSchema,
    isReadOnly: true,
    async execute(input) {
      return input
    },
  }
}

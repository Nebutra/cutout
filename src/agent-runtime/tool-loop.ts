/**
 * A generic, provider-agnostic tool-calling loop — the Agent runtime's
 * replacement for keyword sniffing and pre-computed task graphs. The model
 * decides whether (and how) to call any registered tool from natural
 * language, in one central list per call (Claude Code's `assembleToolPool`
 * pattern: one list, the model's decision, not a chain of single-tool
 * gates). If the model calls nothing, the caller falls back to whatever it
 * did before this loop existed — this is additive, not a replacement.
 *
 * A tool is a plain data object (name/description/Zod input schema/execute/
 * isReadOnly), matching the shape Claude Code's own tool system uses: no
 * class hierarchy. `isReadOnly` mirrors Claude Code's tool metadata — it's
 * informational today (every registered tool so far is read-only/side-
 * effect-free from the app's perspective), but future mutating tools should
 * set it `false` so callers can gate them (e.g. behind confirmation) the
 * moment one exists, rather than retrofitting the check later.
 */
import { createRunEvent, type AgentRunEvent } from './run-events'
import type { GenerationService, GenerationTool } from '@/services/ai/types'
import type { PersonalizationReceiptFlags } from '@/services/ai/types'
import { isErr, type Result } from '@/services/types'

/** Re-exported under this module's own name — the vocabulary tool authors reach for. */
export interface AgentToolDefinition<TInput = unknown, TOutput = unknown>
  extends GenerationTool<TInput, TOutput> {
  /** Defaults to true. Set false for a tool that mutates state beyond its own return value. */
  readonly isReadOnly?: boolean
}

export interface ToolLoopInput {
  readonly runId: string
  readonly providerId: string
  readonly model?: string
  /** Full instruction text: framing + any grounding context + the user's brief. */
  readonly prompt: string
  readonly tools: readonly AgentToolDefinition[]
  /** Steps the model gets to decide-then-observe. 2 covers "call once (or several), then summarize". */
  readonly maxSteps?: number
  readonly signal?: AbortSignal
}

export interface ToolLoopCall {
  /** The provider-assigned call ID — the real correlation key when a tool is called more than once in one turn. */
  readonly toolCallId: string
  readonly toolName: string
  readonly toolInput: unknown
  readonly toolOutput: unknown
  /** False when the model named a tool that isn't in this call's registry. */
  readonly registered: boolean
  /** Set when the tool was registered but its `execute` threw. */
  readonly error?: string
}

export interface ToolLoopResult {
  /** Whether the model elected to call any registered tool at all. */
  readonly called: boolean
  /** One entry per tool call the model made this turn — a single turn can call more than one. */
  readonly calls: readonly ToolLoopCall[]
  /** The model's final text — its reply when it didn't call a tool, or a summary when it did. */
  readonly text: string
  readonly events: readonly AgentRunEvent[]
  readonly personalizationReceipt?:PersonalizationReceiptFlags
}

const DEFAULT_MAX_STEPS = 2

/**
 * Short labels for durable run events and the Agent activity UI.
 * Model-facing `description` strings are instructions, not human titles.
 */
const TOOL_EVENT_LABELS: Readonly<Record<string, string>> = {
  reply_conversationally: 'Replying',
  ask_clarifying_question: 'Asking for clarification',
  proceed_with_generation: 'Preparing generation',
  compile_astryx_theme: 'Compiling Astryx theme',
  configure_prototype_regeneration: 'Configuring regeneration',
  select_pages_to_regenerate: 'Selecting pages',
}

/** Tools that only produce conversation (or silence). They must not appear as ops log rows. */
export const CHAT_SURFACE_TOOLS: ReadonlySet<string> = new Set([
  'reply_conversationally',
])

export function toolEventLabel(toolName: string): string {
  return TOOL_EVENT_LABELS[toolName] ?? toolName.replaceAll('_', ' ')
}

export async function runToolLoop(
  generation: Pick<GenerationService, 'generateWithTools'>,
  input: ToolLoopInput,
): Promise<Result<ToolLoopResult>> {
  const byName = new Map(input.tools.map((tool) => [tool.name, tool]))
  const result = await generation.generateWithTools({
    providerId: input.providerId,
    model: input.model,
    prompt: input.prompt,
    tools: input.tools,
    maxSteps: input.maxSteps ?? DEFAULT_MAX_STEPS,
    signal: input.signal,
  })
  if (isErr(result)) return result

  const events: AgentRunEvent[] = []
  const calls: ToolLoopCall[] = []
  for (const call of result.data.toolCalls) {
    const tool = byName.get(call.toolName)
    const toolCallId = call.toolCallId
    // Event labels are human UI copy. Never reuse the model-facing description
    // (often a multi-sentence "Call this INSTEAD…" instruction).
    const label = toolEventLabel(call.toolName)
    events.push(createRunEvent(input.runId, {
      type: 'tool-started',
      toolCallId,
      tool: call.toolName,
      label,
    }))

    if (!tool) {
      events.push(createRunEvent(input.runId, {
        type: 'tool-failed',
        toolCallId,
        tool: call.toolName,
        label,
        detail: `The model called an unregistered tool: ${call.toolName}`,
      }))
      calls.push({ toolCallId, toolName: call.toolName, toolInput: call.input, toolOutput: undefined, registered: false })
      continue
    }

    if (call.error) {
      events.push(createRunEvent(input.runId, {
        type: 'tool-failed',
        toolCallId,
        tool: call.toolName,
        label,
        detail: call.error,
      }))
      calls.push({
        toolCallId,
        toolName: call.toolName,
        toolInput: call.input,
        toolOutput: undefined,
        registered: true,
        error: call.error,
      })
      continue
    }

    events.push(createRunEvent(input.runId, {
      type: 'tool-succeeded',
      toolCallId,
      tool: call.toolName,
      label,
      outputRefs: [],
    }))
    calls.push({ toolCallId, toolName: call.toolName, toolInput: call.input, toolOutput: call.output, registered: true })
  }

  return { ok: true, data: { called: calls.length > 0, calls, text: result.data.text, events, ...(result.data.personalizationReceipt?{personalizationReceipt:result.data.personalizationReceipt}:{}) } }
}

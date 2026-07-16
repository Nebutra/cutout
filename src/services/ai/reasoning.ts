/**
 * Thinking-strength (reasoning effort) for the chat/understanding slot.
 *
 * Each vendor defines its OWN reasoning knob — there is no universal field:
 *   - OpenAI   `providerOptions.openai.reasoningEffort`      (enum)
 *   - Anthropic `providerOptions.anthropic.thinking:{adaptive}` + `effort` (enum)
 *   - Google   `providerOptions.google.thinkingConfig.thinkingLevel` (enum)
 * (verified against the installed @ai-sdk/* packages, 2026-07).
 *
 * We expose only the subset EVERY direct vendor accepts — `low | medium | high` —
 * so a selection never errors regardless of which model the user typed. "Default"
 * is the absence of a value: we send nothing and the model uses its own default.
 *
 * Compatible providers must first resolve a verified protocol in the model
 * route. Callers then pass that protocol here; a free-text model slug alone is
 * never used to guess an option shape.
 */
import type { ProviderKind } from './provider-types'

/** The user-selectable thinking strengths (universally-supported subset). */
export type ReasoningEffort = 'low' | 'medium' | 'high'

/** Ordered options for the settings selector (`undefined` = provider default). */
export const REASONING_EFFORTS: readonly ReasoningEffort[] = [
  'low',
  'medium',
  'high',
] as const

/** JSON value — structurally identical to the AI SDK's `JSONValue`. */
type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[]

/**
 * The AI SDK `providerOptions` shape (vendor key → option bag). Values are
 * JSON-safe, so this is assignable to the SDK's `ProviderOptions` parameter
 * without pulling a transitive `@ai-sdk/*` type into this module.
 */
export type ReasoningProviderOptions = Record<string, Record<string, JsonValue>>

/**
 * Translate a chosen effort into the AI SDK `providerOptions` fragment for a
 * provider kind. Returns `{}` when no effort is set, or for kinds whose upstream
 * vendor we can't safely target.
 */
export function reasoningProviderOptions(
  kind: ProviderKind,
  effort: ReasoningEffort | undefined,
): ReasoningProviderOptions {
  if (!effort) return {}
  switch (kind) {
    case 'openai':
      return { openai: { reasoningEffort: effort } }
    case 'anthropic':
      return { anthropic: { thinking: { type: 'adaptive' }, effort } }
    case 'google':
      return { google: { thinkingConfig: { thinkingLevel: effort } } }
    default:
      // gateway / openai-compatible: unknown upstream vendor → send nothing.
      return {}
  }
}

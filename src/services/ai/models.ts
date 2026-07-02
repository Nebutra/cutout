/**
 * Per-kind default model slugs (spec §4 / §13-6).
 *
 * These are **defaults and UI hints only** — the user can type any slug in the
 * Settings form, and the value is stored on `ProviderConfig.defaultModel`. Model
 * catalogs drift fast; treat these as sensible starting points, not a source of
 * truth. Slug conventions:
 *   - direct providers use a bare model id (`claude-sonnet-4.6`, `gpt-5.4`)
 *   - gateway uses `provider/model` (`anthropic/claude-sonnet-4.6`)
 */
import type { ProviderKind } from './provider-types'

/** The slug pre-filled when a user picks a kind (before they override it). */
export const DEFAULT_MODEL: Record<ProviderKind, string> = {
  anthropic: 'claude-sonnet-4.6',
  openai: 'gpt-5.4',
  google: 'gemini-2.5-flash',
  gateway: 'anthropic/claude-sonnet-4.6',
  'openai-compatible': 'gpt-4o-mini',
}

/** Optional suggestion lists for a Settings datalist/combobox (non-exhaustive). */
export const SUGGESTED_MODELS: Record<ProviderKind, readonly string[]> = {
  anthropic: ['claude-sonnet-4.6', 'claude-opus-4.6', 'claude-haiku-4.6'],
  openai: ['gpt-5.4', 'gpt-5.4-mini'],
  google: ['gemini-2.5-flash', 'gemini-2.5-pro'],
  gateway: [
    'anthropic/claude-sonnet-4.6',
    'openai/gpt-5.4',
    'google/gemini-2.5-flash',
  ],
  'openai-compatible': [],
}

/** Resolve the effective model for a call: explicit override → config default. */
export function resolveModel(
  kind: ProviderKind,
  configDefault: string | undefined,
  override: string | undefined,
): string {
  return override?.trim() || configDefault?.trim() || DEFAULT_MODEL[kind]
}

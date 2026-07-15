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
export const DEFAULT_MODEL: Record<string, string> = {
  anthropic: 'claude-sonnet-4.6',
  openai: 'gpt-5.4',
  google: 'gemini-2.5-flash',
  gateway: 'anthropic/claude-sonnet-4.6',
  'openai-compatible': 'gpt-4o-mini',
  dashscope:'qwen-plus',deepseek:'deepseek-chat',zhipu:'glm-4.5',moonshot:'kimi-k2',volcengine:'doubao-seed-1-6',siliconflow:'Qwen/Qwen3-8B',openrouter:'openai/gpt-4o-mini',together:'meta-llama/Llama-3.3-70B-Instruct-Turbo',groq:'llama-3.3-70b-versatile',fireworks:'accounts/fireworks/models/llama-v3p3-70b-instruct',xai:'grok-4',mistral:'mistral-large-latest',ollama:'qwen3',vllm:'default','lm-studio':'local-model',
}

/** Optional suggestion lists for a Settings datalist/combobox (non-exhaustive). */
export const SUGGESTED_MODELS: Record<string, readonly string[]> = {
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

/**
 * Curated shortlist of mainstream model slugs for the Settings model picker —
 * surfaced for relays / `openai-compatible` (and gateway) endpoints that proxy
 * many upstreams, so users can pick a popular model instead of recalling exact
 * slugs. Hand-curated snapshot (niche providers intentionally omitted) informed
 * by the models.dev catalog (https://models.dev) — refresh it there. The field
 * stays free-text and case-sensitive; these are only suggestions.
 */
export const POPULAR_MODELS: readonly string[] = [
  // OpenAI — chat / reasoning
  'gpt-5.5',
  'gpt-5',
  'gpt-5-mini',
  'gpt-4.1',
  'gpt-4o',
  'o3',
  'o4-mini',
  // OpenAI — image
  'gpt-image-2',
  'gpt-image-1',
  'dall-e-3',
  // Anthropic
  'claude-opus-4-8',
  'claude-sonnet-5',
  'claude-haiku-4-5',
  // Google
  'gemini-3-pro',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-3.1-flash-image-preview',
  'gemini-2.5-flash-image',
  'imagen-3',
  // xAI
  'grok-4',
]

/** Resolve the effective model for a call: explicit override → config default. */
export function resolveModel(
  kind: ProviderKind,
  configDefault: string | undefined,
  override: string | undefined,
): string {
  return override?.trim() || configDefault?.trim() || DEFAULT_MODEL[kind]
}

/**
 * Model slug helpers.
 *
 * There is deliberately **no per-kind default model table** here any more. A
 * provider is a connection (layer 1); which model serves a call comes from the
 * task binding (layer 3, `task-routing.ts`) and is validated against the
 * connection's probed catalog (layer 2, `ProviderConfig.catalog`). Guessing a
 * slug from the provider kind used to let a call reach a model the user never
 * configured, so that fallback is gone: an unresolved model is an error.
 */

/**
 * Curated shortlist of mainstream model slugs, offered only as *suggestions* in
 * the manual-entry escape hatch for endpoints that serve no catalog. Never a
 * routing fallback. Hand-curated snapshot (niche providers intentionally
 * omitted) informed by the models.dev catalog (https://models.dev) — refresh it
 * there. The field stays free-text and case-sensitive.
 */
export const POPULAR_MODELS: readonly string[] = [
  // OpenAI — chat / reasoning
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
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
  'grok-imagine-image-quality',
  'grok-imagine-image',
]

/**
 * The model slug for one call, or `undefined` when nothing was bound.
 *
 * Callers must treat `undefined` as a hard error — routing a request to a
 * guessed slug bills the user for a model they never chose and produces
 * failures that look like provider outages.
 */
export function resolveModel(override: string | undefined): string | undefined {
  const trimmed = override?.trim()
  return trimmed ? trimmed : undefined
}

/** The error surfaced when layer 3 bound no model for a call. */
export const NO_MODEL_BOUND =
  'No model is bound for this task. Assign one in Settings → AI → Assign models to tasks.'

/**
 * BYOK provider model (spec §4) — the non-secret shape.
 *
 * A `ProviderConfig` is a user-configured connection. It is stored as plain JSON
 * in the app-config dir (via the Rust `load_providers`/`save_providers`
 * commands) and carries **no key**: the secret lives only in the OS keychain,
 * referenced by `id`. Gateway is modeled as "just a provider" (`kind:'gateway'`).
 *
 * Field casing is the on-the-wire shape the Rust `providers.rs` serde struct
 * uses (`#[serde(rename_all="camelCase")]`), so `baseUrl` here maps 1:1 to the
 * persisted JSON. (The AI SDK factory option is spelled `baseURL`; the mapping
 * happens in `generation-service.local.ts`.)
 */
import { z } from 'zod'

/** Every provider kind Rust knows how to inject auth for (spec §4). */
export type ProviderKind =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'gateway'
  | 'openai-compatible'

/** The ordered, user-selectable kinds (drives the Settings `Select`). */
export const PROVIDER_KINDS: readonly ProviderKind[] = [
  'anthropic',
  'openai',
  'google',
  'gateway',
  'openai-compatible',
] as const

/** A user-configured provider connection. NO key field — see module doc. */
export interface ProviderConfig {
  /** Stable uuid; also the keychain entry account (`provider:{id}`). */
  readonly id: string
  readonly kind: ProviderKind
  /** User-facing name ("My Anthropic", "Team Gateway"). */
  readonly label: string
  /** Required for `openai-compatible`; optional override for other kinds. */
  readonly baseUrl?: string
  /** Default model slug, e.g. `claude-sonnet-4.6` or `anthropic/claude-sonnet-4.6`. */
  readonly defaultModel: string
  readonly enabled: boolean
}

/** A new-or-updated provider: `id` optional (generated on create). */
export type ProviderDraft = Omit<ProviderConfig, 'id'> & { readonly id?: string }

/**
 * Boundary validation for provider config coming back from Rust / a form.
 * Kept permissive on `baseUrl` (host allowlisting is enforced in Rust, not here)
 * so we never reject a persisted config the UI could otherwise repair.
 */
export const providerKindSchema = z.enum([
  'anthropic',
  'openai',
  'google',
  'gateway',
  'openai-compatible',
])

export const providerConfigSchema = z.object({
  id: z.string().min(1),
  kind: providerKindSchema,
  label: z.string().min(1),
  baseUrl: z.string().min(1).optional(),
  defaultModel: z.string().min(1),
  enabled: z.boolean(),
})

/** Parse an unknown array (e.g. `load_providers` result) into typed configs. */
export const providerConfigsSchema = z.array(providerConfigSchema)

/**
 * BYOK service contracts (spec §5) — the swap seam for AI.
 *
 * Two interfaces, mirroring the existing `services/types.ts` pattern:
 *  - `ProviderService` — key + provider-config management. The secret is
 *    **write-only** across this boundary: `setKey` sends it straight to Rust and
 *    resolves `void`; nothing here ever returns a secret to JS (status only).
 *  - `GenerationService` — what future features (infill, cloud cutout) call.
 *    Implemented with the AI SDK over the custom-fetch Rust proxy, so callers
 *    are decoupled from provider specifics and from where the key lives.
 */
import type { Result } from '@/services/types'
import type { ProviderConfig, ProviderDraft } from './provider-types'

/** Key + provider-config management. Secrets are never returned to JS. */
export interface ProviderService {
  /** All configured providers (non-secret config from `load_providers`). */
  list(): Promise<ProviderConfig[]>
  /** Create (generates an id) or update a provider; persists the full list. */
  upsert(draft: ProviderDraft): Promise<ProviderConfig>
  /** Remove a provider config and delete its keychain secret (idempotent). */
  remove(id: string): Promise<void>
  /** Send a secret to the OS keychain via Rust. Never stored in JS state. */
  setKey(id: string, secret: string): Promise<void>
  /** Whether a keychain secret exists for `id` (status only — no secret). */
  status(id: string): Promise<{ hasKey: boolean }>
  /** Batch has-key lookup (maps to Rust `list_key_status`). */
  statuses(ids: readonly string[]): Promise<Record<string, boolean>>
  /** Cheap round-trip through the proxy to validate the key works. */
  test(id: string): Promise<Result<{ model: string }>>
}

/** Input shared by generation calls. `model` overrides the config default. */
export interface GenerateInput {
  readonly providerId: string
  readonly model?: string
  readonly prompt: string
  readonly signal?: AbortSignal
}

/** What features call to produce text; more (image/infill) lands here later. */
export interface GenerationService {
  /** Buffered generation. Never throws across the seam — returns a `Result`. */
  generateText(input: GenerateInput): Promise<Result<string>>
  /** Incremental generation. Yields text deltas; throws on setup failure. */
  streamText(input: GenerateInput): AsyncIterable<string>
}

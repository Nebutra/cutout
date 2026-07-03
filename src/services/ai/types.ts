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
import type { z } from 'zod'
import type { Result } from '@/services/types'
import type { ProviderConfig, ProviderDraft } from './provider-types'
import type { PromptPart, PromptRef } from '@/prompts/types'

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

/**
 * Input shared by generation calls (spec §6). `model` overrides the config
 * default. Exactly ONE of `prompt` / `system` / `promptRef` supplies the
 * instruction (enforced at runtime); `input` carries multimodal user content
 * (e.g. the screenshot) for the `system`/`promptRef` paths.
 */
export interface GenerateInput {
  readonly providerId: string
  readonly model?: string
  readonly signal?: AbortSignal
  /** Raw single-string prompt (back-compat, text-only path). */
  readonly prompt?: string
  /** Explicit system instruction (paired with `input` for multimodal). */
  readonly system?: string
  /** A managed prompt, resolved + rendered via `PromptService` → `system`. */
  readonly promptRef?: PromptRef
  /** Multimodal user-message content (image + text framing). */
  readonly input?: readonly PromptPart[]
}

/** A generated binary asset (e.g. an image from `result.files`). */
export interface GeneratedAsset {
  /** IANA media type, e.g. `image/png`. */
  readonly mediaType: string
  /** Raw bytes of the asset. */
  readonly bytes: Uint8Array
}

/** What features call to produce text/images; infill etc. lands here later. */
export interface GenerationService {
  /** Buffered generation. Never throws across the seam — returns a `Result`. */
  generateText(input: GenerateInput): Promise<Result<string>>
  /** Incremental generation. Yields text deltas; throws on setup failure. */
  streamText(input: GenerateInput): AsyncIterable<string>
  /** Image generation via the AI SDK image path (`result.files`, spec §6). */
  generateImages(input: GenerateInput): Promise<Result<GeneratedAsset[]>>
  /**
   * Structured generation (spec §8) — the AI SDK `generateText` +
   * `Output.object` path. Validates the model's reply against `schema` and
   * returns the typed object; used by vision slice-naming. Never throws across
   * the seam — returns a `Result`.
   */
  generateObject<T>(
    input: GenerateInput,
    schema: z.ZodType<T>,
  ): Promise<Result<T>>
}

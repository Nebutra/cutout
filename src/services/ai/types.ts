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
import type { ReasoningEffort } from './reasoning'
import type { PromptPart, PromptRef } from '@/prompts/types'
export interface PersonalizationReceiptFlags{readonly policyVersion:number;readonly personality:string;readonly customInstructions:boolean;readonly memoryEnabled:boolean;readonly memoryIncluded:boolean;readonly toolAssistedMemory:boolean}

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
  /**
   * Thinking strength for reasoning-capable chat models. Mapped to each vendor's
   * `providerOptions` in the generation service; `undefined` sends nothing.
   */
  readonly reasoningEffort?: ReasoningEffort
  /** Runtime-owned structured policy context. Never persisted in receipts. */
  readonly systemContext?: string
}

/** A generated binary asset (e.g. an image from `result.files`). */
export interface GeneratedAsset {
  /** IANA media type, e.g. `image/png`. */
  readonly mediaType: string
  /** Raw bytes of the asset. */
  readonly bytes: Uint8Array
}

/**
 * A tool the model may elect to call — plain data (name/description/Zod
 * input schema/execute), no class hierarchy. `execute` runs inside the
 * provider call the same way `research()`'s built-in `web_search` tool does;
 * by the time `generateWithTools` resolves, any called tool has already run.
 */
export interface GenerationTool<TInput = unknown, TOutput = unknown> {
  readonly name: string
  readonly description: string
  readonly inputSchema: z.ZodType<TInput>
  execute(input: TInput): Promise<TOutput>
}

export interface GenerateWithToolsInput {
  readonly providerId: string
  readonly model?: string
  /** Full instruction text: framing + any grounding context + the user's brief. */
  readonly prompt: string
  readonly tools: readonly GenerationTool[]
  /** Steps the model gets to decide-then-observe-then-decide-again. */
  readonly maxSteps: number
  readonly signal?: AbortSignal
  readonly systemContext?: string
  readonly personalizationReceipt?:PersonalizationReceiptFlags
}

export interface GenerateWithToolsCall {
  readonly toolCallId: string
  readonly toolName: string
  readonly input: unknown
  readonly output: unknown
  /** Set (and `output` left undefined) when the tool's `execute` threw. */
  readonly error?: string
}

export interface GenerateWithToolsOutput {
  /** The model's final text — its reply when no tool was called, or a summary after one was. */
  readonly text: string
  /** Empty when the model chose not to call any registered tool. */
  readonly toolCalls: readonly GenerateWithToolsCall[]
  readonly personalizationReceipt?:PersonalizationReceiptFlags
}

/**
 * Input for 垫图 / reference-conditioned image edit (spec §2/§A). Goes through
 * the Rust `ai_image_edit` command (multipart `/images/edits`), NOT the AI SDK.
 * `prompt` is a plain instruction string (the caller renders any managed prompt
 * first); `images` are the reference-image bytes (`images[0]` is the 垫图 base).
 */
export interface EditImageInput {
  readonly providerId: string
  readonly model?: string
  /** The edit instruction (screen brief / style spec). */
  readonly prompt: string
  /** Reference image bytes; the first is the primary 垫图 base. */
  readonly images: readonly Uint8Array[]
  /** Optional output size, e.g. `1024x1024` (endpoint default when unset). */
  readonly size?: string
  /** `high` (default) preserves the reference's style/features; `low` is looser. */
  readonly inputFidelity?: 'high' | 'low'
  readonly signal?: AbortSignal
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
   * 垫图 / reference-conditioned image edit (spec §2/§A). Sends the reference
   * image(s) + prompt to the OpenAI-shaped `/images/edits` endpoint via the Rust
   * `ai_image_edit` command (multipart — the AI SDK's `generateImage` can't do
   * edits). Only openai / openai-compatible providers; returns PNG assets. Never
   * throws across the seam — returns a `Result`.
   */
  editImage(input: EditImageInput): Promise<Result<GeneratedAsset[]>>
  /**
   * Web-search research (best-effort grounding). Runs the model with the
   * provider's built-in web-search tool (`input.prompt` is the research query)
   * and returns a grounded text summary. Only openai / anthropic / google;
   * never throws across the seam — callers degrade to no grounding on error.
   */
  research(input: GenerateInput): Promise<Result<string>>
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
  /**
   * Multi-step tool-calling generation — the same AI SDK primitive `research()`
   * already uses for its built-in web-search tool (`tools` + `stepCountIs`),
   * generalized to caller-supplied tools. The model decides whether to call a
   * tool at all; a caller that gets `toolCalls: []` back falls through to
   * whatever it did before this existed. Only openai / anthropic / google
   * (same providers `research()` supports); never throws across the seam.
   */
  generateWithTools(input: GenerateWithToolsInput): Promise<Result<GenerateWithToolsOutput>>
}

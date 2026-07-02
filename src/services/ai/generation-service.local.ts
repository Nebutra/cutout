/**
 * Local `GenerationService` (spec §5/§6) — the AI SDK doing its work.
 *
 * Provider factories are built with a **dummy** api key and the custom
 * `tauriFetch`, so all provider-specific request shaping / SSE parsing happens
 * here in JS while the real key stays in Rust (spec §1/§3). The config for a
 * `providerId` is resolved from the injected `ProviderService.list()`; only that
 * slice of the interface is needed, so the dependency is a `Pick`.
 *
 * The instruction comes from exactly one of `prompt` (raw text, back-compat),
 * `system` (explicit), or `promptRef` (resolved+rendered via the injected
 * `PromptService`). Multimodal `input` parts (the screenshot) attach to a single
 * user message. Image output is read from the AI SDK v6 image path
 * (`result.files`, filtered to `image/*` → `uint8Array`).
 */
import {
  generateText as aiGenerateText,
  streamText as aiStreamText,
  generateImage,
} from 'ai'
import type { ModelMessage } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createGatewayProvider } from '@ai-sdk/gateway'
import { err, isErr, ok } from '@/services/types'
import type { Result } from '@/services/types'
import type { PromptPart, PromptService } from '@/prompts/types'
import type {
  GeneratedAsset,
  GenerateInput,
  GenerationService,
  ProviderService,
} from './types'
import type { ProviderConfig } from './provider-types'
import { resolveModel } from './models'
import { tauriFetch } from './tauri-fetch'

/** Placeholder key handed to the SDK; the real key is injected in Rust. */
const DUMMY_KEY = '__managed_by_rust__'

/** Only `list` is needed to resolve a `providerId` → config. */
type ConfigSource = Pick<ProviderService, 'list'>

/** Only `render` is needed to turn a `promptRef` → system instruction. */
type PromptSource = Pick<PromptService, 'render'>

/** Build the AI SDK model for a config, wired to the per-provider proxy fetch. */
function buildModel(cfg: ProviderConfig, modelId: string) {
  const fetch = tauriFetch(cfg.id, cfg.kind)
  const baseURL = cfg.baseUrl
  switch (cfg.kind) {
    case 'anthropic':
      return createAnthropic({ apiKey: DUMMY_KEY, baseURL, fetch })(modelId)
    case 'openai':
      return createOpenAI({ apiKey: DUMMY_KEY, baseURL, fetch })(modelId)
    case 'google':
      return createGoogleGenerativeAI({ apiKey: DUMMY_KEY, baseURL, fetch })(
        modelId,
      )
    case 'gateway':
      return createGatewayProvider({ apiKey: DUMMY_KEY, baseURL, fetch })(
        modelId,
      )
    case 'openai-compatible':
      // `.chat()` targets /chat/completions — the widely-compatible endpoint.
      return createOpenAI({ apiKey: DUMMY_KEY, baseURL, fetch }).chat(modelId)
  }
}

/** Map a domain `PromptPart` to an AI SDK v6 user-message content part. */
function toContentPart(part: PromptPart) {
  if (part.type === 'text') return { type: 'text' as const, text: part.text }
  // v6 still accepts the `{type:'image', image}` part (the SDK auto-detects the
  // media type). It is only deprecated in the v7 migration guide; when Cutout
  // moves to AI SDK 7 this becomes `{type:'file', mediaType, data}`.
  return { type: 'image' as const, image: part.image }
}

/** The normalized shape a prepared call resolves to (raw XOR structured). */
type Prepared =
  | { readonly model: ReturnType<typeof buildModel>; readonly prompt: string }
  | {
      readonly model: ReturnType<typeof buildModel>
      readonly system: string
      readonly messages: ModelMessage[]
    }

/** Count how many instruction sources are supplied (must be exactly one). */
function instructionSourceCount(input: GenerateInput): number {
  return [input.prompt, input.system, input.promptRef].filter(
    (v) => v !== undefined,
  ).length
}

export function createLocalGenerationService(
  providers: ConfigSource,
  prompts?: PromptSource,
): GenerationService {
  async function resolveConfig(
    id: string,
  ): Promise<ProviderConfig | undefined> {
    const list = await providers.list()
    return list.find((p) => p.id === id)
  }

  /** Resolve provider + instruction into a normalized, callable shape. */
  async function prepare(input: GenerateInput): Promise<Result<Prepared>> {
    if (instructionSourceCount(input) !== 1) {
      return err('provide exactly one of prompt, system, or promptRef')
    }
    const cfg = await resolveConfig(input.providerId)
    if (!cfg) return err('provider not configured')
    const modelId = resolveModel(cfg.kind, cfg.defaultModel, input.model)
    const model = buildModel(cfg, modelId)

    // Back-compat raw text path — a single prompt string, no multimodal parts.
    if (input.prompt !== undefined) {
      return ok({ model, prompt: input.prompt })
    }

    // Structured path: resolve the system instruction, then attach user content.
    let system: string
    let scaffold: readonly PromptPart[] = []
    if (input.promptRef !== undefined) {
      if (!prompts) return err('prompt service not available')
      try {
        const rendered = await prompts.render(input.promptRef)
        system = rendered.system
        scaffold = rendered.userScaffold ?? []
      } catch (error) {
        return err(error instanceof Error ? error.message : String(error))
      }
    } else {
      // Exactly-one-of guarantees `system` is set on this branch.
      system = input.system as string
    }

    const parts = [...scaffold, ...(input.input ?? [])]
    if (parts.length === 0) {
      return err('multimodal input required for system/promptRef generation')
    }
    const messages: ModelMessage[] = [
      { role: 'user', content: parts.map(toContentPart) },
    ]
    return ok({ model, system, messages })
  }

  return {
    async generateText(input: GenerateInput): Promise<Result<string>> {
      const prepared = await prepare(input)
      if (isErr(prepared)) return prepared
      try {
        const p = prepared.data
        const { text } =
          'messages' in p
            ? await aiGenerateText({
                model: p.model,
                system: p.system,
                messages: p.messages,
                abortSignal: input.signal,
              })
            : await aiGenerateText({
                model: p.model,
                prompt: p.prompt,
                abortSignal: input.signal,
              })
        return ok(text)
      } catch (error) {
        return err(error instanceof Error ? error.message : String(error))
      }
    },

    async *streamText(input: GenerateInput): AsyncIterable<string> {
      const prepared = await prepare(input)
      if (isErr(prepared)) throw new Error(prepared.error)
      const p = prepared.data
      const result =
        'messages' in p
          ? aiStreamText({
              model: p.model,
              system: p.system,
              messages: p.messages,
              abortSignal: input.signal,
            })
          : aiStreamText({
              model: p.model,
              prompt: p.prompt,
              abortSignal: input.signal,
            })
      for await (const delta of result.textStream) {
        yield delta
      }
    },

    async generateImages(
      input: GenerateInput,
    ): Promise<Result<GeneratedAsset[]>> {
      const cfg = await resolveConfig(input.providerId)
      if (!cfg) return err('provider not configured')
      const modelId = resolveModel(cfg.kind, cfg.defaultModel, input.model)

      // OpenAI-shaped image models (gpt-image / dall-e) are served by the IMAGES
      // endpoint, not /chat/completions — a chat call returns a non-chat body
      // ("Invalid JSON response"). Use `generateImage` with a single text prompt.
      // (Screenshot → sheet deconstruction needs a chat-image model, e.g. Gemini,
      // handled by the files path below; this images API is text-prompt only.)
      if (cfg.kind === 'openai' || cfg.kind === 'openai-compatible') {
        if (instructionSourceCount(input) !== 1) {
          return err('provide exactly one of prompt, system, or promptRef')
        }
        const chunks: string[] = []
        if (input.prompt !== undefined) {
          chunks.push(input.prompt)
        } else if (input.promptRef !== undefined) {
          if (!prompts) return err('prompt service not available')
          try {
            const rendered = await prompts.render(input.promptRef)
            chunks.push(rendered.system)
            for (const part of rendered.userScaffold ?? []) {
              if (part.type === 'text') chunks.push(part.text)
            }
          } catch (error) {
            return err(error instanceof Error ? error.message : String(error))
          }
        } else if (input.system !== undefined) {
          chunks.push(input.system)
        }
        for (const part of input.input ?? []) {
          if (part.type === 'text') chunks.push(part.text)
        }
        const promptText = chunks.filter((c) => c.trim().length > 0).join('\n\n')
        if (!promptText) return err('no prompt text for image generation')

        try {
          const provider = createOpenAI({
            apiKey: DUMMY_KEY,
            baseURL: cfg.baseUrl,
            fetch: tauriFetch(cfg.id, cfg.kind),
          })
          const result = await generateImage({
            model: provider.image(modelId),
            prompt: promptText,
            abortSignal: input.signal,
          })
          const assets: GeneratedAsset[] = result.images.map((img) => ({
            mediaType: 'image/png',
            bytes: img.uint8Array,
          }))
          if (assets.length === 0) return err('The model returned no image.')
          return ok(assets)
        } catch (error) {
          return err(error instanceof Error ? error.message : String(error))
        }
      }

      // Chat-image models (Gemini etc.): images arrive in `result.files`.
      const prepared = await prepare(input)
      if (isErr(prepared)) return prepared
      try {
        const p = prepared.data
        const result =
          'messages' in p
            ? await aiGenerateText({
                model: p.model,
                system: p.system,
                messages: p.messages,
                abortSignal: input.signal,
              })
            : await aiGenerateText({
                model: p.model,
                prompt: p.prompt,
                abortSignal: input.signal,
              })
        const assets: GeneratedAsset[] = result.files
          .filter((file) => file.mediaType.startsWith('image/'))
          .map((file) => ({ mediaType: file.mediaType, bytes: file.uint8Array }))
        return ok(assets)
      } catch (error) {
        return err(error instanceof Error ? error.message : String(error))
      }
    },
  }
}

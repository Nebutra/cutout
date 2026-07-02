/**
 * Local `GenerationService` (spec §5) — the AI SDK doing its work.
 *
 * Provider factories are built with a **dummy** api key and the custom
 * `tauriFetch`, so all provider-specific request shaping / SSE parsing happens
 * here in JS while the real key stays in Rust (spec §1/§3). The config for a
 * `providerId` is resolved from the injected `ProviderService.list()`; only that
 * slice of the interface is needed, so the dependency is a `Pick` (which also
 * keeps this module free of any import cycle with `provider-service.local`).
 */
import { generateText as aiGenerateText, streamText as aiStreamText } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createGatewayProvider } from '@ai-sdk/gateway'
import { err, ok } from '@/services/types'
import type { Result } from '@/services/types'
import type { GenerateInput, GenerationService, ProviderService } from './types'
import type { ProviderConfig } from './provider-types'
import { resolveModel } from './models'
import { tauriFetch } from './tauri-fetch'

/** Placeholder key handed to the SDK; the real key is injected in Rust. */
const DUMMY_KEY = '__managed_by_rust__'

/** Only `list` is needed to resolve a `providerId` → config. */
type ConfigSource = Pick<ProviderService, 'list'>

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

export function createLocalGenerationService(
  providers: ConfigSource,
): GenerationService {
  async function resolve(id: string): Promise<ProviderConfig | undefined> {
    const list = await providers.list()
    return list.find((p) => p.id === id)
  }

  return {
    async generateText(input: GenerateInput): Promise<Result<string>> {
      const cfg = await resolve(input.providerId)
      if (!cfg) return err('provider not configured')
      try {
        const modelId = resolveModel(cfg.kind, cfg.defaultModel, input.model)
        const { text } = await aiGenerateText({
          model: buildModel(cfg, modelId),
          prompt: input.prompt,
          abortSignal: input.signal,
        })
        return ok(text)
      } catch (error) {
        return err(error instanceof Error ? error.message : String(error))
      }
    },

    async *streamText(input: GenerateInput): AsyncIterable<string> {
      const cfg = await resolve(input.providerId)
      if (!cfg) throw new Error('provider not configured')
      const modelId = resolveModel(cfg.kind, cfg.defaultModel, input.model)
      const result = aiStreamText({
        model: buildModel(cfg, modelId),
        prompt: input.prompt,
        abortSignal: input.signal,
      })
      for await (const delta of result.textStream) {
        yield delta
      }
    },
  }
}

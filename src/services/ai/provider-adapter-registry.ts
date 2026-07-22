import { apiBaseUrl } from './base-url'
import { tauriFetch } from './tauri-fetch'
import {
  effectiveProviderWireProtocol,
  isProviderWireProtocolSupported,
  type ProviderConfig,
  type ProviderKind,
} from './provider-types'

const KEY = '__managed_by_rust__'

export interface AdapterRequestPolicy {
  readonly auth: 'rust-keychain-proxy'
  readonly headerStrategy: 'provider-default' | 'openai-compatible'
  readonly baseURL: string | undefined
}

export interface GenerationModelAdapter {
  readonly kind: ProviderKind
  policy(config: ProviderConfig): AdapterRequestPolicy
  createModel(config: ProviderConfig, modelId: string): Promise<any>
}

export class GenerationAdapterRegistry {
  readonly #items = new Map<ProviderKind, GenerationModelAdapter>()

  constructor(items: readonly GenerationModelAdapter[] = []) {
    items.forEach((item) => this.register(item))
  }

  register(item: GenerationModelAdapter) {
    this.#items.set(item.kind, item)
    return this
  }

  adapter(kind: ProviderKind) {
    const item = this.#items.get(kind)
    if (!item) throw new Error(`capability-required: no generation adapter for ${kind}`)
    return item
  }

  createModel(config: ProviderConfig, modelId: string) {
    return this.adapter(config.kind).createModel(config, modelId)
  }
}

export function createProtocolGenerationAdapter(input: {
  kind: ProviderKind
  headerStrategy: AdapterRequestPolicy['headerStrategy']
}): GenerationModelAdapter {
  return {
    kind: input.kind,
    policy: (config) => ({
      auth: 'rust-keychain-proxy',
      headerStrategy: input.headerStrategy,
      baseURL: apiBaseUrl(config.kind, config.baseUrl, config.wireProtocol),
    }),
    async createModel(config, modelId) {
      const protocol = effectiveProviderWireProtocol(config)
      if (!protocol || !isProviderWireProtocolSupported(config.kind, protocol)) {
        throw new Error(
          `capability-required: ${protocol ?? 'no wire protocol'} is not supported for ${config.kind}`,
        )
      }
      const baseURL = apiBaseUrl(config.kind, config.baseUrl, protocol)
      const fetch = tauriFetch(config.id, config.kind, protocol)

      switch (protocol) {
        case 'responses':
        case 'chat-completions': {
          const { createOpenAI } = await import('@ai-sdk/openai')
          const provider = createOpenAI({ apiKey: KEY, baseURL, fetch })
          return protocol === 'responses'
            ? provider.responses(modelId)
            : provider.chat(modelId)
        }
        case 'anthropic-messages': {
          const { createAnthropic } = await import('@ai-sdk/anthropic')
          return createAnthropic({ apiKey: KEY, baseURL, fetch })(modelId)
        }
        case 'google-generate-content': {
          const { createGoogleGenerativeAI } = await import('@ai-sdk/google')
          return createGoogleGenerativeAI({ apiKey: KEY, baseURL, fetch })(modelId)
        }
        default: {
          const unsupported: never = protocol
          throw new Error(`capability-required: no generation adapter for ${unsupported}`)
        }
      }
    },
  }
}

export const OPENAI_COMPATIBLE_GENERATION_KINDS = [
  'openai-compatible',
  'dashscope',
  'deepseek',
  'zhipu',
  'moonshot',
  'volcengine',
  'siliconflow',
  'openrouter',
  'together',
  'groq',
  'fireworks',
  'xai',
  'mistral',
  'ollama',
  'vllm',
  'lm-studio',
] as const

export function createDefaultGenerationAdapterRegistry() {
  const protocolKinds = [
    'anthropic',
    'openai',
    'google',
    ...OPENAI_COMPATIBLE_GENERATION_KINDS,
  ] as const
  const protocolAdapters = protocolKinds.map((kind) =>
    createProtocolGenerationAdapter({
      kind,
      headerStrategy: kind === 'openai-compatible' ? 'openai-compatible' : 'provider-default',
    }),
  )
  const gateway: GenerationModelAdapter = {
    kind: 'gateway',
    policy: (config) => ({
      auth: 'rust-keychain-proxy',
      headerStrategy: 'provider-default',
      baseURL: apiBaseUrl(config.kind, config.baseUrl),
    }),
    async createModel(config, id) {
      const { createGatewayProvider } = await import('@ai-sdk/gateway')
      return createGatewayProvider({
        apiKey: KEY,
        baseURL: apiBaseUrl(config.kind, config.baseUrl),
        fetch: tauriFetch(config.id, config.kind),
      })(id)
    },
  }
  return new GenerationAdapterRegistry([...protocolAdapters, gateway])
}

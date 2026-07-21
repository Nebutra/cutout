import { describe, expect, it, vi } from 'vitest'
import {
  GenerationAdapterRegistry,
  createDefaultGenerationAdapterRegistry,
  createProtocolGenerationAdapter,
} from './provider-adapter-registry'
import type { ProviderConfig } from './provider-types'

const factories = vi.hoisted(() => ({
  chat: vi.fn((id: string) => ({ api: 'chat', id })),
  responses: vi.fn((id: string) => ({ api: 'responses', id })),
  anthropic: vi.fn((id: string) => ({ api: 'anthropic', id })),
  google: vi.fn((id: string) => ({ api: 'google', id })),
}))
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: () => Object.assign(factories.responses, {
    chat: factories.chat,
    responses: factories.responses,
  }),
}))
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: () => factories.anthropic }))
vi.mock('@ai-sdk/google', () => ({ createGoogleGenerativeAI: () => factories.google }))

const config: ProviderConfig = {
  id: 'relay',
  kind: 'openai-compatible',
  label: 'Relay',
  baseUrl: 'https://relay.example',
  defaultModel: 'm',
  enabled: true,
}

describe('generation adapter registry', () => {
  it('uses an injected adapter factory', async () => {
    const createModel = vi.fn(async () => ({ id: 'model' }))
    const registry = new GenerationAdapterRegistry([{
      kind: 'openai-compatible',
      policy: () => ({ auth: 'rust-keychain-proxy', headerStrategy: 'openai-compatible', baseURL: 'x' }),
      createModel,
    }])
    await expect(registry.createModel(config, 'm')).resolves.toEqual({ id: 'model' })
    expect(createModel).toHaveBeenCalledWith(config, 'm')
  })

  it('shares explicit custom-endpoint transport policy', () => {
    expect(createProtocolGenerationAdapter({
      kind: 'openai-compatible',
      headerStrategy: 'openai-compatible',
    }).policy(config)).toEqual({
      auth: 'rust-keychain-proxy',
      headerStrategy: 'openai-compatible',
      baseURL: 'https://relay.example/v1',
    })
  })

  it('fails closed for unregistered providers', () => {
    expect(() => new GenerationAdapterRegistry().adapter('google')).toThrow('capability-required')
  })

  it('registers compatible transports including local runtimes', () => {
    const registry = createDefaultGenerationAdapterRegistry()
    for (const kind of ['dashscope', 'deepseek', 'openrouter', 'ollama', 'vllm', 'lm-studio']) {
      expect(registry.adapter(kind).policy({
        id: 'p',
        kind,
        label: kind,
        baseUrl: kind === 'ollama' ? 'http://127.0.0.1:11434' : undefined,
        defaultModel: 'm',
        enabled: true,
      })).toMatchObject({ auth: 'rust-keychain-proxy' })
    }
  })

  it('routes all four wire protocols without model-name inference', async () => {
    const adapter = createProtocolGenerationAdapter({
      kind: 'openai-compatible',
      headerStrategy: 'openai-compatible',
    })
    await expect(adapter.createModel({ ...config, wireProtocol: 'responses' }, 'same-model')).resolves.toEqual({ api: 'responses', id: 'same-model' })
    await expect(adapter.createModel({ ...config, wireProtocol: 'chat-completions' }, 'same-model')).resolves.toEqual({ api: 'chat', id: 'same-model' })
    await expect(adapter.createModel({ ...config, wireProtocol: 'anthropic-messages' }, 'same-model')).resolves.toEqual({ api: 'anthropic', id: 'same-model' })
    await expect(adapter.createModel({ ...config, wireProtocol: 'google-generate-content' }, 'same-model')).resolves.toEqual({ api: 'google', id: 'same-model' })
  })

  it('rejects unsupported kind/protocol combinations', async () => {
    const adapter = createProtocolGenerationAdapter({ kind: 'deepseek', headerStrategy: 'provider-default' })
    await expect(adapter.createModel({ ...config, kind: 'deepseek', wireProtocol: 'anthropic-messages' }, 'm')).rejects.toThrow(
      'not supported for deepseek',
    )
  })
})

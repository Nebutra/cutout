import { describe, expect, it } from 'vitest'
import {
  defaultProviderWireProtocol,
  isProviderWireProtocolSupported,
  providerConfigSchema,
  supportedProviderWireProtocols,
} from './provider-types'

describe('provider wire protocol', () => {
  it('uses Responses for OpenAI and preserves compatible-provider chat behavior', () => {
    expect(defaultProviderWireProtocol('openai')).toBe('responses')
    expect(defaultProviderWireProtocol('openai-compatible')).toBe('chat-completions')
    expect(defaultProviderWireProtocol('deepseek')).toBe('chat-completions')
    expect(defaultProviderWireProtocol('anthropic')).toBe('anthropic-messages')
    expect(defaultProviderWireProtocol('google')).toBe('google-generate-content')
    expect(defaultProviderWireProtocol('gateway')).toBeUndefined()
  })

  it('accepts old and new protocol values while rejecting invented values', () => {
    const base = { id: 'p', kind: 'openai-compatible', label: 'Relay', defaultModel: 'm', enabled: true }
    expect(providerConfigSchema.parse(base).wireProtocol).toBeUndefined()
    expect(providerConfigSchema.parse({ ...base, wireProtocol: 'anthropic-messages' }).wireProtocol).toBe('anthropic-messages')
    expect(providerConfigSchema.parse({ ...base, wireProtocol: 'google-generate-content' }).wireProtocol).toBe('google-generate-content')
    expect(() => providerConfigSchema.parse({ ...base, wireProtocol: 'completion' })).toThrow()
  })

  it('defines the supported kind/protocol matrix explicitly', () => {
    expect(supportedProviderWireProtocols('openai')).toEqual(['responses', 'chat-completions'])
    expect(supportedProviderWireProtocols('anthropic')).toEqual(['anthropic-messages'])
    expect(supportedProviderWireProtocols('google')).toEqual(['google-generate-content'])
    expect(supportedProviderWireProtocols('openai-compatible')).toEqual([
      'responses',
      'chat-completions',
      'anthropic-messages',
      'google-generate-content',
    ])
    expect(supportedProviderWireProtocols('deepseek')).toEqual(['chat-completions'])
    expect(isProviderWireProtocolSupported('deepseek', 'responses')).toBe(false)
    expect(isProviderWireProtocolSupported('gateway', undefined)).toBe(true)
  })

  it('rejects unsupported combinations at the TypeScript config boundary', () => {
    const base = { id: 'p', kind: 'deepseek', label: 'DeepSeek', defaultModel: 'm', enabled: true }
    expect(() => providerConfigSchema.parse({ ...base, wireProtocol: 'anthropic-messages' })).toThrow(
      'not supported for deepseek',
    )
  })
})

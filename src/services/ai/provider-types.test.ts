import { describe, expect, it } from 'vitest'
import { defaultOpenAIWireProtocol, providerConfigSchema } from './provider-types'

describe('provider wire protocol', () => {
  it('uses Responses for OpenAI and preserves compatible-provider chat behavior', () => {
    expect(defaultOpenAIWireProtocol('openai')).toBe('responses')
    expect(defaultOpenAIWireProtocol('openai-compatible')).toBe('chat-completions')
    expect(defaultOpenAIWireProtocol('deepseek')).toBe('chat-completions')
    expect(defaultOpenAIWireProtocol('anthropic')).toBeUndefined()
  })

  it('accepts old records while rejecting invented protocol values', () => {
    const base = { id: 'p', kind: 'openai-compatible', label: 'Relay', defaultModel: 'm', enabled: true }
    expect(providerConfigSchema.parse(base).wireProtocol).toBeUndefined()
    expect(() => providerConfigSchema.parse({ ...base, wireProtocol: 'completion' })).toThrow()
  })
})

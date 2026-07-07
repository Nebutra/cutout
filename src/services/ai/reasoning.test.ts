import { describe, it, expect } from 'vitest'
import { REASONING_EFFORTS, reasoningProviderOptions } from './reasoning'

describe('reasoningProviderOptions', () => {
  it('sends nothing when no effort is set', () => {
    expect(reasoningProviderOptions('openai', undefined)).toEqual({})
    expect(reasoningProviderOptions('anthropic', undefined)).toEqual({})
    expect(reasoningProviderOptions('google', undefined)).toEqual({})
  })

  it('maps OpenAI to reasoningEffort', () => {
    expect(reasoningProviderOptions('openai', 'high')).toEqual({
      openai: { reasoningEffort: 'high' },
    })
  })

  it('maps Anthropic to adaptive thinking + effort', () => {
    expect(reasoningProviderOptions('anthropic', 'medium')).toEqual({
      anthropic: { thinking: { type: 'adaptive' }, effort: 'medium' },
    })
  })

  it('maps Google to thinkingConfig.thinkingLevel', () => {
    expect(reasoningProviderOptions('google', 'low')).toEqual({
      google: { thinkingConfig: { thinkingLevel: 'low' } },
    })
  })

  it('sends nothing for gateway / openai-compatible (unknown upstream)', () => {
    expect(reasoningProviderOptions('gateway', 'high')).toEqual({})
    expect(reasoningProviderOptions('openai-compatible', 'high')).toEqual({})
  })

  it('exposes exactly the universally-supported low/medium/high levels', () => {
    expect([...REASONING_EFFORTS]).toEqual(['low', 'medium', 'high'])
  })
})

import { describe, expect, it } from 'vitest'
import { apiBaseUrl } from './base-url'

describe('apiBaseUrl', () => {
  it('adds /v1 for pathless OpenAI-compatible endpoints', () => {
    expect(apiBaseUrl('openai-compatible', 'https://relay.example.com')).toBe(
      'https://relay.example.com/v1',
    )
    expect(apiBaseUrl('openai-compatible', 'https://relay.example.com/')).toBe(
      'https://relay.example.com/v1',
    )
    expect(
      apiBaseUrl('openai-compatible', 'https://relay.example.com/?from=console#top'),
    ).toBe('https://relay.example.com/v1')
  })

  it('keeps explicit API paths unchanged', () => {
    expect(apiBaseUrl('openai-compatible', 'https://relay.example.com/v1')).toBe(
      'https://relay.example.com/v1',
    )
    expect(
      apiBaseUrl('openai-compatible', 'https://relay.example.com/api/openai'),
    ).toBe('https://relay.example.com/api/openai')
  })

  it('does not add /v1 for non-OpenAI-shaped providers', () => {
    expect(apiBaseUrl('anthropic', 'https://api.anthropic.com')).toBe(
      'https://api.anthropic.com',
    )
  })
})

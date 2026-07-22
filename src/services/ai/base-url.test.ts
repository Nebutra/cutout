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

  it('uses protocol-specific defaults for custom endpoints', () => {
    expect(
      apiBaseUrl(
        'openai-compatible',
        'https://relay.example.com',
        'anthropic-messages',
      ),
    ).toBe('https://relay.example.com/v1')
    expect(
      apiBaseUrl(
        'openai-compatible',
        'https://relay.example.com',
        'google-generate-content',
      ),
    ).toBe('https://relay.example.com/v1beta')
  })

  it('keeps explicit API paths unchanged', () => {
    expect(apiBaseUrl('openai-compatible', 'https://relay.example.com/v1')).toBe(
      'https://relay.example.com/v1',
    )
    expect(
      apiBaseUrl('openai-compatible', 'https://relay.example.com/api/openai'),
    ).toBe('https://relay.example.com/api/openai')
  })

  it('uses native defaults for first-party protocols', () => {
    expect(apiBaseUrl('anthropic', 'https://api.anthropic.com')).toBe(
      'https://api.anthropic.com/v1',
    )
    expect(apiBaseUrl('google', 'https://generativelanguage.googleapis.com')).toBe(
      'https://generativelanguage.googleapis.com/v1beta',
    )
  })
})

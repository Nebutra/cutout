import { describe, expect, it } from 'vitest'
import { seedBindingsFromLegacyProviders } from './legacy-binding-migration'
import type { ProviderConfig } from './provider-types'

const connection = (overrides: Partial<ProviderConfig> = {}): ProviderConfig => ({
  id: 'p',
  kind: 'openai-compatible',
  label: 'Relay',
  baseUrl: 'https://relay.example/v1',
  wireProtocol: 'chat-completions',
  enabled: true,
  ...overrides,
})

describe('seedBindingsFromLegacyProviders', () => {
  it('seeds a text route from a pre-split connection that still names a model', () => {
    // Before the split this user had no bindings at all — `defaultModel` was
    // their entire routing. Dropping it without seeding would un-route them.
    expect(seedBindingsFromLegacyProviders(
      [connection({ defaultModel: 'gpt-5.6-terra' })],
      {},
    )).toEqual({ providerId: 'p', model: 'gpt-5.6-terra' })
  })

  it('never overwrites bindings the user already has', () => {
    expect(seedBindingsFromLegacyProviders(
      [connection({ defaultModel: 'gpt-5.6-terra' })],
      { text: { providerId: 'other', model: 'chosen' } },
    )).toBeUndefined()
  })

  it('ignores disabled connections and connections with no legacy model', () => {
    expect(seedBindingsFromLegacyProviders(
      [connection({ defaultModel: 'gpt-5.6-terra', enabled: false })],
      {},
    )).toBeUndefined()
    expect(seedBindingsFromLegacyProviders([connection()], {})).toBeUndefined()
    expect(seedBindingsFromLegacyProviders(
      [connection({ defaultModel: '   ' })],
      {},
    )).toBeUndefined()
  })

  it('takes the first enabled legacy connection when several exist', () => {
    expect(seedBindingsFromLegacyProviders(
      [
        connection({ id: 'off', defaultModel: 'skipped', enabled: false }),
        connection({ id: 'first', defaultModel: 'chat-model' }),
        connection({ id: 'second', defaultModel: 'other-model' }),
      ],
      undefined,
    )).toEqual({ providerId: 'first', model: 'chat-model' })
  })
})

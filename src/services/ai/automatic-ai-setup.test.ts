import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  configure: vi.fn(),
  setBinding: vi.fn(),
  setVerification: vi.fn(),
}))
vi.mock('./provider-discovery', async (original) => ({
  ...await original<typeof import('./provider-discovery')>(),
  autoConfigureProviderCandidate: mocks.configure,
}))
vi.mock('./model-assignment.local', () => ({ setCapabilityBinding: mocks.setBinding }))
vi.mock('./provider-verification', () => ({ setProviderVerification: mocks.setVerification }))

import { automaticBindingsFor, configureAutomaticAi } from './automatic-ai-setup'
import type { AutoConfiguredProvider, ProviderDiscoveryCandidate } from './provider-discovery'

const configured = (id: string, kind: 'openai-compatible' | 'cc-switch', models: string[], defaultModel = models[0]!): AutoConfiguredProvider => ({
  provider: { id, kind, label: id, baseUrl: kind === 'cc-switch' ? 'http://127.0.0.1:15721/v1' : 'https://relay.example/v1', wireProtocol: kind === 'cc-switch' ? 'responses' : 'chat-completions', defaultModel, enabled: true },
  models,
})

describe('automatic AI setup', () => {
  beforeEach(() => Object.values(mocks).forEach((mock) => mock.mockReset()))

  it('combines text/Coding and image models without binding an image model as chat', () => {
    const bindings = automaticBindingsFor([
      configured('text', 'openai-compatible', ['gpt-5.5']),
      configured('image', 'openai-compatible', ['gpt-image-2']),
    ])
    expect(bindings.text).toEqual({ providerId: 'text', model: 'gpt-5.5' })
    expect(bindings.webdev).toEqual(bindings.text)
    expect(bindings['image-generation']).toEqual({ providerId: 'image', model: 'gpt-image-2' })
    expect(bindings['image-edit']).toEqual(bindings['image-generation'])
  })

  it('uses an authenticated CC Switch image model for generation and editing', () => {
    const bindings = automaticBindingsFor([
      configured('cc-switch', 'cc-switch', ['gpt-5.6-sol', 'gpt-image-2']),
    ])
    expect(bindings.webdev).toEqual({ providerId: 'cc-switch', model: 'gpt-5.6-sol' })
    expect(bindings['image-generation']).toEqual({ providerId: 'cc-switch', model: 'gpt-image-2' })
    expect(bindings['image-edit']).toEqual(bindings['image-generation'])
  })

  it('prefers the verified provider default for chat and the best supported image model', () => {
    const bindings = automaticBindingsFor([
      configured(
        'cc-switch-upstream',
        'openai-compatible',
        ['codex-auto-review', 'gpt-5.5', 'gpt-image-1', 'gpt-image-1.5', 'gpt-image-2'],
        'gpt-5.5',
      ),
    ])
    expect(bindings.text).toEqual({ providerId: 'cc-switch-upstream', model: 'gpt-5.5' })
    expect(bindings.webdev).toEqual(bindings.text)
    expect(bindings['image-generation']).toEqual({
      providerId: 'cc-switch-upstream',
      model: 'gpt-image-2',
    })
  })

  it('imports candidates until all required tasks are covered, then stops probing', async () => {
    const candidates = ['a', 'b'].map((suffix) => ({
      id: `provider-candidate:${suffix.repeat(64)}`,
      source: 'codex', sourceLabel: 'Codex', kind: 'openai-compatible', label: suffix,
      baseUrl: 'https://relay.example/v1', wireProtocol: 'chat-completions',
      credential: { sourceType: 'config-literal', available: true, importable: true }, warnings: [],
    })) as ProviderDiscoveryCandidate[]
    mocks.configure
      .mockResolvedValueOnce(configured('text', 'openai-compatible', ['gpt-5.5']))
      .mockResolvedValueOnce(configured('image', 'openai-compatible', ['gpt-image-2']))
    await expect(configureAutomaticAi(candidates)).resolves.toMatchObject({ configured: [{ provider: { id: 'text' } }, { provider: { id: 'image' } }] })
    expect(mocks.setBinding).toHaveBeenCalledWith('webdev', { providerId: 'text', model: 'gpt-5.5' })
    expect(mocks.setBinding).toHaveBeenCalledWith('image-generation', { providerId: 'image', model: 'gpt-image-2' })
    expect(mocks.setVerification).toHaveBeenCalledTimes(2)
  })

  it('does not probe unrelated candidates after one provider covers every task', async () => {
    const candidates = ['a', 'b'].map((suffix) => ({
      id: `provider-candidate:${suffix.repeat(64)}`,
      source: 'cc-switch', sourceLabel: 'CC Switch', kind: 'openai-compatible', label: suffix,
      baseUrl: 'https://relay.example/v1', wireProtocol: 'responses',
      credential: { sourceType: 'cc-switch-db', available: true, importable: true }, warnings: [],
    })) as ProviderDiscoveryCandidate[]
    mocks.configure.mockResolvedValueOnce(configured(
      'complete',
      'openai-compatible',
      ['gpt-5.5', 'gpt-image-2'],
      'gpt-5.5',
    ))

    await expect(configureAutomaticAi(candidates)).resolves.toMatchObject({
      configured: [{ provider: { id: 'complete' } }],
    })
    expect(mocks.configure).toHaveBeenCalledTimes(1)
    expect(mocks.configure).toHaveBeenCalledWith(candidates[0]!.id)
  })
})

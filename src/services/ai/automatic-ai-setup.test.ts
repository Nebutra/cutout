import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  configure: vi.fn(),
  setBinding: vi.fn(),
  setDescriptors: vi.fn(),
  setVerification: vi.fn(),
}))
vi.mock('./provider-discovery', async (original) => ({
  ...await original<typeof import('./provider-discovery')>(),
  autoConfigureProviderCandidate: mocks.configure,
}))
vi.mock('./model-assignment.local', () => ({
  setCapabilityBinding: mocks.setBinding,
  setCapabilityDescriptors: mocks.setDescriptors,
}))
vi.mock('./provider-verification', async (original) => ({
  ...await original<typeof import('./provider-verification')>(),
  setProviderVerification: mocks.setVerification,
}))

import { automaticBindingsFor, configureAutomaticAi } from './automatic-ai-setup'
import type { AutoConfiguredProvider, ProviderDiscoveryCandidate } from './provider-discovery'

const configured = (
  id: string,
  kind: 'openai-compatible' | 'cc-switch' | 'dashscope',
  models: string[],
  defaultModel = models[0]!,
  descriptors?: AutoConfiguredProvider['descriptors'],
): AutoConfiguredProvider => ({
  provider: {
    id,
    kind,
    label: id,
    baseUrl: kind === 'cc-switch'
      ? 'http://127.0.0.1:15721/v1'
      : kind === 'dashscope'
        ? 'https://dashscope.aliyuncs.com/compatible-mode/v1'
        : 'https://relay.example/v1',
    wireProtocol: kind === 'cc-switch' ? 'responses' : 'chat-completions',
    defaultModel,
    enabled: true,
  },
  models,
  ...(descriptors ? { descriptors } : {}),
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

  it('honors a verified image Provider default without making Qwen a global default', () => {
    const bindings = automaticBindingsFor([
      configured('gpt', 'openai-compatible', ['gpt-5.5', 'gpt-image-2'], 'gpt-5.5'),
      configured(
        'qwen',
        'dashscope',
        ['qwen-image-3.0-pro', 'qwen-image-3.0'],
        'qwen-image-3.0-pro',
      ),
    ])
    expect(bindings['image-generation']).toEqual({
      providerId: 'qwen',
      model: 'qwen-image-3.0-pro',
    })
    expect(bindings['image-edit']).toEqual(bindings['image-generation'])
  })

  it('selects an isolated preferred text route only from authenticated catalog rows', () => {
    const configuredProviders = [
      configured('default', 'openai-compatible', ['gpt-5.5'], 'gpt-5.5'),
      configured(
        'qwen',
        'dashscope',
        ['qwen-image-3.0', 'qwen-plus'],
        'qwen-image-3.0',
      ),
    ]
    const normal = automaticBindingsFor(configuredProviders)
    const isolated = automaticBindingsFor(configuredProviders, {
      preferredTextRoutes: [{ kind: 'dashscope', model: 'qwen-plus' }],
    })
    const unavailable = automaticBindingsFor(configuredProviders, {
      preferredTextRoutes: [{ kind: 'dashscope', model: 'qwen-max-not-observed' }],
    })

    expect(normal.text).toEqual({ providerId: 'default', model: 'gpt-5.5' })
    expect(isolated.text).toEqual({ providerId: 'qwen', model: 'qwen-plus' })
    expect(isolated.vision).toEqual(normal.vision)
    expect(isolated.webdev).toEqual(normal.webdev)
    expect(unavailable.text).toEqual(normal.text)
  })

  it('persists the packaged preference only after the exact model is catalog-checked', async () => {
    const candidates = ['default', 'qwen'].map((label, index) => ({
      id: `provider-candidate:${String.fromCharCode(97 + index).repeat(64)}`,
      source: 'cutout-keychain', sourceLabel: 'Cutout local credentials',
      kind: index === 1 ? 'dashscope' : 'openai-compatible', label,
      baseUrl: index === 1
        ? 'https://dashscope.aliyuncs.com/compatible-mode/v1'
        : 'https://default.example/v1',
      wireProtocol: 'chat-completions',
      ...(index === 1 ? { modelHint: 'qwen-image-3.0' } : {}),
      credential: { sourceType: 'keychain', available: true, importable: true },
      warnings: [],
    })) as ProviderDiscoveryCandidate[]
    mocks.configure
      .mockResolvedValueOnce(configured(
        'default',
        'openai-compatible',
        ['gpt-5.5', 'gpt-image-2'],
        'gpt-5.5',
      ))
      .mockResolvedValueOnce(configured(
        'qwen',
        'dashscope',
        ['qwen-image-3.0', 'qwen-plus'],
        'qwen-image-3.0',
      ))

    await expect(configureAutomaticAi(candidates, {
      preferredTextRoutes: [{ kind: 'dashscope', model: 'qwen-plus' }],
    })).resolves.toMatchObject({
      bindings: {
        text: { providerId: 'qwen', model: 'qwen-plus' },
        'image-generation': { providerId: 'qwen', model: 'qwen-image-3.0' },
      },
    })
    expect(mocks.setBinding).toHaveBeenCalledWith(
      'text',
      { providerId: 'qwen', model: 'qwen-plus' },
    )
    expect(mocks.setDescriptors).toHaveBeenCalledWith(
      expect.not.arrayContaining([
        expect.objectContaining({ providerId: 'qwen', model: 'qwen-plus' }),
      ]),
    )
  })

  it('keeps a supported compatible image route as the fallback', () => {
    const model = 'custom-image-gen'
    const bindings = automaticBindingsFor([
      configured('relay', 'openai-compatible', ['gpt-5.5', model], 'gpt-5.5', [{
        providerId: 'relay',
        model,
        capabilities: ['image-generation', 'image-edit'],
        source: 'verified-catalog',
        evidence: [
          { capability: 'image-generation', kind: 'verified', sourceId: 'test' },
          { capability: 'image-edit', kind: 'verified', sourceId: 'test' },
        ],
      }]),
    ])
    expect(bindings['image-generation']).toEqual({
      providerId: 'relay',
      model,
    })
    expect(bindings['image-edit']).toEqual(bindings['image-generation'])
  })

  it('binds generation and editing independently when different exact models own them', () => {
    const generationModel = 'canvas-generation-v1'
    const editModel = 'flux-2-max'
    const bindings = automaticBindingsFor([
      configured(
        'relay',
        'openai-compatible',
        ['gpt-5.5', generationModel, editModel],
        'gpt-5.5',
        [{
          providerId: 'relay',
          model: generationModel,
          capabilities: ['image-generation'],
          source: 'verified-catalog',
          evidence: [{
            capability: 'image-generation',
            kind: 'verified',
            sourceId: 'test',
          }],
        }],
      ),
    ])
    expect(bindings['image-generation']).toEqual({
      providerId: 'relay',
      model: generationModel,
    })
    expect(bindings['image-edit']).toEqual({
      providerId: 'relay',
      model: editModel,
    })
  })

  it.each(['seedream-5-pro'])(
    'does not nominate the recommended-looking %s family without exact capability evidence',
    (model) => {
      const bindings = automaticBindingsFor([
        configured('relay', 'openai-compatible', ['gpt-5.5', model], 'gpt-5.5'),
      ])
      expect(bindings['image-generation']).toBeUndefined()
      expect(bindings['image-edit']).toBeUndefined()
    },
  )

  it('binds an exact reviewed Arena model for editing without inventing generation', () => {
    const bindings = automaticBindingsFor([
      configured('relay', 'openai-compatible', ['gpt-5.5', 'reve-2.1'], 'gpt-5.5'),
    ])
    expect(bindings['image-generation']).toBeUndefined()
    expect(bindings['image-edit']).toEqual({ providerId: 'relay', model: 'reve-2.1' })
  })

  it('uses fidelity only to order supported routes and preserves the exact model id', () => {
    const bindings = automaticBindingsFor([
      configured(
        'relay',
        'openai-compatible',
        ['gpt-5.5', 'custom-image-gen', 'chatgpt-image-latest'],
        'gpt-5.5',
      ),
    ])
    expect(bindings['image-generation']).toEqual({
      providerId: 'relay',
      model: 'chatgpt-image-latest',
    })
  })

  it('accepts exact descriptor evidence for a compatible model with no image-like name', () => {
    const model = 'canvas-v7'
    const bindings = automaticBindingsFor([
      configured('relay', 'openai-compatible', ['gpt-5.5', model], 'gpt-5.5', [{
        providerId: 'relay',
        model,
        capabilities: ['image-generation', 'image-edit'],
        source: 'verified-catalog',
        evidence: [
          { capability: 'image-generation', kind: 'verified', sourceId: 'test' },
          { capability: 'image-edit', kind: 'verified', sourceId: 'test' },
        ],
      }]),
    ])
    expect(bindings['image-generation']).toEqual({ providerId: 'relay', model })
    expect(bindings['image-edit']).toEqual(bindings['image-generation'])
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
    expect(mocks.setDescriptors).toHaveBeenCalledWith([
      expect.objectContaining({ providerId: 'image', model: 'gpt-image-2' }),
    ])
  })

  it('prefers exact Cutout Keychain metadata over an Agent-derived endpoint candidate', async () => {
    const agentCandidate = {
      id: `provider-candidate:${'a'.repeat(64)}`,
      source: 'cc-switch', sourceLabel: 'CC Switch', kind: 'openai-compatible',
      label: 'CC Switch Codex upstream', baseUrl: 'https://relay.example/v1',
      wireProtocol: 'responses',
      credential: { sourceType: 'cc-switch-db', available: true, importable: true },
      warnings: [],
    } as ProviderDiscoveryCandidate
    const cutoutCandidate = {
      id: `provider-candidate:${'b'.repeat(64)}`,
      source: 'cutout-keychain', sourceLabel: 'Cutout local credentials',
      kind: 'openai-compatible', label: 'MOX', baseUrl: 'https://relay.example/v1',
      wireProtocol: 'chat-completions', modelHint: 'gpt-5.5',
      credential: { sourceType: 'keychain', available: true, importable: true },
      warnings: [],
    } as ProviderDiscoveryCandidate
    const qwenCandidate = {
      id: `provider-candidate:${'c'.repeat(64)}`,
      source: 'cutout-keychain', sourceLabel: 'Cutout local credentials',
      kind: 'dashscope', label: 'Qwen Image 3',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      wireProtocol: 'chat-completions', modelHint: 'qwen-image-3.0',
      credential: { sourceType: 'keychain', available: true, importable: true },
      warnings: [],
    } as ProviderDiscoveryCandidate
    mocks.configure
      .mockResolvedValueOnce(configured('mox', 'openai-compatible', ['gpt-5.5']))
      .mockResolvedValueOnce(configured(
        'qwen',
        'dashscope',
        ['qwen-image-3.0'],
        'qwen-image-3.0',
      ))
      .mockRejectedValueOnce({
        code: 'unsupported',
        message: 'The Agent-derived fallback uses an incompatible protocol.',
      })

    await expect(configureAutomaticAi([
      agentCandidate,
      cutoutCandidate,
      qwenCandidate,
    ])).resolves.toMatchObject({
      bindings: {
        text: { providerId: 'mox', model: 'gpt-5.5' },
        'image-generation': { providerId: 'qwen', model: 'qwen-image-3.0' },
      },
    })
    expect(mocks.configure.mock.calls).toEqual([
      [cutoutCandidate.id],
      [qwenCandidate.id],
      [agentCandidate.id],
    ])
  })

  it('probes one independently verified fallback after required coverage, then stops', async () => {
    const candidates = ['a', 'b', 'c'].map((suffix) => ({
      id: `provider-candidate:${suffix.repeat(64)}`,
      source: 'cc-switch', sourceLabel: 'CC Switch', kind: 'openai-compatible', label: suffix,
      baseUrl: 'https://relay.example/v1', wireProtocol: 'responses',
      credential: { sourceType: 'cc-switch-db', available: true, importable: true }, warnings: [],
    })) as ProviderDiscoveryCandidate[]
    mocks.configure
      .mockResolvedValueOnce(configured(
        'complete',
        'openai-compatible',
        ['gpt-5.5', 'gpt-image-2'],
        'gpt-5.5',
      ))
      .mockResolvedValueOnce(configured(
        'fallback',
        'openai-compatible',
        ['gpt-5.5-mini', 'gpt-image-1.5'],
        'gpt-5.5-mini',
      ))

    await expect(configureAutomaticAi(candidates)).resolves.toMatchObject({
      configured: [
        { provider: { id: 'complete' } },
        { provider: { id: 'fallback' } },
      ],
    })
    expect(mocks.configure.mock.calls).toEqual([
      [candidates[0]!.id],
      [candidates[1]!.id],
    ])
    expect(mocks.setVerification).toHaveBeenCalledTimes(2)
    expect(mocks.setDescriptors).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ providerId: 'complete', model: 'gpt-image-2' }),
      expect.objectContaining({ providerId: 'fallback', model: 'gpt-image-1.5' }),
    ]))
  })

  it('bounds the fallback probe even when the extra candidate fails verification', async () => {
    const candidates = ['a', 'b', 'c'].map((suffix) => ({
      id: `provider-candidate:${suffix.repeat(64)}`,
      source: 'cc-switch', sourceLabel: 'CC Switch', kind: 'openai-compatible', label: suffix,
      baseUrl: 'https://relay.example/v1', wireProtocol: 'responses',
      credential: { sourceType: 'cc-switch-db', available: true, importable: true }, warnings: [],
    })) as ProviderDiscoveryCandidate[]
    mocks.configure
      .mockResolvedValueOnce(configured(
        'complete',
        'openai-compatible',
        ['gpt-5.5', 'gpt-image-2'],
        'gpt-5.5',
      ))
      .mockRejectedValueOnce({
        code: 'unauthorized',
        message: 'Fallback authentication failed.',
      })

    await expect(configureAutomaticAi(candidates)).resolves.toMatchObject({
      configured: [{ provider: { id: 'complete' } }],
    })
    expect(mocks.configure.mock.calls).toEqual([
      [candidates[0]!.id],
      [candidates[1]!.id],
    ])
  })

  it('spends the bounded fallback probe on the strongest task-fit image candidate', async () => {
    const candidates = ['complete', 'generic', 'qwen'].map((label, index) => ({
      id: `provider-candidate:${String.fromCharCode(97 + index).repeat(64)}`,
      source: 'cutout-keychain', sourceLabel: 'Cutout local credentials',
      kind: index === 2 ? 'dashscope' : 'openai-compatible', label,
      baseUrl: index === 2
        ? 'https://dashscope.aliyuncs.com/compatible-mode/v1'
        : `https://${label}.example/v1`,
      wireProtocol: 'chat-completions',
      ...(index === 1 ? { modelHint: 'gpt-5.5-mini' } : {}),
      ...(index === 2 ? { modelHint: 'qwen-image-3.0' } : {}),
      credential: { sourceType: 'keychain', available: true, importable: true },
      warnings: [],
    })) as ProviderDiscoveryCandidate[]
    mocks.configure
      .mockResolvedValueOnce(configured(
        'complete',
        'openai-compatible',
        ['gpt-5.5', 'gpt-image-2'],
        'gpt-5.5',
      ))
      .mockResolvedValueOnce(configured(
        'qwen',
        'dashscope',
        ['qwen-image-3.0', 'qwen-image-3.0-pro'],
        'qwen-image-3.0',
      ))

    await expect(configureAutomaticAi(candidates)).resolves.toMatchObject({
      configured: [
        { provider: { id: 'complete' } },
        { provider: { id: 'qwen' } },
      ],
    })
    expect(mocks.configure.mock.calls).toEqual([
      [candidates[0]!.id],
      [candidates[2]!.id],
    ])
  })

  it('continues through the reviewed CC Switch queue after the current catalog rejects auth', async () => {
    const candidates = ['a', 'b'].map((suffix) => ({
      id: `provider-candidate:${suffix.repeat(64)}`,
      source: 'cc-switch', sourceLabel: 'CC Switch', kind: 'openai-compatible',
      label: 'CC Switch Codex upstream', baseUrl: `https://${suffix}.example/v1`,
      wireProtocol: 'responses',
      credential: { sourceType: 'cc-switch-db', available: true, importable: true }, warnings: [],
    })) as ProviderDiscoveryCandidate[]
    mocks.configure
      .mockRejectedValueOnce({ code: 'unauthorized', message: 'Provider authentication failed.' })
      .mockResolvedValueOnce(configured(
        'verified-queue-route',
        'openai-compatible',
        ['gpt-5.5', 'gpt-image-2'],
        'gpt-5.5',
      ))

    await expect(configureAutomaticAi(candidates)).resolves.toMatchObject({
      configured: [{ provider: { id: 'verified-queue-route' } }],
      bindings: {
        text: { providerId: 'verified-queue-route', model: 'gpt-5.5' },
        'image-generation': { providerId: 'verified-queue-route', model: 'gpt-image-2' },
        'image-edit': { providerId: 'verified-queue-route', model: 'gpt-image-2' },
      },
    })
    expect(mocks.configure.mock.calls).toEqual([
      [candidates[0]!.id],
      [candidates[1]!.id],
    ])
    expect(mocks.setVerification).toHaveBeenCalledTimes(1)
    expect(mocks.setVerification).toHaveBeenCalledWith(
      'verified-queue-route',
      expect.objectContaining({
        status: 'verified',
        models: ['gpt-5.5', 'gpt-image-2'],
      }),
    )
  })

  it('preserves a bounded message from a structured native rejection', async () => {
    const candidate = {
      id: `provider-candidate:${'a'.repeat(64)}`,
      source: 'codex', sourceLabel: 'Codex', kind: 'openai-compatible', label: 'Codex',
      baseUrl: 'https://relay.example/v1', wireProtocol: 'responses',
      credential: { sourceType: 'config-literal', available: true, importable: true }, warnings: [],
    } as ProviderDiscoveryCandidate
    mocks.configure.mockRejectedValue({
      code: 'credential-unavailable',
      message: 'The native credential is no longer available.',
    })

    await expect(configureAutomaticAi([candidate]))
      .rejects.toThrow('The native credential is no longer available.')
  })
})

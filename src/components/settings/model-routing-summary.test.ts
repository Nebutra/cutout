import { describe, expect, it } from 'vitest'
import { capabilityBindingsSchema } from '@/services/ai/model-capabilities'
import type { ProviderConfig } from '@/services/ai/provider-types'
import type { ProviderVerification } from '@/services/ai/provider-verification'
import { modelRoutingCoverage } from './model-routing-summary'

const provider = (
  kind: ProviderConfig['kind'],
  overrides: Partial<ProviderConfig> = {},
): ProviderConfig => ({
  id: kind,
  kind,
  label: kind,
  defaultModel: 'chat-model',
  enabled: true,
  ...overrides,
})

const bindings = (map: Record<string, { providerId: string; model: string }>) =>
  capabilityBindingsSchema.parse({ version: 'model-assignments.v2', bindings: map })

const verification = (models: readonly string[]): ProviderVerification => ({
  status: 'verified',
  model: models[0]!,
  models: [...models],
  checkedAt: '2026-07-28T00:00:00.000Z',
})

describe('model routing summary', () => {
  it('covers only the six non-speech AI dimensions', () => {
    const result = modelRoutingCoverage([])
    expect(result.covered).toHaveLength(0)
    expect(result.missing).toHaveLength(6)
    expect(result.missing.map((item) => item.task)).not.toEqual(
      expect.arrayContaining(['asr', 'tts']),
    )
  })

  it('does not treat adapter-level capability declarations as model evidence', () => {
    expect(modelRoutingCoverage([provider('openai')]).covered).toEqual([])
  })

  it('covers composite Coding dimensions from verified text and vision routes', () => {
    const routes = bindings({
      text: { providerId: 'openai-compatible', model: 'chat-model' },
      vision: { providerId: 'openai-compatible', model: 'chat-model' },
      'image-generation': { providerId: 'openai-compatible', model: 'image-model' },
      'image-edit': { providerId: 'openai-compatible', model: 'image-model' },
    })
    const result = modelRoutingCoverage(
      [provider('openai-compatible')],
      routes,
      { 'openai-compatible': verification(['chat-model', 'image-model']) },
    )
    expect(result.missing).toEqual([])
    expect(result.covered.map((item) => item.task)).toEqual([
      'text',
      'vision',
      'webdev',
      'image-to-webdev',
      'image-generation',
      'image-edit',
    ])
  })

  it('rejects an assigned image model absent from authenticated catalog evidence', () => {
    const routes = bindings({
      text: { providerId: 'openai-compatible', model: 'chat-model' },
      vision: { providerId: 'openai-compatible', model: 'chat-model' },
      'image-generation': { providerId: 'openai-compatible', model: 'image-model' },
      'image-edit': { providerId: 'openai-compatible', model: 'image-model' },
    })
    const result = modelRoutingCoverage(
      [provider('openai-compatible')],
      routes,
      { 'openai-compatible': verification(['chat-model']) },
    )
    expect(result.missing.map((item) => item.task)).toEqual([
      'image-generation',
      'image-edit',
    ])
  })

  it('ignores bindings whose provider is disabled or absent', () => {
    const route = bindings({
      'image-generation': { providerId: 'openai-compatible', model: 'image-model' },
    })
    expect(modelRoutingCoverage(
      [provider('openai-compatible', { enabled: false })],
      route,
      { 'openai-compatible': verification(['image-model']) },
    ).missing.map((item) => item.task)).toContain('image-generation')
    expect(modelRoutingCoverage(
      [provider('openai-compatible')],
      bindings({ 'image-generation': { providerId: 'ghost', model: 'image-model' } }),
      { ghost: verification(['image-model']) },
    ).missing.map((item) => item.task)).toContain('image-generation')
  })
})

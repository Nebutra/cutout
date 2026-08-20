import { describe, expect, it } from 'vitest'
import {
  capabilityBindingsSchema,
  type ModelDescriptor,
} from '@/services/ai/model-capabilities'
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
  wireProtocol: kind === 'openai' ? 'responses' : 'chat-completions',
  catalog: { models: ['chat-model'], fetchedAt: '2026-07-28T00:00:00.000Z' },
  enabled: true,
  ...overrides,
})

const bindings = (
  map: Record<string, { providerId: string; model: string }>,
  descriptors: readonly ModelDescriptor[] = [],
) => capabilityBindingsSchema.parse({
  version: 'model-assignments.v2',
  bindings: map,
  descriptors,
})

const imageDescriptor = (providerId: string, model: string): ModelDescriptor => ({
  providerId,
  model,
  capabilities: ['image-generation', 'image-edit'],
  source: 'verified-catalog',
  evidence: [
    { capability: 'image-generation', kind: 'verified', sourceId: 'test' },
    { capability: 'image-edit', kind: 'verified', sourceId: 'test' },
  ],
})

const verification = (): ProviderVerification => ({
  status: 'verified',
  checkedAt: '2026-07-28T00:00:00.000Z',
})

/** Catalog evidence now lives on the connection, so tests set it there. */
const withCatalog = (
  base: ProviderConfig,
  models: readonly string[],
): ProviderConfig => ({
  ...base,
  catalog: { models: [...models], fetchedAt: '2026-07-28T00:00:00.000Z' },
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
    }, [imageDescriptor('openai-compatible', 'image-model')])
    const result = modelRoutingCoverage(
      [withCatalog(provider('openai-compatible'), ['chat-model', 'image-model'])],
      routes,
      { 'openai-compatible': verification() },
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
      [withCatalog(provider('openai-compatible'), ['chat-model'])],
      routes,
      { 'openai-compatible': verification() },
    )
    expect(result.missing.map((item) => item.task)).toEqual([
      'image-generation',
      'image-edit',
    ])
  })

  it('rejects authenticated catalog presence without exact image capability evidence', () => {
    const routes = bindings({
      'image-generation': { providerId: 'openai-compatible', model: 'image-model' },
      'image-edit': { providerId: 'openai-compatible', model: 'image-model' },
    })
    const result = modelRoutingCoverage(
      [withCatalog(provider('openai-compatible'), ['image-model'])],
      routes,
      { 'openai-compatible': verification() },
    )
    expect(result.missing.map((item) => item.task)).toEqual(expect.arrayContaining([
      'image-generation',
      'image-edit',
    ]))
  })

  it('ignores bindings whose provider is disabled or absent', () => {
    const route = bindings({
      'image-generation': { providerId: 'openai-compatible', model: 'image-model' },
    })
    expect(modelRoutingCoverage(
      [withCatalog(provider('openai-compatible', { enabled: false }), ['image-model'])],
      route,
      { 'openai-compatible': verification() },
    ).missing.map((item) => item.task)).toContain('image-generation')
    expect(modelRoutingCoverage(
      [withCatalog(provider('openai-compatible'), ['image-model'])],
      bindings({ 'image-generation': { providerId: 'ghost', model: 'image-model' } }),
      { ghost: verification() },
    ).missing.map((item) => item.task)).toContain('image-generation')
  })
})

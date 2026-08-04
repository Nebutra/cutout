import { describe, expect, it } from 'vitest'
import type { ModelCapability, ModelDescriptor } from './model-capabilities'
import {
  assessImageRoute,
  imageRouteFidelity,
  imageRouteRecommendationRank,
  imageRoutePresentationStatus,
  projectVerifiedImageCapabilityBindings,
  reviewedCatalogImageDescriptors,
  verifiedImageRouteDescriptor,
} from './image-route-assessment'
import type { ProviderConfig } from './provider-types'

const provider = (
  kind: string,
  wireProtocol: ProviderConfig['wireProtocol'] = kind === 'openai'
    ? 'responses'
    : kind === 'google'
      ? 'google-generate-content'
      : 'chat-completions',
): ProviderConfig => ({
  id: `provider:${kind}`,
  kind,
  label: kind,
  defaultModel: 'model',
  enabled: true,
  wireProtocol,
})
const descriptor = (
  providerId: string,
  model: string,
  capabilities: readonly ModelCapability[],
  kind: 'declared' | 'observed' | 'verified' = 'verified',
): ModelDescriptor => ({
  providerId,
  model,
  capabilities: [...capabilities],
  source: 'verified-catalog',
  evidence: capabilities.map((capability) => ({ capability, kind, sourceId: 'test' })),
})

describe('image route assessment', () => {
  it('centralizes high-fidelity model families without using them as support evidence', () => {
    expect([
      'gpt-image-2',
      'gpt-image-1.5-high-fidelity',
      'chatgpt-image-latest-high-fidelity',
      'muse-image',
      'mai-image-2.5',
      'gemini-3-pro-image-preview',
      'gemini-3.1-flash-image-preview',
      'Qwen-Image-3.0',
      'seedream-5-pro',
      'reve-2.1',
      'grok-imagine-image',
    ].map(imageRouteFidelity)).toEqual(Array(11).fill('recommended'))
    expect(imageRouteFidelity('custom-image-gen')).toBe('compatible')
    expect(imageRouteRecommendationRank('gpt-image-2'))
      .toBeGreaterThan(imageRouteRecommendationRank('gpt-image-1.5-high-fidelity'))
  })

  it('keeps exact assignment and support independent from fidelity metadata', () => {
    const route = provider('openai')
    const assess = (model: string) => assessImageRoute({
      provider: route,
      assignment: { providerId: route.id, model },
      descriptor: descriptor(route.id, model, ['image-generation', 'image-edit']),
    })
    const recommended = assess('chatgpt-image-latest-high-fidelity')
    const compatible = assess('custom-image-gen')
    expect(recommended.assignment).toEqual({
      providerId: route.id,
      model: 'chatgpt-image-latest-high-fidelity',
    })
    expect(compatible.assignment).toEqual({ providerId: route.id, model: 'custom-image-gen' })
    expect(recommended.generation).toEqual(compatible.generation)
    expect(recommended.edit).toEqual(compatible.edit)
  })

  it('intersects exact verified model evidence with the OpenAI adapter', () => {
    const route = provider('openai')
    const assignment = { providerId: route.id, model: 'custom-image-model' }
    const result = assessImageRoute({
      provider: route,
      assignment,
      descriptor: descriptor(route.id, assignment.model, ['image-generation', 'image-edit']),
    })
    expect(result).toMatchObject({
      fidelity: 'compatible',
      generation: { supported: true, strategy: 'openai-images-generations' },
      edit: { supported: true, strategy: 'openai-images-edits' },
    })
  })

  it('does not treat declared evidence, provider kind, or a recommended name as support', () => {
    const route = provider('openai')
    const assignment = { providerId: route.id, model: 'gpt-image-2' }
    const result = assessImageRoute({
      provider: route,
      assignment,
      descriptor: descriptor(route.id, assignment.model, ['image-generation', 'image-edit'], 'declared'),
    })
    expect(result.fidelity).toBe('recommended')
    expect(result.generation).toEqual({ supported: false, reason: 'evidence-required' })
    expect(result.edit).toEqual({ supported: false, reason: 'evidence-required' })
  })

  it('does not treat a task binding or authenticated catalog presence as capability evidence', () => {
    const route = provider('openai')
    const assignment = { providerId: route.id, model: 'compatible-image' }
    const result = assessImageRoute({
      provider: route,
      assignment,
      descriptor: undefined,
    })
    expect(result.fidelity).toBe('compatible')
    expect(result.generation).toEqual({ supported: false, reason: 'evidence-required' })
    expect(result.edit).toEqual({ supported: false, reason: 'evidence-required' })
  })

  it('bootstraps only reviewed exact models from an authenticated catalog', () => {
    const route = provider('openai')
    expect(reviewedCatalogImageDescriptors(route, [
      'gpt-image-2',
      'custom-image-gen',
      'seedream-5-pro',
    ])).toEqual([
      expect.objectContaining({
        providerId: route.id,
        model: 'gpt-image-2',
        capabilities: ['image-generation', 'image-edit'],
        evidence: expect.arrayContaining([
          expect.objectContaining({ capability: 'image-edit', kind: 'observed' }),
        ]),
      }),
    ])
  })

  it('turns Arena edit evidence into support only after exact endpoint verification', () => {
    const route = provider('openai-compatible', 'chat-completions')
    const assignment = { providerId: route.id, model: 'flux-2-max' }
    expect(verifiedImageRouteDescriptor({
      provider: route,
      assignment,
      descriptors: [],
      verifiedCatalogModels: [],
    })).toBeUndefined()

    const exact = verifiedImageRouteDescriptor({
      provider: route,
      assignment,
      descriptors: [],
      verifiedCatalogModels: ['other-model', assignment.model],
    })
    expect(exact).toMatchObject({
      providerId: route.id,
      model: assignment.model,
      capabilities: ['image-edit'],
      evidence: [expect.objectContaining({
        kind: 'observed',
        sourceId: 'arena-image-edit:2026-07-25',
      })],
    })
    expect(assessImageRoute({ provider: route, assignment, descriptor: exact })).toMatchObject({
      fidelity: 'compatible',
      generation: { supported: false, reason: 'evidence-required' },
      edit: { supported: true, strategy: 'openai-images-edits' },
    })
  })

  it('keeps reviewed edit capability adapter-required on an unimplemented transport', () => {
    const route = provider('dashscope', 'chat-completions')
    const assignment = { providerId: route.id, model: 'qwen-image-edit-2511' }
    const exact = verifiedImageRouteDescriptor({
      provider: route,
      assignment,
      descriptors: [],
      verifiedCatalogModels: [assignment.model],
    })
    expect(assessImageRoute({ provider: route, assignment, descriptor: exact }).edit)
      .toEqual({ supported: false, reason: 'adapter-required' })
  })

  it('projects reviewed catalog evidence into runtime bindings without changing assignments', () => {
    const route = provider('openai-compatible', 'chat-completions')
    const assignment = { providerId: route.id, model: 'flux-2-max' }
    const bindings = {
      version: 'model-assignments.v2' as const,
      bindings: { 'image-edit': assignment },
      descriptors: [],
    }
    const projected = projectVerifiedImageCapabilityBindings({
      bindings,
      providers: [route],
      catalogModelsByProvider: { [route.id]: [assignment.model] },
    })
    expect(projected?.bindings).toEqual(bindings.bindings)
    expect(projected?.descriptors).toEqual([
      expect.objectContaining({
        providerId: route.id,
        model: assignment.model,
        capabilities: ['image-edit'],
      }),
    ])
    expect(bindings.descriptors).toEqual([])
  })

  it('supports verified Google generation but keeps edit adapter-required', () => {
    const route = provider('google', 'google-generate-content')
    const assignment = { providerId: route.id, model: 'gemini-image-custom' }
    const result = assessImageRoute({
      provider: route,
      assignment,
      descriptor: descriptor(route.id, assignment.model, ['image-generation', 'image-edit'], 'observed'),
    })
    expect(result.generation).toEqual({ supported: true, strategy: 'google-multimodal-generate' })
    expect(result.edit).toEqual({ supported: false, reason: 'adapter-required' })
    expect(imageRoutePresentationStatus(result, 'image-generation')).toBe('supported')
    expect(imageRoutePresentationStatus(result, 'image-edit')).toBe('adapter-required')
  })

  it('keeps DashScope/Qwen adapter-required without inventing native transport', () => {
    const route = provider('dashscope', 'chat-completions')
    const assignment = { providerId: route.id, model: 'Qwen-Image-3.0' }
    const result = assessImageRoute({
      provider: route,
      assignment,
      descriptor: descriptor(route.id, assignment.model, ['image-generation', 'image-edit']),
    })
    expect(result.fidelity).toBe('recommended')
    expect(result.generation).toEqual({ supported: false, reason: 'adapter-required' })
    expect(result.edit).toEqual({ supported: false, reason: 'adapter-required' })
  })

  it('rejects disabled and mismatched exact routes', () => {
    const route = { ...provider('openai'), enabled: false }
    const assignment = { providerId: route.id, model: 'image-a' }
    const exact = descriptor(route.id, assignment.model, ['image-generation'])
    expect(assessImageRoute({ provider: route, assignment, descriptor: exact }).generation)
      .toEqual({ supported: false, reason: 'provider-disabled' })
    expect(assessImageRoute({
      provider: { ...route, enabled: true },
      assignment,
      descriptor: { ...exact, model: 'image-b' },
    }).generation).toEqual({ supported: false, reason: 'route-mismatch' })
  })
})

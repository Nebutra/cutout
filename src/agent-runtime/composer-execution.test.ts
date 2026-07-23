import { describe, expect, it } from 'vitest'
import type { ModelAssignments } from '@/services/ai/model-assignment-types'
import type { ProviderConfig } from '@/services/ai/provider-types'
import type { ModelDescriptor } from './capability-router'
import {
  composerRouteNotices,
  composerModelValue,
  fixedModelValue,
  lockComposerChatRoute,
  lockComposerImageRoute,
  lockComposerRoute,
  parseComposerModelValue,
  supportsWebSearch,
} from './composer-execution'

const assignments: ModelAssignments = {
  chat: { providerId: 'claude', model: 'claude-sonnet' },
  image: { providerId: 'openai', model: 'gpt-image-1' },
}
const providers: ProviderConfig[] = [
  { id: 'claude', kind: 'anthropic', label: 'Claude', defaultModel: 'claude-sonnet', enabled: true },
  { id: 'openai', kind: 'openai', label: 'OpenAI', defaultModel: 'gpt-image-1', enabled: true },
]
const verifiedCatalog: ModelDescriptor[] = [
  { providerId: 'claude', model: 'claude-sonnet', slot: 'chat', capabilities: ['text', 'vision', 'reasoning', 'tools'], quality: .8, cost: .5, speed: .7, region: 'global', available: true },
  { providerId: 'openai', model: 'gpt-image-1', slot: 'image', capabilities: ['image-generation', 'image-edit'], quality: .8, cost: .5, speed: .7, region: 'global', available: true },
]

describe('composer execution adapter', () => {
  it('round-trips fixed slot choices and rejects stale values', () => {
    const value = fixedModelValue('chat', assignments.chat!)
    expect(parseComposerModelValue(value, assignments)).toEqual({
      mode: 'fixed', slot: 'chat', assignment: assignments.chat,
    })
    expect(composerModelValue({ mode: 'fixed', slot: 'chat', assignment: assignments.chat! })).toBe(value)
    expect(parseComposerModelValue('chat:old:model', assignments)).toEqual({ mode: 'auto' })
  })

  it('locks both slots at run start and resolves auto thinking to a concrete effort', () => {
    const route = lockComposerRoute({
      model: { mode: 'auto' }, thinking: 'auto', assignments, providers,
      hasReferenceImages: true, modelCatalog: verifiedCatalog,
    })
    expect(route.chat).toEqual({ ...assignments.chat, effort: 'medium' })
    expect(route.image).toEqual(assignments.image)
    expect(route.imagePolicy.slot).toBe('image')
  })

  it('can classify a local material request without an image-provider assignment', () => {
    const chatOnly = { chat: assignments.chat }
    const route = lockComposerChatRoute({
      model: { mode: 'auto' },
      thinking: 'auto',
      assignments: chatOnly,
      providers,
      hasReferenceImages: false,
      modelCatalog: verifiedCatalog.filter((model) => model.slot === 'chat'),
    })
    expect(route.chat.providerId).toBe('claude')
    expect(() => lockComposerImageRoute({
      model: { mode: 'auto' },
      thinking: 'auto',
      assignments: chatOnly,
      providers,
      hasReferenceImages: false,
      modelCatalog: verifiedCatalog.filter((model) => model.slot === 'chat'),
    })).toThrow('Configure a image model')
  })

  it('keeps provider-default separate from auto thinking', () => {
    const route = lockComposerRoute({
      model: { mode: 'auto' }, thinking: 'provider-default', assignments, providers,
      hasReferenceImages: false, modelCatalog: verifiedCatalog,
    })
    expect(route.chat.effort).toBeUndefined()
    expect(route.chatPolicy.requestedThinking).toBe('provider-default')
  })

  it('reports actual web-search support by enabled direct provider kind', () => {
    expect(supportsWebSearch(assignments.chat!, providers)).toBe(true)
    expect(supportsWebSearch(
      { providerId: 'gateway', model: 'vendor/model' },
      [{ id: 'gateway', kind: 'gateway', label: 'Gateway', defaultModel: 'vendor/model', enabled: true }],
    )).toBe(false)
  })

  it('turns capability degradation into factual user-visible notices', () => {
    const route = lockComposerRoute({
      model: { mode: 'fixed', slot: 'chat', assignment: assignments.chat! },
      thinking: 'high', assignments, providers, hasReferenceImages: false,
      modelCatalog: verifiedCatalog,
    })
    expect(composerRouteNotices(route)).toContain(
      'The fixed model applies to one capability slot; Agent Router used the configured assignment for the other slot.',
    )
  })
})

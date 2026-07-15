import { describe, expect, it } from 'vitest'
import { designDocumentToDesignOsPanelModel } from './design-os/model'
import type { DesignDocument } from '@/design-ir'

describe('current Design OS projection', () => {
  it('shows the current document inventory instead of a baseline empty model', () => {
    const model = designDocumentToDesignOsPanelModel(document(), {
      providers: [{
        id: 'provider:openai',
        kind: 'openai',
        label: 'OpenAI',
        defaultModel: 'gpt-5',
        enabled: true,
      }],
      assignments: {
        chat: { providerId: 'provider:openai', model: 'gpt-5' },
      },
    })

    expect(model.counts).toEqual({ sources: 2, tokens: 3, components: 1, materials: 4 })
    expect(model.capabilities).toContainEqual(expect.objectContaining({
      id: 'byok-connector',
      label: 'AI model connection',
      status: 'available',
      detail: 'Connected: chat.',
    }))
    expect(model.capabilities).toContainEqual(expect.objectContaining({
      id: 'headless-policy',
      status: 'unknown',
    }))
  })

  it('does not claim headless or connector support without evidence', () => {
    const model = designDocumentToDesignOsPanelModel(document(), {
      connectorConfigurationPending: true,
    })

    expect(model.capabilities).toContainEqual(expect.objectContaining({
      id: 'byok-connector',
      status: 'unknown',
    }))
    expect(model.capabilities).not.toContainEqual(expect.objectContaining({
      id: 'design-kit',
      status: 'available',
    }))
  })
})

function document(): DesignDocument {
  return {
    version: 'design-ir.v1',
    meta: {
      id: 'project:acme',
      title: 'Acme',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    revision: {
      id: 'revision:acme:1',
      number: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      author: { kind: 'system', id: 'test' },
    },
    needs: [],
    sources: [{ id: 'source:1' }, { id: 'source:2' }],
    materials: [{ id: 'material:1' }, { id: 'material:2' }, { id: 'material:3' }, { id: 'material:4' }],
    provenance: [],
    brands: [],
    tokens: [{ id: 'token:1' }, { id: 'token:2' }, { id: 'token:3' }],
    components: [{ id: 'component:1' }],
    relations: [],
  } as unknown as DesignDocument
}

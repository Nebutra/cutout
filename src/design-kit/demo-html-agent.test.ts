import { describe, expect, it } from 'vitest'
import type { DesignDocument } from '@/design-ir'
import type { Result } from '@/services/types'
import { composeDemoHtmlPrompt, composeDemoHtmlWithAgent } from './demo-html-agent'

const timestamp = '2026-07-15T10:00:00.000Z'

function document(overrides: Partial<DesignDocument> = {}): DesignDocument {
  return {
    version: 'design-ir.v1',
    meta: { id: 'project:trace', title: 'Trace Console', createdAt: timestamp, updatedAt: timestamp },
    revision: { id: 'revision:1', number: 1, createdAt: timestamp, author: { kind: 'human', id: 'user:1' } },
    needs: [{
      id: 'need:audit', title: 'Live run audit', statement: 'Operators must audit agent runs in real time.',
      priority: 'high', status: 'accepted', acceptanceCriteria: [],
    }],
    sources: [],
    brands: [],
    tokens: [],
    components: [{ id: 'component:table', name: 'Runs table', status: 'ready', tokenIds: [] }],
    materials: [],
    provenance: [],
    relations: [],
    ...overrides,
  }
}

const chat = { providerId: 'provider:openai', model: 'gpt-5' }

describe('composeDemoHtmlPrompt', () => {
  it('grounds the prompt in the actual product needs and components, not a generic template', () => {
    const prompt = composeDemoHtmlPrompt(document(), ':root { --cutout-color-accent: #123456; }')
    expect(prompt).toContain('Trace Console')
    expect(prompt).toContain('Operators must audit agent runs in real time.')
    expect(prompt).toContain('Runs table')
    expect(prompt).toContain('--cutout-color-accent: #123456;')
    expect(prompt).toContain('not a generic admin dashboard unless the product genuinely is one')
  })

  it('still produces a usable prompt for a document with no declared needs or components', () => {
    const prompt = composeDemoHtmlPrompt(document({ needs: [], components: [] }), '')
    expect(prompt).toContain('infer a plausible product from the title alone')
    expect(prompt).toContain('no components declared yet')
  })
})

describe('composeDemoHtmlWithAgent', () => {
  it('returns the composed HTML, stripping a code fence if the model added one', async () => {
    const generateText = async (): Promise<Result<string>> => ({
      ok: true,
      data: '```html\n<!doctype html><html><body>Trace</body></html>\n```',
    })
    const html = await composeDemoHtmlWithAgent({
      document: document(),
      tokensCss: '',
      chat,
      generation: { generateText },
    })
    expect(html).toBe('<!doctype html><html><body>Trace</body></html>')
  })

  it('falls back to null (never throws) when the provider call fails', async () => {
    const generateText = async (): Promise<Result<string>> => ({ ok: false, error: 'provider not configured' })
    const html = await composeDemoHtmlWithAgent({
      document: document(),
      tokensCss: '',
      chat,
      generation: { generateText },
    })
    expect(html).toBeNull()
  })

  it('falls back to null when the model returns non-HTML output', async () => {
    const generateText = async (): Promise<Result<string>> => ({ ok: true, data: 'Sure, here is your page: ...' })
    const html = await composeDemoHtmlWithAgent({
      document: document(),
      tokensCss: '',
      chat,
      generation: { generateText },
    })
    expect(html).toBeNull()
  })
})

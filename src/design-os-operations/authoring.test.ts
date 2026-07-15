import { describe, expect, it } from 'vitest'
import type { DesignDocument } from '@/design-ir'
import { applyAuthoring, authoringForDocument, prepareAuthoring } from './authoring'

const timestamp = '2026-07-11T12:00:00.000Z'

function document(): DesignDocument {
  return {
    version: 'design-ir.v1',
    meta: { id: 'project:authoring', title: 'Authoring', createdAt: timestamp, updatedAt: timestamp },
    revision: { id: 'revision:1', number: 1, createdAt: timestamp, author: { kind: 'human', id: 'human:1' } },
    needs: [], sources: [], brands: [],
    tokens: [{ id: 'token:primary', name: 'Primary', kind: 'color', value: '#00875a' }],
    components: [{ id: 'component:button', name: 'Button', status: 'ready', tokenIds: ['token:primary'] }],
    prototype: { id: 'prototype:1', plan: {
      version: 'prototype-plan.v0', product: { name: 'Authoring', summary: 'Test', audience: 'Designers', primaryGoal: 'Test', platform: 'web' },
      designSystem: { styleSummary: 'Direct', palette: ['#00875a'], typography: 'Inter', spacing: '4px', componentPrinciples: ['Explicit'], assetDirection: 'None' },
      pages: [{ id: 'page:home', name: 'Home', route: '/', purpose: 'Test', viewport: { platform: 'web', width: 1440, height: 900, scroll: 'single-screen' }, regions: [{ id: 'region:main', name: 'Main', role: 'content', summary: 'Main content', complexity: 'low', decompositionStrategy: 'direct', assetRoute: 'board-cutout', assetOpportunities: [] }], interactions: [], overlays: [], states: [] }],
      flows: [{ id: 'flow:home', name: 'Home', goal: 'View home', startPageId: 'page:home', steps: [] }], humanLoop: { mode: 'continue', rationale: 'Explicit fixture.' },
    } },
    materials: [], provenance: [], relations: [
      { id: 'relation:token', kind: 'component-uses-token', from: { kind: 'component', id: 'component:button' }, to: { kind: 'token', id: 'token:primary' } },
      { id: 'relation:prototype', kind: 'prototype-uses-component', from: { kind: 'prototype', id: 'prototype:1' }, to: { kind: 'component', id: 'component:button' } },
    ],
  }
}

describe('Design OS authoring operations', () => {
  it('validates explicit component declarations, previews, approves, and restores only on the same revision', async () => {
    const current = document()
    const prepared = await prepareAuthoring(current, 'components', [{
      id: 'component:button', name: 'Button', kind: 'primitive', sourcePageIds: ['page:home'], tokenRefs: ['token:primary'], props: [], variants: [], slots: [], status: 'ready',
    }])
    if (!prepared.ok) throw new Error(prepared.error)
    expect(prepared.data.summary).toContain('1 explicit candidates')
    const applied = applyAuthoring(current, undefined, prepared.data)
    expect(applied.ok).toBe(true)
    if (!applied.ok) return
    expect(authoringForDocument(current, applied.data)?.componentCandidates).toHaveLength(1)
    expect(authoringForDocument({ ...current, revision: { ...current.revision, id: 'revision:2', number: 2 } }, applied.data)).toBeUndefined()
  })

  it('rejects guessed or unbound component candidates before preview', async () => {
    const prepared = await prepareAuthoring(document(), 'components', [{
      id: 'component:button', name: 'Button', kind: 'primitive', sourcePageIds: ['page:missing'], tokenRefs: [], props: [], variants: [], slots: [], status: 'ready',
    }])
    expect(prepared).toMatchObject({ ok: false })
  })

  it('revision-guards starter configuration approval', async () => {
    const current = document()
    const prepared = await prepareAuthoring(current, 'starter', { framework: 'vite-react', assetBindings: [], existingPaths: [] })
    expect(prepared.ok).toBe(true)
    if (!prepared.ok) return
    const stale = { ...current, revision: { ...current.revision, id: 'revision:2', number: 2 } }
    expect(applyAuthoring(stale, undefined, prepared.data)).toMatchObject({ ok: false, error: expect.stringContaining('Revision conflict') })
  })
})

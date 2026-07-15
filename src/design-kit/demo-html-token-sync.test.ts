import { describe, expect, it } from 'vitest'
import type { DesignDocument } from '@/design-ir'
import { headlessTokenAdapters } from './headless'
import { applyTokenValueChanges, diffDemoHtmlTokens, parseCssCustomProperties } from './demo-html-token-sync'

const timestamp = '2026-07-15T10:00:00.000Z'

function document(overrides: Partial<DesignDocument> = {}): DesignDocument {
  return {
    version: 'design-ir.v1',
    meta: { id: 'project:sync', title: 'Sync', createdAt: timestamp, updatedAt: timestamp },
    revision: { id: 'revision:1', number: 1, createdAt: timestamp, author: { kind: 'human', id: 'user:1' } },
    needs: [],
    sources: [{
      id: 'source:demo-html', kind: 'document', role: 'reference', title: 'demo.html (edited)',
      license: { kind: 'proprietary', holder: 'Project owner' },
      content: [{ id: 'content:demo-html', uri: 'cutout://ingestion/sha256/abc' }],
    }],
    brands: [],
    tokens: [
      { id: 'token:color:accent', name: 'Accent', kind: 'color', value: '#0ea5e9' },
      { id: 'token:spacing:md', name: 'Medium', kind: 'spacing', value: '1rem' },
      { id: 'token:motion:ease', name: 'Ease', kind: 'motion', value: 'cubic-bezier(0.4,0,0.2,1)' },
    ],
    components: [],
    materials: [],
    provenance: [],
    relations: [],
    ...overrides,
  }
}

function varNameFor(doc: DesignDocument, tokenId: string): string {
  const adapter = headlessTokenAdapters(doc.tokens.filter((token) => token.kind !== 'motion'))
    .find((entry) => entry.tokenId === tokenId)
  if (!adapter) throw new Error(`No adapter for ${tokenId}`)
  return `cutout-${adapter.category}-${adapter.cssName}`
}

describe('parseCssCustomProperties', () => {
  it('extracts every custom property declaration regardless of surrounding markup', () => {
    const parsed = parseCssCustomProperties(`
      <style>
        :root {
          --cutout-color-accent: #ff0000;
          --cutout-spacing-md: 1.5rem;
        }
      </style>
    `)
    expect(parsed).toEqual({ 'cutout-color-accent': '#ff0000', 'cutout-spacing-md': '1.5rem' })
  })

  it('ignores malformed declarations without throwing', () => {
    expect(parseCssCustomProperties('not css at all')).toEqual({})
  })
})

describe('diffDemoHtmlTokens', () => {
  it('maps declared custom properties back to token ids via headlessTokenAdapters and reports only real changes', () => {
    const doc = document()
    const accentVar = varNameFor(doc, 'token:color:accent')
    const spacingVar = varNameFor(doc, 'token:spacing:md')
    const html = `<style>:root { --${accentVar}: #ff0000; --${spacingVar}: 1rem; }</style>`

    const changes = diffDemoHtmlTokens(doc, html)

    expect(changes).toEqual([
      { tokenId: 'token:color:accent', name: 'Accent', previousValue: '#0ea5e9', nextValue: '#ff0000' },
    ])
  })

  it('ignores custom properties that do not map to a known token', () => {
    const doc = document()
    const changes = diffDemoHtmlTokens(doc, '<style>:root { --cutout-color-not-a-real-token: #ff0000; }</style>')
    expect(changes).toEqual([])
  })

  it('ignores alias var() references written by the compiler itself', () => {
    const doc = document()
    const accentVar = varNameFor(doc, 'token:color:accent')
    const changes = diffDemoHtmlTokens(doc, `<style>:root { --${accentVar}: var(--cutout-color-other); }</style>`)
    expect(changes).toEqual([])
  })

  it('does not throw when the document contains a motion token headlessTokenAdapters cannot export', () => {
    const doc = document()
    expect(() => diffDemoHtmlTokens(doc, '<style>:root {}</style>')).not.toThrow()
  })
})

describe('applyTokenValueChanges', () => {
  it('bumps the revision, records one provenance entry, and updates only the changed token values', () => {
    const doc = document()
    const applied = applyTokenValueChanges(doc, [
      { tokenId: 'token:color:accent', name: 'Accent', previousValue: '#0ea5e9', nextValue: '#ff0000' },
    ], {
      id: 'revision:2',
      createdAt: '2026-07-15T11:00:00.000Z',
      actor: { kind: 'human', id: 'user:1' },
      sourceId: 'source:demo-html',
    })

    expect(applied.ok).toBe(true)
    if (!applied.ok) return
    expect(applied.data.revision).toEqual({
      id: 'revision:2', number: 2, createdAt: '2026-07-15T11:00:00.000Z', author: { kind: 'human', id: 'user:1' },
    })
    const accent = applied.data.tokens.find((token) => token.id === 'token:color:accent')
    expect(accent?.value).toBe('#ff0000')
    expect(accent?.provenanceId).toBe('provenance:demo-html-sync:revision:2')
    const spacing = applied.data.tokens.find((token) => token.id === 'token:spacing:md')
    expect(spacing?.value).toBe('1rem')
    expect(applied.data.provenance).toHaveLength(1)
    expect(applied.data.provenance[0]).toMatchObject({
      operation: 'edit', sourceIds: ['source:demo-html'], tool: 'design-kit.demo-html-token-sync',
    })
  })

  it('rejects an empty change set instead of silently no-op bumping the revision', () => {
    const result = applyTokenValueChanges(document(), [], {
      id: 'revision:2', createdAt: timestamp, actor: { kind: 'human', id: 'user:1' }, sourceId: 'source:demo-html',
    })
    expect(result).toEqual({ ok: false, error: 'No token value changes to apply.' })
  })

  it('rejects a change referencing a source that was never ingested', () => {
    const result = applyTokenValueChanges(document(), [
      { tokenId: 'token:color:accent', name: 'Accent', previousValue: '#0ea5e9', nextValue: '#ff0000' },
    ], {
      id: 'revision:2', createdAt: timestamp, actor: { kind: 'human', id: 'user:1' }, sourceId: 'source:missing',
    })
    expect(result.ok).toBe(false)
  })

  it('rejects a change referencing an unknown token id', () => {
    const result = applyTokenValueChanges(document(), [
      { tokenId: 'token:does-not-exist', name: 'Ghost', previousValue: '#000', nextValue: '#fff' },
    ], {
      id: 'revision:2', createdAt: timestamp, actor: { kind: 'human', id: 'user:1' }, sourceId: 'source:demo-html',
    })
    expect(result.ok).toBe(false)
  })
})

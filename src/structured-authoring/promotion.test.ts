import { describe, expect, it } from 'vitest'
import type { DesignDocument } from '@/design-ir'
import { compileComponentCandidates } from '@/components-compiler'
import { promoteSelection } from './promotion'

const at = '2026-07-12T00:00:00.000Z'
const document: DesignDocument = {
  version: 'design-ir.v1', meta: { id: 'design', title: 'Design', createdAt: at, updatedAt: at }, revision: { id: 'revision:1', number: 1, createdAt: at, author: { kind: 'human', id: 'user' } }, needs: [], sources: [], brands: [],
  tokens: [{ id: 'token:surface', name: 'Surface', kind: 'color', value: '#fff' }],
  components: [{ id: 'component:hero', name: 'Hero', status: 'ready', tokenIds: ['token:surface'] }],
  prototype: { id: 'prototype:1', plan: { version: 'prototype-plan.v0', product: { name: 'Product', summary: 'Summary', audience: 'Users', primaryGoal: 'Ship', platform: 'web' }, designSystem: { styleSummary: 'Quiet', palette: ['#fff'], typography: 'Sans', spacing: '4px', componentPrinciples: ['Clear'], assetDirection: 'Approved only' }, pages: [{ id: 'page:home', name: 'Home', route: '/', purpose: 'Home', viewport: { platform: 'web', width: 1440, height: 900, scroll: 'single-screen' }, regions: [{ id: 'region:hero', name: 'Hero', role: 'hero', summary: 'Hero region', complexity: 'low', assetRoute: 'ignore-code-ui', decompositionStrategy: 'direct', assetOpportunities: [] }], overlays: [], states: [], interactions: [] }], flows: [{ id: 'flow', name: 'Flow', goal: 'Ship', startPageId: 'page:home', steps: [] }], humanLoop: { mode: 'continue', rationale: 'Explicit selection' } } },
  materials: [{ id: 'material:screen', kind: 'image', name: 'Screen', currentRevisionId: 'material-revision:1', revisions: [{ id: 'material-revision:1', ordinal: 1, createdAt: at, content: { id: 'content:screen', uri: `sha256:${'a'.repeat(64)}`, sha256: 'a'.repeat(64), mediaType: 'image/png' } }] }], provenance: [],
  relations: [{ id: 'relation:token', kind: 'component-uses-token', from: { kind: 'component', id: 'component:hero' }, to: { kind: 'token', id: 'token:surface' } }, { id: 'relation:prototype', kind: 'prototype-uses-component', from: { kind: 'prototype', id: 'prototype:1' }, to: { kind: 'component', id: 'component:hero' } }],
}
const selection = { materialId: 'material:screen', revisionId: 'material-revision:1', pageId: 'page:home', bounds: { x: 20, y: 30, width: 600, height: 320 }, selectedBy: 'user', selectedAt: at }
const component = { id: 'component:hero', name: 'Hero', kind: 'composite' as const, sourcePageIds: ['page:home'], tokenRefs: ['token:surface'], props: [{ name: 'title', type: 'string' as const, required: true }], variants: [{ name: 'tone', values: ['light', 'dark'] }], slots: [{ name: 'actions', required: false }], states: [{ name: 'loading', description: 'Loading state', props: { title: 'Loading' } }], stories: [{ name: 'Default', variant: { tone: 'light' }, viewport: 'desktop' as const }, { name: 'Loading', state: 'loading', variant: { tone: 'dark' }, viewport: 'mobile' as const }], evidence: selection, confidence: 0.92, constraints: { horizontal: 'fill' as const, vertical: 'hug' as const, minWidth: 280, maxWidth: 1200 }, responsive: [{ breakpoint: 'mobile', changes: { horizontal: 'fill' as const } }], tokenBindings: [{ property: 'background', tokenId: 'token:surface' }], status: 'ready' as const }

describe('Pixels to structured authoring', () => {
  it('promotes only an explicit user-selected region into a validated component contract and registry state', async () => {
    const result = promoteSelection(document, { version: 'structured-promotion.v1', id: 'promotion:hero', kind: 'component', name: 'Hero', selection, confidence: 0.92, constraints: component.constraints, responsive: component.responsive, tokenBindings: component.tokenBindings, component })
    expect(result).toMatchObject({ node: { kind: 'component', selection: { bounds: { width: 600 } } }, registry: { status: 'ready', designIrRefs: expect.arrayContaining(['material:screen', 'component:hero']), tokenRefs: ['token:surface'] } })
    const compiled = await compileComponentCandidates({ document, candidates: [result.componentCandidate!] })
    const manifest = JSON.parse(compiled.files.find(({ path }) => path === 'components.manifest.json')!.content)
    expect(manifest.candidates[0]).toMatchObject({ evidence: { materialId: 'material:screen' }, confidence: 0.92, constraints: { horizontal: 'fill' }, states: [{ name: 'loading' }], stories: [{ name: 'Default' }, { name: 'Loading' }], tokenBindings: [{ property: 'background', tokenId: 'token:surface' }] })
  })

  it('supports Frame/Text/Image promotions and refuses missing or mismatched evidence', () => {
    for (const [kind, extra] of [['frame', {}], ['text', { text: 'Editable copy' }], ['image', { imageAssetRef: 'material:screen' }]] as const) expect(promoteSelection(document, { version: 'structured-promotion.v1', id: `promotion:${kind}`, kind, name: kind, selection, confidence: 1, constraints: { horizontal: 'fixed', vertical: 'fixed' }, responsive: [], tokenBindings: [], ...extra }).node.kind).toBe(kind)
    expect(() => promoteSelection(document, { version: 'structured-promotion.v1', id: 'bad', kind: 'frame', name: 'Bad', selection: { ...selection, revisionId: 'missing' }, confidence: 1, constraints: { horizontal: 'fixed', vertical: 'fixed' }, responsive: [], tokenBindings: [] })).toThrow('material revision')
    expect(() => promoteSelection(document, { version: 'structured-promotion.v1', id: 'bad-component', kind: 'component', name: 'Bad', selection, confidence: 0.8, constraints: component.constraints, responsive: component.responsive, tokenBindings: component.tokenBindings, component })).toThrow('confidence')
  })
})

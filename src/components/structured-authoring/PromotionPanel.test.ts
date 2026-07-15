import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PromotionPanel } from './PromotionPanel'

const selection = { materialId: 'material:screen', revisionId: 'revision:1', pageId: 'page:home', bounds: { x: 10, y: 20, width: 640, height: 360 }, selectedBy: 'user', selectedAt: '2026-07-12T00:00:00.000Z' }
describe('PromotionPanel', () => {
  it('stays hidden without explicit selection and progressively reveals component detail', () => {
    expect(renderToStaticMarkup(createElement(PromotionPanel, {}))).toBe('')
    const basic = renderToStaticMarkup(createElement(PromotionPanel, { selection }))
    expect(basic).toContain('Promote as Frame')
    expect(basic).toContain('Promote as Component')
    expect(basic).not.toContain('Component contract')
    const component = { id: 'component:hero', name: 'Hero', kind: 'composite' as const, sourcePageIds: ['page:home'], tokenRefs: [], props: [], variants: [], slots: [], states: [{ name: 'loading', description: 'Loading', props: {} }], stories: [{ name: 'Loading', state: 'loading', variant: {}, viewport: 'mobile' as const }], evidence: selection, confidence: 0.9, constraints: { horizontal: 'fill' as const, vertical: 'hug' as const }, responsive: [], tokenBindings: [], status: 'ready' as const }
    const promotion = { version: 'structured-promotion.v1' as const, id: 'promotion', kind: 'component' as const, name: 'Hero', selection, confidence: 0.9, constraints: component.constraints, responsive: [], tokenBindings: [], component }
    const expanded = renderToStaticMarkup(createElement(PromotionPanel, { selection, promotion }))
    expect(expanded).toContain('Component contract')
    expect(expanded).toContain('1 states · 1 stories')
    expect(expanded).toContain('90% reviewed confidence')
  })
})

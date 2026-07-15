import { describe, expect, it } from 'vitest'
import type { MaterialRef } from '@/agent-runtime/material-impact'
import { derivedMaterialLinks } from './deliverable-graph'
import { buildOutputCanvasNodes, type CanvasImageItem } from './output-canvas-layout'

const item = (id: string, kind: MaterialRef['kind'], sourcePageId?: string): MaterialRef => ({ id, kind, label: id, version: 'v1', provenance: kind === 'cutout-slice' ? { source: 'page-deconstruction', sourcePageId, independentlyEditable: false } : { source: 'prototype-generation' } })

describe('Creative Board deliverable graph', () => {
  it('projects source pages to derived assets from recorded provenance', () => {
    expect(derivedMaterialLinks([item('design', 'design-system'), item('home', 'prototype-page'), item('hero', 'cutout-slice', 'home')])).toEqual([{ sourceId: 'home', targetId: 'hero' }])
  })

  it('connects design-system output cards to page cards with real output node endpoints', () => {
    const canvasItem = (id: string, kind: MaterialRef['kind']): CanvasImageItem => ({ id, label: id, material: item(id, kind) })
    const graph = buildOutputCanvasNodes([
      { key: 'design', title: 'Design system', items: [canvasItem('design', 'design-system')], perRow: 1 },
      { key: 'pages', title: 'Pages', items: [canvasItem('home', 'prototype-page')], perRow: 6 },
    ], null)
    expect(graph.edges).toEqual([expect.objectContaining({ source: 'design:design', target: 'pages:home' })])
    expect(graph.nodes.filter(({ type }) => type === 'outputCard')).toEqual([
      expect.objectContaining({ id: 'design:design', sourcePosition: 'bottom', targetPosition: 'top' }),
      expect.objectContaining({ id: 'pages:home', sourcePosition: 'bottom', targetPosition: 'top' }),
    ])
  })
})

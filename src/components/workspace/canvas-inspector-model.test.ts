import { describe, expect, it } from 'vitest'
import { projectCanvasSelection } from './canvas-inspector-model'

describe('Canvas inspector projection', () => {
  it('keeps an empty selection executable without fabricating project internals', () => {
    expect(projectCanvasSelection(null)).toBeNull()
  })

  it('projects only common result properties and one Agent action', () => {
    expect(projectCanvasSelection({
      id: 'page:home',
      kind: 'prototype-page',
      label: 'Home',
      version: 'v2',
      provenance: { source: 'prototype-generation' },
    })).toEqual({
      title: 'Home',
      kind: 'Prototype page',
      status: 'Ready',
      source: 'Agent generation',
      version: 'v2',
      actionLabel: 'Modify with Agent',
    })
  })
})

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DesignOsPanel, type DesignOsPanelModel } from './DesignOsPanel'

const model: DesignOsPanelModel = {
  documentId: 'project:acme',
  revisionId: 'revision:12',
  revisionNumber: 12,
  counts: { sources: 4, tokens: 18, components: 7, materials: 23 },
  capabilities: [
    { id: 'design-kit', label: 'Design Kit export', status: 'available', detail: 'Directory export is verified.' },
    { id: 'motion', label: 'Motion compiler', status: 'planned' },
    { id: 'figma', label: 'Figma sync', status: 'unavailable', detail: 'No connector configured.' },
  ],
}

describe('DesignOsPanel', () => {
  it('renders read-only IR revision, inventory counts, and declared capability states', () => {
    const html = renderToStaticMarkup(createElement(DesignOsPanel, { model }))

    expect(html).toContain('data-slot="design-os-panel"')
    expect(html).toContain('project:acme')
    expect(html).toContain('Revision 12')
    expect(html).toContain('revision:12')
    expect(html).toContain('Sources')
    expect(html).toContain('Tokens')
    expect(html).toContain('Components')
    expect(html).toContain('Materials')
    expect(html).toContain('>4<')
    expect(html).toContain('>18<')
    expect(html).toContain('>7<')
    expect(html).toContain('>23<')
    expect(html).toContain('Design Kit export')
    expect(html).toContain('Available')
    expect(html).toContain('Planned')
    expect(html).toContain('Unavailable')
    expect(html).not.toContain('<button')
  })

  it('makes an empty capability declaration explicit without inventing a status', () => {
    const html = renderToStaticMarkup(createElement(DesignOsPanel, {
      model: { ...model, capabilities: [] },
    }))

    expect(html).toContain('No capabilities declared.')
    expect(html).not.toContain('data-slot="design-os-capabilities"')
  })
})

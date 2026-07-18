import { act, createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { RichTextArtifact } from './RichTextArtifact'

describe('RichTextArtifact', () => {
  it('renders arbitrary Markdown without a plan-specific dashboard structure', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    flushSync(() => root.render(createElement(RichTextArtifact, {
      label: 'Review artifact',
      title: 'Flexible artifact',
      meta: 'Ready',
      markdown: '# A model-chosen title\n\n| Decision | Why |\n| --- | --- |\n| One document | Maintainable |',
    })))

    expect(host.querySelector('[data-slot="rich-text-artifact"]')).not.toBeNull()
    expect(host.querySelector('h1')?.textContent).toBe('A model-chosen title')
    expect(host.querySelector('table')).not.toBeNull()
    expect(host.textContent).not.toContain('Review context')
    expect(host.textContent).not.toContain('Outline')
    act(() => root.unmount())
    host.remove()
  })
})

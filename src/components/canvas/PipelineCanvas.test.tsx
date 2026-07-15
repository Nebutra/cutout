import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/components/workspace/IntentWorkspace', () => ({
  IntentWorkspace: () => createElement('div', { 'data-intent-workspace': true }),
}))

import { PipelineCanvas } from './PipelineCanvas'

describe('PipelineCanvas layout contract', () => {
  it('renders a full-size non-overflowing shell', () => {
    const html = renderToStaticMarkup(createElement(PipelineCanvas, { onOpenDesignOs: vi.fn() }))
    expect(html).toContain('data-intent-workspace="true"')
    expect(html).toContain('min-h-0')
    expect(html).toContain('min-w-0')
    expect(html).toContain('overflow-hidden')
  })
})

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DeferredSurfaceFallback } from './AppShell'

describe('AppShell deferred loading surfaces', () => {
  it('announces lazy workspace loading without an empty flash', () => {
    const html = renderToStaticMarkup(
      createElement(DeferredSurfaceFallback, { label: 'Loading project workspace' }),
    )

    expect(html).toContain('role="status"')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('Loading project workspace')
  })
})

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { setupI18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { describe, expect, it, vi } from 'vitest'
import { ProviderDirectory } from './ProviderDirectory'

const i18n = setupI18n()
i18n.loadAndActivate({ locale: 'en', messages: {} })

describe('ProviderDirectory responsive layout', () => {
  it('keeps controls bounded and gives cards an independent vertical scroller', () => {
    const html = renderToStaticMarkup(createElement(I18nProvider, { i18n }, createElement(ProviderDirectory, { onSelect: vi.fn() })))
    expect(html).toContain('data-provider-directory="true"')
    expect(html).toContain('min-w-0')
    expect(html).toContain('data-provider-directory-body="true"')
    expect(html).toContain('overflow-y-auto')
    expect(html).toContain('overflow-x-hidden')
    expect(html).toContain('grid-cols-1')
    expect(html).toContain('sm:grid-cols-2')
  })

  it('uses a mobile select and a desktop scrollable tab list without clipping labels', () => {
    const html = renderToStaticMarkup(createElement(I18nProvider, { i18n }, createElement(ProviderDirectory, { onSelect: vi.fn() })))
    expect(html).toContain('<select')
    expect(html).toContain('sm:hidden')
    expect(html).toContain('role="tablist"')
    expect(html).toContain('overflow-x-auto')
    expect(html).toContain('break-words')
    expect(html).not.toContain('truncate text-sm font-medium')
  })
})

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { setupI18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PRODUCT_VERSION } from '@/product-version'

const toast = vi.hoisted(() => vi.fn())

vi.mock('sonner', () => ({ toast }))

import { AboutFooter } from './AboutFooter'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const i18n = setupI18n()
i18n.loadAndActivate({ locale: 'en', messages: {} })

describe('AboutFooter', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.clearAllMocks()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(
      <I18nProvider i18n={i18n}>
        <AboutFooter />
      </I18nProvider>,
    ))
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('shows the complete product identity and preserves the About toast', () => {
    const button = host.querySelector('button') as HTMLButtonElement
    const version = [...button.querySelectorAll('span')].find(
      (item) => item.textContent === `v${PRODUCT_VERSION}`,
    )

    expect(button.textContent).toContain('Cutout')
    expect(version).toBeDefined()
    expect(version?.classList).toContain('shrink-0')
    expect(button.classList).not.toContain('truncate')
    expect(button.querySelector('.lucide-info')).not.toBeNull()
    expect(button.textContent).not.toContain('Tauri 2')
    expect(button.textContent).not.toContain('React 19')

    act(() => button.click())

    expect(toast).toHaveBeenCalledOnce()
    expect(toast).toHaveBeenCalledWith('Cutout', {
      description: 'AI-Native UI/UX · Tauri 2 · React 19 — local, offline-first.',
    })
  })
})

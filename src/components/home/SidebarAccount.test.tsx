import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SettingsUIProvider } from '@/components/settings/settings-ui'
import type { UpdateState } from '@/updater'
import type { DesktopUpdateController } from '@/updater/service'
import { setupI18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'

vi.mock('@lingui/react/macro', () => ({
  useLingui: () => ({ t: ({ message }: { message: string }) => message }),
}))

import { SidebarAccount } from './SidebarAccount'

const preferences = { channel: 'stable' as const, autoCheck: true }
const idle: UpdateState = { phase: 'idle', preferences, downloaded: 0 }
const i18n = setupI18n()
i18n.loadAndActivate({ locale: 'en', messages: {} })
let root: Root | undefined
let host: HTMLDivElement | undefined
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = undefined
  host = undefined
})

function mount(initial: UpdateState) {
  let state = initial
  let listener: ((next: UpdateState) => void) | undefined
  const open = vi.fn()
  const controller = {
    getState: () => state,
    subscribe: (next: (value: UpdateState) => void) => { listener = next; return () => { listener = undefined } },
  } as unknown as DesktopUpdateController
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root?.render(createElement(
    SettingsUIProvider,
    { value: { open } },
    createElement(TooltipProvider, null, createElement(I18nProvider, { i18n }, createElement(SidebarAccount, { updateController: controller }))),
  )))
  return {
    host,
    open,
    publish(next: UpdateState) { state = next; act(() => listener?.(next)) },
  }
}

describe('Home update action', () => {
  it('is hidden without an actionable GitHub release', () => {
    const view = mount(idle)
    expect(view.host.querySelector('[data-testid="home-update-action"]')).toBeNull()
    view.publish({ ...idle, phase: 'checking' })
    expect(view.host.querySelector('[data-testid="home-update-action"]')).toBeNull()
    view.publish({ ...idle, phase: 'error', error: 'offline' })
    expect(view.host.querySelector('[data-testid="home-update-action"]')).toBeNull()
  })

  it.each(['available', 'downloading', 'ready', 'installing', 'error'] as const)('shows an actionable release while %s', (phase) => {
    const view = mount({ ...idle, phase, release: { version: '1.2.0' } })
    expect(view.host.querySelector('[data-testid="home-update-action"]')).not.toBeNull()
  })

  it('opens the existing Updates & Support surface for download and install', () => {
    const view = mount({ ...idle, phase: 'available', release: { version: '1.2.0' } })
    const action = view.host.querySelector('[data-testid="home-update-action"]') as HTMLButtonElement
    expect(action).not.toBeNull()
    expect(action.getAttribute('aria-label')).toBe('Updates 1.2.0')
    act(() => action.click())
    expect(view.open).toHaveBeenCalledWith({ section: 'updates-support', anchor: 'updates' })
  })
})

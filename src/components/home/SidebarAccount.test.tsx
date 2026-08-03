import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SettingsUIProvider } from '@/components/settings/settings-ui'
import type { UpdateState } from '@/updater'
import type { DesktopUpdateController } from '@/updater/service'
import { setupI18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import type { LocalNotification } from '@/services/local/local-notifications'

vi.mock('@lingui/react/macro', () => ({
  useLingui: () => ({ t: ({ message }: { message: string }) => message }),
}))

import { NotificationRow, SidebarAccount } from './SidebarAccount'

const preferences = { channel: 'stable' as const, autoCheck: true }
const idle: UpdateState = { phase: 'idle', preferences, downloaded: 0 }
const i18n = setupI18n()
i18n.loadAndActivate({ locale: 'en', messages: {} })
let root: Root | undefined
let host: HTMLDivElement | undefined
beforeEach(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => { values.delete(key) },
    setItem: (key: string, value: string) => { values.set(key, value) },
  } satisfies Storage)
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  localStorage.clear()
  vi.unstubAllGlobals()
  root = undefined
  host = undefined
})

function mount(initial: UpdateState) {
  let state = initial
  let listener: ((next: UpdateState) => void) | undefined
  const open = vi.fn()
  const deferUpdateNotification = vi.fn()
  const controller = {
    getState: () => state,
    subscribe: (next: (value: UpdateState) => void) => { listener = next; return () => { listener = undefined } },
    deferUpdateNotification,
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
    deferUpdateNotification,
    publish(next: UpdateState) { state = next; act(() => listener?.(next)) },
  }
}

function mountNotificationRow(notification: LocalNotification, controller?: DesktopUpdateController) {
  const open = vi.fn()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root?.render(createElement(
    SettingsUIProvider,
    { value: { open } },
    createElement(I18nProvider, { i18n }, createElement(NotificationRow, { notification, controller })),
  )))
  return { host, open }
}

const updateNotification: LocalNotification = {
  id: 'update:stable:1.2.0',
  source: 'update',
  kind: 'attention',
  title: 'Update available',
  detail: 'Cutout 1.2.0 is available on the stable channel.',
  createdAt: 42,
  read: false,
  action: { type: 'open-settings', section: 'updates-support', anchor: 'updates' },
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

  it('opens update settings from the actionable bell row', () => {
    const view = mountNotificationRow(updateNotification)
    const row = view.host.querySelector('button[aria-label="Open Update available"]') as HTMLButtonElement
    expect(row).not.toBeNull()
    act(() => row.click())
    expect(view.open).toHaveBeenCalledWith({ section: 'updates-support', anchor: 'updates' })
  })

  it('routes reminder deferral through the updater controller', () => {
    const deferUpdateNotification = vi.fn()
    const controller = { deferUpdateNotification } as unknown as DesktopUpdateController
    const view = mountNotificationRow(updateNotification, controller)
    const remind = [...view.host.querySelectorAll('button')].find((button) => button.textContent?.includes('Remind tomorrow')) as HTMLButtonElement
    expect(remind).not.toBeNull()
    act(() => remind.click())
    expect(deferUpdateNotification).toHaveBeenCalledWith('update:stable:1.2.0')
  })

})

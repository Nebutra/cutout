/**
 * Settings UI context — lets any descendant open the Settings dialog.
 *
 * `AppShell` owns the open state (so the `⌘,` hotkey can toggle it) and exposes
 * `open()` here; the Home sidebar account menu and the Integrations settings
 * section consume it without threading a prop through the tree. Ephemeral UI
 * state — deliberately not in Zustand.
 *
 * Kept as `.ts` (no JSX) — mirrors `services/context.ts`, building its element via
 * `createElement` so the provider + hook can co-live without a fast-refresh warning.
 */
import { createContext, createElement, useContext } from 'react'
import type { ReactNode } from 'react'

export interface SettingsUI {
  readonly open: (target?: SettingsTarget) => void
}
export type SettingsTargetSection='general'|'ai'|'updates-support'|'speech'|'personalization'|'integrations'|'archived'
export interface SettingsTarget{readonly section:SettingsTargetSection;readonly anchor?:'model-routing'|'connections'|'paid-actions'|'updates'}

export function focusSettingsTarget(
  target: SettingsTarget | undefined,
  root: Pick<Document, 'querySelector'> = document,
): HTMLElement | null {
  if (!target?.anchor) return null
  const selector = target.anchor === 'connections'
    ? '#settings-integrations-heading'
    : `[data-settings-anchor="${target.anchor}"]`
  const element = root.querySelector<HTMLElement>(selector)
  element?.scrollIntoView({ block: 'center' })
  element?.focus({ preventScroll: true })
  return element
}

const SettingsUIContext = createContext<SettingsUI | null>(null)

export interface SettingsUIProviderProps {
  readonly value: SettingsUI
  readonly children?: ReactNode
}

export function SettingsUIProvider(props: SettingsUIProviderProps) {
  return createElement(
    SettingsUIContext.Provider,
    { value: props.value },
    props.children,
  )
}

export function useSettingsUI(): SettingsUI {
  const ctx = useContext(SettingsUIContext)
  if (!ctx) {
    throw new Error('useSettingsUI must be used within a <SettingsUIProvider>')
  }
  return ctx
}

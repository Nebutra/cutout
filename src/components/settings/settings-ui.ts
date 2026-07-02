/**
 * Settings UI context — lets any descendant open the Settings dialog.
 *
 * `AppShell` owns the open state (so the `⌘,` hotkey can toggle it) and exposes
 * `open()` here; the TopBar gear (`SettingsMenu`) consumes it without threading a
 * prop through the whole TopBar. Ephemeral UI state — deliberately not in Zustand.
 *
 * Kept as `.ts` (no JSX) — mirrors `services/context.ts`, building its element via
 * `createElement` so the provider + hook can co-live without a fast-refresh warning.
 */
import { createContext, createElement, useContext } from 'react'
import type { ReactNode } from 'react'

export interface SettingsUI {
  readonly open: () => void
}

const SettingsUIContext = createContext<SettingsUI | null>(null)

export interface SettingsUIProviderProps {
  readonly value: SettingsUI
  readonly children: ReactNode
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

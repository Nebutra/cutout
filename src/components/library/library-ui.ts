/**
 * Library UI context — lets any descendant open the asset-library drawer.
 *
 * Mirrors `settings-ui.ts`: `AppShell` owns the open state and exposes `open()`
 * here, so the TopBar button (and, later, "查看素材库" affordances after adding an
 * asset) can open the drawer without threading a prop through the tree. Ephemeral
 * UI state — deliberately not in Zustand.
 *
 * Kept as `.ts` (no JSX) — like `services/context.ts` — building its element via
 * `createElement` so the provider + hook can co-live without a fast-refresh warn.
 */
import { createContext, createElement, useContext } from 'react'
import type { ReactNode } from 'react'

export interface LibraryUI {
  readonly open: () => void
}

const LibraryUIContext = createContext<LibraryUI | null>(null)

export interface LibraryUIProviderProps {
  readonly value: LibraryUI
  readonly children: ReactNode
}

export function LibraryUIProvider(props: LibraryUIProviderProps) {
  return createElement(
    LibraryUIContext.Provider,
    { value: props.value },
    props.children,
  )
}

export function useLibraryUI(): LibraryUI {
  const ctx = useContext(LibraryUIContext)
  if (!ctx) {
    throw new Error('useLibraryUI must be used within a <LibraryUIProvider>')
  }
  return ctx
}

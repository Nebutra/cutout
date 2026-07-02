/**
 * Global keyboard map (spec §4c — "no cmdk").
 *
 *   ⌘O        import                ⌘R        rerun
 *   ⌘⇧E       export all            ⌘E        export selected
 *   [ / ]     prev / next slice     ← → ↑ ↓   grid navigation
 *   Enter     begin rename          Esc       clear selection / cancel rename
 *
 * The hook is dumb glue: it maps chords to injected callbacks so AppShell owns
 * the wiring. Keystrokes are ignored while a text field is focused (except Esc),
 * so inline rename typing is never hijacked. Discoverability is via TopBar
 * tooltips, per spec.
 */
import { useEffect } from 'react'

/** The action a chord resolves to. Any handler may be omitted (no-op). */
export interface HotkeyHandlers {
  onImport?: () => void
  onRerun?: () => void
  onExportAll?: () => void
  onExportSelected?: () => void
  onPrev?: () => void
  onNext?: () => void
  onMove?: (dir: 'up' | 'down' | 'left' | 'right') => void
  onRename?: () => void
  onClear?: () => void
  onOpenSettings?: () => void
}

/** True when focus sits in a control that should own its own keystrokes. */
function isEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  )
}

const ARROW_DIRS: Readonly<Record<string, 'up' | 'down' | 'left' | 'right'>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}

export function useHotkeys(handlers: HotkeyHandlers): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const mod = event.metaKey || event.ctrlKey
      const editing = isEditingTarget(event.target)

      // Esc always works so it can cancel an in-progress rename.
      if (event.key === 'Escape') {
        handlers.onClear?.()
        return
      }
      // ⌘, opens Settings — works even while a text field is focused.
      if (mod && event.key === ',') {
        event.preventDefault()
        handlers.onOpenSettings?.()
        return
      }
      // Everything else is suppressed while typing in a field.
      if (editing) return

      if (mod) {
        const key = event.key.toLowerCase()
        if (key === 'o') {
          event.preventDefault()
          handlers.onImport?.()
        } else if (key === 'r') {
          event.preventDefault()
          handlers.onRerun?.()
        } else if (key === 'e' && event.shiftKey) {
          event.preventDefault()
          handlers.onExportAll?.()
        } else if (key === 'e') {
          event.preventDefault()
          handlers.onExportSelected?.()
        }
        return
      }

      switch (event.key) {
        case '[':
          event.preventDefault()
          handlers.onPrev?.()
          break
        case ']':
          event.preventDefault()
          handlers.onNext?.()
          break
        case 'Enter':
          event.preventDefault()
          handlers.onRename?.()
          break
        case 'ArrowUp':
        case 'ArrowDown':
        case 'ArrowLeft':
        case 'ArrowRight':
          event.preventDefault()
          handlers.onMove?.(ARROW_DIRS[event.key])
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handlers])
}

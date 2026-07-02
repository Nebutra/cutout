/**
 * TopBar (spec §4c) — brand · primary actions · theme/settings.
 *
 * Thin, dense, and calm (Linear/Raycast). Draggable region for the frameless
 * feel is left to the Tauri window config; here we only lay out controls.
 * Language lives in Settings (⚙); the gear opens the unified Settings dialog.
 */
import { Scissors } from 'lucide-react'
import { TopBarActions } from './TopBarActions'
import { ThemeToggle } from './ThemeToggle'
import { SettingsMenu } from './SettingsMenu'

export interface TopBarProps {
  readonly onRerun: () => void
}

export function TopBar({ onRerun }: TopBarProps) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-background/80 px-3 backdrop-blur">
      <div className="flex items-center gap-2">
        <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Scissors className="size-3.5" />
        </div>
        <span className="text-sm font-semibold tracking-tight">Cutout</span>
      </div>

      <div className="flex items-center gap-1.5">
        <TopBarActions onRerun={onRerun} />
        <div className="mx-1 h-5 w-px bg-border" />
        <ThemeToggle />
        <SettingsMenu />
      </div>
    </header>
  )
}

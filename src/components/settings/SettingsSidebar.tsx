/**
 * SettingsSidebar — section navigation for the Settings dialog.
 *
 * Two weight-bearing sections (General, AI); About lives in the footer. Plain
 * buttons drive a controlled `section` state — no router (the app is a single
 * workspace view; Settings is an overlay).
 */
import type { ReactNode } from 'react'
import { Settings2, KeyRound } from 'lucide-react'
import { Trans } from '@lingui/react/macro'
import { cn } from '@/lib/utils'

export type SettingsSection = 'general' | 'ai'

interface SidebarItem {
  readonly id: SettingsSection
  readonly icon: typeof Settings2
  readonly label: ReactNode
}

const ITEMS: readonly SidebarItem[] = [
  {
    id: 'general',
    icon: Settings2,
    label: <Trans id="settings.section_general">General</Trans>,
  },
  {
    id: 'ai',
    icon: KeyRound,
    label: <Trans id="settings.section_ai">AI</Trans>,
  },
]

interface SettingsSidebarProps {
  readonly value: SettingsSection
  readonly onChange: (section: SettingsSection) => void
}

export function SettingsSidebar({ value, onChange }: SettingsSidebarProps) {
  return (
    <nav className="flex flex-col gap-0.5">
      {ITEMS.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          aria-current={value === id}
          className={cn(
            'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
            value === id
              ? 'bg-foreground/10 font-medium text-foreground'
              : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground',
          )}
        >
          <Icon className="size-4 shrink-0" />
          {label}
        </button>
      ))}
    </nav>
  )
}

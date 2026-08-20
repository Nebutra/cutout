/**
 * SettingsSidebar — section navigation for the Settings dialog.
 *
 * Two weight-bearing sections (General, AI); About lives in the footer. Plain
 * buttons drive a controlled `section` state — no router (the app is a single
 * workspace view; Settings is an overlay).
 */
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { Settings2, KeyRound, Layers, Archive, Sparkles, Mic, LifeBuoy } from 'lucide-react'
import { Trans } from '@lingui/react/macro'
import { cn } from '@/lib/utils'

export type SettingsSection = 'general' | 'ai' | 'updates-support' | 'speech' | 'personalization' | 'integrations' | 'archived'

interface SidebarItem {
  readonly id: SettingsSection
  readonly icon: typeof Settings2
  readonly label: ReactNode
  readonly badge?: ReactNode
}

interface SettingsSidebarProps {
  readonly value: SettingsSection
  readonly onChange: (section: SettingsSection) => void
  readonly archivedCount?: number
}

export function SettingsSidebar({ value, onChange, archivedCount = 0 }: SettingsSidebarProps) {
  const navigationRef = useRef<HTMLElement>(null)
  const items: readonly SidebarItem[] = [
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
    { id: 'updates-support', icon: LifeBuoy, label: <Trans id="settings.section_updates_support">Updates & Support</Trans> },
    { id: 'personalization', icon: Sparkles, label: <Trans id="settings.section_personalization">Personalization</Trans> },
    { id: 'speech', icon: Mic, label: <Trans id="settings.section_speech">Speech</Trans> },
    {
      id: 'integrations',
      icon: Layers,
      label: <Trans id="settings.section_integrations">Integrations</Trans>,
    },
    {
      id: 'archived',
      icon: Archive,
      label: <Trans id="settings.section_archived">Archived</Trans>,
      badge: archivedCount > 0 ? archivedCount : undefined,
    },
  ]

  useLayoutEffect(() => {
    const navigation = navigationRef.current
    const selected = navigation?.querySelector<HTMLElement>(
      `[data-settings-section="${value}"]`,
    )
    if (!navigation || !selected || navigation.scrollWidth <= navigation.clientWidth) return
    navigation.scrollLeft = Math.max(0, selected.offsetLeft - navigation.offsetLeft)
  }, [value])

  return (
    <nav ref={navigationRef} className="flex gap-0.5 overflow-x-auto sm:flex-col sm:overflow-visible">
      {items.map(({ id, icon: Icon, label, badge }) => (
        <button
          key={id}
          type="button"
          data-settings-section={id}
          onClick={() => onChange(id)}
          aria-current={value === id}
          className={cn(
            'flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors sm:w-full',
            value === id
              ? 'bg-foreground/10 font-medium text-foreground'
              : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground',
          )}
        >
          <Icon className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {badge !== undefined && badge !== null ? (
            <span className="shrink-0 rounded-full bg-foreground/10 px-1.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
              {badge}
            </span>
          ) : null}
        </button>
      ))}
    </nav>
  )
}

/**
 * SettingsDialog (design spec §2) — the unified Settings surface.
 *
 * A controlled shadcn `Dialog` with a left sidebar (master-detail), opened from
 * the TopBar gear and the `⌘,` accelerator (both via `AppShell` + `settings-ui`).
 * No router — `section` is local state. General and AI are the only sections;
 * About is a footer line. Every control inside applies instantly.
 */
import { useState } from 'react'
import { Trans } from '@lingui/react/macro'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { SettingsSidebar, type SettingsSection } from './SettingsSidebar'
import { AboutFooter } from './AboutFooter'
import { GeneralSection } from './sections/GeneralSection'
import { AiSection } from './sections/AiSection'

interface SettingsDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [section, setSection] = useState<SettingsSection>('general')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">
          <Trans id="settings.menu_label">Settings</Trans>
        </DialogTitle>
        <DialogDescription className="sr-only">
          <Trans id="settings.dialog_a11y_desc">
            Application preferences and AI providers.
          </Trans>
        </DialogDescription>

        <div className="flex min-h-[440px]">
          <aside className="flex w-44 shrink-0 flex-col border-r border-border bg-muted/20 p-2">
            <SettingsSidebar value={section} onChange={setSection} />
            <div className="mt-auto pt-2">
              <AboutFooter />
            </div>
          </aside>

          <div className="min-w-0 flex-1 overflow-y-auto p-5">
            {section === 'general' ? <GeneralSection /> : <AiSection />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * SettingsDialog (design spec §2) — the unified Settings surface.
 *
 * A controlled shadcn `Dialog` with a left sidebar (master-detail), opened from
 * the TopBar gear and the `⌘,` accelerator (both via `AppShell` + `settings-ui`).
 * No router — `section` is local state. About is a footer line. Every control
 * inside applies instantly.
 */
import { useEffect, useState } from 'react'
import { Trans } from '@lingui/react/macro'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import type { LocalProjectSummary } from '@/services/local/project-repository.local'
import { SettingsSidebar, type SettingsSection } from './SettingsSidebar'
import { AboutFooter } from './AboutFooter'
import { GeneralSection } from './sections/GeneralSection'
import { AiSection } from './sections/AiSection'
import { IntegrationsSection } from './sections/IntegrationsSection'
import { ArchivedSection } from './sections/ArchivedSection'
import { PersonalizationSection } from './sections/PersonalizationSection'
import { SpeechSection } from './sections/SpeechSection'
import { UpdatesSupportSection } from './sections/UpdatesSupportSection'
import type { DesktopUpdateController } from '@/updater/service'
import { focusSettingsTarget, type SettingsTarget } from './settings-ui'

interface SettingsDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly initialSection?: SettingsSection
  readonly projects?: readonly LocalProjectSummary[]
  readonly onRestoreProject?: (id: string) => void
  readonly onDeleteProject?: (id: string) => void
  readonly prepareUpdateRecoverySnapshot?: () => Promise<boolean>
  readonly updateController?: DesktopUpdateController
  readonly target?: SettingsTarget
}

export function SettingsDialog({
  open,
  onOpenChange,
  initialSection = 'general',
  projects = [],
  onRestoreProject = () => {},
  onDeleteProject = () => {},
  prepareUpdateRecoverySnapshot = async () => true,
  updateController,
  target,
}: SettingsDialogProps) {
  const [section, setSection] = useState<SettingsSection>(target?.section??initialSection)
  const archivedCount = projects.filter((project) => project.archivedAt).length
  useEffect(()=>{if(!open)return;setSection(target?.section??initialSection);if(target?.anchor)requestAnimationFrame(()=>{focusSettingsTarget(target)})},[initialSection,open,target])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(46rem,calc(100dvh-1rem))] w-[calc(100vw-1rem)] min-w-0 max-w-3xl gap-0 overflow-hidden p-0 sm:h-[min(46rem,calc(100dvh-3rem))]">
        <DialogTitle className="sr-only">
          <Trans id="settings.menu_label">Settings</Trans>
        </DialogTitle>
        <DialogDescription className="sr-only">
          <Trans id="settings.dialog_a11y_desc">
            Application preferences and AI providers.
          </Trans>
        </DialogDescription>

        <div className="flex h-full min-h-0 min-w-0 flex-col sm:flex-row">
          <aside className="flex w-full shrink-0 flex-col border-b border-border bg-muted/20 p-2 sm:w-44 sm:border-r sm:border-b-0">
            <SettingsSidebar value={section} onChange={setSection} archivedCount={archivedCount} />
            <div className="mt-auto hidden pt-2 sm:block">
              <AboutFooter />
            </div>
          </aside>

          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5">
            {section === 'general' ? (
              <GeneralSection />
            ) : section === 'speech' ? (
              <SpeechSection />
            ) : section === 'personalization' ? (
              <PersonalizationSection />
            ) : section === 'integrations' ? (
              <IntegrationsSection />
            ) : section === 'archived' ? (
              <ArchivedSection
                projects={projects}
                onRestoreProject={onRestoreProject}
                onDeleteProject={onDeleteProject}
              />
            ) : section === 'updates-support' ? (
              <UpdatesSupportSection prepareRecoverySnapshot={prepareUpdateRecoverySnapshot} updateController={updateController} />
            ) : (
              <AiSection />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

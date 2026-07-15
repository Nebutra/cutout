/**
 * ArchivedSection — Settings surface for archived local projects.
 *
 * Archiving/restoring/deleting a project already lives on its project card
 * (Home sidebar). This section is just the destination for browsing what's
 * archived, restoring it, or deleting it for good — moved out of the primary
 * Home navigation so "Archived" isn't a first-class workspace destination.
 */
import { useState } from 'react'
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { LocalProjectSummary } from '@/services/local/project-repository.local'

export interface ArchivedSectionProps {
  readonly projects: readonly LocalProjectSummary[]
  readonly onRestoreProject: (id: string) => void
  readonly onDeleteProject: (id: string) => void
}

export function ArchivedSection({ projects, onRestoreProject, onDeleteProject }: ArchivedSectionProps) {
  const { t, i18n } = useLingui()
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const archived = projects
    .filter((project) => project.archivedAt)
    .sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0))
  const pendingDelete = archived.find((project) => project.id === pendingDeleteId) ?? null
  const formatter = new Intl.DateTimeFormat(i18n.locale, { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <section aria-labelledby="settings-archived-heading">
      <div className="flex items-center gap-2.5">
        <Archive className="size-4 text-muted-foreground" />
        <h2 id="settings-archived-heading" className="text-sm font-semibold">
          <Trans id="settings.section_archived">Archived</Trans>
        </h2>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        <Trans id="settings.archived_description">
          Archived projects stay on this device until you restore or delete them.
        </Trans>
      </p>

      {archived.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          <Trans id="home.nothing_archived">Nothing archived</Trans>
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border rounded-md border border-border">
          {archived.map((project) => (
            <li key={project.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{project.name}</p>
                <p className="text-xs text-muted-foreground">
                  {project.archivedAt ? formatter.format(new Date(project.archivedAt)) : null}
                </p>
              </div>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t({ id: 'settings.delete_archived_named', message: `Delete ${project.name}` })}
                onClick={() => setPendingDeleteId(project.id)}
              >
                <Trash2 className="size-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => onRestoreProject(project.id)}>
                <ArchiveRestore className="size-4" />
                <Trans id="home.restore">Restore</Trans>
              </Button>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => { if (!open) setPendingDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <Trans id="home.delete_permanently_title">Delete permanently?</Trans>
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? t({ id: 'home.delete_permanently_description', message: `This removes "${pendingDelete.name}" from local storage. This action cannot be undone.` })
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Trans id="home.cancel">Cancel</Trans>
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (pendingDeleteId) onDeleteProject(pendingDeleteId)
                setPendingDeleteId(null)
              }}
            >
              <Trans id="home.delete">Delete</Trans>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

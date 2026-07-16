/**
 * TopBar (spec §4c) — file tabs · primary actions.
 *
 * Thin, dense, and calm (Linear/Raycast). Draggable region for the frameless
 * feel is left to the Tauri window config; here we only lay out controls.
 * Global destinations stay pinned on the right so they remain reachable from
 * both Home and project views.
 */
import { Home, Plus, Scissors, X } from 'lucide-react'
import { TopBarActions } from './TopBarActions'
import { ProjectMenu } from './ProjectMenu'
import { shouldShowProjectMenu } from './project-menu-visibility'
import { TabsMenu, type ClosedTab } from './TabsMenu'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface TopBarProps {
  readonly view: 'home' | 'project'
  readonly projectName: string
  readonly projectTabOpen: boolean
  readonly onOpenHome: () => void
  readonly onOpenProject: () => void
  readonly onCloseProject: () => void
  readonly onNewProject: () => void
  readonly onRerun: () => void
  readonly onArchiveProject: () => void
  readonly recentlyClosedTabs: readonly ClosedTab[]
  readonly onReopenTab: (id: string) => void
}

export function TopBar({
  view,
  projectName,
  projectTabOpen,
  onOpenHome,
  onOpenProject,
  onCloseProject,
  onNewProject,
  onRerun,
  onArchiveProject,
  recentlyClosedTabs,
  onReopenTab,
}: TopBarProps) {
  return (
    <header className="flex h-12 shrink-0 items-stretch justify-between gap-3 border-b border-border bg-background/80 px-3 backdrop-blur">
      <div className="flex min-w-0 items-stretch gap-2">
        <div className="flex min-w-0 items-stretch gap-1">
          <TopTab
            active={view === 'home'}
            label="Home"
            icon={<Home className="size-3.5" />}
            onClick={onOpenHome}
          />
          {projectTabOpen ? (
            <div className="flex items-center">
              <TopTab
                active={view === 'project'}
                label={projectName}
                icon={<Scissors className="size-3.5" />}
                onClick={onOpenProject}
                onClose={onCloseProject}
              />
              {shouldShowProjectMenu(view) ? <ProjectMenu projectName={projectName} onArchive={onArchiveProject} /> : null}
            </div>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="New project"
            className="my-0.5 size-11 shrink-0 rounded-md"
            onClick={onNewProject}
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {view === 'project' ? <TopBarActions onRerun={onRerun} /> : null}
        <TabsMenu
          view={view}
          projectName={projectName}
          projectTabOpen={projectTabOpen}
          recentlyClosed={recentlyClosedTabs}
          onOpenHome={onOpenHome}
          onOpenProject={onOpenProject}
          onCloseProject={onCloseProject}
          onReopenTab={onReopenTab}
        />
      </div>
    </header>
  )
}

function TopTab({
  active,
  label,
  icon,
  onClick,
  onClose,
}: {
  readonly active: boolean
  readonly label: string
  readonly icon: React.ReactNode
  readonly onClick: () => void
  readonly onClose?: () => void
}) {
  return (
    <div
      className={cn(
        'my-1.5 flex max-w-[16rem] min-w-0 items-center rounded-md border text-sm transition-colors',
        active
          ? 'border-border bg-muted/70 text-foreground shadow-sm'
          : 'border-transparent text-muted-foreground hover:bg-muted/45 hover:text-foreground',
      )}
    >
      <button
        type="button"
        aria-current={active ? 'page' : undefined}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-l-md py-1.5 pl-3 pr-2 text-left"
        onClick={onClick}
      >
        <span className="shrink-0">{icon}</span>
        <span className="truncate font-medium">{label}</span>
      </button>
      {onClose ? (
        <button
          type="button"
          aria-label={`Close ${label}`}
          className="mr-1 flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-70 transition hover:bg-background/80 hover:text-foreground hover:opacity-100"
          onClick={onClose}
        >
          <X className="size-3" />
        </button>
      ) : null}
    </div>
  )
}

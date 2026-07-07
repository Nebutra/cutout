import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  ArrowRight,
  Clock3,
  FileText,
  Images,
  LayoutGrid,
  List,
  Plus,
  RefreshCw,
  Scissors,
  Sparkles,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import type { LocalProjectSummary } from '@/services/local/project-repository.local'
import { cn } from '@/lib/utils'

type ProjectFilter = 'all' | 'ready' | 'draft' | 'archived'
type ProjectViewMode = 'grid' | 'list'
type ProjectLoadState = 'loading' | 'ready' | 'error'

const PROJECT_HOME_VIEW_MODE_KEY = 'cutout.home.projectViewMode'
const PROJECT_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
})

interface ProjectHomeProps {
  readonly activeProjectId: string | null
  readonly projects: readonly LocalProjectSummary[]
  readonly loadState: ProjectLoadState
  readonly loadError: string | null
  readonly onOpenProject: (id: string) => void
  readonly onArchiveProject: (id: string) => void
  readonly onRestoreProject: (id: string) => void
  readonly onDeleteProject: (id: string) => void
  readonly onNewProject: () => void
  readonly onRetryProjects: () => void
}

export function ProjectHome({
  activeProjectId,
  projects,
  loadState,
  loadError,
  onOpenProject,
  onArchiveProject,
  onRestoreProject,
  onDeleteProject,
  onNewProject,
  onRetryProjects,
}: ProjectHomeProps) {
  const hasProjects = projects.length > 0
  const loading = loadState === 'loading'
  const failed = loadState === 'error'
  const [filter, setFilter] = useState<ProjectFilter>('all')
  const [viewMode, setViewMode] = useState<ProjectViewMode>(
    readProjectHomeViewMode,
  )
  const counts = useMemo(() => projectCounts(projects), [projects])
  const visibleProjects = useMemo(
    () => projects.filter((project) => projectMatchesFilter(project, filter)),
    [filter, projects],
  )
  const hasVisibleProjects = visibleProjects.length > 0

  useEffect(() => {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(PROJECT_HOME_VIEW_MODE_KEY, viewMode)
  }, [viewMode])

  return (
    <main className="flex min-h-0 flex-1 bg-background">
      <aside className="hidden w-60 shrink-0 border-r border-border bg-muted/10 p-3 md:flex md:flex-col">
        <div className="flex items-center gap-2 rounded-md px-2 py-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Scissors className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Cutout</p>
            <p className="text-xs text-muted-foreground">Files</p>
          </div>
        </div>

        <Button
          type="button"
          className="mt-5 w-full justify-start"
          onClick={onNewProject}
        >
          <Plus className="size-4" />
          New project
        </Button>

        <nav className="mt-5 space-y-1" aria-label="Project filters">
          <FilterItem
            icon={LayoutGrid}
            label="All projects"
            count={counts.all}
            active={filter === 'all'}
            onClick={() => setFilter('all')}
          />
          <FilterItem
            icon={Sparkles}
            label="Ready"
            count={counts.ready}
            active={filter === 'ready'}
            onClick={() => setFilter('ready')}
          />
          <FilterItem
            icon={FileText}
            label="Drafts"
            count={counts.draft}
            active={filter === 'draft'}
            onClick={() => setFilter('draft')}
          />
          <FilterItem
            icon={Archive}
            label="Archived"
            count={counts.archived}
            active={filter === 'archived'}
            onClick={() => setFilter('archived')}
          />
        </nav>
      </aside>

      <section className="min-w-0 flex-1 overflow-y-auto bg-muted/15">
        <div className="mx-auto w-full max-w-6xl px-6 py-8">
          <header className="border-b border-border pb-6">
            <p className="text-sm font-medium text-muted-foreground">File</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              Projects
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Open a local project or start a clean one.
            </p>
          </header>

          <section className="mt-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">{filterTitle(filter)}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {loading
                    ? 'Loading local projects...'
                    : `${visibleProjects.length} local`}
                </p>
              </div>
              <ViewModeToggle value={viewMode} onChange={setViewMode} />
            </div>

            {loading ? (
              <ProjectHomeSkeleton viewMode={viewMode} />
            ) : failed ? (
              <ProjectHomeError
                error={loadError ?? 'Project storage could not be loaded.'}
                onRetry={onRetryProjects}
              />
            ) : hasVisibleProjects ? (
              viewMode === 'grid' ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {visibleProjects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      active={project.id === activeProjectId}
                      onOpen={() => onOpenProject(project.id)}
                      onArchive={() => onArchiveProject(project.id)}
                      onRestore={() => onRestoreProject(project.id)}
                      onDelete={() => onDeleteProject(project.id)}
                    />
                  ))}
                </div>
              ) : (
                <ProjectList
                  projects={visibleProjects}
                  activeProjectId={activeProjectId}
                  onOpenProject={onOpenProject}
                  onArchiveProject={onArchiveProject}
                  onRestoreProject={onRestoreProject}
                  onDeleteProject={onDeleteProject}
                />
              )
            ) : (
              <EmptyProjectState
                hasProjects={hasProjects}
                filter={filter}
                viewMode={viewMode}
                onNewProject={onNewProject}
              />
            )}
          </section>
        </div>
      </section>
    </main>
  )
}

function ProjectHomeSkeleton({
  viewMode,
}: {
  readonly viewMode: ProjectViewMode
}) {
  if (viewMode === 'list') {
    return (
      <div className="overflow-hidden rounded-lg border border-border bg-background shadow-sm">
        <div className="hidden grid-cols-[minmax(18rem,1fr)_8.5rem_6rem_7.5rem_7rem] gap-4 border-b border-border px-4 py-3 lg:grid">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-3 w-12" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(18rem,1fr)_8.5rem_6rem_7.5rem_7rem] lg:items-center lg:gap-4"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Skeleton className="size-11 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-3 w-64 max-w-full" />
                </div>
              </div>
              <Skeleton className="hidden h-3 w-20 lg:block" />
              <Skeleton className="hidden h-3 w-8 lg:block" />
              <Skeleton className="hidden h-3 w-16 lg:block" />
              <Skeleton className="hidden h-3 w-14 lg:block" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }, (_, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-lg border border-border bg-background shadow-sm"
        >
          <Skeleton className="aspect-[16/10] w-full rounded-none" />
          <div className="space-y-3 p-4">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <div className="flex gap-2">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function ProjectHomeError({
  error,
  onRetry,
}: {
  readonly error: string
  readonly onRetry: () => void
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <div className="flex min-w-0 gap-3">
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-destructive">
            Could not load projects
          </h3>
          <p className="mt-1 break-words text-sm leading-6 text-destructive/80">
            {error}
          </p>
        </div>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="size-3.5" />
        Retry
      </Button>
    </div>
  )
}

function ViewModeToggle({
  value,
  onChange,
}: {
  readonly value: ProjectViewMode
  readonly onChange: (value: ProjectViewMode) => void
}) {
  return (
    <div
      className="flex shrink-0 items-center rounded-md border border-border bg-background p-0.5"
      role="group"
      aria-label="Project view"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Grid view"
        aria-pressed={value === 'grid'}
        className={cn(
          'h-7 rounded-[min(var(--radius-md),10px)] px-2 text-muted-foreground',
          value === 'grid' &&
            'bg-muted text-foreground shadow-sm hover:bg-muted hover:text-foreground',
        )}
        onClick={() => onChange('grid')}
      >
        <LayoutGrid className="size-4" />
        Grid
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="List view"
        aria-pressed={value === 'list'}
        className={cn(
          'h-7 rounded-[min(var(--radius-md),10px)] px-2 text-muted-foreground',
          value === 'list' &&
            'bg-muted text-foreground shadow-sm hover:bg-muted hover:text-foreground',
        )}
        onClick={() => onChange('list')}
      >
        <List className="size-4" />
        List
      </Button>
    </div>
  )
}

function EmptyProjectState({
  hasProjects,
  filter,
  viewMode,
  onNewProject,
}: {
  readonly hasProjects: boolean
  readonly filter: ProjectFilter
  readonly viewMode: ProjectViewMode
  readonly onNewProject: () => void
}) {
  if (viewMode === 'list') {
    return (
      <div className="overflow-hidden rounded-lg border border-border bg-background shadow-sm">
        <div className="hidden grid-cols-[minmax(18rem,1fr)_8.5rem_6rem_7.5rem_7rem] gap-4 border-b border-border px-4 py-3 text-xs font-medium text-muted-foreground lg:grid">
          <span>Name</span>
          <span>Last modified</span>
          <span>Assets</span>
          <span>Design</span>
          <span>Status</span>
        </div>
        <button
          type="button"
          className="grid w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/35 lg:grid-cols-[minmax(18rem,1fr)_8.5rem_6rem_7.5rem_7rem] lg:items-center lg:gap-4"
          onClick={onNewProject}
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-dashed border-border bg-muted/25">
              <Plus className="size-5 text-muted-foreground" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">New project</span>
              <span className="mt-1 block truncate text-xs text-muted-foreground">
                {hasProjects
                  ? `No ${filterTitle(filter).toLowerCase()} yet.`
                  : 'Start from one intent and let the Agent plan the prototype suite.'}
              </span>
            </span>
          </span>
          <span className="hidden text-sm text-muted-foreground lg:block">—</span>
          <span className="hidden text-sm tabular-nums text-muted-foreground lg:block">
            0
          </span>
          <span className="hidden text-sm text-muted-foreground lg:block">
            No design
          </span>
          <span className="hidden text-sm text-muted-foreground lg:block">
            Empty
          </span>
        </button>
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <button
        type="button"
        className={cn(
          'flex min-h-[17rem] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-background/65 p-6 text-center transition-colors hover:border-foreground/30 hover:bg-background',
          !hasProjects && 'md:col-span-2 xl:col-span-2',
        )}
        onClick={onNewProject}
      >
        <div className="flex size-12 items-center justify-center rounded-lg border border-border bg-muted/40">
          <Plus className="size-5 text-muted-foreground" />
        </div>
        <h3 className="mt-4 text-sm font-semibold">New project</h3>
        <p className="mt-2 max-w-56 text-sm leading-6 text-muted-foreground">
          {hasProjects
            ? `No ${filterTitle(filter).toLowerCase()} yet.`
            : 'Start from one intent and let the Agent plan the prototype suite.'}
        </p>
      </button>
    </div>
  )
}

function FilterItem({
  icon: Icon,
  label,
  count,
  active,
  onClick,
}: {
  readonly icon: LucideIcon
  readonly label: string
  readonly count: number
  readonly active: boolean
  readonly onClick: () => void
}) {
  return (
    <button
      type="button"
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors',
        active
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      )}
      onClick={onClick}
    >
      <Icon className="size-4" />
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
        {count}
      </span>
    </button>
  )
}

function projectCounts(projects: readonly LocalProjectSummary[]) {
  const activeProjects = projects.filter((project) => !project.archivedAt)
  return {
    all: activeProjects.length,
    ready: activeProjects.filter((project) => project.status === 'Ready').length,
    draft: activeProjects.filter(
      (project) => project.status === 'Draft' || project.status === 'Running',
    ).length,
    archived: projects.filter((project) => Boolean(project.archivedAt)).length,
  }
}

function projectMatchesFilter(
  project: LocalProjectSummary,
  filter: ProjectFilter,
): boolean {
  if (filter === 'archived') return Boolean(project.archivedAt)
  if (project.archivedAt) return false
  if (filter === 'all') return true
  if (filter === 'ready') return project.status === 'Ready'
  if (filter === 'draft') {
    return (
      project.status === 'Draft' ||
      project.status === 'Running' ||
      project.status === 'Empty'
    )
  }
  return false
}

function filterTitle(filter: ProjectFilter): string {
  switch (filter) {
    case 'ready':
      return 'Ready'
    case 'draft':
      return 'Drafts'
    case 'archived':
      return 'Archived'
    case 'all':
      return 'Recently viewed'
  }
}

function ProjectList({
  projects,
  activeProjectId,
  onOpenProject,
  onArchiveProject,
  onRestoreProject,
  onDeleteProject,
}: {
  readonly projects: readonly LocalProjectSummary[]
  readonly activeProjectId: string | null
  readonly onOpenProject: (id: string) => void
  readonly onArchiveProject: (id: string) => void
  readonly onRestoreProject: (id: string) => void
  readonly onDeleteProject: (id: string) => void
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background shadow-sm">
      <div className="hidden grid-cols-[minmax(18rem,1fr)_8.5rem_6rem_7.5rem_7rem_2.5rem] gap-4 border-b border-border px-4 py-3 text-xs font-medium text-muted-foreground lg:grid">
        <span>Name</span>
        <span>Last modified</span>
        <span>Assets</span>
        <span>Design</span>
        <span>Status</span>
        <span className="sr-only">Actions</span>
      </div>
      <div className="divide-y divide-border">
        {projects.map((project) => (
          <ProjectRow
            key={project.id}
            project={project}
            active={project.id === activeProjectId}
            onOpen={() => onOpenProject(project.id)}
            onArchive={() => onArchiveProject(project.id)}
            onRestore={() => onRestoreProject(project.id)}
            onDelete={() => onDeleteProject(project.id)}
          />
        ))}
      </div>
    </div>
  )
}

function ProjectRow({
  project,
  active,
  onOpen,
  onArchive,
  onRestore,
  onDelete,
}: {
  readonly project: LocalProjectSummary
  readonly active: boolean
  readonly onOpen: () => void
  readonly onArchive: () => void
  readonly onRestore: () => void
  readonly onDelete: () => void
}) {
  const archived = Boolean(project.archivedAt)
  return (
    <div
      className={cn(
        'grid gap-3 px-4 py-3 transition-colors hover:bg-muted/35 lg:grid-cols-[minmax(18rem,1fr)_8.5rem_6rem_7.5rem_7rem_2.5rem] lg:items-center lg:gap-4',
        active && 'bg-muted/45',
      )}
    >
      <button
        type="button"
        className="flex min-w-0 items-center gap-3 text-left"
        onClick={onOpen}
      >
        <ProjectThumbFrame project={project} className="size-16" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">
            {project.name}
          </span>
          <span className="mt-1 block truncate text-xs text-muted-foreground">
            {project.brief || 'No intent yet'}
          </span>
        </span>
      </button>
      <span className="hidden text-sm text-muted-foreground lg:block">
        {formatProjectDate(project.updatedAt)}
      </span>
      <span className="hidden text-sm tabular-nums text-muted-foreground lg:block">
        {project.assetCount}
      </span>
      <span className="hidden text-sm text-muted-foreground lg:block">
        {project.hasDesignMarkdown ? 'DESIGN.md' : 'No design'}
      </span>
      <span className="hidden text-sm text-muted-foreground lg:block">
        {archived ? 'Archived' : project.status}
      </span>
      <ProjectActions
        project={project}
        onArchive={onArchive}
        onRestore={onRestore}
        onDelete={onDelete}
        className="justify-self-start lg:justify-self-end"
      />
    </div>
  )
}

function ProjectCard({
  project,
  active,
  onOpen,
  onArchive,
  onRestore,
  onDelete,
}: {
  readonly project: LocalProjectSummary
  readonly active: boolean
  readonly onOpen: () => void
  readonly onArchive: () => void
  readonly onRestore: () => void
  readonly onDelete: () => void
}) {
  const archived = Boolean(project.archivedAt)
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-lg border bg-background text-left shadow-sm transition-colors hover:border-foreground/30',
        active ? 'border-foreground/30' : 'border-border',
      )}
    >
      <button
        type="button"
        className="block h-full w-full text-left"
        onClick={onOpen}
      >
        <div className="flex aspect-[16/10] items-center justify-center border-b border-border bg-[linear-gradient(45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(-45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(45deg,transparent_75%,hsl(var(--muted))_75%),linear-gradient(-45deg,transparent_75%,hsl(var(--muted))_75%)] bg-[length:18px_18px] bg-[position:0_0,0_9px,9px_-9px,-9px_0] p-8">
          <ProjectThumbFrame project={project} className="size-14" />
        </div>
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{project.name}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {project.brief || 'No intent yet'}
              </p>
            </div>
            <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <ProjectChip icon={Images} label={`${project.assetCount} assets`} />
            <ProjectChip
              icon={FileText}
              label={project.hasDesignMarkdown ? 'DESIGN.md' : 'No DESIGN.md'}
            />
            <ProjectChip icon={Clock3} label={archived ? 'Archived' : project.status} />
          </div>
        </div>
      </button>
      <ProjectActions
        project={project}
        onArchive={onArchive}
        onRestore={onRestore}
        onDelete={onDelete}
        className="absolute right-2 top-2 bg-background/90 shadow-sm"
      />
    </div>
  )
}

function ProjectThumbFrame({
  project,
  className,
}: {
  readonly project: LocalProjectSummary
  readonly className?: string
}) {
  return project.thumbnail ? (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background shadow-sm',
        className,
      )}
    >
      <ProjectThumbnail blob={project.thumbnail} />
    </span>
  ) : (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-lg border border-border bg-background shadow-sm',
        className,
      )}
    >
      <Scissors className="size-6 text-muted-foreground" />
    </span>
  )
}

function ProjectThumbnail({ blob }: { readonly blob: Blob }) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob])
  useEffect(() => () => URL.revokeObjectURL(url), [url])

  return (
    <img
      src={url}
      alt=""
      className="max-h-full max-w-full object-contain drop-shadow-sm"
    />
  )
}

function ProjectActions({
  project,
  onArchive,
  onRestore,
  onDelete,
  className,
}: {
  readonly project: LocalProjectSummary
  readonly onArchive: () => void
  readonly onRestore: () => void
  readonly onDelete: () => void
  readonly className?: string
}) {
  if (project.archivedAt) {
    return (
      <div className={cn('flex items-center gap-1', className)}>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Restore ${project.name}`}
          className="transition-colors hover:text-foreground"
          onClick={(event) => {
            event.stopPropagation()
            onRestore()
          }}
        >
          <ArchiveRestore className="size-3.5" />
        </Button>
        <ProjectDeleteButton projectName={project.name} onDelete={onDelete} />
      </div>
    )
  }

  return (
    <ProjectArchiveButton
      projectName={project.name}
      onArchive={onArchive}
      className={className}
    />
  )
}

function ProjectArchiveButton({
  projectName,
  onArchive,
  className,
}: {
  readonly projectName: string
  readonly onArchive: () => void
  readonly className?: string
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Archive ${projectName}`}
          className={cn('transition-colors hover:text-foreground', className)}
          onClick={(event) => event.stopPropagation()}
        >
          <Archive className="size-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive project?</AlertDialogTitle>
          <AlertDialogDescription>
            “{projectName}” will move out of active projects. You can restore it
            from Archived.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onArchive}>Archive</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function ProjectDeleteButton({
  projectName,
  onDelete,
  className,
}: {
  readonly projectName: string
  readonly onDelete: () => void
  readonly className?: string
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${projectName}`}
          className={cn('transition-colors hover:text-destructive', className)}
          onClick={(event) => event.stopPropagation()}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete permanently?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes “{projectName}” from local storage. This action cannot
            be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onDelete}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function ProjectChip({
  icon: Icon,
  label,
}: {
  readonly icon: typeof Clock3
  readonly label: string
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/25 px-2 py-1 text-xs text-muted-foreground">
      <Icon className="size-3" />
      {label}
    </span>
  )
}

function readProjectHomeViewMode(): ProjectViewMode {
  if (typeof localStorage === 'undefined') return 'grid'
  return localStorage.getItem(PROJECT_HOME_VIEW_MODE_KEY) === 'list'
    ? 'list'
    : 'grid'
}

function formatProjectDate(timestamp: number): string {
  return PROJECT_DATE_FORMATTER.format(new Date(timestamp))
}

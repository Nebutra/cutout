import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  Clock3,
  FileText,
  Images,
  LayoutGrid,
  List,
  Plus,
  Scissors,
  Sparkles,
  Trash2,
} from 'lucide-react'
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import type { LocalProjectSummary } from '@/services/local/project-repository.local'
import { cn } from '@/lib/utils'

type ProjectFilter = 'all' | 'ready' | 'draft' | 'empty'
type ProjectViewMode = 'grid' | 'list'

const PROJECT_HOME_VIEW_MODE_KEY = 'cutout.home.projectViewMode'
const PROJECT_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
})

interface ProjectHomeProps {
  readonly activeProjectId: string | null
  readonly projects: readonly LocalProjectSummary[]
  readonly onOpenProject: (id: string) => void
  readonly onDeleteProject: (id: string) => void
  readonly onNewProject: () => void
}

export function ProjectHome({
  activeProjectId,
  projects,
  onOpenProject,
  onDeleteProject,
  onNewProject,
}: ProjectHomeProps) {
  const hasProjects = projects.length > 0
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
            <p className="text-xs text-muted-foreground">Local projects</p>
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
            icon={Clock3}
            label="Empty"
            count={counts.empty}
            active={filter === 'empty'}
            onClick={() => setFilter('empty')}
          />
        </nav>
      </aside>

      <section className="min-w-0 flex-1 overflow-y-auto bg-muted/15">
        <div className="mx-auto w-full max-w-6xl px-6 py-8">
          <header className="border-b border-border pb-6">
            <p className="text-sm font-medium text-muted-foreground">Home</p>
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
                  {visibleProjects.length} local
                </p>
              </div>
              <ViewModeToggle value={viewMode} onChange={setViewMode} />
            </div>

            {hasVisibleProjects ? (
              viewMode === 'grid' ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {visibleProjects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      active={project.id === activeProjectId}
                      onOpen={() => onOpenProject(project.id)}
                      onDelete={() => onDeleteProject(project.id)}
                    />
                  ))}
                </div>
              ) : (
                <ProjectList
                  projects={visibleProjects}
                  activeProjectId={activeProjectId}
                  onOpenProject={onOpenProject}
                  onDeleteProject={onDeleteProject}
                />
              )
            ) : (
              <EmptyProjectState
                hasProjects={hasProjects}
                filter={filter}
                onNewProject={onNewProject}
              />
            )}
          </section>
        </div>
      </section>
    </main>
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
        variant={value === 'grid' ? 'secondary' : 'ghost'}
        size="icon-sm"
        aria-label="Grid view"
        aria-pressed={value === 'grid'}
        onClick={() => onChange('grid')}
      >
        <LayoutGrid className="size-4" />
      </Button>
      <Button
        type="button"
        variant={value === 'list' ? 'secondary' : 'ghost'}
        size="icon-sm"
        aria-label="List view"
        aria-pressed={value === 'list'}
        onClick={() => onChange('list')}
      >
        <List className="size-4" />
      </Button>
    </div>
  )
}

function EmptyProjectState({
  hasProjects,
  filter,
  onNewProject,
}: {
  readonly hasProjects: boolean
  readonly filter: ProjectFilter
  readonly onNewProject: () => void
}) {
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
  readonly icon: typeof LayoutGrid
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
  return {
    all: projects.length,
    ready: projects.filter((project) => project.status === 'Ready').length,
    draft: projects.filter(
      (project) => project.status === 'Draft' || project.status === 'Running',
    ).length,
    empty: projects.filter((project) => project.status === 'Empty').length,
  }
}

function projectMatchesFilter(
  project: LocalProjectSummary,
  filter: ProjectFilter,
): boolean {
  if (filter === 'all') return true
  if (filter === 'ready') return project.status === 'Ready'
  if (filter === 'draft') {
    return project.status === 'Draft' || project.status === 'Running'
  }
  return project.status === 'Empty'
}

function filterTitle(filter: ProjectFilter): string {
  switch (filter) {
    case 'ready':
      return 'Ready'
    case 'draft':
      return 'Drafts'
    case 'empty':
      return 'Empty'
    case 'all':
      return 'Recently viewed'
  }
}

function ProjectList({
  projects,
  activeProjectId,
  onOpenProject,
  onDeleteProject,
}: {
  readonly projects: readonly LocalProjectSummary[]
  readonly activeProjectId: string | null
  readonly onOpenProject: (id: string) => void
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
  onDelete,
}: {
  readonly project: LocalProjectSummary
  readonly active: boolean
  readonly onOpen: () => void
  readonly onDelete: () => void
}) {
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
        {project.status}
      </span>
      <ProjectDeleteButton
        projectName={project.name}
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
  onDelete,
}: {
  readonly project: LocalProjectSummary
  readonly active: boolean
  readonly onOpen: () => void
  readonly onDelete: () => void
}) {
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
            <ProjectChip icon={Clock3} label={project.status} />
          </div>
        </div>
      </button>
      <ProjectDeleteButton
        projectName={project.name}
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
          <AlertDialogTitle>Delete project?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes “{projectName}” from local projects. This action cannot
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

import { useEffect, useMemo } from 'react'
import {
  ArrowRight,
  Clock3,
  FileText,
  Images,
  Plus,
  Scissors,
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

interface ProjectHomeProps {
  readonly activeProjectId: string | null
  readonly currentProject: LocalProjectSummary | null
  readonly projects: readonly LocalProjectSummary[]
  readonly onOpenProject: (id: string) => void
  readonly onDeleteProject: (id: string) => void
  readonly onNewProject: () => void
}

export function ProjectHome({
  activeProjectId,
  currentProject,
  projects,
  onOpenProject,
  onDeleteProject,
  onNewProject,
}: ProjectHomeProps) {
  const hasProjects = projects.length > 0

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

        <nav className="mt-5 space-y-1">
          <HomeNavItem icon={Clock3} label="Recents" active />
        </nav>

        <div className="mt-auto rounded-md border border-border bg-background p-3">
          <p className="text-xs font-medium text-muted-foreground">Current</p>
          <p className="mt-1 truncate text-sm font-semibold">
            {currentProject?.name ?? 'No project'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {currentProject
              ? `${currentProject.assetCount} assets · ${currentProject.status}`
              : 'Create a project to begin'}
          </p>
        </div>
      </aside>

      <section className="min-w-0 flex-1 overflow-y-auto bg-muted/15">
        <div className="mx-auto w-full max-w-6xl px-6 py-8">
          <header className="border-b border-border pb-6">
            <p className="text-sm font-medium text-muted-foreground">Home</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Projects</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Open a local project or start a clean one.
            </p>
          </header>

          <section className="mt-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Recently viewed</h2>
              <span className="rounded-full border border-border bg-background px-2 py-1 text-xs text-muted-foreground">
                Local
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  active={project.id === activeProjectId}
                  onOpen={() => onOpenProject(project.id)}
                  onDelete={() => onDeleteProject(project.id)}
                />
              ))}

              <button
                type="button"
                className={cn(
                  'flex min-h-[17rem] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-background/65 p-6 text-center transition-colors hover:border-foreground/30 hover:bg-background',
                  !hasProjects && 'md:col-span-2 xl:col-span-1',
                )}
                onClick={onNewProject}
              >
                <div className="flex size-12 items-center justify-center rounded-lg border border-border bg-muted/40">
                  <Plus className="size-5 text-muted-foreground" />
                </div>
                <h3 className="mt-4 text-sm font-semibold">New project</h3>
                <p className="mt-2 max-w-56 text-sm leading-6 text-muted-foreground">
                  Start from one intent and let the Agent plan the prototype suite.
                </p>
              </button>
            </div>
          </section>
        </div>
      </section>
    </main>
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
          {project.thumbnail ? (
            <ProjectThumbnail blob={project.thumbnail} />
          ) : (
            <div className="flex size-14 items-center justify-center rounded-lg border border-border bg-background shadow-sm">
              <Scissors className="size-6 text-muted-foreground" />
            </div>
          )}
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
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${project.name}`}
            className="absolute right-2 top-2 opacity-0 shadow-sm transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
            onClick={(event) => event.stopPropagation()}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes “{project.name}” from local projects. This action
              cannot be undone.
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
    </div>
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

function HomeNavItem({
  icon: Icon,
  label,
  active = false,
}: {
  readonly icon: typeof Clock3
  readonly label: string
  readonly active?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-2 text-sm',
        active ? 'bg-muted text-foreground' : 'text-muted-foreground',
      )}
    >
      <Icon className="size-4" />
      <span>{label}</span>
    </div>
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

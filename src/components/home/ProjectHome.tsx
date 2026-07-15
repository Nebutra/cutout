import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { withViewTransition } from "@/lib/view-transition";
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  ArrowUp,
  Blocks,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FolderOpen,
  Globe,
  Images,
  LayoutGrid,
  Library,
  Lightbulb,
  List,
  Link2,
  FileText,
  Monitor,
  MoreHorizontal,
  Palette,
  Pencil,
  Plus,
  Pin,
  PinOff,
  X,
  Scissors,
  Search,
  SearchX,
  Smartphone,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { LocalProjectSummary } from "@/services/local/project-repository.local";
import { cn } from "@/lib/utils";
import { sortProjects } from "./project-order";
import { filterProjects } from "./project-search";
import { ConnectorMenu } from "@/components/integrations/ConnectorMenu";
import { SidebarAccount } from "./SidebarAccount";
import { GlobalLibraryView } from "@/components/library/GlobalLibraryView";

type HomeSection =
  "start" | "library" | "drafts" | "projects" | "published" | "archived";

function isDraftProject(project: LocalProjectSummary) {
  return project.status === "Draft" || project.status === "Empty";
}
type ProjectLoadState = "loading" | "ready" | "error";
type DirectoryLayout = "grid" | "list";

const DIRECTORY_LAYOUT_KEY = "cutout.home.directory-layout";

function readDirectoryLayout(): DirectoryLayout {
  try {
    return localStorage.getItem(DIRECTORY_LAYOUT_KEY) === "list"
      ? "list"
      : "grid";
  } catch {
    return "grid";
  }
}

interface ProjectHomeProps {
  readonly initialSection?: Extract<HomeSection, "start" | "library">;
  /** Bump to force the Start composer even when ProjectHome is already mounted deep in another section (e.g. Archived). */
  readonly resetToStartSignal?: number;
  readonly activeProjectId: string | null;
  readonly projects: readonly LocalProjectSummary[];
  readonly loadState: ProjectLoadState;
  readonly loadError: string | null;
  readonly onOpenProject: (id: string) => void;
  readonly onArchiveProject: (id: string) => void;
  readonly onRestoreProject: (id: string) => void;
  readonly onDeleteProject: (id: string) => void;
  readonly onRenameProject: (
    project: LocalProjectSummary,
    name: string,
  ) => void;
  readonly onPinProject: (
    project: LocalProjectSummary,
    pinned: boolean,
  ) => void;
  readonly onStartWithBrief: (
    brief: string,
    attachments?: readonly File[],
  ) => void;
  readonly onImportBoard: () => void;
  readonly onOpenEverythingInbox?: () => void;
  readonly onRetryProjects: () => void;
}

export function ProjectHome({
  initialSection = "start",
  resetToStartSignal,
  activeProjectId,
  projects,
  loadState,
  loadError,
  onOpenProject,
  onArchiveProject,
  onRestoreProject,
  onDeleteProject,
  onRenameProject,
  onPinProject,
  onStartWithBrief,
  onImportBoard,
  onOpenEverythingInbox,
  onRetryProjects,
}: ProjectHomeProps) {
  const [sectionNav, setSectionNav] = useState<{
    readonly stack: readonly HomeSection[];
    readonly index: number;
  }>({ stack: [initialSection], index: 0 });
  const section = sectionNav.stack[sectionNav.index];
  const setSection = (next: HomeSection) => {
    if (next === sectionNav.stack[sectionNav.index]) return;
    withViewTransition(() => {
      setSectionNav(({ stack, index }) => ({
        stack: [...stack.slice(0, index + 1), next],
        index: index + 1,
      }));
    });
  };
  const [brief, setBrief] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const resetSignalRef = useRef<number | undefined>(undefined);

  useLayoutEffect(() => {
    if (
      resetToStartSignal === undefined ||
      resetToStartSignal === resetSignalRef.current
    )
      return;
    resetSignalRef.current = resetToStartSignal;
    setSectionNav({ stack: ["start"], index: 0 });
    setBrief("");
    setSelectedPresetId(null);
    setFocusRequest((value) => value + 1);
  }, [resetToStartSignal]);

  useLayoutEffect(() => {
    if (section !== "start" || focusRequest === 0) return;
    let cancelled = false;
    let firstFrame = 0;
    let secondFrame = 0;
    queueMicrotask(() => {
      if (cancelled) return;
      firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(() => {
          if (cancelled) return;
          const composer = composerRef.current;
          composer?.focus({ preventScroll: true });
          if (composer) composer.setSelectionRange(composer.value.length, composer.value.length);
        });
      });
    });
    return () => {
      cancelled = true;
      if (firstFrame) cancelAnimationFrame(firstFrame);
      if (secondFrame) cancelAnimationFrame(secondFrame);
    };
  }, [focusRequest, section]);

  const applyPreset = (id: string, template: string) => {
    const selected = selectedPresetId === id;
    setSectionNav({ stack: ["start"], index: 0 });
    setSelectedPresetId(selected ? null : id);
    setBrief((current) =>
      selected && current === template ? "" : selected ? current : template,
    );
    composerRef.current?.focus({ preventScroll: true });
    setFocusRequest((value) => value + 1);
  };
  const counts = useMemo(() => projectCounts(projects), [projects]);
  const recentProjects = useMemo(
    () =>
      sortProjects(projects.filter((project) => !project.archivedAt)).slice(
        0,
        5,
      ),
    [projects],
  );
  const visibleProjects = useMemo(
    () =>
      sortProjects(
        projects.filter((project) => {
          if (section === "archived") return Boolean(project.archivedAt);
          if (project.archivedAt) return false;
          return section === "drafts" ? isDraftProject(project) : true;
        }),
      ),
    [projects, section],
  );

  return (
    <main className="flex min-h-0 flex-1 bg-background">
      <WorkspaceSidebar
        section={section}
        counts={counts}
        recentProjects={recentProjects}
        onSelectSection={setSection}
        onOpenProject={onOpenProject}
        activeProjectId={activeProjectId}
        onArchiveProject={onArchiveProject}
        onRenameProject={onRenameProject}
        onPinProject={onPinProject}
      />

      <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-muted/[0.18]">
        <WorkspaceHeader
          section={section}
          canGoBack={sectionNav.index > 0}
          canGoForward={sectionNav.index < sectionNav.stack.length - 1}
          onBack={() =>
            withViewTransition(() =>
              setSectionNav((nav) =>
                nav.index > 0 ? { ...nav, index: nav.index - 1 } : nav,
              ),
            )
          }
          onForward={() =>
            withViewTransition(() =>
              setSectionNav((nav) =>
                nav.index < nav.stack.length - 1
                  ? { ...nav, index: nav.index + 1 }
                  : nav,
              ),
            )
          }
          selectedPresetId={selectedPresetId}
          onApplyPreset={applyPreset}
          onRefocusComposer={() => {
            composerRef.current?.focus({ preventScroll: true });
            setFocusRequest((value) => value + 1);
          }}
        />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <MobileNavigation
            section={section}
            counts={counts}
            onSelectSection={setSection}
          />
          {section === "library" ? (
            <div className="min-h-full">
              <GlobalLibraryView projectId={activeProjectId} />
            </div>
          ) : section === "published" ? (
            <PublishedProjectsPlaceholder />
          ) : section === "start" ? (
            <StartWorkspace
              key={resetToStartSignal ?? 0}
              composerRef={composerRef}
              brief={brief}
              onBriefChange={(value) => {
                setBrief(value);
                setSelectedPresetId(null);
              }}
              recentProjects={recentProjects}
              onImportBoard={onImportBoard}
              onOpenEverythingInbox={onOpenEverythingInbox}
              onOpenProject={onOpenProject}
              activeProjectId={activeProjectId}
              onArchiveProject={onArchiveProject}
              onRenameProject={onRenameProject}
              onPinProject={onPinProject}
              onStartWithBrief={onStartWithBrief}
            />
          ) : (
            <ProjectDirectory
              activeProjectId={activeProjectId}
              section={section}
              projects={visibleProjects}
              loadState={loadState}
              loadError={loadError}
              onOpenProject={onOpenProject}
              onArchiveProject={onArchiveProject}
              onRestoreProject={onRestoreProject}
              onDeleteProject={onDeleteProject}
              onRenameProject={onRenameProject}
              onPinProject={onPinProject}
              onRetryProjects={onRetryProjects}
              onStartNew={() => setSection("start")}
            />
          )}
        </div>
      </section>
    </main>
  );
}

function WorkspaceHeader({
  section,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  selectedPresetId,
  onApplyPreset,
  onRefocusComposer,
}: {
  readonly section: HomeSection;
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  readonly onBack: () => void;
  readonly onForward: () => void;
  readonly selectedPresetId: string | null;
  readonly onApplyPreset: (id: string, template: string) => void;
  readonly onRefocusComposer: () => void;
}) {
  const { t } = useLingui();
  const sectionLabels: Record<HomeSection, string> = {
    start: t({ id: "home.new_project", message: "New project" }),
    library: t({ id: "home.library_label", message: "Library" }),
    drafts: t({ id: "home.drafts", message: "Drafts" }),
    projects: t({ id: "home.all_projects", message: "All projects" }),
    published: t({
      id: "home.published_projects",
      message: "Published Projects",
    }),
    archived: t({ id: "home.archived", message: "Archived" }),
  };
  const presets = [
    {
      id: "web",
      icon: Globe,
      color: "text-sky-500",
      label: t({ id: "home.preset_web", message: "Web" }),
      template: t({
        id: "home.preset_web_brief",
        message: "Design a responsive web experience for ",
      }),
    },
    {
      id: "mobile",
      icon: Smartphone,
      color: "text-emerald-500",
      label: t({ id: "home.preset_mobile", message: "Mobile app" }),
      template: t({
        id: "home.preset_mobile_brief",
        message: "Design a mobile app UI for ",
      }),
    },
    {
      id: "miniapp",
      icon: Blocks,
      color: "text-green-600",
      label: t({ id: "home.preset_miniapp", message: "Mini program" }),
      template: t({
        id: "home.preset_miniapp_brief",
        message: "Design a WeChat mini-program flow for ",
      }),
    },
    {
      id: "desktop",
      icon: Monitor,
      color: "text-violet-500",
      label: t({ id: "home.preset_desktop", message: "Desktop" }),
      template: t({
        id: "home.preset_desktop_brief",
        message: "Design a desktop application workspace for ",
      }),
    },
    {
      id: "brand",
      icon: Palette,
      color: "text-pink-500",
      label: t({ id: "home.preset_brand", message: "Brand kit" }),
      template: t({
        id: "home.preset_brand_brief",
        message:
          "Create a complete brand kit (logo, colors, type, assets) for ",
      }),
    },
    {
      id: "poster",
      icon: Images,
      color: "text-amber-500",
      label: t({ id: "home.preset_poster", message: "Poster" }),
      template: t({
        id: "home.preset_poster_brief",
        message: "Create a poster / key visual for ",
      }),
    },
  ] as const;

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-background/90 px-3 backdrop-blur">
      <div className="flex min-w-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={!canGoBack}
          aria-label={t({ id: "home.nav_back", message: "Back" })}
          onClick={onBack}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={!canGoForward}
          aria-label={t({ id: "home.nav_forward", message: "Forward" })}
          onClick={onForward}
        >
          <ChevronRight className="size-4" />
        </Button>
        <span className="ml-1 truncate text-sm font-medium">
          {sectionLabels[section]}
        </span>
      </div>
      <div className="flex items-center gap-1.5 overflow-x-auto">
        {presets.map((preset) => (
          <Button
            key={preset.id}
            type="button"
            variant={selectedPresetId === preset.id ? "secondary" : "ghost"}
            size="sm"
            className="shrink-0 rounded-full"
            aria-label={preset.label}
            aria-pressed={selectedPresetId === preset.id}
            onClick={() => onApplyPreset(preset.id, preset.template)}
            onDoubleClick={onRefocusComposer}
          >
            <preset.icon className={cn("size-4", preset.color)} />
            <span className="hidden lg:inline">{preset.label}</span>
          </Button>
        ))}
      </div>
    </header>
  );
}

interface NavigationProps {
  readonly section: HomeSection;
  readonly counts: ReturnType<typeof projectCounts>;
  readonly onSelectSection: (section: HomeSection) => void;
}

function WorkspaceSidebar({
  section,
  counts,
  recentProjects,
  onSelectSection,
  onOpenProject,
  activeProjectId,
  onArchiveProject,
  onRenameProject,
  onPinProject,
}: NavigationProps & {
  readonly recentProjects: readonly LocalProjectSummary[];
  readonly onOpenProject: (id: string) => void;
  readonly activeProjectId: string | null;
  readonly onArchiveProject: (id: string) => void;
  readonly onRenameProject: (
    project: LocalProjectSummary,
    name: string,
  ) => void;
  readonly onPinProject: (
    project: LocalProjectSummary,
    pinned: boolean,
  ) => void;
}) {
  const { t } = useLingui();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-background px-3 py-4 md:flex">
      <SidebarAccount />

      <ProjectNavigation
        section={section}
        counts={counts}
        onSelectSection={onSelectSection}
      />

      <div className="mt-7 min-h-0">
        <p className="px-2 text-[11px] font-medium uppercase text-muted-foreground">
          {t({ id: "home.recent_heading", message: "Recent" })}
        </p>
        <div className="mt-2 space-y-0.5">
          {recentProjects.length ? (
            recentProjects.map((project) => (
              <ProjectListItem
                key={project.id}
                project={project}
                active={project.id === activeProjectId}
                compact
                onOpen={() => onOpenProject(project.id)}
                onArchive={() => onArchiveProject(project.id)}
                onRename={(name) => onRenameProject(project, name)}
                onPin={(pinned) => onPinProject(project, pinned)}
              />
            ))
          ) : (
            <p className="px-2 py-2 text-xs text-muted-foreground">
              {t({ id: "home.no_projects_yet", message: "No projects yet" })}
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}

function MobileNavigation(props: NavigationProps) {
  return (
    <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-3 py-2 backdrop-blur md:hidden">
      <ProjectNavigation {...props} compact />
    </div>
  );
}

function ProjectNavigation({
  section,
  counts,
  onSelectSection,
  compact = false,
}: NavigationProps & { readonly compact?: boolean }) {
  const { t } = useLingui();

  return (
    <nav
      className={cn(compact ? "grid grid-cols-5 gap-1" : "mt-5 space-y-1")}
      aria-label={t({
        id: "home.workspace_navigation",
        message: "Workspace navigation",
      })}
    >
      <NavItem
        compact={compact}
        icon={Library}
        label={t({ id: "home.library_label", message: "Library" })}
        active={section === "library"}
        onClick={() => onSelectSection("library")}
      />
      <NavItem
        compact={compact}
        icon={FileText}
        label={t({ id: "home.drafts", message: "Drafts" })}
        count={counts.drafts}
        active={section === "drafts"}
        onClick={() => onSelectSection("drafts")}
      />
      <NavItem
        compact={compact}
        icon={LayoutGrid}
        label={t({ id: "home.all_projects", message: "All projects" })}
        count={counts.active}
        active={section === "projects"}
        onClick={() => onSelectSection("projects")}
      />
      <NavItem
        compact={compact}
        icon={Globe}
        label={t({
          id: "home.published_projects",
          message: "Published Projects",
        })}
        badge={t({ id: "home.wip_badge", message: "WIP" })}
        active={section === "published"}
        onClick={() => onSelectSection("published")}
      />
    </nav>
  );
}

function StartWorkspace({
  composerRef,
  brief,
  onBriefChange,
  recentProjects,
  onImportBoard,
  onOpenEverythingInbox,
  onOpenProject,
  activeProjectId,
  onArchiveProject,
  onRenameProject,
  onPinProject,
  onStartWithBrief,
}: {
  readonly composerRef: RefObject<HTMLTextAreaElement | null>;
  readonly brief: string;
  readonly onBriefChange: (brief: string) => void;
  readonly recentProjects: readonly LocalProjectSummary[];
  readonly onImportBoard: () => void;
  readonly onOpenEverythingInbox?: () => void;
  readonly onOpenProject: (id: string) => void;
  readonly activeProjectId: string | null;
  readonly onArchiveProject: (id: string) => void;
  readonly onRenameProject: (
    project: LocalProjectSummary,
    name: string,
  ) => void;
  readonly onPinProject: (
    project: LocalProjectSummary,
    pinned: boolean,
  ) => void;
  readonly onStartWithBrief: (
    brief: string,
    attachments?: readonly File[],
  ) => void;
}) {
  const { t } = useLingui();
  const setBrief = onBriefChange;
  const [attachments, setAttachments] = useState<File[]>([]);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);

  const submitBrief = () => {
    if (submittingRef.current) return;
    const value = brief.trim();
    if (value) {
      submittingRef.current = true;
      onStartWithBrief(value, attachments);
    }
  };

  return (
    <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-4 py-8 sm:px-6 lg:px-10">
      <div className="flex flex-1 flex-col justify-center py-6 sm:py-10">
        <div className="mx-auto w-full max-w-3xl">
          <h1 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
            {t({ id: "home.start_title", message: "What will we design?" })}
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-center text-sm leading-6 text-muted-foreground">
            {t({
              id: "home.start_description",
              message:
                "Tell us the outcome. The Agent will handle the plan, production, and delivery details.",
            })}
          </p>

          <form
            className="mt-9 w-full"
            onSubmit={(event) => {
              event.preventDefault();
              submitBrief();
            }}
          >
            <div
              data-testid="home-composer-surface"
              className="relative w-full min-w-0 rounded-2xl border border-border bg-background shadow-[0_12px_32px_rgb(0_0_0/0.06)] transition-[border-color,box-shadow] focus-within:border-foreground/30 focus-within:shadow-[0_16px_40px_rgb(0_0_0/0.1)]"
            >
              <input
                ref={attachInputRef}
                className="sr-only"
                type="file"
                multiple
                accept="image/*,video/*,.md,.markdown,.mdx,.txt,.pdf"
                aria-label="Add local files"
                onChange={(event) => {
                  setAttachments((current) => [
                    ...current,
                    ...Array.from(event.target.files ?? []),
                  ]);
                  event.target.value = "";
                }}
              />
              {attachments.length ? (
                <div
                  aria-label="Composer attachments"
                  className="flex flex-wrap gap-1.5 px-4 pt-3"
                >
                  {attachments.map((file, index) => (
                    <span
                      key={`${file.name}:${file.size}:${index}`}
                      className="flex max-w-full items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs"
                    >
                      <AttachmentThumbnail file={file} />
                      <span className="max-w-40 truncate">{file.name}</span>
                      {file.type.startsWith("video/") ? (
                        <span className="text-[10px] text-muted-foreground">
                          Adapter required
                        </span>
                      ) : null}
                      <button
                        type="button"
                        aria-label={`Remove ${file.name}`}
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          setAttachments((current) =>
                            current.filter((_, item) => item !== index),
                          )
                        }
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
              <Textarea
                ref={composerRef}
                autoFocus
                value={brief}
                onChange={(event) => setBrief(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter")
                    submitBrief();
                }}
                placeholder={t({
                  id: "home.brief_placeholder",
                  message: "Describe the result you want...",
                })}
                className="min-h-28 w-full resize-none rounded-none border-0 bg-transparent px-4 pt-3 pb-2 text-base shadow-none outline-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent sm:min-h-24"
              />
              <div
                data-testid="home-composer-actions"
                className="flex min-h-12 w-full items-center justify-between gap-3 px-3 pt-1 pb-3"
              >
                <div className="flex items-center gap-1">
                  {onOpenEverythingInbox ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          className="rounded-full border-border/80 text-muted-foreground hover:text-foreground"
                          aria-label="Add source"
                        >
                          <Plus className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-56">
                        <DropdownMenuItem onSelect={onOpenEverythingInbox}>
                          <Lightbulb className="size-4" /> Idea, story, or need
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => attachInputRef.current?.click()}
                        >
                          <FileText className="size-4" /> Files and documents
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={onOpenEverythingInbox}>
                          <Link2 className="size-4" /> URL descriptor
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => attachInputRef.current?.click()}
                        >
                          <Images className="size-4" /> Screenshot, photo, or
                          video
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={onOpenEverythingInbox}>
                          <FolderOpen className="size-4" /> Repository or
                          integration
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={onImportBoard}>
                          <Images className="size-4" /> Quick import visual
                          board
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          className="rounded-full border-border/80 text-muted-foreground hover:text-foreground"
                          onClick={onImportBoard}
                          aria-label={t({
                            id: "home.attach_reference",
                            message: "Attach a reference",
                          })}
                        >
                          <FolderOpen className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {t({
                          id: "home.attach_reference",
                          message: "Attach a reference",
                        })}
                      </TooltipContent>
                    </Tooltip>
                  )}
                  <ConnectorMenu triggerClassName="rounded-full border border-border/80 text-muted-foreground hover:text-foreground" />
                </div>
                <Button
                  type="submit"
                  size="icon-sm"
                  className="rounded-full"
                  disabled={!brief.trim()}
                  aria-label={t({
                    id: "home.create_from_brief",
                    message: "Create from brief",
                  })}
                >
                  <ArrowUp className="size-4" />
                </Button>
              </div>
            </div>
          </form>

          {recentProjects.length ? (
            <div className="mt-12">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">
                  {t({
                    id: "home.continue_heading",
                    message: "Continue working",
                  })}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {t({ id: "home.local_projects", message: "Local projects" })}
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {recentProjects.slice(0, 3).map((project) => (
                  <ProjectListItem
                    key={project.id}
                    project={project}
                    active={project.id === activeProjectId}
                    card
                    onOpen={() => onOpenProject(project.id)}
                    onArchive={() => onArchiveProject(project.id)}
                    onRename={(name) => onRenameProject(project, name)}
                    onPin={(pinned) => onPinProject(project, pinned)}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AttachmentThumbnail({ file }: { readonly file: File }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!file.type.startsWith("image/")) return;
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  if (url)
    return <img src={url} alt="" className="size-5 rounded-sm object-cover" />;
  return file.type.startsWith("video/") ? (
    <Images className="size-4 text-muted-foreground" />
  ) : (
    <FileText className="size-4 text-muted-foreground" />
  );
}

function ProjectDirectory({
  activeProjectId,
  section,
  projects,
  loadState,
  loadError,
  onOpenProject,
  onArchiveProject,
  onRestoreProject,
  onDeleteProject,
  onRenameProject,
  onPinProject,
  onRetryProjects,
  onStartNew,
}: {
  readonly activeProjectId: string | null;
  readonly section: Exclude<HomeSection, "start" | "published">;
  readonly projects: readonly LocalProjectSummary[];
  readonly loadState: ProjectLoadState;
  readonly loadError: string | null;
  readonly onOpenProject: (id: string) => void;
  readonly onArchiveProject: (id: string) => void;
  readonly onRestoreProject: (id: string) => void;
  readonly onDeleteProject: (id: string) => void;
  readonly onRenameProject: (
    project: LocalProjectSummary,
    name: string,
  ) => void;
  readonly onPinProject: (
    project: LocalProjectSummary,
    pinned: boolean,
  ) => void;
  readonly onRetryProjects: () => void;
  readonly onStartNew: () => void;
}) {
  const { t, i18n } = useLingui();
  const [query, setQuery] = useState("");
  const [layout, setLayout] = useState<DirectoryLayout>(readDirectoryLayout);
  const archived = section === "archived";
  const title = archived
    ? t({ id: "home.archived_projects", message: "Archived projects" })
    : section === "drafts"
      ? t({ id: "home.drafts", message: "Drafts" })
      : t({ id: "home.your_projects", message: "Your projects" });
  const matchedProjects = useMemo(
    () => filterProjects(projects, query),
    [projects, query],
  );
  const selectLayout = (next: DirectoryLayout) => {
    setLayout(next);
    try {
      localStorage.setItem(DIRECTORY_LAYOUT_KEY, next);
    } catch {
      // best-effort persistence only
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10 lg:px-10">
      <header className="border-b border-border pb-5">
        <p className="text-sm text-muted-foreground">
          {t({ id: "home.workspace", message: "Workspace" })}
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {loadState === "ready" && projects.length ? (
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t({
                  id: "home.search_projects",
                  message: "Search projects...",
                })}
                aria-label={t({
                  id: "home.search_projects",
                  message: "Search projects...",
                })}
                className="h-9 pl-8"
              />
            </div>
          ) : null}
          <div className="flex items-center rounded-md border border-border p-0.5">
            <Button
              type="button"
              variant={layout === "grid" ? "secondary" : "ghost"}
              size="icon-sm"
              className="size-7"
              aria-label={t({ id: "home.layout_grid", message: "Grid view" })}
              aria-pressed={layout === "grid"}
              onClick={() => selectLayout("grid")}
            >
              <LayoutGrid className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant={layout === "list" ? "secondary" : "ghost"}
              size="icon-sm"
              className="size-7"
              aria-label={t({ id: "home.layout_list", message: "List view" })}
              aria-pressed={layout === "list"}
              onClick={() => selectLayout("list")}
            >
              <List className="size-3.5" />
            </Button>
          </div>
          {!archived ? (
            <Button type="button" size="sm" onClick={onStartNew}>
              <Plus className="size-4" />
              {t({ id: "home.new_project", message: "New project" })}
            </Button>
          ) : null}
        </div>
      </header>
      <div className="mt-6">
        {loadState === "loading" ? (
          <DirectorySkeleton />
        ) : loadState === "error" ? (
          <DirectoryError
            error={
              loadError ??
              t({
                id: "home.project_load_error",
                message: "Project storage could not be loaded.",
              })
            }
            onRetry={onRetryProjects}
          />
        ) : !projects.length ? (
          <EmptyDirectory section={section} />
        ) : !matchedProjects.length ? (
          <EmptySearchResults query={query} onClear={() => setQuery("")} />
        ) : layout === "grid" ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {matchedProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                locale={i18n.locale}
                active={project.id === activeProjectId}
                onOpen={() => onOpenProject(project.id)}
                onArchive={() => onArchiveProject(project.id)}
                onRestore={() => onRestoreProject(project.id)}
                onDelete={() => onDeleteProject(project.id)}
                onRename={(name) => onRenameProject(project, name)}
                onPin={(pinned) => onPinProject(project, pinned)}
              />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border bg-background">
            {matchedProjects.map((project) => (
              <ProjectRow
                key={project.id}
                project={project}
                locale={i18n.locale}
                active={project.id === activeProjectId}
                onOpen={() => onOpenProject(project.id)}
                onArchive={() => onArchiveProject(project.id)}
                onRestore={() => onRestoreProject(project.id)}
                onDelete={() => onDeleteProject(project.id)}
                onRename={(name) => onRenameProject(project, name)}
                onPin={(pinned) => onPinProject(project, pinned)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ProjectRow({
  project,
  locale,
  active,
  onOpen,
  onArchive,
  onRestore,
  onDelete,
  onRename,
  onPin,
}: {
  readonly project: LocalProjectSummary;
  readonly locale: string;
  readonly active: boolean;
  readonly onOpen: () => void;
  readonly onArchive: () => void;
  readonly onRestore: () => void;
  readonly onDelete: () => void;
  readonly onRename: (name: string) => void;
  readonly onPin: (pinned: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 transition-colors hover:bg-muted/35",
        active && "bg-muted/45",
      )}
    >
      <button
        type="button"
        aria-label={`Open ${project.name}`}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        onClick={onOpen}
      >
        <ProjectMark project={project} className="size-11" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">
            {project.name}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {project.brief || <ProjectStatusDescription project={project} />}
          </span>
        </span>
      </button>
      <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
        <Images className="size-3" />
        {project.assetCount}
      </span>
      <span className="hidden items-center gap-1 text-xs text-muted-foreground md:flex">
        <Clock3 className="size-3" />
        {formatProjectDate(project.updatedAt, locale)}
      </span>
      <ProjectActions
        project={project}
        onRename={onRename}
        onPin={onPin}
        onArchive={onArchive}
        onRestore={onRestore}
        onDelete={onDelete}
      />
    </div>
  );
}

export function ProjectCard({
  project,
  locale,
  active,
  onOpen,
  onArchive,
  onRestore,
  onDelete,
  onRename,
  onPin,
}: {
  readonly project: LocalProjectSummary;
  readonly locale: string;
  readonly active: boolean;
  readonly onOpen: () => void;
  readonly onArchive: () => void;
  readonly onRestore: () => void;
  readonly onDelete: () => void;
  readonly onRename: (name: string) => void;
  readonly onPin: (pinned: boolean) => void;
}) {
  const { t } = useLingui();
  const pinned = Boolean(project.pinnedAt);
  const archived = Boolean(project.archivedAt);

  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl border border-border bg-background transition-colors hover:border-foreground/25",
        active && "ring-1 ring-foreground/15",
      )}
    >
      <button
        type="button"
        aria-label={`Open ${project.name}`}
        className="relative block aspect-[16/10] w-full overflow-hidden bg-muted/40 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        onClick={onOpen}
      >
        {project.thumbnail ? (
          <CardThumbnail thumbnail={project.thumbnail} />
        ) : (
          <span className="flex h-full items-center justify-center">
            <Scissors className="size-6 text-muted-foreground/50" />
          </span>
        )}
      </button>
      {!archived ? (
        <div
          className={cn(
            "absolute right-2 top-2 transition-opacity",
            "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
            pinned && "opacity-100",
          )}
        >
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            className="shadow-sm"
            aria-label={`${pinned ? "Unpin" : "Pin"} ${project.name}`}
            aria-pressed={pinned}
            onClick={() => onPin(!pinned)}
          >
            {pinned ? (
              <PinOff className="size-3.5" />
            ) : (
              <Pin className="size-3.5" />
            )}
          </Button>
        </div>
      ) : null}
      <div className="flex items-center gap-2.5 border-t border-border p-3">
        <ProjectMark project={project} className="size-8" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {project.name}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {t({
              id: "home.edited_date",
              message: `Edited ${formatProjectDate(project.updatedAt, locale)}`,
            })}
          </span>
        </span>
        <div className="opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
          <ProjectActions
            project={project}
            compact
            menuOnly
            onRename={onRename}
            onPin={onPin}
            onArchive={onArchive}
            onRestore={onRestore}
            onDelete={onDelete}
          />
        </div>
      </div>
    </div>
  );
}

function CardThumbnail({ thumbnail }: { readonly thumbnail: Blob }) {
  const url = useObjectUrl(thumbnail);

  return url ? (
    <img src={url} alt="" className="h-full w-full object-cover" />
  ) : null;
}

function ProjectListItem({
  project,
  active,
  compact = false,
  card = false,
  onOpen,
  onArchive,
  onRename,
  onPin,
}: {
  readonly project: LocalProjectSummary;
  readonly active: boolean;
  readonly compact?: boolean;
  readonly card?: boolean;
  readonly onOpen: () => void;
  readonly onArchive: () => void;
  readonly onRename: (name: string) => void;
  readonly onPin: (pinned: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "group relative flex min-w-0 items-center rounded-md transition-colors",
        compact &&
          "text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
        card &&
          "border border-border bg-background hover:border-foreground/30 hover:bg-muted/30",
        active &&
          "bg-muted text-foreground ring-1 ring-inset ring-foreground/10",
      )}
    >
      <button
        type="button"
        aria-current={active ? "page" : undefined}
        aria-label={`Open ${project.name}`}
        className={cn(
          "flex min-w-0 flex-1 items-center text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
          compact ? "gap-2 px-2 py-1.5 pr-16" : "gap-3 p-3 pr-20",
        )}
        onClick={onOpen}
      >
        <ProjectMark
          project={project}
          className={compact ? "size-5" : "size-9"}
        />
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate", card && "text-sm font-medium")}>
            {project.name}
          </span>
          {card ? (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {project.brief || <ProjectStatusDescription project={project} />}
            </span>
          ) : null}
        </span>
      </button>
      <div
        className={cn(
          "absolute right-1 flex items-center rounded-md bg-inherit opacity-100 transition-opacity",
          "md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100",
          project.pinnedAt && "md:opacity-100",
        )}
      >
        <ProjectActions
          project={project}
          compact
          onRename={onRename}
          onPin={onPin}
          onArchive={onArchive}
        />
      </div>
    </div>
  );
}

function ProjectActions({
  project,
  compact = false,
  menuOnly = false,
  onRename,
  onPin,
  onArchive,
  onRestore,
  onDelete,
}: {
  readonly project: LocalProjectSummary;
  readonly compact?: boolean;
  readonly menuOnly?: boolean;
  readonly onRename: (name: string) => void;
  readonly onPin: (pinned: boolean) => void;
  readonly onArchive: () => void;
  readonly onRestore?: () => void;
  readonly onDelete?: () => void;
}) {
  const { t } = useLingui();
  const archived = Boolean(project.archivedAt);
  const pinned = Boolean(project.pinnedAt);
  const [renameOpen, setRenameOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState(project.name);
  const actionSize = compact ? "size-7" : undefined;
  const pinLabel = pinned
    ? t({ id: "home.unpin_named", message: `Unpin ${project.name}` })
    : t({ id: "home.pin_named", message: `Pin ${project.name}` });

  return (
    <>
      {!archived && !menuOnly ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={actionSize}
              aria-label={pinLabel}
              aria-pressed={pinned}
              onClick={() => onPin(!pinned)}
            >
              {pinned ? (
                <PinOff className="size-3.5" />
              ) : (
                <Pin className="size-3.5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {pinned
              ? t({ id: "home.unpin_project", message: "Unpin project" })
              : t({ id: "home.pin_project", message: "Pin project" })}
          </TooltipContent>
        </Tooltip>
      ) : null}

      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className={actionSize}
                aria-label={t({
                  id: "home.more_actions_named",
                  message: `More actions for ${project.name}`,
                })}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <Trans id="home.project_actions">Project actions</Trans>
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-48">
          {!archived ? (
            <>
              <DropdownMenuItem
                onSelect={() => {
                  setName(project.name);
                  setRenameOpen(true);
                }}
              >
                <Pencil className="size-4" />{" "}
                <Trans id="home.rename">Rename</Trans>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onPin(!pinned)}>
                {pinned ? (
                  <PinOff className="size-4" />
                ) : (
                  <Pin className="size-4" />
                )}
                {pinned ? (
                  <Trans id="home.unpin">Unpin</Trans>
                ) : (
                  <Trans id="home.pin">Pin</Trans>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setArchiveOpen(true)}>
                <Archive className="size-4" />{" "}
                <Trans id="home.archive">Archive</Trans>
              </DropdownMenuItem>
            </>
          ) : (
            <>
              <DropdownMenuItem onSelect={() => onRestore?.()}>
                <ArchiveRestore className="size-4" />{" "}
                <Trans id="home.restore">Restore</Trans>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setDeleteOpen(true)}
              >
                <Trash2 className="size-4" />{" "}
                <Trans id="home.delete_permanently">Delete permanently</Trans>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const nextName = name.trim();
              if (!nextName || nextName === project.name) return;
              onRename(nextName);
              setRenameOpen(false);
            }}
          >
            <DialogHeader>
              <DialogTitle>
                <Trans id="home.rename_project_title">Rename project</Trans>
              </DialogTitle>
              <DialogDescription>
                <Trans id="home.rename_project_description">
                  Choose a clear name for this local project.
                </Trans>
              </DialogDescription>
            </DialogHeader>
            <Input
              autoFocus
              className="mt-4"
              aria-label={t({
                id: "home.project_name_aria",
                message: "Project name",
              })}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <DialogFooter className="mt-5">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRenameOpen(false)}
              >
                <Trans id="home.cancel">Cancel</Trans>
              </Button>
              <Button
                type="submit"
                disabled={!name.trim() || name.trim() === project.name}
              >
                <Trans id="home.rename">Rename</Trans>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <Trans id="home.archive_project_title">Archive project?</Trans>
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t({
                id: "home.archive_project_description",
                message: `"${project.name}" will move out of active projects. You can restore it from Archived.`,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Trans id="home.cancel">Cancel</Trans>
            </AlertDialogCancel>
            <AlertDialogAction onClick={onArchive}>
              <Trans id="home.archive">Archive</Trans>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <Trans id="home.delete_permanently_title">
                Delete permanently?
              </Trans>
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t({
                id: "home.delete_permanently_description",
                message: `This removes "${project.name}" from local storage. This action cannot be undone.`,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Trans id="home.cancel">Cancel</Trans>
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onDelete}>
              <Trans id="home.delete">Delete</Trans>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ProjectMark({
  project,
  className,
}: {
  readonly project: LocalProjectSummary;
  readonly className: string;
}) {
  return project.thumbnail ? (
    <ProjectThumbnail thumbnail={project.thumbnail} className={className} />
  ) : (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md border border-border bg-muted/30",
        className,
      )}
    >
      <Scissors className="size-4 text-muted-foreground" />
    </span>
  );
}

function ProjectThumbnail({
  thumbnail,
  className,
}: {
  readonly thumbnail: Blob;
  readonly className: string;
}) {
  const url = useObjectUrl(thumbnail);

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-background",
        className,
      )}
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-contain" />
      ) : null}
    </span>
  );
}

function useObjectUrl(blob: Blob) {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    const nextUrl = URL.createObjectURL(blob);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [blob]);

  return url;
}

function ProjectStatusDescription({
  project,
}: {
  readonly project: LocalProjectSummary;
}) {
  const { t } = useLingui();
  const statusMessages = {
    Empty: t({ id: "home.status_empty", message: "Empty" }),
    Draft: t({ id: "home.status_draft", message: "Draft" }),
    Running: t({ id: "home.status_running", message: "Running" }),
    Ready: t({ id: "home.status_ready", message: "Ready" }),
  };

  const assetLabel =
    project.assetCount === 1
      ? t({ id: "home.asset_singular", message: "asset" })
      : t({ id: "home.asset_plural", message: "assets" });

  return `${statusMessages[project.status]} · ${project.assetCount} ${assetLabel}`;
}

function DirectorySkeleton() {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-background p-3">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 py-1">
          <Skeleton className="size-11 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function DirectoryError({
  error,
  onRetry,
}: {
  readonly error: string;
  readonly onRetry: () => void;
}) {
  const { t } = useLingui();

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <div className="flex gap-3">
        <AlertCircle className="mt-0.5 size-4 text-destructive" />
        <div>
          <h2 className="text-sm font-semibold text-destructive">
            {t({
              id: "home.load_failed_title",
              message: "Could not load projects",
            })}
          </h2>
          <p className="mt-1 text-sm text-destructive/80">{error}</p>
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        {t({ id: "home.retry", message: "Retry" })}
      </Button>
    </div>
  );
}

function PublishedProjectsPlaceholder() {
  const { t } = useLingui();

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10 lg:px-10">
      <header className="border-b border-border pb-5">
        <p className="text-sm text-muted-foreground">
          {t({ id: "home.workspace", message: "Workspace" })}
        </p>
        <div className="mt-1 flex items-center gap-2.5">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t({
              id: "home.published_projects",
              message: "Published Projects",
            })}
          </h1>
          <span className="rounded border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {t({ id: "home.wip_badge", message: "WIP" })}
          </span>
        </div>
      </header>
      <div className="mt-6 flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-background/70 p-8 text-center">
        <Globe className="size-6 text-muted-foreground" />
        <h2 className="mt-3 text-sm font-semibold">
          {t({
            id: "home.published_empty_title",
            message: "Publishing is on the way",
          })}
        </h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {t({
            id: "home.published_empty_description",
            message:
              "Projects you publish will be listed here with their live links. This needs accounts and a community service, which are not built yet.",
          })}
        </p>
      </div>
    </div>
  );
}

function EmptyDirectory({
  section,
}: {
  readonly section: Exclude<HomeSection, "start" | "published">;
}) {
  const { t } = useLingui();
  const Icon =
    section === "archived"
      ? Archive
      : section === "drafts"
        ? FileText
        : LayoutGrid;
  const heading =
    section === "archived"
      ? t({ id: "home.nothing_archived", message: "Nothing archived" })
      : section === "drafts"
        ? t({ id: "home.no_drafts_yet", message: "No drafts yet" })
        : t({ id: "home.no_projects_yet", message: "No projects yet" });
  const description =
    section === "archived"
      ? t({
          id: "home.archived_empty_description",
          message: "Archived work will appear here.",
        })
      : section === "drafts"
        ? t({
            id: "home.drafts_empty_description",
            message:
              "Projects that have not produced results yet will collect here.",
          })
        : t({
            id: "home.projects_empty_description",
            message: "Start with an idea or bring in a visual board.",
          });

  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-background/70 p-6 text-center">
      <Icon className="size-5 text-muted-foreground" />
      <h2 className="mt-3 text-sm font-semibold">{heading}</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function EmptySearchResults({
  query,
  onClear,
}: {
  readonly query: string;
  readonly onClear: () => void;
}) {
  const { t } = useLingui();

  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-background/70 p-6 text-center">
      <SearchX className="size-5 text-muted-foreground" />
      <h2 className="mt-3 text-sm font-semibold">
        {t({ id: "home.no_search_matches", message: "No matching projects" })}
      </h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {t({
          id: "home.no_search_matches_description",
          message: `Nothing matches “${query.trim()}”. Try a different name or brief keyword.`,
        })}
      </p>
      <Button variant="outline" size="sm" className="mt-4" onClick={onClear}>
        {t({ id: "home.clear_search", message: "Clear search" })}
      </Button>
    </div>
  );
}

function NavItem({
  icon: Icon,
  label,
  count,
  badge,
  active,
  compact,
  onClick,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly count?: number;
  readonly badge?: string;
  readonly active: boolean;
  readonly compact: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors",
        compact && "justify-center",
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
      onClick={onClick}
    >
      <Icon className="size-4" />
      <span className={cn("truncate", !compact && "flex-1 text-left")}>
        {label}
      </span>
      {badge ? (
        <span
          className={cn(
            "rounded border border-border/70 bg-muted/60 px-1 py-px text-[9px] font-medium uppercase tracking-wide text-muted-foreground",
            compact && "hidden",
          )}
        >
          {badge}
        </span>
      ) : null}
      {count !== undefined ? (
        <span className="text-xs tabular-nums text-muted-foreground">
          {count}
        </span>
      ) : null}
    </button>
  );
}

function projectCounts(projects: readonly LocalProjectSummary[]) {
  const active = projects.filter((project) => !project.archivedAt);
  return {
    active: active.length,
    drafts: active.filter(isDraftProject).length,
    archived: projects.filter((project) => Boolean(project.archivedAt)).length,
  };
}

function formatProjectDate(timestamp: number, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
  }).format(new Date(timestamp));
}

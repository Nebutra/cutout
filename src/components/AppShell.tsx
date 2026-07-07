/**
 * AppShell (spec §4c) — root layout + global wiring.
 *
 * Owns the SINGLE live-preview analysis bridge (one Worker) and drives:
 *   - the debounced param auto-run (`useAutoRun`),
 *   - the manual ⌘R / Rerun trigger,
 *   - the global keyboard map (`useHotkeys`) → import / export / nav / rename.
 *
 * Layout is a column: TopBar · PipelineCanvas (grows) · StatusBar. The service
 * registry + query/tooltip/toast providers are mounted above this in App. The
 * canvas (spec §5) hosts the existing cutout flow as board + slices nodes, so
 * the whole pipeline — import → params → preview → slices → export — still works.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import { toast } from 'sonner'
import { TopBar } from './topbar/TopBar'
import { PipelineCanvas } from './canvas/PipelineCanvas'
import { ProjectHome } from './home/ProjectHome'
import { StatusBar } from './status/StatusBar'
import { SettingsDialog } from '@/components/settings/SettingsDialog'
import { SettingsUIProvider } from '@/components/settings/settings-ui'
import { LibraryDrawer } from '@/components/library/LibraryDrawer'
import { LibraryUIProvider } from '@/components/library/library-ui'
import { useAnalysisBridge } from '@/hooks/useAnalysisBridge'
import { useAiNativeControl } from '@/hooks/useAiNativeControl'
import { useAutoRun } from '@/hooks/useAutoRun'
import { useHotkeys, type HotkeyHandlers } from '@/hooks/useHotkeys'
import { useImageImport } from '@/hooks/useImageImport'
import { useExport } from '@/hooks/useExport'
import { useSliceNavigation } from '@/hooks/useSliceNavigation'
import { requestRename } from '@/hooks/useRenameIntent'
import { useStore, getStoreState } from '@/store'
import {
  createEmptyProjectRecord,
  createLocalProjectRepository,
  createProjectRecordFromStore,
  createRestoreInputFromProject,
  type LocalProjectRecord,
  type LocalProjectSummary,
} from '@/services/local/project-repository.local'
import { isErr } from '@/services/types'
import { isWorkspaceSnapshotEmpty, workspaceSnapshotFingerprint } from '@/workspace/workspace-snapshot'
import { cn } from '@/lib/utils'

type AppView = 'home' | 'project'
type ProjectLoadState = 'loading' | 'ready' | 'error'

interface ProjectShellState {
  readonly projects: readonly LocalProjectSummary[]
  readonly projectLoadState: ProjectLoadState
  readonly projectLoadError: string | null
  readonly activeProjectId: string | null
  readonly view: AppView
  readonly projectTabOpen: boolean
  readonly projectVersion: number
}

type ProjectShellAction =
  | { readonly type: 'projects-loading' }
  | {
      readonly type: 'projects-loaded'
      readonly projects: readonly LocalProjectSummary[]
      readonly activeProjectId: string | null
    }
  | { readonly type: 'projects-load-failed'; readonly error: string }
  | { readonly type: 'open-home' }
  | { readonly type: 'open-project'; readonly id: string }
  | { readonly type: 'close-project' }
  | { readonly type: 'create-project'; readonly project: LocalProjectSummary }
  | { readonly type: 'project-updated'; readonly project: LocalProjectSummary }
  | { readonly type: 'delete-project'; readonly id: string }
  | { readonly type: 'autosaved'; readonly project: LocalProjectSummary }

const INITIAL_PROJECT_SHELL_STATE: ProjectShellState = {
  projects: [],
  projectLoadState: 'loading',
  projectLoadError: null,
  activeProjectId: null,
  view: 'home',
  projectTabOpen: false,
  projectVersion: 0,
}

function projectShellReducer(
  state: ProjectShellState,
  action: ProjectShellAction,
): ProjectShellState {
  switch (action.type) {
    case 'projects-loading':
      return {
        ...state,
        projectLoadState: 'loading',
        projectLoadError: null,
      }
    case 'projects-loaded':
      return {
        ...state,
        projects: action.projects,
        projectLoadState: 'ready',
        projectLoadError: null,
        activeProjectId: action.activeProjectId,
        view: 'home',
        projectTabOpen: false,
      }
    case 'projects-load-failed':
      return {
        ...state,
        projectLoadState: 'error',
        projectLoadError: action.error,
      }
    case 'open-home':
      return { ...state, view: 'home' }
    case 'open-project':
      return {
        ...state,
        activeProjectId: action.id,
        view: 'project',
        projectTabOpen: true,
        projectVersion: state.projectVersion + 1,
      }
    case 'close-project':
      return { ...state, view: 'home', projectTabOpen: false }
    case 'create-project':
      return {
        ...state,
        projectLoadState: 'ready',
        projectLoadError: null,
        activeProjectId: action.project.id,
        view: 'project',
        projectTabOpen: true,
        projectVersion: state.projectVersion + 1,
      }
    case 'project-updated':
      return {
        ...state,
        projects: [
          action.project,
          ...state.projects.filter((item) => item.id !== action.project.id),
        ].sort((a, b) => b.updatedAt - a.updatedAt),
      }
    case 'delete-project': {
      const deletingActive = state.activeProjectId === action.id
      return {
        ...state,
        projects: state.projects.filter((item) => item.id !== action.id),
        activeProjectId: deletingActive ? null : state.activeProjectId,
        view: deletingActive ? 'home' : state.view,
        projectTabOpen: deletingActive ? false : state.projectTabOpen,
        projectVersion: deletingActive
          ? state.projectVersion + 1
          : state.projectVersion,
      }
    }
    case 'autosaved':
      return {
        ...state,
        projectLoadState: 'ready',
        projectLoadError: null,
        projects: [
          action.project,
          ...state.projects.filter((item) => item.id !== action.project.id),
        ].sort((a, b) => b.updatedAt - a.updatedAt),
      }
  }
}

export function AppShell() {
  // One bridge / one worker for the whole shell (auto-run + manual rerun).
  const { analyze } = useAnalysisBridge()
  useAutoRun(analyze)
  useAiNativeControl({ analyze })

  const { openPicker } = useImageImport()
  const { exportAll, exportOne } = useExport()
  const nav = useSliceNavigation()
  const clearSelection = useStore((s) => s.clearSelection)
  const resetProject = useStore((s) => s.resetProject)
  const restoreProject = useStore((s) => s.restoreProject)
  const brief = useStore((s) => s.brief)
  const workspaceFingerprint = useStore(workspaceAutosaveFingerprint)
  const projectRepository = useMemo(() => createLocalProjectRepository(), [])
  const [projectShell, dispatchProjectShell] = useReducer(
    projectShellReducer,
    INITIAL_PROJECT_SHELL_STATE,
  )
  const {
    projects,
    projectLoadState,
    projectLoadError,
    activeProjectId,
    view,
    projectTabOpen,
    projectVersion,
  } = projectShell
  const projectsRef = useRef<readonly LocalProjectSummary[]>([])
  const activeRecordRef = useRef<LocalProjectRecord | null>(null)
  const restoringRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const projectName = useMemo(() => projectNameFromBrief(brief), [brief])

  useEffect(() => {
    projectsRef.current = projects
  }, [projects])

  const loadProjects = useCallback(
    async (isCanceled: () => boolean = () => false) => {
      dispatchProjectShell({ type: 'projects-loading' })
      const result = await projectRepository.list()
      if (isCanceled()) return
      if (isErr(result)) {
        dispatchProjectShell({
          type: 'projects-load-failed',
          error: result.error,
        })
        toast.error('Could not load projects', { description: result.error })
        return
      }

      const rows = result.data.filter((project) => !isDisposableEmptyProject(project))
      const disposable = result.data.filter(isDisposableEmptyProject)
      if (disposable.length > 0) {
        await Promise.all(
          disposable.map((project) => projectRepository.remove(project.id)),
        )
      }

      if (isCanceled()) return
      dispatchProjectShell({
        type: 'projects-loaded',
        projects: rows,
        activeProjectId: rows[0]?.id ?? null,
      })
    },
    [projectRepository],
  )

  useEffect(() => {
    let canceled = false
    void loadProjects(() => canceled)
    return () => {
      canceled = true
    }
  }, [loadProjects])

  // Settings dialog open-state lives here so both the TopBar gear (via the
  // SettingsUI context) and the ⌘, hotkey can open it.
  const [settingsOpen, setSettingsOpen] = useState(false)
  const openSettings = useCallback(() => setSettingsOpen(true), [])
  const settingsUI = useMemo(() => ({ open: openSettings }), [openSettings])

  // The asset-library drawer open-state also lives here, so the TopBar button
  // (via the LibraryUI context) can open it.
  const [libraryOpen, setLibraryOpen] = useState(false)
  const openLibrary = useCallback(() => setLibraryOpen(true), [])
  const libraryUI = useMemo(() => ({ open: openLibrary }), [openLibrary])

  const openHome = useCallback(
    () => dispatchProjectShell({ type: 'open-home' }),
    [],
  )
  const openProjectById = useCallback(
    async (id: string) => {
      const loaded = await projectRepository.load(id)
      if (isErr(loaded)) {
        toast.error('Could not open project', { description: loaded.error })
        return
      }

      restoringRef.current = true
      try {
        activeRecordRef.current = loaded.data
        const restoreInput = await createRestoreInputFromProject(loaded.data)
        restoreProject(restoreInput)
        dispatchProjectShell({ type: 'open-project', id })
      } catch (error) {
        toast.error('Could not restore project', {
          description: error instanceof Error ? error.message : String(error),
        })
      } finally {
        queueMicrotask(() => {
          restoringRef.current = false
        })
      }
    },
    [projectRepository, restoreProject],
  )
  const openProject = useCallback(() => {
    const id = activeProjectId ?? projects[0]?.id
    if (id) void openProjectById(id)
  }, [activeProjectId, openProjectById, projects])
  const closeProject = useCallback(() => {
    dispatchProjectShell({ type: 'close-project' })
  }, [])
  const newProject = useCallback(async () => {
    const project = createEmptyProjectRecord()

    restoringRef.current = true
    activeRecordRef.current = project
    resetProject()
    dispatchProjectShell({ type: 'create-project', project })
    queueMicrotask(() => {
      restoringRef.current = false
    })
  }, [resetProject])
  const requestNewProject = useCallback(() => {
    void newProject()
  }, [newProject])
  const deleteProject = useCallback(
    async (id: string) => {
      const removed = await projectRepository.remove(id)
      if (isErr(removed)) {
        toast.error('Could not delete project', { description: removed.error })
        return
      }

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      if (activeProjectId === id) {
        restoringRef.current = true
        activeRecordRef.current = null
        resetProject()
        queueMicrotask(() => {
          restoringRef.current = false
        })
      }

      dispatchProjectShell({ type: 'delete-project', id })
      toast.success('Project deleted')
    },
    [activeProjectId, projectRepository, resetProject],
  )
  const archiveProject = useCallback(
    async (id: string) => {
      const archived = await projectRepository.archive(id, Date.now())
      if (isErr(archived)) {
        toast.error('Could not archive project', { description: archived.error })
        return
      }

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      if (activeProjectId === id) {
        restoringRef.current = true
        activeRecordRef.current = null
        resetProject()
        dispatchProjectShell({ type: 'close-project' })
        queueMicrotask(() => {
          restoringRef.current = false
        })
      }

      dispatchProjectShell({
        type: 'project-updated',
        project: projectSummaryFromRecord(archived.data),
      })
      toast.success('Project archived')
    },
    [activeProjectId, projectRepository, resetProject],
  )
  const restoreArchivedProject = useCallback(
    async (id: string) => {
      const restored = await projectRepository.archive(id, null)
      if (isErr(restored)) {
        toast.error('Could not restore project', { description: restored.error })
        return
      }

      dispatchProjectShell({
        type: 'project-updated',
        project: projectSummaryFromRecord(restored.data),
      })
      toast.success('Project restored')
    },
    [projectRepository],
  )

  useEffect(() => {
    if (!activeProjectId || restoringRef.current) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)

    saveTimerRef.current = setTimeout(() => {
      const state = getStoreState()
      if (!shouldPersistWorkspace(state)) return
      const current = projectsRef.current.find(
        (project) => project.id === activeProjectId,
      )
      const previous =
        activeRecordRef.current?.id === activeProjectId
          ? activeRecordRef.current
          : undefined
      const createdAt = current?.createdAt ?? Date.now()
      void createProjectRecordFromStore({
        id: activeProjectId,
        createdAt,
        state,
        previous,
      }).then(async (record) => {
        const saved = await projectRepository.save(record)
        if (isErr(saved)) {
          console.warn('[Cutout] project autosave failed:', saved.error)
          return
        }
        activeRecordRef.current = record
        dispatchProjectShell({ type: 'autosaved', project: record })
      })
    }, 250)

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [activeProjectId, projectRepository, workspaceFingerprint])

  const rerun = useCallback(() => {
    // Re-analyze current params (with slices) using the shell's own bridge.
    if (getStoreState().source.bitmap) analyze(true)
  }, [analyze])

  const exportSelected = useCallback(() => {
    const selected = getStoreState().analysis.slices.find((s) => s.selected)
    if (selected) exportOne(selected.id)
    else exportAll()
  }, [exportOne, exportAll])

  const renameSelected = useCallback(() => {
    const selected = getStoreState().analysis.slices.find((s) => s.selected)
    if (selected) requestRename(selected.id)
  }, [])

  const handlers = useMemo<HotkeyHandlers>(
    () => ({
      onImport: openPicker,
      onRerun: rerun,
      onExportAll: exportAll,
      onExportSelected: exportSelected,
      onPrev: nav.prev,
      onNext: nav.next,
      onMove: nav.move,
      onRename: renameSelected,
      onClear: clearSelection,
      onOpenSettings: openSettings,
    }),
    [
      openPicker,
      rerun,
      exportAll,
      exportSelected,
      nav.prev,
      nav.next,
      nav.move,
      renameSelected,
      clearSelection,
      openSettings,
    ],
  )
  useHotkeys(handlers)

  return (
    <SettingsUIProvider value={settingsUI}>
      <LibraryUIProvider value={libraryUI}>
        <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
          <TopBar
            view={view}
            projectName={projectName}
            projectTabOpen={projectTabOpen}
            onOpenHome={openHome}
            onOpenProject={openProject}
            onCloseProject={closeProject}
            onNewProject={requestNewProject}
            onRerun={rerun}
          />
          {view === 'home' ? (
            <ProjectHome
              activeProjectId={activeProjectId}
              projects={projects}
              loadState={projectLoadState}
              loadError={projectLoadError}
              onOpenProject={(id) => void openProjectById(id)}
              onArchiveProject={(id) => void archiveProject(id)}
              onRestoreProject={(id) => void restoreArchivedProject(id)}
              onDeleteProject={(id) => void deleteProject(id)}
              onNewProject={requestNewProject}
              onRetryProjects={() => void loadProjects()}
            />
          ) : null}
          <div className={cn('min-h-0 flex-1', view === 'project' ? 'flex' : 'hidden')}>
            <PipelineCanvas key={projectVersion} />
          </div>
          {view === 'project' ? <StatusBar /> : null}
        </div>
        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
        <LibraryDrawer open={libraryOpen} onOpenChange={setLibraryOpen} />
      </LibraryUIProvider>
    </SettingsUIProvider>
  )
}

function projectNameFromBrief(brief: string): string {
  const firstLine = brief.trim().split(/\n+/)[0]?.trim()
  if (!firstLine) return 'Untitled project'
  return firstLine.length > 42 ? `${firstLine.slice(0, 42)}...` : firstLine
}

function isDisposableEmptyProject(project: LocalProjectSummary): boolean {
  return (
    !project.archivedAt &&
    project.brief.trim().length === 0 &&
    project.assetCount === 0 &&
    !project.hasDesignMarkdown &&
    project.status === 'Empty' &&
    !project.thumbnail
  )
}

function projectSummaryFromRecord(record: LocalProjectRecord): LocalProjectSummary {
  return {
    id: record.id,
    name: record.name,
    brief: record.brief,
    assetCount: record.assetCount,
    hasDesignMarkdown: record.hasDesignMarkdown,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    archivedAt: record.archivedAt,
    thumbnail: record.thumbnail,
  }
}

function shouldPersistWorkspace(
  state: ReturnType<typeof getStoreState>,
): boolean {
  return Boolean(
    state.brief.trim() ||
      state.source.bitmap ||
      state.mockup ||
      state.designMarkdown ||
      state.analysis.slices.length > 0 ||
      !isWorkspaceSnapshotEmpty(state.workspaceSnapshot),
  )
}

function workspaceAutosaveFingerprint(state: ReturnType<typeof getStoreState>): string {
  const slices = state.analysis.slices
    .map((slice) => `${slice.id}:${slice.name}:${slice.width}x${slice.height}`)
    .join(',')
  const mockup = state.mockup
    ? `${state.mockup.width}x${state.mockup.height}:${state.mockup.blob.size}`
    : ''
  const design = state.designMarkdown
    ? `${state.designMarkdown.name}:${state.designMarkdown.importedAt}:${state.designMarkdown.content.length}`
    : ''
  const params = [
    state.params.threshold,
    state.params.minArea,
    state.params.mergeGap,
    state.params.padding,
  ].join(',')

  return [
    state.brief,
    state.source.imageId,
    mockup,
    design,
    workspaceSnapshotFingerprint(state.workspaceSnapshot),
    state.analysis.status,
    state.genPhase,
    params,
    slices,
  ].join('|')
}

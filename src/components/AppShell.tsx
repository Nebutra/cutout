/**
 * AppShell (spec §4c) — root layout + global wiring.
 *
 * Owns the SINGLE live-preview analysis bridge (one Worker) and drives:
 *   - the debounced param auto-run (`useAutoRun`),
 *   - the manual ⌘R / Rerun trigger,
 *   - the global keyboard map (`useHotkeys`) → import / export / nav / rename.
 *
 * Layout is a column: TopBar · PipelineCanvas (grows). The service
 * registry + query/tooltip/toast providers are mounted above this in App. The
 * canvas (spec §5) hosts the existing cutout flow as board + slices nodes, so
 * the whole pipeline — import → params → preview → slices → export — still works.
 */
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { TopBar } from "./topbar/TopBar";
import { ProjectHome } from "./home/ProjectHome";
import { SettingsUIProvider } from "@/components/settings/settings-ui";
import { HelpMenu } from "@/components/help/HelpMenu";
import type {
  DesignOsReceipt,
  DesignOsWorkbenchCallbacks,
  DesignOsWorkbenchTab,
  FigmaWorkbenchPreview,
} from "@/components/design-os-workbench/DesignOsWorkbench";
import type { DesignOsWorkbenchModel } from "@/components/design-os-workbench/DesignOsWorkbench";
import type { DesignOsCapabilityContext } from "@/components/design-os/model";
import type { LiveDesignOsArtifacts } from "@/components/design-os-workbench/live-model";
import { LibraryUIProvider } from "@/components/library/library-ui";
import { useAnalysisBridge } from "@/hooks/useAnalysisBridge";
import { useAiNativeControl } from "@/hooks/useAiNativeControl";
import { useAutoRun } from "@/hooks/useAutoRun";
import { useHotkeys, type HotkeyHandlers } from "@/hooks/useHotkeys";
import { useImageImport } from "@/hooks/useImageImport";
import { ImageImportActionsProvider } from "@/hooks/image-import-actions";
import { useExport } from "@/hooks/useExport";
import { useSliceNavigation } from "@/hooks/useSliceNavigation";
import { useModelAssignments } from "@/hooks/queries/ai-settings";
import { useProviders } from "@/hooks/queries/providers";
import { requestRename } from "@/hooks/useRenameIntent";
import { useStore, getStoreState } from "@/store";
import {
  createEmptyProjectRecord,
  createLocalProjectRepository,
  createProjectRecordFromStore,
  createRestoreInputFromProject,
  type LocalProjectRecord,
  type LocalProjectSummary,
} from "@/services/local/project-repository.local";
import { isErr } from "@/services/types";
import type { BundleRepository } from "@/services/types";
import type { DesignDocument } from "@/design-ir";
import type { DeliveryExecutor } from "@/delivery-center";
import { useServices } from "@/services/context";
import type {
  AuthoringKind,
  AuthoringPreview,
} from "@/design-os-operations/authoring";
import type { FigmaSnapshotPreview } from "@/design-os-operations/figma-snapshot";
import type { SourceIngestPreview } from "@/design-os-operations/operations";
import type { EverythingInput } from "@/ingestion/everything-inbox";
import type { NativeRepositoryScanResult } from "@/platform/native";
import type { RepositoryIngestMetadata } from "@/components/design-os-workbench/SourceIngestDialog";
import {
  isWorkspaceSnapshotEmpty,
  textFingerprint,
  workspaceSnapshotFingerprint,
} from "@/workspace/workspace-snapshot";
import {
  loadWorkspaceNavigation,
  enterWorkspaceSurface,
  migrateLegacyDesignOsView,
  projectDeliverReturnControl,
  projectWorkspaceSurface,
  returnFromDeliver,
  saveWorkspaceNavigation,
  WORKSPACE_NAVIGATION_EVENT,
  type WorkspaceNavigation,
  type WorkspaceNavigationSession,
} from "@/workspace/navigation";
import { cn } from "@/lib/utils";
import { withViewTransition } from "@/lib/view-transition";
import { createNewTaskGate, projectNewTaskIntent } from "@/workspace/new-task-transition";
import { createLocalStorageCrashMarkerStore, markCleanExit, startCrashSession } from "@/local-recovery";
import { recordAiNativeDiagnostic } from "@/services/ai-native/diagnostics";
import { getAuthorizedWorkspace, subscribeAuthorizedWorkspace } from "@/platform/authorized-workspace";
import { bindTauriAgentHostLifecycle, createTauriAgentHostService } from "@/agent-host/tauri-service";
import { projectDurableHostEvents } from "@/agent-host/run-event-projection";
import { createRunEventStore } from "@/agent-runtime/run-events";
import { createDesktopUpdateOrchestrator } from "@/updater/service";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const PipelineCanvas = lazy(() =>
  import("./canvas/PipelineCanvas").then((module) => ({
    default: module.PipelineCanvas,
  })),
);
const SettingsDialog = lazy(() =>
  import("@/components/settings/SettingsDialog").then((module) => ({
    default: module.SettingsDialog,
  })),
);
const LibraryDrawer = lazy(() =>
  import("@/components/library/LibraryDrawer").then((module) => ({
    default: module.LibraryDrawer,
  })),
);
const DesignOsWorkbench = lazy(() =>
  import("@/components/design-os-workbench/DesignOsWorkbench").then(
    (module) => ({
      default: module.DesignOsWorkbench,
    }),
  ),
);

function deliverySurfaceTab(tab: string): DesignOsWorkbenchTab | null {
  switch (tab) {
    case "delivery":
    case "kits":
    case "components":
    case "starter":
      return tab;
    default:
      return null;
  }
}
const SourceIngestDialog = lazy(() =>
  import("@/components/design-os-workbench/SourceIngestDialog").then(
    (module) => ({
      default: module.SourceIngestDialog,
    }),
  ),
);

type AppView = "home" | "project";
type ProjectLoadState = "loading" | "ready" | "error";

interface ProjectShellState {
  readonly projects: readonly LocalProjectSummary[];
  readonly projectLoadState: ProjectLoadState;
  readonly projectLoadError: string | null;
  readonly activeProjectId: string | null;
  readonly view: AppView;
  readonly projectTabOpen: boolean;
  readonly projectVersion: number;
}

type ProjectShellAction =
  | { readonly type: "projects-loading" }
  | {
      readonly type: "projects-loaded";
      readonly projects: readonly LocalProjectSummary[];
      readonly activeProjectId: string | null;
    }
  | { readonly type: "projects-load-failed"; readonly error: string }
  | { readonly type: "open-home" }
  | { readonly type: "new-task" }
  | { readonly type: "open-project"; readonly id: string }
  | { readonly type: "focus-project" }
  | { readonly type: "close-project" }
  | { readonly type: "create-project"; readonly project: LocalProjectSummary }
  | { readonly type: "project-updated"; readonly project: LocalProjectSummary }
  | { readonly type: "delete-project"; readonly id: string }
  | { readonly type: "autosaved"; readonly project: LocalProjectSummary };

const INITIAL_PROJECT_SHELL_STATE: ProjectShellState = {
  projects: [],
  projectLoadState: "loading",
  projectLoadError: null,
  activeProjectId: null,
  view: "home",
  projectTabOpen: false,
  projectVersion: 0,
};

function projectShellReducer(
  state: ProjectShellState,
  action: ProjectShellAction,
): ProjectShellState {
  switch (action.type) {
    case "projects-loading":
      return {
        ...state,
        projectLoadState: "loading",
        projectLoadError: null,
      };
    case "projects-loaded":
      return {
        ...state,
        projects: action.projects,
        projectLoadState: "ready",
        projectLoadError: null,
        activeProjectId: action.activeProjectId,
        view: "home",
        projectTabOpen: false,
      };
    case "projects-load-failed":
      return {
        ...state,
        projectLoadState: "error",
        projectLoadError: action.error,
      };
    case "open-home":
      return { ...state, view: "home" };
    case "new-task":
      return { ...state, activeProjectId: null, view: "home", projectTabOpen: false, projectVersion: state.projectVersion + 1 };
    case "open-project":
      return {
        ...state,
        activeProjectId: action.id,
        view: "project",
        projectTabOpen: true,
        projectVersion: state.projectVersion + 1,
      };
    case "focus-project":
      // Re-focusing the already-open project tab (e.g. Home -> project tab
      // click, or TabsMenu selection) — only the view changes. Bumping
      // projectVersion here would remount PipelineCanvas and silently drop
      // in-memory canvas state (annotations, sidebar toggles) with no data
      // reload to justify it.
      return { ...state, view: "project" };
    case "close-project":
      return { ...state, view: "home", projectTabOpen: false };
    case "create-project":
      return {
        ...state,
        projectLoadState: "ready",
        projectLoadError: null,
        activeProjectId: action.project.id,
        view: "project",
        projectTabOpen: true,
        projectVersion: state.projectVersion + 1,
      };
    case "project-updated":
      return {
        ...state,
        projects: [
          action.project,
          ...state.projects.filter((item) => item.id !== action.project.id),
        ].sort((a, b) => b.updatedAt - a.updatedAt),
      };
    case "delete-project": {
      const deletingActive = state.activeProjectId === action.id;
      return {
        ...state,
        projects: state.projects.filter((item) => item.id !== action.id),
        activeProjectId: deletingActive ? null : state.activeProjectId,
        view: deletingActive ? "home" : state.view,
        projectTabOpen: deletingActive ? false : state.projectTabOpen,
        projectVersion: deletingActive
          ? state.projectVersion + 1
          : state.projectVersion,
      };
    }
    case "autosaved":
      return {
        ...state,
        projectLoadState: "ready",
        projectLoadError: null,
        projects: [
          action.project,
          ...state.projects.filter((item) => item.id !== action.project.id),
        ].sort((a, b) => b.updatedAt - a.updatedAt),
      };
  }
}

export function AppShell() {
  const crashSessionStartedRef = useRef(false);
  useEffect(() => {
    if (crashSessionStartedRef.current) return;
    crashSessionStartedRef.current = true;
    const marker = createLocalStorageCrashMarkerStore(localStorage);
    const result = startCrashSession(marker, { sessionId: crypto.randomUUID(), now: new Date().toISOString() });
    if (result.crashed) recordAiNativeDiagnostic({ level: "warn", scope: "startup", message: result.safeMode ? "Repeated unclean startup; safe mode recommended." : "Recovered from an unclean startup.", details: { crashCount: result.marker.crashCount, safeMode: result.safeMode } });
    const clean = () => markCleanExit(marker);
    window.addEventListener("pagehide", clean, { once: true });
    return () => window.removeEventListener("pagehide", clean);
  }, []);
  useEffect(() => bindTauriAgentHostLifecycle({
    getWorkspace: getAuthorizedWorkspace,
    subscribe: subscribeAuthorizedWorkspace,
    create: (workspaceHandle) => createTauriAgentHostService({ workspaceHandle, instanceId: `desktop.${crypto.randomUUID()}` }),
    onSnapshot: (snapshot) => {
      const state = getStoreState(), workspace = state.workspaceSnapshot;
      if (!workspace) return;
      const current = workspace.agentRunEvents ?? createRunEventStore();
      const projected = projectDurableHostEvents(current, snapshot.events);
      if (projected.events.length === current.events.length) return;
      state.setWorkspaceSnapshot({ ...workspace, agentRunEvents: projected });
    },
  }), []);
  // One bridge / one worker for the whole shell (auto-run + manual rerun).
  const { analyze } = useAnalysisBridge();
  useAutoRun(analyze);
  useAiNativeControl({ analyze });

  const { importFile, openPicker, pickFile, inputProps } = useImageImport();
  const { exportAll, exportOne } = useExport();
  const services = useServices();
  const nav = useSliceNavigation();
  const clearSelection = useStore((s) => s.clearSelection);
  const resetProject = useStore((s) => s.resetProject);
  const restoreProject = useStore((s) => s.restoreProject);
  const projectName = useStore((s) =>
    projectNameFromSources(
      s.workspaceSnapshot?.prototypePlan?.product.projectName,
      s.workspaceSnapshot?.prototypePlan?.product.name,
      s.brief,
    ),
  );
  const workspaceFingerprint = useStore(workspaceAutosaveFingerprint);
  // A new snapshot object may contain binary material whose byte length is
  // unchanged. Keep the reference as an autosave dependency; the canonical IR
  // content hash below decides whether it is actually a durable change.
  const workspaceSnapshot = useStore((s) => s.workspaceSnapshot);
  const designDocument = useStore(
    (s) => s.workspaceSnapshot?.designDocument ?? null,
  );
  const modelAssignments = useModelAssignments();
  const providerConfigurations = useProviders();
  const projectRepository = useMemo(() => createLocalProjectRepository(), []);
  const [projectShell, dispatchProjectShell] = useReducer(
    projectShellReducer,
    INITIAL_PROJECT_SHELL_STATE,
  );
  const [workspaceNavigation, setWorkspaceNavigation] =
    useState<WorkspaceNavigation>(() => loadWorkspaceNavigation());
  const workspaceReturnToRef = useRef<WorkspaceNavigationSession["returnTo"]>(
    workspaceNavigation.mode === "deliver" ? undefined : workspaceNavigation,
  );
  const workspaceSurface = projectWorkspaceSurface(workspaceNavigation);
  const deliverReturnControl = projectDeliverReturnControl({ current: workspaceNavigation, returnTo: workspaceReturnToRef.current });
  const inlineDeliveryTab = workspaceSurface.surface === "inline-main"
    ? deliverySurfaceTab(workspaceSurface.tab)
    : null;
  useEffect(() => {
    if (workspaceNavigation.mode !== "deliver") workspaceReturnToRef.current = workspaceNavigation;
    try {
      saveWorkspaceNavigation(workspaceNavigation);
    } catch {
      /* optional local preference */
    }
  }, [workspaceNavigation]);
  useEffect(() => {
    const sync = (event: Event) =>
      setWorkspaceNavigation(
        (event as CustomEvent<WorkspaceNavigation>).detail ??
          loadWorkspaceNavigation(),
      );
    window.addEventListener(WORKSPACE_NAVIGATION_EVENT, sync);
    return () => window.removeEventListener(WORKSPACE_NAVIGATION_EVENT, sync);
  }, []);
  const {
    projects,
    projectLoadState,
    projectLoadError,
    activeProjectId,
    view,
    projectTabOpen,
    projectVersion,
  } = projectShell;
  const projectsRef = useRef<readonly LocalProjectSummary[]>([]);
  const activeRecordRef = useRef<LocalProjectRecord | null>(null);
  const restoringRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedFingerprintRef = useRef("");
  const saveActiveProjectNowRef = useRef<
    (projectId?: string | null) => Promise<boolean>
  >(async () => false);
  const activeProjectIdRef = useRef<string | null>(activeProjectId);
  activeProjectIdRef.current = activeProjectId;
  const updateController = useMemo(() => createDesktopUpdateOrchestrator({
    prepareRecoverySnapshot: () => activeProjectIdRef.current
      ? saveActiveProjectNowRef.current(activeProjectIdRef.current)
      : Promise.resolve(true),
  }), []);
  useEffect(() => {
    let timer: number | undefined;
    let disposed = false;
    void updateController.initialize().then(() => {
      if (!disposed) timer = window.setTimeout(() => void updateController.autoCheck(true), 8_000);
    });
    return () => { disposed = true; if (timer !== undefined) window.clearTimeout(timer); };
  }, [updateController]);

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  const saveActiveProjectNow = useCallback(
    async (projectId = activeProjectId): Promise<boolean> => {
      if (!projectId || restoringRef.current) return false;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      const state = getStoreState();
      if (!shouldPersistWorkspace(state)) return false;

      const current = projectsRef.current.find(
        (project) => project.id === projectId,
      );
      const previous =
        activeRecordRef.current?.id === projectId
          ? activeRecordRef.current
          : undefined;
      const createdAt = previous?.createdAt ?? current?.createdAt ?? Date.now();

      const record = await createProjectRecordFromStore({
        id: projectId,
        createdAt,
        state,
        previous,
      });
      const fingerprint = [
        projectId,
        workspaceAutosaveFingerprint(state),
        record.designDocumentContentHash ?? "",
      ].join(":");
      if (fingerprint === lastSavedFingerprintRef.current) return true;
      // The repository compiler is the authority for the portable Design IR.
      // Write it back only when the captured store state is still current. The
      // snapshot fingerprint intentionally treats this derived document as a
      // stable terminal projection, so this cannot restart a projection loop.
      if (
        record.workspace &&
        workspaceAutosaveFingerprint(getStoreState()) ===
          workspaceAutosaveFingerprint(state)
      ) {
        getStoreState().setWorkspaceSnapshot(record.workspace);
      }
      const saved = await projectRepository.save(record);
      if (isErr(saved)) {
        console.warn("[Cutout] project autosave failed:", saved.error);
        return false;
      }

      activeRecordRef.current = record;
      lastSavedFingerprintRef.current = fingerprint;
      dispatchProjectShell({ type: "autosaved", project: record });
      return true;
    },
    [activeProjectId, projectRepository],
  );

  useEffect(() => {
    saveActiveProjectNowRef.current = saveActiveProjectNow;
  }, [saveActiveProjectNow]);

  const loadProjects = useCallback(
    async (isCanceled: () => boolean = () => false) => {
      dispatchProjectShell({ type: "projects-loading" });
      const result = await projectRepository.list();
      if (isCanceled()) return;
      if (isErr(result)) {
        dispatchProjectShell({
          type: "projects-load-failed",
          error: result.error,
        });
        toast.error("Could not load projects", { description: result.error });
        return;
      }

      const rows = result.data.filter(
        (project) => !isDisposableEmptyProject(project),
      );
      const disposable = result.data.filter(isDisposableEmptyProject);
      if (disposable.length > 0) {
        await Promise.all(
          disposable.map((project) => projectRepository.remove(project.id)),
        );
      }

      if (isCanceled()) return;
      dispatchProjectShell({
        type: "projects-loaded",
        projects: rows,
        activeProjectId: rows[0]?.id ?? null,
      });
    },
    [projectRepository],
  );

  useEffect(() => {
    let canceled = false;
    void loadProjects(() => canceled);
    return () => {
      canceled = true;
    };
  }, [loadProjects]);

  // Settings dialog open-state lives here so both the TopBar gear (via the
  // SettingsUI context) and the ⌘, hotkey can open it.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recentlyClosedTabs, setRecentlyClosedTabs] = useState<
    readonly { readonly id: string; readonly name: string }[]
  >([]);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const settingsUI = useMemo(() => ({ open: openSettings }), [openSettings]);

  // The asset-library drawer open-state also lives here, so the TopBar button
  // (via the LibraryUI context) can open it.
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [openHomeLibrary, setOpenHomeLibrary] = useState(false);
  const [newProjectSignal, setNewProjectSignal] = useState(0);
  const newTaskGateRef = useRef(createNewTaskGate());
  const openLibrary = useCallback(() => setLibraryOpen(true), []);

  const [designOsOpen, setDesignOsOpen] = useState(false);
  const [advancedAuditOpen, setAdvancedAuditOpen] = useState(false);
  const [sourceIngestOpen, setSourceIngestOpen] = useState(false);
  const [sourceIngestPreview, setSourceIngestPreview] = useState<
    SourceIngestPreview | undefined
  >();
  const [repositoryIngest, setRepositoryIngest] = useState<{
    previewId: string;
    scan: NativeRepositoryScanResult;
    role: string;
    license: string;
  }>();
  const [designKitReceipt, setDesignKitReceipt] = useState<{
    revisionId: string;
    receipt: DesignOsReceipt;
  } | null>(null);
  const [specimenKit, setSpecimenKit] = useState<{
    revisionId: string;
    files: readonly { path: string; content: string }[];
    composedByAgent: boolean;
  } | null>(null);
  const [figmaSnapshotPreview, setFigmaSnapshotPreview] =
    useState<FigmaSnapshotPreview>();
  const [figmaBindings, setFigmaBindings] = useState<{
    revisionId: string;
    bindings: FigmaSnapshotPreview["bindings"];
  }>();
  const [authoringPreview, setAuthoringPreview] = useState<AuthoringPreview>();
  const [designOsModelFactory, setDesignOsModelFactory] = useState<
    | ((
        document: NonNullable<typeof designDocument>,
        capabilities?: DesignOsCapabilityContext,
        artifacts?: LiveDesignOsArtifacts,
      ) => DesignOsWorkbenchModel)
    | null
  >(null);
  useEffect(() => {
    if (
      (!designOsOpen && !advancedAuditOpen && workspaceSurface.surface !== "inline-main") ||
      !designDocument ||
      designOsModelFactory
    )
      return;
    let active = true;
    void import("@/components/design-os-workbench/live-model").then(
      (liveModel) => {
        if (!active) return;
        setDesignOsModelFactory(() => liveModel.buildLiveDesignOsWorkbenchModel);
      },
    );
    return () => {
      active = false;
    };
  }, [
    designDocument,
    designOsModelFactory,
    designOsOpen,
    advancedAuditOpen,
    workspaceSurface.surface,
  ]);
  const designOsModel = useMemo(() => {
    if (!designDocument || !designOsModelFactory) return null;
    return {
      ...designOsModelFactory(
        designDocument,
        {
          assignments: modelAssignments.data,
          providers: providerConfigurations.data,
          connectorConfigurationPending:
            modelAssignments.isPending || providerConfigurations.isPending,
        },
        {
          ...(sourceIngestPreview
            ? { ingestPreview: sourceIngestPreview }
            : {}),
          ...(repositoryIngest ? { repositoryIngest } : {}),
          ...(designKitReceipt?.revisionId === designDocument.revision.id
            ? { designKitReceipt: designKitReceipt.receipt }
            : {}),
          ...(figmaSnapshotPreview
            ? {
                figmaPreview: {
                  id: figmaSnapshotPreview.id,
                  fileName: figmaSnapshotPreview.snapshot.file.name,
                  summary: figmaSnapshotPreview.summary,
                  collections: figmaSnapshotPreview.collectionCount,
                  tokens: figmaSnapshotPreview.tokenCount,
                  components: figmaSnapshotPreview.componentCount,
                  codeConnect: figmaSnapshotPreview.codeConnectCount,
                  warnings: figmaSnapshotPreview.warnings,
                } satisfies FigmaWorkbenchPreview,
              }
            : {}),
          ...(figmaBindings?.revisionId === designDocument.revision.id
            ? { figmaExportReady: true }
            : {}),
          authoring: workspaceSnapshot?.designOsAuthoring,
          deliveryPlan: workspaceSnapshot?.deliveryPlan,
          deliveryReceipt: workspaceSnapshot?.deliveryReceipt,
          ...(authoringPreview ? { authoringPreview } : {}),
        },
      ),
      workflowPacks: [],
      ...(specimenKit?.revisionId === designDocument.revision.id
        ? { specimen: specimenKit }
        : {}),
    };
  }, [
    designDocument,
    modelAssignments.data,
    modelAssignments.isPending,
    providerConfigurations.data,
    providerConfigurations.isPending,
    sourceIngestPreview,
    repositoryIngest,
    designKitReceipt,
    specimenKit,
    figmaSnapshotPreview,
    figmaBindings,
    workspaceSnapshot?.designOsAuthoring,
    workspaceSnapshot?.deliveryPlan,
    workspaceSnapshot?.deliveryReceipt,
    authoringPreview,
    designOsModelFactory,
  ]);
  const [designOsDefaultTab, setDesignOsDefaultTab] =
    useState<DesignOsWorkbenchTab>("overview");
  const [designOsSurfaceMode, setDesignOsSurfaceMode] = useState<
    "inspector" | "deliver"
  >("inspector");
  const openDesignOs = useCallback(
    (tab: DesignOsWorkbenchTab = "overview") => {
      const navigation = migrateLegacyDesignOsView(tab);
      const surface = projectWorkspaceSurface(navigation);
      if (surface.surface === "inline-main") {
        const action = tab === "delivery" ? "deliver" : tab === "kits" || tab === "components" || tab === "starter" ? tab : "deliver";
        const session = enterWorkspaceSurface({ current: workspaceNavigation, returnTo: workspaceReturnToRef.current }, action);
        workspaceReturnToRef.current = session.returnTo;
        setWorkspaceNavigation(session.current);
      } else setWorkspaceNavigation(navigation);
      const deliver = surface.surface === "inline-main";
      setDesignOsSurfaceMode(deliver ? "deliver" : "inspector");
      setDesignOsDefaultTab(
        tab === "delivery" && !designOsModel?.delivery ? "kits" : tab,
      );
      setDesignOsOpen(surface.surface === "canvas-inspector");
    },
    [designOsModel, workspaceNavigation],
  );

  const prepareWorkbenchSource = useCallback(
    async (input: EverythingInput, _repository?: RepositoryIngestMetadata) => {
      const current = getStoreState().workspaceSnapshot?.designDocument;
      if (!current) {
        toast.error("No DesignDocument is available");
        return;
      }
      const { prepareSourceIngest } =
        await import("@/design-os-operations/operations");
      const prepared = await prepareSourceIngest(current, input, {
        actorId: "human:desktop",
      });
      if (isErr(prepared)) {
        toast.error("Could not prepare source", {
          description: prepared.error,
        });
        return;
      }
      const snapshot = getStoreState().workspaceSnapshot;
      if (!snapshot?.designDocument) return;
      const { applyPreparedSourceIngest } =
        await import("@/design-os-operations/operations");
      const applied = applyPreparedSourceIngest(
        snapshot.designDocument,
        prepared.data,
        {
          revisionId: `revision:ingest:${crypto.randomUUID()}`,
          createdAt: new Date().toISOString(),
          actorId: "human:desktop",
        },
      );
      if (isErr(applied)) {
        toast.error("Could not add source", { description: applied.error });
        return;
      }
      getStoreState().setWorkspaceSnapshot({
        ...snapshot,
        designDocument: applied.data,
      });
      setSourceIngestPreview(undefined);
      setRepositoryIngest(undefined);
      toast.success(
        prepared.data.impact.noChanges
          ? "Source already exists"
          : "Source added",
      );
    },
    [],
  );

  const prepareWorkbenchSources = useCallback(
    async (inputs: readonly EverythingInput[]) => {
      const current = getStoreState().workspaceSnapshot?.designDocument;
      if (!current) {
        toast.error("No DesignDocument is available");
        return;
      }
      const { prepareSourceIngestBatch } =
        await import("@/design-os-operations/operations");
      const prepared = await prepareSourceIngestBatch(current, inputs, {
        actorId: "human:desktop",
      });
      if (isErr(prepared)) {
        toast.error("Could not prepare sources", {
          description: prepared.error,
        });
        return;
      }
      const snapshot = getStoreState().workspaceSnapshot;
      if (!snapshot?.designDocument) return;
      const { applyPreparedSourceIngest } =
        await import("@/design-os-operations/operations");
      const applied = applyPreparedSourceIngest(
        snapshot.designDocument,
        prepared.data,
        {
          revisionId: `revision:ingest:${crypto.randomUUID()}`,
          createdAt: new Date().toISOString(),
          actorId: "human:desktop",
        },
      );
      if (isErr(applied)) {
        toast.error("Could not add sources", { description: applied.error });
        return;
      }
      getStoreState().setWorkspaceSnapshot({
        ...snapshot,
        designDocument: applied.data,
      });
      setSourceIngestPreview(undefined);
      setRepositoryIngest(undefined);
      toast.success(
        prepared.data.impact.noChanges
          ? "Sources already exist"
          : `${prepared.data.impact.sourcesAdded} sources added`,
      );
    },
    [],
  );

  const approveWorkbenchSource = useCallback(
    async (requestedPreviewId: string) => {
      const preview = sourceIngestPreview;
      const snapshot = getStoreState().workspaceSnapshot;
      const current = snapshot?.designDocument;
      if (
        !preview ||
        !snapshot ||
        !current ||
        sourcePreviewId(preview) !== requestedPreviewId
      ) {
        toast.error("Source preview is no longer available");
        return;
      }
      const { applyPreparedSourceIngest } =
        await import("@/design-os-operations/operations");
      const applied = applyPreparedSourceIngest(current, preview, {
        revisionId: `revision:ingest:${crypto.randomUUID()}`,
        createdAt: new Date().toISOString(),
        actorId: "human:desktop",
      });
      if (isErr(applied)) {
        toast.error("Could not apply source", { description: applied.error });
        return;
      }
      getStoreState().setWorkspaceSnapshot({
        ...snapshot,
        designDocument: applied.data,
      });
      setSourceIngestPreview(undefined);
      setRepositoryIngest(undefined);
      toast.success(
        preview.impact.noChanges
          ? "Source was already present"
          : "Source added to Design IR",
      );
    },
    [sourceIngestPreview],
  );

  const exportWorkbenchKit = useCallback(
    async (itemId: string) => {
      const current = getStoreState().workspaceSnapshot?.designDocument;
      if (!current) return;
      const {
        compileBrandKitOperation,
        compileDesignKitOperation,
        exportCompiledBundle,
      } = await import("@/design-os-operations/operations");
      const { headlessTokenAdapters } = await import("@/design-kit/headless");
      if (itemId === "kit:brand") {
        const definition =
          getStoreState().workspaceSnapshot?.designOsAuthoring?.brand;
        const compiled = await compileBrandKitOperation(current, definition);
        if (isErr(compiled)) {
          toast.error("Brand Kit is blocked", { description: compiled.error });
          return;
        }
        const exported = await exportCompiledBundle(current, services.bundles, {
          kind: "brand-kit",
          bundle: compiled.data,
          name: safeBundleName(`${current.meta.title}-brand-kit`),
        });
        if (isErr(exported)) {
          toast.error("Could not export Brand Kit", {
            description: exported.error,
          });
          return;
        }
        toast.success(
          exported.data.canceled
            ? "Brand Kit export canceled"
            : `${exported.data.fileCount} Brand Kit files exported`,
        );
        return;
      }
      if (itemId !== "kit:design-system") return;
      const compiled = await compileDesignKitOperation(
        current,
        headlessTokenAdapters(current.tokens),
      );
      if (isErr(compiled)) {
        toast.error("Design Kit is blocked", { description: compiled.error });
        return;
      }
      const exported = await exportCompiledBundle(current, services.bundles, {
        kind: "design-kit",
        bundle: compiled.data,
        name: safeBundleName(`${current.meta.title}-design-kit`),
      });
      if (isErr(exported)) {
        toast.error("Could not export Design Kit", {
          description: exported.error,
        });
        return;
      }
      if (exported.data.canceled) {
        toast.info("Design Kit export canceled");
        return;
      }
      const receipt: DesignOsReceipt = {
        id: `receipt:${current.revision.id}:${exported.data.bundleDir ?? "bundle"}`,
        title: `${exported.data.fileCount} files exported`,
        detail: exported.data.bundleDir ?? "User-selected folder",
        createdAt: new Date().toISOString(),
        digest: exported.data.files[0]?.sha256,
      };
      setDesignKitReceipt({ revisionId: current.revision.id, receipt });
      toast.success("Design Kit exported", { description: receipt.detail });
    },
    [services.bundles],
  );

  const generateSpecimen = useCallback(async () => {
    const current = getStoreState().workspaceSnapshot?.designDocument;
    if (!current) {
      toast.error("No DesignDocument is available");
      return;
    }
    const { compileDesignKitOperation } = await import(
      "@/design-os-operations/operations"
    );
    const { headlessTokenAdapters } = await import("@/design-kit/headless");
    const compiled = await compileDesignKitOperation(
      current,
      headlessTokenAdapters(current.tokens),
    );
    if (isErr(compiled)) {
      toast.error("Could not generate specimen", {
        description: compiled.error,
      });
      return;
    }
    let files = compiled.data.files.map((file) => ({
      path: file.path,
      content: file.content,
    }));

    // The deterministic demo.html above is always valid, but it's a generic
    // template — it has no idea what this product actually is. When a chat
    // model is configured, ask it to compose a demo that reflects the real
    // needs/components instead, and swap it in only if that succeeds.
    const chat = modelAssignments.data?.chat;
    let composedByAgent = false;
    if (chat) {
      const { composeDemoHtmlWithAgent } = await import("@/design-kit");
      const tokensCss =
        files.find((file) => file.path === "tokens.css")?.content ?? "";
      const composed = await composeDemoHtmlWithAgent({
        document: current,
        tokensCss,
        chat,
        generation: services.generation,
      });
      if (composed) {
        composedByAgent = true;
        files = files.map((file) =>
          file.path === "demo.html" ? { ...file, content: composed } : file,
        );
      }
    }

    setSpecimenKit({ revisionId: current.revision.id, files, composedByAgent });
    toast.success("Specimen generated", {
      description: composedByAgent
        ? "demo.html composed by the Agent for this product."
        : "demo.html used the deterministic template — connect a chat model for a product-aware demo.",
    });
  }, [modelAssignments.data?.chat, services.generation]);

  const syncDemoHtml = useCallback(
    (file: File) => {
      void (async () => {
        await prepareWorkbenchSource({
          type: "local-file",
          path: file.name,
          bytes: new Uint8Array(await file.arrayBuffer()),
          sourceKind: "document",
          mediaType: file.type || "text/html",
          title: `${file.name} (edited demo)`,
          role: "reference",
          license: { kind: "proprietary", holder: "Project owner" },
        });
      })();
    },
    [prepareWorkbenchSource],
  );

  const previewUnifiedDelivery = useCallback(
    async (targetIds: readonly string[]) => {
      const snapshot = getStoreState().workspaceSnapshot;
      const current = snapshot?.designDocument;
      if (
        !snapshot ||
        !current ||
        targetIds.length !== 1 ||
        targetIds[0] !== "delivery:design-system"
      ) {
        toast.error(
          "Selected delivery targets are not executable in this host",
        );
        return;
      }
      const { UnifiedDeliveryCenter } = await import("@/delivery-center");
      const executor = await designSystemDeliveryExecutor(
        current,
        services.bundles,
      );
      const center = new UnifiedDeliveryCenter([executor]);
      const outcomeId =
        snapshot.outcome?.contract.id ?? `outcome:${current.meta.id}`;
      const outcomeRevision = snapshot.outcome?.runId ?? current.revision.id;
      const request = {
        protocol: "cutout.delivery-center.v1" as const,
        id: `delivery-request:${crypto.randomUUID()}`,
        outcomeId,
        outcomeRevision,
        designRevision: {
          documentId: current.meta.id,
          revisionId: current.revision.id,
          revisionNumber: current.revision.number,
        },
        targets: [
          {
            id: "delivery:design-system",
            kind: "design-system" as const,
            destination: {
              kind: "managed-export" as const,
              ref: "native-folder-picker",
            },
            requiredGates: ["provenance" as const],
            dependsOn: [],
            metadata: {},
          },
        ],
      };
      try {
        const plan = await center.preview(request);
        getStoreState().setWorkspaceSnapshot({
          ...snapshot,
          deliveryRequest: request,
          deliveryPlan: plan,
          deliveryReceipt: null,
        });
      } catch (error) {
        toast.error("Could not preview delivery", {
          description: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [services.bundles],
  );

  const approveUnifiedDelivery = useCallback(
    async (planId: string) => {
      const snapshot = getStoreState().workspaceSnapshot;
      const current = snapshot?.designDocument;
      const request = snapshot?.deliveryRequest;
      const persistedPlan = snapshot?.deliveryPlan;
      if (
        !snapshot ||
        !current ||
        !request ||
        !persistedPlan ||
        persistedPlan.id !== planId
      ) {
        toast.error("Delivery preview is no longer available");
        return;
      }
      const { UnifiedDeliveryCenter } = await import("@/delivery-center");
      const center = new UnifiedDeliveryCenter([
        await designSystemDeliveryExecutor(current, services.bundles),
      ]);
      try {
        const replayed = await center.preview(request);
        if (replayed.id !== persistedPlan.id)
          throw new Error(
            "Delivery preview changed after reload; review it again.",
          );
        const receipt = await center.execute(
          replayed.id,
          `approval:${crypto.randomUUID()}`,
          {
            documentId: current.meta.id,
            revisionId: current.revision.id,
            revisionNumber: current.revision.number,
          },
        );
        getStoreState().setWorkspaceSnapshot({
          ...getStoreState().workspaceSnapshot!,
          deliveryRequest: request,
          deliveryPlan: replayed,
          deliveryReceipt: receipt,
        });
        if (receipt.status === "succeeded") toast.success("Delivery complete");
        else toast.error("Delivery needs attention");
      } catch (error) {
        toast.error("Delivery failed", {
          description: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [services.bundles],
  );

  const prepareWorkbenchAuthoring = useCallback(
    async (kind: AuthoringKind, value: unknown) => {
      const current = getStoreState().workspaceSnapshot?.designDocument;
      if (!current) return;
      const { prepareAuthoring } =
        await import("@/design-os-operations/authoring");
      const prepared = await prepareAuthoring(current, kind, value);
      if (isErr(prepared)) {
        toast.error("Declaration is invalid", { description: prepared.error });
        return;
      }
      setAuthoringPreview(prepared.data);
      toast.success("Declaration preview is ready");
    },
    [],
  );

  const approveWorkbenchAuthoring = useCallback(
    async (id: string) => {
      const preview = authoringPreview;
      const snapshot = getStoreState().workspaceSnapshot;
      const current = snapshot?.designDocument;
      if (!preview || preview.id !== id || !snapshot || !current) {
        toast.error("Declaration preview is no longer available");
        return;
      }
      const { applyAuthoring } =
        await import("@/design-os-operations/authoring");
      const applied = applyAuthoring(
        current,
        snapshot.designOsAuthoring ?? undefined,
        preview,
      );
      if (isErr(applied)) {
        toast.error("Could not save declaration", {
          description: applied.error,
        });
        return;
      }
      getStoreState().setWorkspaceSnapshot({
        ...snapshot,
        designOsAuthoring: applied.data,
      });
      setAuthoringPreview(undefined);
      toast.success("Declaration saved for this revision");
    },
    [authoringPreview],
  );

  const exportWorkbenchComponents = useCallback(
    async (itemId: string) => {
      if (itemId !== "component:manifest") return;
      const snapshot = getStoreState().workspaceSnapshot;
      const current = snapshot?.designDocument;
      if (!current) return;
      const { compileComponentsOperation, exportCompiledBundle } =
        await import("@/design-os-operations/operations");
      const compiled = await compileComponentsOperation(
        current,
        snapshot?.designOsAuthoring?.componentCandidates,
      );
      if (isErr(compiled)) {
        toast.error("Components are blocked", { description: compiled.error });
        return;
      }
      const exported = await exportCompiledBundle(current, services.bundles, {
        kind: "components",
        bundle: compiled.data,
        name: safeBundleName(`${current.meta.title}-components`),
      });
      if (isErr(exported)) {
        toast.error("Could not export components", {
          description: exported.error,
        });
        return;
      }
      toast.success(
        exported.data.canceled
          ? "Component export canceled"
          : `${exported.data.fileCount} component files exported`,
      );
    },
    [services.bundles],
  );

  const exportWorkbenchStarter = useCallback(
    async (itemId: string) => {
      const framework =
        itemId === "starter:next"
          ? "next-app-router"
          : itemId === "starter:vite"
            ? "vite-react"
            : undefined;
      if (!framework) return;
      const snapshot = getStoreState().workspaceSnapshot;
      const current = snapshot?.designDocument;
      const authoring = snapshot?.designOsAuthoring;
      const config = authoring?.starterConfigs?.find(
        (entry) => entry.framework === framework,
      );
      if (!current || !config) {
        toast.error("Starter configuration is missing");
        return;
      }
      const {
        compileComponentsOperation,
        compileDesignKitOperation,
        compileStarterOperation,
        exportCompiledBundle,
      } = await import("@/design-os-operations/operations");
      const [{ headlessTokenAdapters }, { componentManifestSchema }] =
        await Promise.all([
          import("@/design-kit/headless"),
          import("@/components-compiler/compiler"),
        ]);
      const kit = await compileDesignKitOperation(
        current,
        headlessTokenAdapters(current.tokens),
      );
      const components = await compileComponentsOperation(
        current,
        authoring?.componentCandidates,
      );
      if (isErr(kit) || isErr(components)) {
        toast.error("Starter inputs are invalid", {
          description: isErr(kit)
            ? kit.error
            : isErr(components)
              ? components.error
              : "",
        });
        return;
      }
      const manifestFile = components.data.files.find(
        (file) => file.path === "components.manifest.json",
      );
      const manifest = componentManifestSchema.safeParse(
        manifestFile ? JSON.parse(manifestFile.content) : undefined,
      );
      if (!manifest.success) {
        toast.error("Component Manifest could not be verified");
        return;
      }
      const compiled = await compileStarterOperation(current, {
        framework,
        kit: kit.data,
        candidates: manifest.data,
        assetBindings: config.assetBindings,
        existingPaths: config.existingPaths,
      });
      if (isErr(compiled)) {
        toast.error("Starter is blocked", { description: compiled.error });
        return;
      }
      const exported = await exportCompiledBundle(current, services.bundles, {
        kind: "starter",
        bundle: compiled.data,
        name: safeBundleName(`${current.meta.title}-${framework}`),
      });
      if (isErr(exported)) {
        toast.error("Could not export starter", {
          description: exported.error,
        });
        return;
      }
      toast.success(
        exported.data.canceled
          ? "Starter export canceled"
          : `${exported.data.fileCount} starter files exported`,
      );
    },
    [services.bundles],
  );

  const prepareWorkbenchFigma = useCallback(async (snapshot: unknown) => {
    const current = getStoreState().workspaceSnapshot?.designDocument;
    if (!current) return;
    const { prepareFigmaSnapshot } =
      await import("@/design-os-operations/figma-snapshot");
    const prepared = await prepareFigmaSnapshot(current, snapshot);
    if (isErr(prepared)) {
      toast.error("Could not preview Figma snapshot", {
        description: prepared.error,
      });
      return;
    }
    setFigmaSnapshotPreview(prepared.data);
    toast.success("Figma snapshot is ready for review");
  }, []);

  const approveWorkbenchFigma = useCallback(
    async (previewId: string) => {
      const preview = figmaSnapshotPreview;
      const snapshot = getStoreState().workspaceSnapshot;
      const current = snapshot?.designDocument;
      if (!preview || !snapshot || !current || preview.id !== previewId) {
        toast.error("Figma preview is no longer available");
        return;
      }
      const { applyFigmaSnapshot } =
        await import("@/design-os-operations/figma-snapshot");
      const applied = await applyFigmaSnapshot(current, preview, {
        revisionId: `revision:figma:${crypto.randomUUID()}`,
        createdAt: new Date().toISOString(),
      });
      if (isErr(applied)) {
        toast.error("Could not apply Figma snapshot", {
          description: applied.error,
        });
        return;
      }
      getStoreState().setWorkspaceSnapshot({
        ...snapshot,
        designDocument: applied.data,
      });
      setFigmaBindings({
        revisionId: applied.data.revision.id,
        bindings: preview.bindings,
      });
      setFigmaSnapshotPreview(undefined);
      toast.success("Figma tokens and component bindings added to Design IR");
    },
    [figmaSnapshotPreview],
  );

  const exportWorkbenchFigma = useCallback(async () => {
    const current = getStoreState().workspaceSnapshot?.designDocument;
    if (
      !current ||
      !figmaBindings ||
      figmaBindings.revisionId !== current.revision.id
    ) {
      toast.error("Figma bindings do not match the current revision");
      return;
    }
    const { exportFigmaVariables } =
      await import("@/design-os-operations/figma-snapshot");
    const exported = await exportFigmaVariables(
      current,
      figmaBindings.bindings,
      services.bundles,
    );
    if (isErr(exported)) {
      toast.error("Could not export Figma Variables", {
        description: exported.error,
      });
      return;
    }
    toast.success(
      exported.data.canceled
        ? "Figma export canceled"
        : `${exported.data.fileCount} Figma files exported`,
    );
  }, [figmaBindings, services.bundles]);

  const openHome = useCallback(() => {
    void saveActiveProjectNow();
    withViewTransition(() => dispatchProjectShell({ type: "open-home" }));
  }, [saveActiveProjectNow]);
  const openGlobalLibrary = useCallback(() => {
    setOpenHomeLibrary(true);
    openHome();
  }, [openHome]);
  const libraryUI = useMemo(
    () => ({ open: openLibrary, openGlobal: openGlobalLibrary }),
    [openGlobalLibrary, openLibrary],
  );
  const openProjectById = useCallback(
    async (id: string) => {
      if (activeProjectId && activeProjectId !== id) {
        await saveActiveProjectNow(activeProjectId);
      }

      const loaded = await projectRepository.load(id);
      if (isErr(loaded)) {
        if (activeRecordRef.current?.id === id) {
          withViewTransition(() =>
            dispatchProjectShell({ type: "open-project", id }),
          );
          return;
        }

        if (isMissingProjectError(loaded.error)) {
          if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
          }
          if (activeProjectId === id) {
            restoringRef.current = true;
            activeRecordRef.current = null;
            resetProject();
            queueMicrotask(() => {
              restoringRef.current = false;
            });
          }
          dispatchProjectShell({ type: "delete-project", id });
          toast.warning("Project is no longer available", {
            description: "The stale project tab was closed.",
          });
          return;
        }

        toast.error("Could not open project", { description: loaded.error });
        return;
      }

      restoringRef.current = true;
      try {
        activeRecordRef.current = loaded.data;
        lastSavedFingerprintRef.current = "";
        const restoreInput = await createRestoreInputFromProject(loaded.data);
        restoreProject(restoreInput);
        withViewTransition(() =>
          dispatchProjectShell({ type: "open-project", id }),
        );
      } catch (error) {
        toast.error("Could not restore project", {
          description: error instanceof Error ? error.message : String(error),
        });
      } finally {
        queueMicrotask(() => {
          restoringRef.current = false;
        });
      }
    },
    [
      activeProjectId,
      projectRepository,
      resetProject,
      restoreProject,
      saveActiveProjectNow,
    ],
  );
  const openProject = useCallback(() => {
    const id = activeProjectId ?? projects[0]?.id;
    if (!id) return;
    if (projectTabOpen && activeRecordRef.current?.id === id) {
      withViewTransition(() => dispatchProjectShell({ type: "focus-project" }));
      return;
    }
    void openProjectById(id);
  }, [activeProjectId, openProjectById, projectTabOpen, projects]);
  const closeProject = useCallback(() => {
    const closedId = activeRecordRef.current?.id;
    if (closedId) {
      const closedName = projectName;
      setRecentlyClosedTabs((prev) =>
        [
          { id: closedId, name: closedName },
          ...prev.filter((tab) => tab.id !== closedId),
        ].slice(0, 5),
      );
    }
    void saveActiveProjectNow();
    withViewTransition(() => dispatchProjectShell({ type: "close-project" }));
  }, [projectName, saveActiveProjectNow]);
  const reopenClosedTab = useCallback(
    (id: string) => {
      setRecentlyClosedTabs((prev) => prev.filter((tab) => tab.id !== id));
      void openProjectById(id);
    },
    [openProjectById],
  );
  const newProject = useCallback(async () => {
    await saveActiveProjectNow();
    const project = createEmptyProjectRecord();

    restoringRef.current = true;
    activeRecordRef.current = project;
    lastSavedFingerprintRef.current = "";
    resetProject();
    withViewTransition(() =>
      dispatchProjectShell({ type: "create-project", project }),
    );
    queueMicrotask(() => {
      restoringRef.current = false;
    });
  }, [resetProject, saveActiveProjectNow]);
  const requestNewProject = useCallback(() => {
    void newProject();
  }, [newProject]);
  const requestNewTask = useCallback(() => {
    const requestId = crypto.randomUUID();
    void newTaskGateRef.current.run(async () => {
      const blankProject = view === "project" && !shouldPersistWorkspace(getStoreState());
      const transition = projectNewTaskIntent({
        view,
        blankProject,
        hasHomeDraft: false,
        resetSignal: newProjectSignal,
      }, requestId);
      if (!transition.applied) return;
      if (transition.saveActiveProject) await saveActiveProjectNow();
      restoringRef.current = true;
      resetProject();
      activeRecordRef.current = null;
      lastSavedFingerprintRef.current = "";
      setOpenHomeLibrary(false);
      setNewProjectSignal(transition.state.resetSignal);
      withViewTransition(() => dispatchProjectShell({ type: "new-task" }));
      queueMicrotask(() => { restoringRef.current = false; });
    });
  }, [newProjectSignal, resetProject, saveActiveProjectNow, view]);
  const startProjectWithBrief = useCallback(
    (brief: string, attachments: readonly File[] = []) => {
      void (async () => {
        await newProject();
        const state = getStoreState();
        state.setBrief(brief);
        const inputs: EverythingInput[] = [];
        for (const file of attachments) {
          if (file.type.startsWith("video/")) continue;
          inputs.push({
            type: "local-file",
            path: file.name,
            bytes: new Uint8Array(await file.arrayBuffer()),
            sourceKind: file.type.startsWith("image/")
              ? "screenshot"
              : "document",
            mediaType: file.type || undefined,
            title: file.name,
            role: "reference",
            license: { kind: "proprietary", holder: "Project owner" },
          });
        }
        if (inputs.length) await prepareWorkbenchSources(inputs);
        state.requestAgentRun("create-assets");
      })();
    },
    [newProject, prepareWorkbenchSources],
  );
  const importBoardIntoNewProject = useCallback(() => {
    pickFile((file) => {
      void (async () => {
        await newProject();
        await importFile(file);
      })();
    });
  }, [importFile, newProject, pickFile]);
  const deleteProject = useCallback(
    async (id: string) => {
      const removed = await projectRepository.remove(id);
      if (isErr(removed)) {
        toast.error("Could not delete project", { description: removed.error });
        return;
      }

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (activeProjectId === id) {
        restoringRef.current = true;
        activeRecordRef.current = null;
        resetProject();
        queueMicrotask(() => {
          restoringRef.current = false;
        });
      }

      dispatchProjectShell({ type: "delete-project", id });
      toast.success("Project deleted");
    },
    [activeProjectId, projectRepository, resetProject],
  );
  const archiveProject = useCallback(
    async (id: string) => {
      if (activeProjectId === id) await saveActiveProjectNow(id);
      const archived = await projectRepository.archive(id, Date.now());
      if (isErr(archived)) {
        toast.error("Could not archive project", {
          description: archived.error,
        });
        return;
      }

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (activeProjectId === id) {
        restoringRef.current = true;
        activeRecordRef.current = null;
        resetProject();
        withViewTransition(() =>
          dispatchProjectShell({ type: "close-project" }),
        );
        queueMicrotask(() => {
          restoringRef.current = false;
        });
      }

      dispatchProjectShell({
        type: "project-updated",
        project: projectSummaryFromRecord(archived.data),
      });
      toast.success("Project archived");
    },
    [activeProjectId, projectRepository, resetProject, saveActiveProjectNow],
  );
  const restoreArchivedProject = useCallback(
    async (id: string) => {
      const restored = await projectRepository.archive(id, null);
      if (isErr(restored)) {
        toast.error("Could not restore project", {
          description: restored.error,
        });
        return;
      }

      dispatchProjectShell({
        type: "project-updated",
        project: projectSummaryFromRecord(restored.data),
      });
      toast.success("Project restored");
    },
    [projectRepository],
  );
  const updateProjectMetadata = useCallback(
    async (
      id: string,
      patch: {
        readonly expectedMetadataUpdatedAt: number;
        readonly name?: string;
        readonly pinnedAt?: number | null;
      },
    ) => {
      const updated = await projectRepository.updateMetadata(id, patch);
      if (isErr(updated)) {
        toast.error("Could not update project", { description: updated.error });
        return;
      }
      if (activeRecordRef.current?.id === id)
        activeRecordRef.current = updated.data;
      dispatchProjectShell({
        type: "project-updated",
        project: projectSummaryFromRecord(updated.data),
      });
    },
    [projectRepository],
  );

  useEffect(() => {
    if (!activeProjectId || restoringRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(() => {
      void saveActiveProjectNowRef.current(activeProjectId);
    }, 250);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [activeProjectId, workspaceFingerprint, workspaceSnapshot]);

  useEffect(
    () => () => {
      void saveActiveProjectNowRef.current();
    },
    [],
  );

  useEffect(() => {
    const flush = () => {
      void saveActiveProjectNowRef.current();
    };
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };

    window.addEventListener("blur", flush);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => {
      window.removeEventListener("blur", flush);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", flushWhenHidden);
    };
  }, []);

  const rerun = useCallback(() => {
    // Re-analyze current params (with slices) using the shell's own bridge.
    if (getStoreState().source.bitmap) analyze(true);
  }, [analyze]);

  const exportSelected = useCallback(() => {
    const selected = getStoreState().analysis.slices.find((s) => s.selected);
    if (selected) exportOne(selected.id);
    else exportAll();
  }, [exportOne, exportAll]);

  const renameSelected = useCallback(() => {
    const selected = getStoreState().analysis.slices.find((s) => s.selected);
    if (selected) requestRename(selected.id);
  }, []);

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
  );
  useHotkeys(handlers);

  const workbenchCallbacks: DesignOsWorkbenchCallbacks = {
    onRequestSourceIngest: () => setSourceIngestOpen(true),
    onApproveSourceIngest: approveWorkbenchSource,
    onOpenSource: (sourceId) => {
      const href = designOsModel?.sources.find(
        (source) => source.id === sourceId,
      )?.href;
      if (href) window.open(href, "_blank", "noopener,noreferrer");
    },
    onExportKit: exportWorkbenchKit,
    onGenerateSpecimen: generateSpecimen,
    onSyncDemoHtml: syncDemoHtml,
    onExportComponent: exportWorkbenchComponents,
    onExportStarter: exportWorkbenchStarter,
    onPrepareAuthoring: prepareWorkbenchAuthoring,
    onApproveAuthoring: approveWorkbenchAuthoring,
    onPrepareFigmaSnapshot: prepareWorkbenchFigma,
    onApproveFigmaSnapshot: approveWorkbenchFigma,
    onExportFigmaVariables: exportWorkbenchFigma,
    onPreviewDelivery: previewUnifiedDelivery,
    onApproveDelivery: approveUnifiedDelivery,
    onPrepareMissingDelivery: () => setDesignOsOpen(false),
    onAddDeliveryDestination: openSettings,
  };

  return (
    <ImageImportActionsProvider value={{ openPicker }}>
      <SettingsUIProvider value={settingsUI}>
        <LibraryUIProvider value={libraryUI}>
          <div className="relative flex h-full min-h-0 flex-col bg-background text-foreground">
            <HelpMenu />
            <TopBar
              view={view}
              projectName={projectName}
              projectTabOpen={projectTabOpen}
              recentlyClosedTabs={recentlyClosedTabs.filter(
                (tab) => !(projectTabOpen && tab.id === activeProjectId),
              )}
              onReopenTab={reopenClosedTab}
              onOpenHome={openHome}
              onOpenProject={openProject}
              onCloseProject={closeProject}
              onNewProject={requestNewTask}
              onRerun={rerun}
              onArchiveProject={() => {
                if (activeProjectId) void archiveProject(activeProjectId);
              }}
              onOpenDesignOs={() => openDesignOs("overview")}
            />
            {view === "home" ? (
              <ProjectHome
                initialSection={openHomeLibrary ? "library" : "start"}
                resetToStartSignal={newProjectSignal}
                activeProjectId={activeProjectId}
                projects={projects}
                loadState={projectLoadState}
                loadError={projectLoadError}
                onOpenProject={(id) => void openProjectById(id)}
                onArchiveProject={(id) => void archiveProject(id)}
                onRestoreProject={(id) => void restoreArchivedProject(id)}
                onDeleteProject={(id) => void deleteProject(id)}
                onRenameProject={(project, name) =>
                  void updateProjectMetadata(project.id, {
                    expectedMetadataUpdatedAt: project.metadataUpdatedAt ?? 0,
                    name,
                  })
                }
                onPinProject={(project, pinned) =>
                  void updateProjectMetadata(project.id, {
                    expectedMetadataUpdatedAt: project.metadataUpdatedAt ?? 0,
                    pinnedAt: pinned ? Date.now() : null,
                  })
                }
                onStartWithBrief={startProjectWithBrief}
                onImportBoard={importBoardIntoNewProject}
                onOpenEverythingInbox={() => {
                  if (!activeProjectId) requestNewProject();
                  setSourceIngestOpen(true);
                }}
                onRetryProjects={() => void loadProjects()}
              />
            ) : null}
            <div
              className={cn(
                "relative min-h-0 flex-1 flex-col",
                view === "project" ? "flex" : "hidden",
              )}
            >
              {view === "project" && inlineDeliveryTab ? (
                designOsModel ? (
                  <Suspense fallback={<DeferredSurfaceFallback label="Loading delivery workspace" />}>
                    <DesignOsWorkbench
                      key={inlineDeliveryTab}
                      model={designOsModel}
                      defaultTab={inlineDeliveryTab}
                      surfaceMode="deliver"
                      className="h-full"
                      callbacks={workbenchCallbacks}
                      onBackToWorkspace={() => {
                        const session = returnFromDeliver({ current: workspaceNavigation, returnTo: workspaceReturnToRef.current });
                        workspaceReturnToRef.current = session.returnTo;
                        setWorkspaceNavigation(session.current);
                      }}
                      backLabel={deliverReturnControl.label}
                      backMobileLabel={deliverReturnControl.mobileLabel}
                    />
                  </Suspense>
                ) : <DeferredSurfaceFallback label="Loading delivery workspace" />
              ) : null}
              {view === "project" ? (
                <div className={cn("min-h-0 flex-1 flex-col", inlineDeliveryTab ? "hidden" : "flex")} aria-hidden={Boolean(inlineDeliveryTab)} inert={Boolean(inlineDeliveryTab)} data-slot="project-workspace-surface">
                  <Suspense fallback={<DeferredSurfaceFallback label="Loading project workspace" />}>
                    <PipelineCanvas
                      key={projectVersion}
                      onOpenDesignOs={openDesignOs}
                      advanced={workspaceNavigation.advanced}
                      onOpenAdvanced={() => setAdvancedAuditOpen(true)}
                    />
                  </Suspense>
                </div>
              ) : null}
            </div>
          </div>
          {settingsOpen ? (
            <Suspense fallback={<OverlayLoading label="Loading settings" />}>
              <SettingsDialog
                open
                onOpenChange={setSettingsOpen}
                projects={projects}
                onRestoreProject={(id) => void restoreArchivedProject(id)}
                onDeleteProject={(id) => void deleteProject(id)}
                prepareUpdateRecoverySnapshot={() => activeProjectId ? saveActiveProjectNowRef.current(activeProjectId) : Promise.resolve(true)}
                updateController={updateController}
              />
            </Suspense>
          ) : null}
          <DeveloperAuditDialog
            open={advancedAuditOpen}
            onOpenChange={setAdvancedAuditOpen}
            model={designOsModel}
          />
          {libraryOpen ? (
            <Suspense
              fallback={<OverlayLoading label="Loading asset library" />}
            >
              <LibraryDrawer open onOpenChange={setLibraryOpen} />
            </Suspense>
          ) : null}
          <Dialog open={designOsOpen && workspaceSurface.surface === "canvas-inspector"} onOpenChange={setDesignOsOpen}>
            <DialogContent className="h-[min(48rem,88vh)] w-[calc(100vw-1rem)] min-w-0 max-w-5xl gap-0 overflow-hidden p-0">
              <DialogHeader className="sr-only">
                <DialogTitle>{designOsSurfaceMode === "deliver" ? "Deliver" : "Canvas inspector"}</DialogTitle>
                <DialogDescription>
                  Inspect, ingest, compile, and export verified project
                  deliverables.
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1">
                {designOsModel ? (
                  <Suspense
                    fallback={
                      <DeferredSurfaceFallback label={designOsSurfaceMode === "deliver" ? "Loading delivery workspace" : "Loading canvas inspector"} />
                    }
                  >
                    <DesignOsWorkbench
                      key={designOsDefaultTab}
                      model={designOsModel}
                      defaultTab={designOsDefaultTab}
                      surfaceMode={designOsSurfaceMode}
                      className="h-full"
                      callbacks={workbenchCallbacks}
                    />
                  </Suspense>
                ) : (
                  <p
                    role="status"
                    className="border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground"
                  >
                    No DesignDocument is available for this project yet.
                  </p>
                )}
              </div>
            </DialogContent>
          </Dialog>
          {sourceIngestOpen ? (
            <Suspense
              fallback={<OverlayLoading label="Loading source import" />}
            >
              <SourceIngestDialog
                open
                onOpenChange={setSourceIngestOpen}
                onPrepare={prepareWorkbenchSource}
                onPrepareBatch={prepareWorkbenchSources}
                nativeRepositoryAvailable={
                  services.repositorySources.nativeAvailable
                }
                onSelectRepository={async () => {
                  const scanned =
                    await services.repositorySources.selectAndScan();
                  if (isErr(scanned)) throw new Error(scanned.error);
                  return scanned.data;
                }}
              />
            </Suspense>
          ) : null}
          <input
            {...inputProps}
            type="file"
            accept="image/*,.md,.markdown"
            className="hidden"
          />
        </LibraryUIProvider>
      </SettingsUIProvider>
    </ImageImportActionsProvider>
  );
}

export function DeferredSurfaceFallback({ label }: { readonly label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="grid h-full min-h-24 place-items-center text-sm text-muted-foreground"
    >
      {label}
    </div>
  );
}

function OverlayLoading({ label }: { readonly label: string }) {
  return (
    <span role="status" aria-live="polite" className="sr-only">
      {label}
    </span>
  );
}

function projectNameFromSources(
  ...sources: Array<string | null | undefined>
): string {
  for (const source of sources) {
    const firstLine = source?.trim().split(/\n+/)[0]?.trim();
    if (firstLine)
      return firstLine.length > 42 ? `${firstLine.slice(0, 42)}...` : firstLine;
  }
  return "Untitled project";
}

function safeBundleName(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (normalized || "cutout-design-kit").slice(0, 128);
}

function sourcePreviewId(preview: SourceIngestPreview): string {
  return [
    preview.base.documentId,
    preview.base.revisionId,
    ...preview.patch.sources.map((source) => source.id),
  ].join("|");
}

async function designSystemDeliveryExecutor(
  document: DesignDocument,
  bundles: BundleRepository,
): Promise<DeliveryExecutor> {
  const { compileDesignKitOperation, exportCompiledBundle } =
    await import("@/design-os-operations/operations");
  const { headlessTokenAdapters } = await import("@/design-kit/headless");
  const compile = async () => {
    const result = await compileDesignKitOperation(
      document,
      headlessTokenAdapters(document.tokens),
    );
    if (isErr(result)) throw new Error(result.error);
    return result.data;
  };
  return {
    kind: "design-system",
    async preview(target) {
      const kit = await compile();
      return {
        targetId: target.id,
        kind: "design-system",
        destination: target.destination,
        effects: ["managed-export"],
        estimatedCostUsd: 0,
        currency: "USD",
        files: kit.files.map((file) => ({
          path: file.path,
          sha256: file.sha256,
        })),
        warnings: [],
      };
    },
    async execute(target) {
      const startedAt = new Date().toISOString();
      try {
        const kit = await compile();
        const exported = await exportCompiledBundle(document, bundles, {
          kind: "design-kit",
          bundle: kit,
          name: safeBundleName(`${document.meta.title}-design-kit`),
        });
        if (isErr(exported)) throw new Error(exported.error);
        if (exported.data.canceled)
          return {
            targetId: target.id,
            kind: "design-system",
            status: "cancelled",
            destination: target.destination,
            startedAt,
            completedAt: new Date().toISOString(),
            artifacts: [],
            quality: [],
            kitManifests: [],
            error: {
              code: "user-cancelled",
              message: "The folder selection was cancelled.",
            },
          };
        const manifest = kit.files.find(
          (file) => file.path === "manifest.json",
        );
        if (!manifest) throw new Error("Design Kit manifest is missing.");
        return {
          targetId: target.id,
          kind: "design-system",
          status: "succeeded",
          destination: target.destination,
          startedAt,
          completedAt: new Date().toISOString(),
          artifacts: exported.data.files.map((file) => ({
            path: file.path,
            sha256: file.sha256,
            mediaType: mediaTypeForDelivery(file.path),
          })),
          quality: [
            {
              gate: "provenance",
              status: "passed",
              evidenceIds: [manifest.sha256],
            },
          ],
          kitManifests: [
            {
              kind: "design-system",
              id: `design-kit:${document.revision.id}`,
              sha256: manifest.sha256,
            },
          ],
        };
      } catch (error) {
        return {
          targetId: target.id,
          kind: "design-system",
          status: "failed",
          destination: target.destination,
          startedAt,
          completedAt: new Date().toISOString(),
          artifacts: [],
          quality: [],
          kitManifests: [],
          error: {
            code: "delivery-failed",
            message:
              error instanceof Error
                ? error.message
                : "Design System delivery failed.",
          },
        };
      }
    },
  };
}

function mediaTypeForDelivery(path: string): string {
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".css")) return "text/css";
  if (path.endsWith(".md")) return "text/markdown";
  if (path.endsWith(".ts")) return "text/typescript";
  return "text/plain";
}

function isDisposableEmptyProject(project: LocalProjectSummary): boolean {
  return (
    !project.archivedAt &&
    project.brief.trim().length === 0 &&
    project.assetCount === 0 &&
    !project.hasDesignMarkdown &&
    project.status === "Empty" &&
    !project.thumbnail
  );
}

function projectSummaryFromRecord(
  record: LocalProjectRecord,
): LocalProjectSummary {
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
    pinnedAt: record.pinnedAt,
    metadataUpdatedAt: record.metadataUpdatedAt,
    customName: record.customName,
    thumbnail: record.thumbnail,
  };
}

function isMissingProjectError(error: string): boolean {
  return /Project\s+"[^"]+"\s+was not found\./.test(error);
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
  );
}

function workspaceAutosaveFingerprint(
  state: ReturnType<typeof getStoreState>,
): string {
  const slices = state.analysis.slices
    .map((slice) => `${slice.id}:${slice.name}:${slice.width}x${slice.height}`)
    .join(",");
  const mockup = state.mockup
    ? `${state.mockup.width}x${state.mockup.height}:${state.mockup.blob.size}`
    : "";
  const design = state.designMarkdown
    ? `${state.designMarkdown.name}:${state.designMarkdown.importedAt}:${textFingerprint(state.designMarkdown.content)}`
    : "";
  const params = [
    state.params.threshold,
    state.params.minArea,
    state.params.mergeGap,
    state.params.padding,
  ].join(",");

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
  ].join("|");
}

function DeveloperAuditDialog({
  open,
  onOpenChange,
  model,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly model: DesignOsWorkbenchModel | null;
}) {
  const [section, setSection] = useState<"ir" | "receipts">("ir");
  const report = model
    ? {
        protocol: "cutout.redacted-audit.v1",
        document: {
          id: model.summary.documentId,
          revisionId: model.summary.revisionId,
          revisionNumber: model.summary.revisionNumber,
          counts: model.summary.counts,
        },
        receipts: {
          governance: model.governance
            ? {
                id: model.governance.receipt.receiptId,
                status: model.governance.receipt.status,
                evidenceHash: model.governance.receipt.evidenceHash,
                findingCount: model.governance.receipt.findings.length,
              }
            : null,
          delivery: model.delivery?.receipt
            ? {
                id: model.delivery.receipt.id,
                status: model.delivery.receipt.status,
                targetCount: model.delivery.receipt.targets.length,
              }
            : null,
        },
      }
    : null;
  const href = report
    ? `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(report, null, 2))}`
    : undefined;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Developer audit</DialogTitle>
          <DialogDescription>
            Read-only project structure and redacted evidence. Prompts, source
            content, secrets and local paths are excluded.
          </DialogDescription>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground">Host diagnostics</summary>
            <p className="mt-2">Accessibility inspection: {typeof window !== "undefined" && (window as typeof window & { axe?: unknown }).axe ? "Axe host available" : "Axe host unavailable"}</p>
          </details>
        </DialogHeader>
        {report ? (
          <div className="space-y-4 text-sm">
            <div
              role="tablist"
              aria-label="Developer audit sections"
              className="flex gap-2"
            >
              {(
                [
                  ["ir", "Design IR"],
                  ["receipts", "Receipts"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={section === id}
                  onClick={() => setSection(id)}
                  className={cn(
                    "rounded-md px-2 py-1",
                    section === id && "bg-muted",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {section === "ir" ? (
              <section role="tabpanel" aria-label="Design IR audit">
                <h3 className="font-medium">Design IR</h3>
                <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <dt>Revision</dt>
                  <dd>{report.document.revisionNumber}</dd>
                  {Object.entries(report.document.counts).map(
                    ([key, value]) => (
                      <>
                        <dt key={`${key}-label`} className="capitalize">
                          {key}
                        </dt>
                        <dd key={key}>{value}</dd>
                      </>
                    ),
                  )}
                </dl>
              </section>
            ) : null}
            {section === "receipts" ? (
              <section role="tabpanel" aria-label="Receipts audit">
                <h3 className="font-medium">Receipts</h3>
                <p className="text-xs text-muted-foreground">
                  {report.receipts.governance ? 1 : 0} governance ·{" "}
                  {report.receipts.delivery ? 1 : 0} delivery
                </p>
              </section>
            ) : null}
            <a
              download="cutout-audit.redacted.json"
              href={href}
              className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium"
            >
              Export redacted report
            </a>
          </div>
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            No canonical Design IR is available for this project yet.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

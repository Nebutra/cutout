import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ComponentType,
  type ReactNode,
} from "react";
import { useLingui } from "@lingui/react/macro";
import {
  Boxes,
  Check,
  ChevronUp,
  ChevronRight,
  Copy,
  Download,
  Files as FilesIcon,
  ImageIcon,
  Layers3,
  Loader2,
  MessageCircle,
  MessageSquareText,
  PackageCheck,
  PackageOpen,
  Palette,
  Grid3x3,
  Map as MapIcon,
  PanelLeft,
  PanelLeftClose,
  Plus,
  Route,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Tag,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { getStoreState, useStore } from "@/store";
import type { SliceInput } from "@/store/types";
import {
  isSliceConsumable,
  useSelectedSlice,
  useSource,
  useSlices,
  useStatus,
} from "@/store/selectors";
import { useImageImportActions } from "@/hooks/image-import-actions";
import { useExport } from "@/hooks/useExport";
import { useServices } from "@/services/context";
import { createCutoutResultSink } from "@/services/cutout-result-sink";
import { isErr } from "@/services/types";
import type { ModelAssignment } from "@/services/ai/model-assignment-types";
import { ensureProviderVerification } from "@/services/ai/provider-verification";
import type {
  ComposerModelPolicy,
  ComposerThinkingPolicy,
} from "@/agent-runtime/execution-policy";
import {
  composerRouteNotices,
  composerModelValue,
  fixedModelValue,
  lockComposerRoute,
  parseComposerModelValue,
  supportsWebSearch,
  type LockedComposerRoute,
} from "@/agent-runtime/composer-execution";
import { recordAiNativeDiagnostic } from "@/services/ai-native/diagnostics";
import { useModelAssignments } from "@/hooks/queries/ai-settings";
import { useProviders } from "@/hooks/queries/providers";
import {
  useDeconstructMockup,
  useNameSlices,
} from "@/hooks/queries/pipeline";
import { useLibraryUI } from "@/components/library/library-ui";
import { RichTextArtifact } from "@/components/artifacts/RichTextArtifact";
import { planPrototype } from "@/prototype/planner";
import { prototypeReviewMarkdown } from "@/prototype/review-document";
import type {
  HumanLoopAskLike,
  PrototypeHumanLoopAsk,
  PrototypePage,
  PrototypePlan,
  ResolvedHumanLoopAnswer,
} from "@/prototype/prototype-plan";
import {
  pagesForScope,
  DEFAULT_PROTOTYPE_SUITE_SCOPE,
  prototypeDesignMarkdown,
  prototypeDesignMarkdownSynthesisSystem,
  prototypeDesignSystemPrompt,
  prototypePagePrompt,
  type PrototypeSuiteScope,
} from "@/prototype/generate-suite";
import { generatePrototypePageSet } from "@/prototype/page-generation";
import {
  fallbackPrototypeSliceNames,
  isGenericSliceFilename,
} from "@/prototype/asset-names";
import { createPrototypeAssetManifest } from "@/prototype/asset-manifest";
import {
  appendDesignMarkdownSection,
  appendDesignMarkdownTableRow,
  editableDesignValueLiteral,
  formatEditedDesignValue,
  parseEditableDesignMarkdown,
  parseEditableDesignValue,
  removeDesignMarkdownSection,
  removeDesignMarkdownTableRow,
  updateDesignMarkdownControl,
  updateDesignMarkdownSection,
  updateDesignMarkdownTableCell,
  type EditableDesignControl,
  type EditableDesignMarkdown,
  type EditableDesignSection,
  type EditableDesignTable,
} from "@/prototype/design-md";
import {
  designSystemMarkdownValidationError,
} from "@/prototype/design-system-validation";
import {
  projectPrototypeArtifacts,
  prototypeMediaValidationError,
  recoverPrototypeArtifacts,
  type PrototypeDesignSystemArtifact,
  type PrototypeImageArtifact,
  type PrototypePageArtifact,
} from "@/prototype/prototype-artifact-recovery";
import {
  renderDesignSource,
  type DesignSourceFormat,
} from "@/prototype/design-md-export";
import {
  ASTRYX_COMMON_VARIABLES,
  automaticAstryxMapping,
  astryxColorChoices,
  compileAstryxThemeFromDesignMarkdown,
  type AstryxColorChoice,
} from "@/design-kit/astryx-design-md";
import { astryxAgentPrompt, type AstryxBinding } from "@/design-kit/astryx";
import { runToolLoop } from "@/agent-runtime/tool-loop";
import { agentCapabilityContext } from "@/agent-runtime/agent-capability-context";
import {
  askClarifyingQuestionTool,
  astryxThemeTool,
  configurePageTargetingTool,
  configureRegenerationTool,
  conversationalReplyTool,
  proceedWithGenerationTool,
} from "@/agent-runtime/tool-registry";
import { createClarificationBridge } from "@/agent-runtime/clarification-bridge";
import type { RegenerationDecision } from "@/prototype/regeneration-tool";
import type { GenerationDecision } from "@/prototype/generation-tool";
import type { PageTargetingDecision } from "@/prototype/page-targeting-tool";
import type { ConversationalReplyInput } from "@/prototype/conversational-reply-tool";
import type { AskClarifyingQuestionInput } from "@/prototype/ask-clarifying-question-tool";
import { CanvasBackgroundPicker } from "./CanvasBackgroundPicker";
import { readCanvasBackground, writeCanvasBackground } from "./canvas-background";
import {
  withCanvasAnnotations,
  type CanvasAnnotation,
} from "./canvas-annotations";
import type {
  PersistedPrototypeDesignSystem,
  PersistedPrototypeImage,
  PersistedPrototypePage,
  WorkspaceNamingStatus,
  WorkspaceSnapshot,
  WorkspaceWorkflowPhase,
} from "@/workspace/workspace-snapshot";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SourceCanvas } from "@/components/source/SourceCanvas";
import { SliceOutcomeTabs } from "@/components/slices/SliceOutcomeTabs";
import { InspectorPanel } from "@/components/inspector/InspectorPanel";
import {
  OutputCanvas,
  type CanvasImageItem,
  type OutputCanvasProps,
} from "./OutputCanvas";
import { projectCanvasOverlayAnchor, projectCanvasSafeArea, projectVisiblePanelInsets, visiblyOccupiesSpace } from "./output-canvas-viewport";
import type { DesignDocument } from "@/design-ir";
import {
  approveCurrentDeliverables,
  createIndexedDbGlobalLibraryBackend,
  GlobalLibraryStore,
  libraryItemFromApproval,
  type ApprovedDeliverableReceipt,
  type GlobalLibraryItem,
} from "@/global-library";
import { AgentWorkspaceDock } from "@/components/agent-workspace";
import {
  FilesPanel,
  type FilesPanelNode,
} from "@/components/files-panel/FilesPanel";
import { bytesToBlob, blobToBytes, decodeImage } from "@/lib/image";
import { forEachConcurrent } from "@/lib/async-pool";
import {
  nameRegionSlices,
  runRegionBreakdown,
  selectPagesWithBoardCutouts,
  sliceRegionBoardBitmap,
} from "@/prototype/region-deconstruct";
import {
  buildPageChecklist,
  generateWithQa,
  reviewGeneratedImage,
} from "@/prototype/generation-qa";
import { cn } from "@/lib/utils";

// Vision QA gate over generated pages and region boards (reject/re-roll with
// lesson feedback). Retries are paid image calls — keep the budget small.
const PROTOTYPE_QA_ENABLED = true;
const PROTOTYPE_QA_MAX_RETRIES = 1;
const PROTOTYPE_GENERATION_CONCURRENCY = 2;
import {
  persistReferenceAttachment,
  useReferenceAttachments,
} from "./useReferenceAttachments";
import { projectPrototypeOutcome } from "@/agent-runtime/prototype-outcome";
import {
  planPrototypeRepair,
  type PrototypeRepairPlan,
} from "@/agent-runtime/prototype-repair";
import { buildAgentViewModel } from "@/components/agent-workspace/agent-view-model";
import {
  assertImpactPlanCurrent,
  buildMaterialImpactPlan,
  reconcileMaterialSelection,
  type MaterialImpactPlan,
  type MaterialRef,
} from "@/agent-runtime/material-impact";
import {
  AgentRunCoordinator,
  isAgentRunCancelled,
  type AgentRunLease,
} from "@/agent-runtime/run-coordinator";
import { useAgentRunEvents } from "@/agent-runtime/use-agent-run-events";
import { consumeComposerDraft } from "./composer-draft";
import { createLiveTextBatcher } from "./live-agent-output";
import { useDesktopToolLoop } from "@/agent-runtime/use-desktop-tool-loop";
import {
  decideVariant,
  decisionFor,
  emptyCreativeBoard,
  requestMoreLikeThis,
  type CreativeBoardState,
  type CreativeVariantDecision,
} from "@/agent-runtime/creative-board-decisions";
import { createPrototypePageVisualTask } from "@/prototype/visual-task";
import {
  assignBoardCandidates,
  beginPrototypeProduction,
  cancelPrototypeProduction,
  carryPrototypeTaskPublication,
  compilePrototypeProductionPlan,
  currentProductionRunId,
  failPrototypeTask,
  finalizePrototypeProduction,
  integrityIssue,
  isConsumableTask,
  projectProductionMaterials,
  projectProductionReviewQueue,
  prototypeDirectAssetChecklist,
  prototypeDirectAssetPrompt,
  publishPrototypeTaskArtifact,
  qualityIssue,
  type ProductionArtifactRef,
  type ProductionIssue,
  type ProductionReviewProjection,
  type ProductionRunStatus,
} from "@/asset-production";

type AssetStageId =
  | "idle"
  | "planning"
  | "review"
  | "design-system"
  | "preparing"
  | "mockup"
  | "deconstruct"
  | "cutout"
  | "naming"
  | "done";
type WorkflowPhase = WorkspaceWorkflowPhase;
type NamingStatus = WorkspaceNamingStatus;

interface AssetStage {
  readonly id: Exclude<AssetStageId, "idle">;
  readonly label: string;
  readonly detail: string;
  readonly icon: ComponentType<{ className?: string }>;
  readonly status: "pending" | "running" | "done";
}

const CUSTOM_HUMAN_LOOP_ID = "__custom__";
const SERIAL_REFERENCE_PAGE_LIMIT = 1;
type DesignMarkdownAsset = ReturnType<
  typeof useStore.getState
>["designMarkdown"];

export function IntentWorkspace({
  onOpenDesignOs = () => {},
  advanced = false,
  onOpenAdvanced,
}: {
  readonly onOpenDesignOs?: (tab?: "overview" | "delivery" | "specimen") => void;
  readonly advanced?: boolean;
  readonly onOpenAdvanced?: () => void;
}) {
  const { t } = useLingui();
  const services = useServices();
  const dockAttachInputRef = useRef<HTMLInputElement | null>(null);
  const initialWorkspace = useStore((s) => s.workspaceSnapshot);
  // This is derived by AppShell from the current workspace. Retain it while
  // this component persists local UI state; otherwise every interaction would
  // erase the live Design OS projection before the next autosave.
  const designDocument = useStore(
    (s) => s.workspaceSnapshot?.designDocument ?? null,
  );
  const setWorkspaceSnapshot = useStore((s) => s.setWorkspaceSnapshot);
  const [agentBusy, setAgentBusy] = useState(false);
  const agentRunCoordinatorRef = useRef(new AgentRunCoordinator());
  const activeRunRef = useRef<AgentRunLease | null>(null);
  const [runCancelled, setRunCancelled] = useState(false);
  const {
    store: agentRunEvents,
    startRun: startAgentRun,
    record: emitRunEvent,
    recordMany: emitRunEvents,
  } = useAgentRunEvents(initialWorkspace?.agentRunEvents);
  const { attachments, onAttachFiles, removeAttachment } =
    useReferenceAttachments({
      initialAttachments: initialWorkspace?.attachments ?? [],
      onDesignMarkdownImport: (asset) =>
        getStoreState().setDesignMarkdown(asset),
    });
  const [webSearchEnabled, setWebSearchEnabled] = useState(
    () => initialWorkspace?.webSearchEnabled ?? false,
  );
  const [composerModelPolicy, setComposerModelPolicy] =
    useState<ComposerModelPolicy>(
      () => initialWorkspace?.composerModelPolicy ?? { mode: "auto" },
    );
  const [composerThinkingPolicy, setComposerThinkingPolicy] =
    useState<ComposerThinkingPolicy>(
      () => initialWorkspace?.composerThinkingPolicy ?? "auto",
    );
  const [executionNotices, setExecutionNotices] = useState<readonly string[]>(
    [],
  );
  const lockedRouteRef = useRef<LockedComposerRoute | null>(null);
  const personalizedGenerationRef = useRef(services.generation);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [initialPrototypeArtifacts] = useState(() =>
    recoverPrototypeArtifacts({
      designSystem: initialWorkspace?.prototypeDesignSystem ?? null,
      pages: initialWorkspace?.prototypePages ?? [],
    }),
  );
  const [workflowPhase, setWorkflowPhase] = useState<WorkflowPhase>(() =>
    recoverWorkflowPhase(initialWorkspace, initialPrototypeArtifacts),
  );
  const [prototypePlan, setPrototypePlan] = useState<PrototypePlan | null>(
    () => initialWorkspace?.prototypePlan ?? null,
  );
  const [prototypeScope, setPrototypeScope] = useState<PrototypeSuiteScope>(
    () => initialWorkspace?.prototypeScope ?? DEFAULT_PROTOTYPE_SUITE_SCOPE,
  );
  const [humanLoopChoiceId, setHumanLoopChoiceId] = useState<string | null>(
    () => initialWorkspace?.humanLoopChoiceId ?? null,
  );
  const [prototypePages, setPrototypePages] = useState<
    readonly PrototypePageArtifact[]
  >(() => initialPrototypeArtifacts.pages);
  const [prototypeDesignSystem, setPrototypeDesignSystem] =
    useState<PrototypeDesignSystemArtifact | null>(
      () => initialPrototypeArtifacts.designSystem,
    );
  const prototypeArtifacts = useMemo(
    () =>
      projectPrototypeArtifacts({
        designSystem: prototypeDesignSystem,
        pages: prototypePages,
      }),
    [prototypeDesignSystem, prototypePages],
  );
  const [selectedPrototypePageId, setSelectedPrototypePageId] = useState<
    string | null
  >(() => initialWorkspace?.selectedPrototypePageId ?? null);
  const [approvedDeliverables, setApprovedDeliverables] = useState<
    readonly ApprovedDeliverableReceipt[]
  >(() => initialWorkspace?.approvedDeliverables ?? []);
  const [librarySavedMaterialIds, setLibrarySavedMaterialIds] = useState<
    ReadonlySet<string>
  >(new Set());
  const [savedLibraryItems, setSavedLibraryItems] = useState<
    readonly GlobalLibraryItem[]
  >([]);
  useEffect(() => {
    if (typeof indexedDB === "undefined") return;
    const libraryStore = new GlobalLibraryStore(
      createIndexedDbGlobalLibraryBackend(indexedDB),
    );
    void libraryStore.catalog().then((catalog) => {
      const saved = approvedDeliverables
        .map((receipt) =>
          catalog.items.find(
            (item) =>
              item.id === receipt.library.itemId &&
              item.version === receipt.library.version &&
              item.contentSha256 === receipt.library.contentSha256,
          ),
        )
        .filter((item): item is GlobalLibraryItem => Boolean(item));
      setSavedLibraryItems(saved);
      setLibrarySavedMaterialIds(
        new Set(
          approvedDeliverables
            .filter((receipt) =>
              saved.some(
                (item) =>
                  item.id === receipt.library.itemId &&
                  item.version === receipt.library.version,
              ),
            )
            .map((receipt) => receipt.material.id),
        ),
      );
    });
  }, [approvedDeliverables]);
  const [agentDockVisible, setAgentDockVisible] = useState(true);
  const [filesDockVisible, setFilesDockVisible] = useState(false);
  const [designDockVisible, setDesignDockVisible] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [canvasBackground, setCanvasBackground] = useState<string | null>(
    readCanvasBackground,
  );
  const [minimapVisible, setMinimapVisible] = useState(() => {
    try {
      return localStorage.getItem("cutout.canvas-minimap") === "1";
    } catch {
      return false;
    }
  });
  const [gridVisible, setGridVisible] = useState(() => {
    try {
      return localStorage.getItem("cutout.canvas-grid") !== "0";
    } catch {
      return true;
    }
  });
  const [canvasAnnotations, setCanvasAnnotations] = useState<
    readonly CanvasAnnotation[]
  >(() => initialWorkspace?.canvasAnnotations ?? []);
  const { openPicker } = useImageImportActions();
  const { exportAll, exportAllPending } = useExport();
  const focusAgentComposer = useCallback(() => {
    setSidebarCollapsed(false);
    setAgentDockVisible(true);
    setTimeout(() => {
      document
        .querySelector<HTMLTextAreaElement>('[aria-label="Message the Agent"]')
        ?.focus();
    }, 50);
  }, []);
  const library = useLibraryUI();
  const [focusedArtifactId, setFocusedArtifactId] = useState<string | null>(
    null,
  );
  const [focusRequestId, setFocusRequestId] = useState(0);
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialRef | null>(
    null,
  );
  const [creativeBoard, setCreativeBoard] = useState(
    () => initialWorkspace?.creativeBoard ?? emptyCreativeBoard(),
  );
  const [humanLoopCustomAnswer, setHumanLoopCustomAnswer] = useState(
    () => initialWorkspace?.humanLoopCustomAnswer ?? "",
  );
  const [composerDraft, setComposerDraft] = useState("");
  const [liveAgentOutput, setLiveAgentOutput] = useState(
    () => initialWorkspace?.liveAgentOutput ?? "",
  );
  const [liveAgentLabel, setLiveAgentLabel] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(
    () => initialWorkspace?.runError ?? null,
  );
  const [namingStatus, setNamingStatus] = useState<NamingStatus>(
    () => initialWorkspace?.namingStatus ?? "idle",
  );
  const autoNamePendingRef = useRef(false);
  const brief = useStore((s) => s.brief);
  const setBrief = useStore((s) => s.setBrief);
  const pendingAgentRunId = useStore((s) => s.pendingAgentRun?.id ?? null);
  const setMockup = useStore((s) => s.setMockup);
  const mockup = useStore((s) => s.mockup);
  const importedDesignMarkdown = useStore((s) => s.designMarkdown);
  const setDesignMarkdown = useStore((s) => s.setDesignMarkdown);
  const genPhase = useStore((s) => s.genPhase);
  const genError = useStore((s) => s.genError);
  const source = useSource();
  const slices = useSlices();
  const selectedSlice = useSelectedSlice();
  const analysisStatus = useStatus();
  const assetProduction = useStore((state) => state.assetProduction);
  const productionStatusRunId = currentProductionRunId(assetProduction);
  const productionStatus = productionStatusRunId
    ? assetProduction.runs[productionStatusRunId]?.status ?? null
    : null;
  const productionReviewQueue = useMemo(
    () => projectProductionReviewQueue(assetProduction),
    [assetProduction],
  );
  const productionRepairRegionIds = useMemo(
    () => [...new Set(productionReviewQueue.map((item) => item.regionId))],
    [productionReviewQueue],
  );
  const productionReviewCount = productionReviewQueue.length;
  const assignments = useModelAssignments();
  const providers = useProviders();
  const desktopTools = useDesktopToolLoop({
    services,
    providers: providers.data ?? [],
    assignments: assignments.data ?? {},
    revision: designDocument?.revision.number ?? 0,
    append: emitRunEvents,
    cutoutResultSink: createCutoutResultSink(getStoreState),
  });
  const emitRunEventsRef = useRef(emitRunEvents);
  emitRunEventsRef.current = emitRunEvents;
  const clarificationBridge = useMemo(
    () =>
      createClarificationBridge({
        append: (events) => emitRunEventsRef.current(events),
      }),
    [],
  );
  const { isPending: deconstructing } =
    useDeconstructMockup(() => lockedRouteRef.current?.image);
  const { mutateAsync: nameSlices, isPending: naming } = useNameSlices(
    () => lockedRouteRef.current?.chat,
  );

  const hasSource = Boolean(source.bitmap);
  const hasSlices = slices.length > 0;
  const exportableSliceCount = slices.filter(
    (slice) => slice.included && isSliceConsumable(slice),
  ).length;
  const materialRefs = useMemo<readonly MaterialRef[]>(() => {
    return [
      ...(prototypeDesignSystem
        ? [
            {
              id: "design-system",
              kind: "design-system" as const,
              label: prototypeDesignSystem.name || "Design system",
              version: prototypeImageVersion(prototypeDesignSystem),
              provenance: { source: "prototype-generation" as const },
            },
          ]
        : []),
      ...prototypePages.map((artifact) => ({
        id: artifact.page.id,
        kind: "prototype-page" as const,
        label: artifact.page.name,
        version: prototypeImageVersion(artifact),
        provenance: { source: "prototype-generation" as const },
      })),
      ...slices.map((slice) => ({
        id: slice.id,
        kind: "cutout-slice" as const,
        label: slice.name,
        version: `${slice.blob.size}:${slice.width}x${slice.height}:${slice.box.x},${slice.box.y}`,
        provenance: {
          source: "page-deconstruction" as const,
          sourcePageId: slice.pageId ?? undefined,
          independentlyEditable: false,
        },
      })),
    ];
  }, [prototypeDesignSystem, prototypePages, slices]);

  async function selectedMaterialReferenceBytes(
    material: MaterialRef | null,
  ): Promise<Uint8Array | undefined> {
    if (!material) return undefined;
    if (material.kind === "design-system") {
      return prototypeDesignSystem?.bytes;
    }
    if (material.kind === "prototype-page") {
      return prototypePages.find((page) => page.page.id === material.id)?.bytes;
    }
    const slice = slices.find((candidate) => candidate.id === material.id);
    return slice ? blobToBytes(slice.blob) : undefined;
  }
  const impactPlan = useMemo(
    () =>
      buildMaterialImpactPlan(selectedMaterial, {
        designSystemId: prototypeDesignSystem ? "design-system" : null,
        pageIds: prototypePages.map((artifact) => artifact.page.id),
        sliceIds: slices.map((slice) => slice.id),
      }),
    [prototypeDesignSystem, prototypePages, selectedMaterial, slices],
  );
  const filesTree = useMemo<readonly FilesPanelNode[]>(() => {
    const folders: FilesPanelNode[] = [];
    if (prototypeDesignSystem) {
      folders.push({
        kind: "folder",
        id: "folder:design-system",
        name: "Design system",
        defaultOpen: true,
        children: [
          {
            kind: "file",
            id: "design-system",
            name: prototypeDesignSystem.name || "Design system",
            blob: prototypeDesignSystem.blob,
            width: prototypeDesignSystem.width,
            height: prototypeDesignSystem.height,
          },
        ],
      });
    }
    if (prototypePages.length > 0) {
      folders.push({
        kind: "folder",
        id: "folder:pages",
        name: "Pages",
        defaultOpen: true,
        children: prototypePages.map((artifact) => ({
          kind: "file",
          id: artifact.page.id,
          name: artifact.page.name,
          blob: artifact.blob,
          width: artifact.width,
          height: artifact.height,
        })),
      });
    }
    if (slices.length > 0) {
      folders.push({
        kind: "folder",
        id: "folder:slices",
        name: "Slices",
        defaultOpen: true,
        children: slices.map((slice) => ({
          kind: "file",
          id: slice.id,
          name: slice.name,
          blob: slice.blob,
          width: slice.width,
          height: slice.height,
        })),
      });
    }
    if (approvedDeliverables.length > 0) {
      folders.push({
        kind: "folder",
        id: "folder:library",
        name: "Library",
        children: approvedDeliverables.map((receipt) => {
          const saved = savedLibraryItems.find(
            (item) =>
              item.id === receipt.library.itemId &&
              item.version === receipt.library.version,
          );
          if (!saved) {
            return {
              kind: "receipt",
              id: `receipt:${receipt.material.id}`,
              name: receipt.material.name,
              receiptKind: receipt.material.kind,
              contentSha256: receipt.material.contentSha256,
            };
          }
          return {
            kind: "folder",
            id: `library-item:${saved.id}:${saved.version}`,
            name: `${receipt.material.name} · v${saved.version}`,
            children: buildArtifactTree(
              `library-item:${saved.id}:${saved.version}`,
              saved.content.artifacts,
            ),
          };
        }),
      });
    }
    return folders;
  }, [
    approvedDeliverables,
    prototypeDesignSystem,
    prototypePages,
    savedLibraryItems,
    slices,
  ]);

  useEffect(() => {
    setSelectedMaterial((current) =>
      reconcileMaterialSelection(current, materialRefs),
    );
  }, [materialRefs]);
  // Once an Agent run starts, naming must use the same locked chat route even
  // if Settings refresh while paid work is still completing.
  const hasChatModel = Boolean(
    lockedRouteRef.current?.chat ?? assignments.data?.chat,
  );
  const working =
    agentBusy ||
    workflowPhase === "planning" ||
    workflowPhase === "design-system" ||
    workflowPhase === "generating-suite" ||
    deconstructing ||
    naming ||
    analysisStatus === "running";
  const composerModelOptions = useMemo(() => {
    const providerList = providers.data ?? [];
    const choices = [
      {
        value: "auto",
        label: "Auto",
        description: "Let the Agent Router choose the chat and image slots.",
      },
    ];
    for (const slot of ["chat", "image"] as const) {
      const assignment = assignments.data?.[slot];
      if (!assignment) continue;
      const provider = providerList.find(
        (item) => item.id === assignment.providerId,
      );
      choices.push({
        value: fixedModelValue(slot, assignment),
        label: `${slot === "chat" ? "Chat" : "Image"} · ${assignment.model}`,
        description: `${provider?.label ?? assignment.providerId} · fixes the ${slot} slot; the other slot remains Auto.`,
      });
    }
    return choices;
  }, [assignments.data, providers.data]);
  const activeStage = resolveAssetStage({
    genPhase,
    analysisStatus,
    naming,
    hasMockup: Boolean(mockup),
    hasSource,
    hasSlices,
    agentBusy,
    workflowPhase,
    hasPlan: Boolean(prototypePlan),
    hasDesignSystem: Boolean(prototypeDesignSystem),
    hasPrototypePages: prototypePages.length > 0,
    productionStatus,
  });
  const elapsedSeconds = useElapsedSeconds(runStartedAt, working);
  const stages = buildAssetStages({
    activeStage,
    hasMockup: Boolean(mockup),
    hasSource,
    hasSlices,
    namingStatus,
    hasPlan: Boolean(prototypePlan),
    hasDesignSystem: Boolean(prototypeDesignSystem),
    hasPrototypePages: prototypePages.length > 0,
    productionStatus,
  });
  const projectedOutcome = useMemo(
    () =>
      projectPrototypeOutcome({
        plan: prototypePlan,
        scope: prototypeScope,
        hasDesignSystem: Boolean(prototypeArtifacts.designSystem),
        designSystemRevision: prototypeArtifacts.designSystem
          ? prototypeImageVersion(prototypeArtifacts.designSystem)
          : undefined,
        hasDesignMarkdown:
          prototypeArtifacts.hasValidDesignMarkdown ||
          Boolean(
            importedDesignMarkdown?.content &&
              !designSystemMarkdownValidationError(
                importedDesignMarkdown.content,
              ),
          ),
        pages: prototypeArtifacts.pages.map((artifact) => ({
          page: artifact.page,
          revision: prototypeImageVersion(artifact),
        })),
        assets: projectProductionMaterials(assetProduction).map((material) => ({
          id: material.taskId,
          manifestItemId: material.manifestItemId,
          label: slices.find((slice) => slice.productionTaskId === material.taskId)?.name,
          revision: material.artifact.sha256,
        })),
      }),
    [
      assetProduction,
      importedDesignMarkdown?.content,
      prototypeArtifacts,
      prototypePlan,
      prototypeScope,
      slices,
    ],
  );
  const outcome = useMemo(
    () =>
      projectedOutcome && runCancelled
        ? { ...projectedOutcome, status: "cancelled" as const }
        : projectedOutcome,
    [projectedOutcome, runCancelled],
  );
  const canSaveToLibrary = Boolean(designDocument && outcome);

  useEffect(() => {
    const runId = agentRunEvents.activeRunId;
    if (!runId || !outcome || agentRunEvents.activeRun?.status === "cancelled")
      return;
    for (const material of outcome.materials) {
      emitRunEvent(
        runId,
        { type: "material-recorded", material },
        {
          eventId: `${runId}:material:${material.id}:${material.evidenceKey ?? ""}:${material.revision ?? ""}`,
        },
      );
    }
    const missingSignature = outcome.evaluation.missing
      .map((item) => `${item.kind}:${item.count}`)
      .join(",");
    emitRunEvent(
      runId,
      {
        type: "outcome-evaluated",
        status: outcome.evaluation.status,
        missing: outcome.evaluation.missing,
      },
      {
        eventId: `${runId}:outcome:${outcome.evaluation.status}:${missingSignature}`,
      },
    );
  }, [
    agentRunEvents.activeRun?.status,
    agentRunEvents.activeRunId,
    emitRunEvent,
    outcome,
  ]);
  const repairPlan = planPrototypeRepair(
    outcome,
    Boolean(prototypeArtifacts.designSystem),
    productionRepairRegionIds,
  );
  const agentViewModel = buildAgentViewModel({
    brief,
    workflowPhase,
    stages,
    outcome,
    working,
    preparing: agentBusy && workflowPhase === "idle",
    elapsedSeconds,
    runError:
      runError ??
      (genError ? userFacingGenerationError(genError.message) : null),
    notices: executionNotices,
    runEvents: agentRunEvents,
    liveAgentMessage: liveAgentOutput
      ? {
          id: `runtime:stream:${agentRunEvents.activeRunId ?? "design-markdown"}`,
          text: liveAgentOutput,
          label: liveAgentLabel ?? "Agent is responding",
        }
      : null,
  });
  const humanLoop = prototypePlan?.humanLoop ?? null;
  // A suspended ask_clarifying_question call (mid model-turn, tool-gate
  // path) takes priority over the older cross-invocation humanLoop.mode ===
  // 'ask' (planPrototype's own generateObject-level ask) — the two should
  // never both be true in practice, but if they were, a live model call
  // actually waiting on this answer is the more urgent one to surface.
  const liveAsk = agentRunEvents.activeRun?.humanLoopAsk ?? null;
  const activeAsk: HumanLoopAskLike | null =
    liveAsk ?? (humanLoop?.mode === "ask" ? humanLoop : null);
  const selectedHumanLoopChoiceId = activeAsk
    ? humanLoopChoiceId === CUSTOM_HUMAN_LOOP_ID
      ? activeAsk.defaultChoiceId
      : (humanLoopChoiceId ?? activeAsk.defaultChoiceId)
    : null;
  const liveAskId = liveAsk?.askId ?? null;
  useEffect(() => {
    // agentBusy is set true synchronously before tryToolGate() is even
    // called (createAssets), so it's still true for the entire suspension —
    // without this, `disabled: working` would lock the composer and the
    // user could never type or submit an answer. Flipping it false here
    // mirrors how the older cross-invocation ask flow already presents
    // itself (its finally block resets agentBusy before the question ever
    // renders); onSubmit sets it back true once the answer is sent.
    if (liveAskId) setAgentBusy(false);
  }, [liveAskId]);
  const scopedPrimaryPageCount = prototypePlan
    ? pagesForScope(prototypePlan, "primary-flow").length
    : 0;
  const showDockScopePicker =
    humanLoop?.mode === "continue" &&
    scopedPrimaryPageCount < (prototypePlan?.pages.length ?? 0);

  useLayoutEffect(() => {
    setWorkspaceSnapshot({
      version: "workspace.v1",
      workflowPhase,
      prototypePlan,
      prototypeScope,
      humanLoopChoiceId,
      humanLoopCustomAnswer,
      prototypeDesignSystem: prototypeDesignSystem
        ? persistPrototypeDesignSystem(prototypeDesignSystem)
        : null,
      prototypePages: prototypePages.map(persistPrototypePage),
      selectedPrototypePageId,
      runError,
      namingStatus,
      liveAgentOutput,
      attachments: attachments.map(persistReferenceAttachment),
      webSearchEnabled,
      composerModelPolicy:
        composerModelPolicy.mode === "auto" ? undefined : composerModelPolicy,
      composerThinkingPolicy:
        composerThinkingPolicy === "auto" ? undefined : composerThinkingPolicy,
      outcome,
      agentRunEvents,
      designDocument,
      approvedDeliverables,
      canvasAnnotations,
      capabilityReceipts: initialWorkspace?.capabilityReceipts,
      creativeBoard:
        creativeBoard.decisions.length || creativeBoard.branches.length
          ? creativeBoard
          : undefined,
    });
  }, [
    attachments,
    agentRunEvents,
    approvedDeliverables,
    canvasAnnotations,
    initialWorkspace?.capabilityReceipts,
    composerModelPolicy,
    composerThinkingPolicy,
    creativeBoard,
    designDocument,
    humanLoopChoiceId,
    humanLoopCustomAnswer,
    liveAgentOutput,
    namingStatus,
    outcome,
    prototypeDesignSystem,
    prototypePages,
    prototypePlan,
    prototypeScope,
    runError,
    selectedPrototypePageId,
    setWorkspaceSnapshot,
    slices,
    webSearchEnabled,
    workflowPhase,
  ]);

  useEffect(() => {
    if (!autoNamePendingRef.current) return;
    if (analysisStatus !== "done" || slices.length === 0) return;
    const lease = activeRunRef.current;
    if (!lease || !agentRunCoordinatorRef.current.isActive(lease)) {
      autoNamePendingRef.current = false;
      return;
    }
    if (!hasChatModel || naming) {
      if (!hasChatModel) {
        autoNamePendingRef.current = false;
        const fallbackCount = applyLocalSemanticSliceNames(
          prototypePlan,
          prototypeScope,
          true,
        );
        setNamingStatus(fallbackCount > 0 ? "done" : "skipped");
        finishActiveRun(lease);
        if (activeRunRef.current === lease) activeRunRef.current = null;
      }
      return;
    }

    autoNamePendingRef.current = false;
    setNamingStatus("running");
    void (async () => {
      try {
        const count = await nameSlices({ signal: lease.controller.signal });
        agentRunCoordinatorRef.current.checkpoint(lease);
        const fallbackCount = applyLocalSemanticSliceNames(
          prototypePlan,
          prototypeScope,
          true,
        );
        setNamingStatus(count + fallbackCount > 0 ? "done" : "skipped");
      } catch (error) {
        if (isAgentRunCancelled(error) || lease.controller.signal.aborted)
          return;
        const fallbackCount = applyLocalSemanticSliceNames(
          prototypePlan,
          prototypeScope,
          true,
        );
        setNamingStatus(fallbackCount > 0 ? "done" : "error");
        console.info(
          "[Cutout] semantic naming skipped:",
          error instanceof Error ? error.message : String(error),
        );
      } finally {
        finishActiveRun(lease);
        if (activeRunRef.current === lease) activeRunRef.current = null;
      }
    })();
  }, [
    analysisStatus,
    hasChatModel,
    nameSlices,
    naming,
    prototypePlan,
    prototypeScope,
    slices.length,
  ]);

  function stopActiveRun(): void {
    const lease = activeRunRef.current;
    if (!lease || !agentRunCoordinatorRef.current.cancel(lease, "user")) return;
    const runId = agentRunEvents.activeRunId;
    if (runId) {
      emitRunEvent(runId, {
        type: "run-cancelled",
        reason: "Stopped by user",
      });
    }
    activeRunRef.current = null;
    autoNamePendingRef.current = false;
    setAgentBusy(false);
    getStoreState().endGen();
    setRunCancelled(true);
    setRunError(null);
    setNamingStatus((status) =>
      status === "running" || status === "pending" ? "idle" : status,
    );
    setWorkflowPhase((phase) =>
      phase === "planning" ||
      phase === "design-system" ||
      phase === "generating-suite"
        ? "idle"
        : phase,
    );
  }

  function applyPendingSteers(lease: AgentRunLease, prompt: string): string {
    const instructions = agentRunCoordinatorRef.current.drainSteers(lease);
    if (instructions.length === 0) return prompt;
    return [
      prompt,
      "",
      "[User steering received during this run]",
      ...instructions.map((instruction, index) => `${index + 1}. ${instruction}`),
      "Apply these instructions to remaining work. Do not redo completed work unless explicitly requested.",
    ].join("\n");
  }

  function finishActiveRun(lease: AgentRunLease): void {
    const pending = agentRunCoordinatorRef.current.drainSteers(lease);
    agentRunCoordinatorRef.current.finish(lease);
    if (pending.length === 0) return;
    // A correction can arrive after the final paid call has begun. Never
    // replay that call: retain the correction as the next editable draft and
    // make the deferred boundary explicit instead of silently dropping it.
    setComposerDraft((current) =>
      [...pending, current.trim()].filter(Boolean).join("\n"),
    );
    setExecutionNotices((current) => [
      ...current,
      "A late direction arrived after the final execution boundary and was kept as your next message.",
    ]);
  }

  useEffect(
    () => () => {
      const active = activeRunRef.current;
      if (active) agentRunCoordinatorRef.current.cancel(active, "unmount");
    },
    [],
  );

  useEffect(() => {
    if (working) return;
    if (!runStartedAt) return;
    const timer = window.setTimeout(() => setRunStartedAt(null), 900);
    return () => window.clearTimeout(timer);
  }, [runStartedAt, working]);

  function updateDesignMarkdownContent(content: string): void {
    const normalized = content.replace(/\r\n?/g, "\n");
    if (prototypeDesignSystem) {
      setPrototypeDesignSystem((current) =>
        current ? { ...current, designMarkdown: normalized } : current,
      );
      return;
    }

    setDesignMarkdown({
      name: importedDesignMarkdown?.name ?? "DESIGN.md",
      content: normalized,
      importedAt: importedDesignMarkdown?.importedAt ?? Date.now(),
    });
  }

  async function providerKeyPreflightMessage(
    providerIds: readonly string[],
  ): Promise<string | null> {
    const ids = [...new Set(providerIds)];
    if (ids.length === 0) return null;

    try {
      const [providers, statuses] = await Promise.all([
        services.providers.list(),
        services.providers.statuses(ids),
      ]);
      const missing = ids.filter((id) => statuses[id] !== true);
      if (missing.length === 0) return null;

      const labels = missing.map((id) => {
        const provider = providers.find((item) => item.id === id);
        return provider?.label ?? id;
      });
      return `Add an API key for ${labels.join(", ")} in Settings before generating.`;
    } catch (error) {
      return `Could not verify provider API key status: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
  }

  /**
   * When web search is on, ground the brief before planning: run the provider's
   * web-search tool and append a concise factual summary. Best-effort — any
   * failure (unsupported provider, tool error) returns the brief unchanged.
   */
  async function researchedBrief(
    text: string,
    chat: ModelAssignment,
    webSearchSupported: boolean,
    lease: AgentRunLease,
    runId: string,
  ): Promise<string> {
    if (!webSearchEnabled || !webSearchSupported) return text;
    agentRunCoordinatorRef.current.checkpoint(lease);
    // `research()` is a provider-native built-in tool call, not something
    // routed through runToolLoop() (it can't be — see the tool-registry
    // design note: provider-native web search executes server-side inside
    // the model call, it has no client-controlled execute()). Narrate it
    // with the same tool-started/succeeded/failed events runToolLoop's
    // calls get, so it's visible in the run feed instead of silent until
    // failure.
    const toolCallId = crypto.randomUUID();
    emitRunEvent(runId, {
      type: "tool-started",
      toolCallId,
      tool: "web_search",
      label: "Web search",
    });
    const result = await personalizedGenerationRef.current.research({
      providerId: chat.providerId,
      model: chat.model,
      reasoningEffort: chat.effort,
      reasoningProtocol: chat.reasoningProtocol,
      prompt: [
        "Research this product brief on the web. Return a concise, factual grounding",
        "summary: key facts, domain conventions, notable brands/competitors, and",
        "constraints. No preamble, no markdown headings.",
        "",
        text,
      ].join("\n"),
      signal: lease.controller.signal,
    });
    agentRunCoordinatorRef.current.checkpoint(lease);
    if (isErr(result) || !result.data.trim()) {
      const detail = isErr(result)
        ? result.error
        : "No grounding text returned.";
      emitRunEvent(runId, {
        type: "tool-failed",
        toolCallId,
        tool: "web_search",
        label: "Web search",
        detail,
      });
      setExecutionNotices((current) => [
        ...current,
        `Web search failed and the Agent continued without grounding${isErr(result) ? `: ${result.error}` : "."}`,
      ]);
      return text;
    }
    emitRunEvent(runId, {
      type: "tool-succeeded",
      toolCallId,
      tool: "web_search",
      label: "Web search",
      outputRefs: [],
    });
    return `${text}\n\n[Web research grounding]\n${result.data.trim()}`;
  }

  async function createAssets(
    mode: "create" | "repair" = "create",
    options: {
      skipToolGate?: boolean;
      briefOverride?: string;
      ignoreSelectedMaterial?: boolean;
    } = {},
  ): Promise<void> {
    const baseText = (options.briefOverride ?? brief).trim();
    if (!baseText) return;
    const text = withCanvasAnnotations(baseText, canvasAnnotations);
    const requestedMaterial = options.ignoreSelectedMaterial
      ? null
      : selectedMaterial;
    const plannedImpact = buildMaterialImpactPlan(requestedMaterial, {
      designSystemId: prototypeDesignSystem ? "design-system" : null,
      pageIds: prototypePages.map((artifact) => artifact.page.id),
      sliceIds: slices.map((slice) => slice.id),
    });
    try {
      assertImpactPlanCurrent(plannedImpact, requestedMaterial);
    } catch (error) {
      setRunError(errorMessage(error));
      return;
    }
    const targetedRepair = requestedMaterial
      ? repairForMaterialImpact(plannedImpact)
      : null;
    const repair =
      targetedRepair ??
      (mode === "repair"
        ? planPrototypeRepair(
            outcome,
            Boolean(prototypeArtifacts.designSystem),
            productionRepairRegionIds,
          )
        : null);
    if ((mode === "repair" || requestedMaterial) && (!prototypePlan || !repair))
      return;
    const materialReference = await selectedMaterialReferenceBytes(requestedMaterial);
    if (requestedMaterial && !materialReference) {
      setRunError("The selected material is no longer available. Select it again before requesting changes.");
      return;
    }
    const [
      { createPersonalizationService },
      { createPersonalizationRuntimeContext, personalizeGenerationService },
    ] = await Promise.all([
      import("@/personalization"),
      import("@/agent-runtime/personalization-runtime"),
    ]);
    const personalizationContext = await createPersonalizationRuntimeContext(
      await createPersonalizationService().load(),
    );
    personalizedGenerationRef.current = personalizeGenerationService(
      services.generation,
      personalizationContext,
    );
    const assignmentTable = assignments.data ?? {};
    const providerList = providers.data ?? (await services.providers.list());
    // Auto routing is fail-closed on provider verification. Installs that
    // predate verification receipts have assigned providers with no record —
    // settle those with one probe here instead of blocking the run.
    await Promise.all(
      [
        ...new Set(
          [
            assignmentTable.chat?.providerId,
            assignmentTable.image?.providerId,
          ].filter((id): id is string => Boolean(id)),
        ),
      ]
        .filter((id) =>
          providerList.some((provider) => provider.id === id && provider.enabled),
        )
        .map((id) =>
          ensureProviderVerification(id, async () => {
            const result = await services.providers.test(id);
            if (isErr(result)) throw new Error(result.error);
            return result.data;
          }),
        ),
    );
    const routePolicy = await import("@/agent-runtime/route-policy");
    let route: LockedComposerRoute;
    try {
      route = lockComposerRoute({
        model: composerModelPolicy,
        thinking: composerThinkingPolicy,
        assignments: assignmentTable,
        providers: providerList,
        hasReferenceImages: attachments.length > 0,
        routePreferences: routePolicy.routePreferencesFromPolicy(
          routePolicy.loadRoutePolicy(),
        ),
      });
      routePolicy.appendRouteReceipts(
        [route.chatPolicy.routeReceipt, route.imagePolicy.routeReceipt]
          .filter((receipt) => receipt !== undefined)
          .map((receipt) => ({
            ...receipt,
            personalization: personalizationContext.receipt,
          })),
      );
    } catch (error) {
      setRunError(errorMessage(error));
      return;
    }
    lockedRouteRef.current = route;
    const chatAssignment = route.chat;
    const imageAssignment = route.image;
    const providerKeyError = await providerKeyPreflightMessage([
      chatAssignment.providerId,
      imageAssignment.providerId,
    ]);
    if (providerKeyError) {
      setRunError(providerKeyError);
      return;
    }

    const lease = agentRunCoordinatorRef.current.begin();
    activeRunRef.current = lease;
    // Set synchronously (not after tryToolGate resolves) so the composer's
    // `working`/disabled state covers the tool-gate phase too — otherwise a
    // second submission could re-enter createAssets while this one is still
    // awaiting the tool-gate model call.
    setAgentBusy(true);

    let regenerationDecision: RegenerationDecision | null = null;
    let pageTargetingDecision: PageTargetingDecision | null = null;
    let clarifiedBrief: string | null = null;
    // Both the tool gate and a repair reuse an existing conversation turn. Do
    // not project either path as a second user bubble in the transcript.
    let intentAlreadyRecorded = mode === "repair";
    if (mode === "create" && !selectedMaterial && !options.skipToolGate) {
      const toolGate = await tryToolGate(text, chatAssignment, lease);
      intentAlreadyRecorded = true;
      // A newer submission may have superseded this lease while tryToolGate
      // awaited its model call. Stop here instead of falling through into
      // the pipeline below for a turn that's no longer the active run.
      if (!agentRunCoordinatorRef.current.isActive(lease)) return;
      if (toolGate.handled) {
        finishActiveRun(lease);
        if (activeRunRef.current === lease) activeRunRef.current = null;
        setAgentBusy(false);
        return;
      }
      regenerationDecision = toolGate.regenerationDecision;
      pageTargetingDecision = toolGate.pageTargetingDecision;
      // A clarifying answer already folds into the brief; otherwise use the
      // model's distilled brief from proceed_with_generation, if any.
      clarifiedBrief = toolGate.clarifiedBrief ?? toolGate.refinedBrief;
    }

    setRunStartedAt(Date.now());
    setLiveAgentOutput("");
    setRunError(null);
    const webSearchSupported = supportsWebSearch(chatAssignment, providerList);
    setExecutionNotices([
      ...composerRouteNotices(route),
      ...(webSearchEnabled && !webSearchSupported
        ? [
            "Web search is unavailable for the selected chat provider. The Agent continued without web grounding.",
          ]
        : []),
    ]);
    const runId = `workspace:${lease.id}`;
    startAgentRun(mode, { runId });
    if (!intentAlreadyRecorded) {
      emitRunEvent(runId, { type: "intent-recorded", intent: text });
    }
    setRunCancelled(false);
    try {
      let plan = prototypePlan;
      let plannerBrief = repair
        ? text
        : await researchedBrief(
            clarifiedBrief ?? text,
            chatAssignment,
            webSearchSupported,
            lease,
            runId,
          );
      plannerBrief = applyPendingSteers(lease, plannerBrief);
      let generationBrief = plannerBrief;

      if (!plan) {
        plan = await planPrototypeSuite(plannerBrief, chatAssignment, lease);
        if (plan.humanLoop.mode === "ask") return;
      }

      if (plan.humanLoop.mode === "ask") {
        const answer = resolveHumanLoopAnswer(
          plan.humanLoop,
          humanLoopChoiceId,
          humanLoopCustomAnswer,
        );
        generationBrief = composeHumanLoopRequirement(
          plannerBrief,
          plan.humanLoop,
          answer,
        );
        generationBrief = applyPendingSteers(lease, generationBrief);
        plan = await planPrototypeSuite(generationBrief, chatAssignment, lease);
        if (plan.humanLoop.mode === "ask") return;
      }

      autoNamePendingRef.current = repair ? repair.deconstructPages : true;
      generationBrief = applyPendingSteers(lease, generationBrief);
      if (!repair || repair.deconstructPages) setNamingStatus("pending");
      const resolvedTargetPageIds = pageTargetingDecision
        ? pagesForScope(plan, prototypeScope)
            .filter((page) =>
              pageTargetingDecision.targetPageNames.includes(page.name),
            )
            .map((page) => page.id)
        : undefined;
      await generatePrototypeSuite(
        generationBrief,
        plan,
        route,
        {
          startFresh: regenerationDecision
            ? regenerationDecision.forceRegenerateDesignSystem
            : !repair &&
              hasSlices &&
              isPrototypeSuiteComplete(
                plan,
                prototypeScope,
                prototypePages,
                prototypeDesignSystem,
              ),
          forceParallel:
            regenerationDecision &&
            regenerationDecision.parallelPageGeneration !== "auto"
              ? regenerationDecision.parallelPageGeneration === "parallel"
              : undefined,
          repair: repair ?? undefined,
          targetPageIds:
            resolvedTargetPageIds && resolvedTargetPageIds.length > 0
              ? resolvedTargetPageIds
              : targetedRepair &&
                  plannedImpact.effectiveTarget?.kind === "prototype-page"
                ? [plannedImpact.effectiveTarget.id]
                : undefined,
          materialReference,
        },
        lease,
      );
    } catch (error) {
      autoNamePendingRef.current = false;
      if (isAgentRunCancelled(error) || lease.controller.signal.aborted) {
        agentRunCoordinatorRef.current.publish(lease, () =>
          setRunCancelled(true),
        );
        return;
      }
      const message = errorMessage(error);
      const displayMessage = userFacingGenerationError(message);
      recordAiNativeDiagnostic({
        level: "error",
        scope: "workspace.create-assets",
        message,
        details: {
          displayMessage,
          briefLength: text.length,
          workflowPhase,
          hasPrototypePlan: Boolean(prototypePlan),
          chatProviderId: chatAssignment.providerId,
          chatModel: chatAssignment.model,
          imageProviderId: imageAssignment.providerId,
          imageModel: imageAssignment.model,
        },
      });
      setRunError(displayMessage);
      toast.error("Generation failed", {
        description: displayMessage,
      });
    } finally {
      if (agentRunCoordinatorRef.current.isActive(lease)) {
        setAgentBusy(false);
        setWorkflowPhase((phase) =>
          phase === "planning" ||
          phase === "design-system" ||
          phase === "generating-suite"
            ? "idle"
            : phase,
        );
        if (!autoNamePendingRef.current) {
          finishActiveRun(lease);
          if (activeRunRef.current === lease) activeRunRef.current = null;
        }
      }
    }
  }

  /**
   * Before falling into the hardcoded plan→design-system→pages sequence, let
   * the model decide — via real tool-calling, not keyword sniffing, and in
   * ONE central tool list per call (Claude Code's `assembleToolPool`
   * pattern, not a chain of single-tool gates) — whether this brief is
   * asking to compile an Astryx theme, configure how an existing prototype
   * suite regenerates, regenerate only specific existing pages, needs a
   * clarifying question before proceeding, or isn't a build request at all
   * (a greeting, small talk, a question too vague to plan from). All five
   * tools are free, local, and deterministic (`ask_clarifying_question`
   * suspends on user input, not on a paid call) — no DAG, no paid-tool
   * approval chain. None of them execute `generatePrototypeSuite` itself;
   * they only decide inputs the caller feeds into that same, unmodified
   * call — the paid generation path and its checkpoint/lease discipline are
   * never touched.
   *
   * `handled: true` means a tool fully answered the turn — the caller
   * returns immediately without falling into the fixed pipeline. Otherwise
   * `regenerationDecision`/`pageTargetingDecision`/`clarifiedBrief` carry
   * whatever the model decided (or null, meaning: keep today's heuristics
   * and original text) for the caller to fold into what follows.
   */
  async function tryToolGate(
    text: string,
    chat: ModelAssignment,
    lease: AgentRunLease,
  ): Promise<{
    handled: boolean;
    regenerationDecision: RegenerationDecision | null;
    pageTargetingDecision: PageTargetingDecision | null;
    clarifiedBrief: string | null;
    /** A model-distilled brief (from proceed_with_generation) to generate from. */
    refinedBrief: string | null;
  }> {
    const designMarkdownContent =
      prototypeDesignSystem?.designMarkdown.trim() ||
      importedDesignMarkdown?.content.trim() ||
      (prototypePlan
        ? prototypeDesignMarkdown(
            prototypePlan,
            importedDesignMarkdown?.content,
          )
        : null);
    const designModel = designMarkdownContent
      ? parseEditableDesignMarkdown(designMarkdownContent)
      : null;
    const astryxTool =
      designModel && astryxColorChoices(designModel).length > 0
        ? astryxThemeTool(designModel)
        : null;
    const regenerationTool =
      prototypeDesignSystem || prototypePages.length > 0
        ? configureRegenerationTool()
        : null;
    const targetablePages = prototypePlan
      ? pagesForScope(prototypePlan, prototypeScope).map((page) => ({
          id: page.id,
          name: page.name,
        }))
      : [];
    const pageTargetingTool =
      targetablePages.length > 0
        ? configurePageTargetingTool(targetablePages)
        : null;
    // Always offered, unlike the ones above — a brand-new session (no design
    // system, no colors yet) is exactly where "hello" would otherwise have
    // nothing to opt out with and fall straight into the fixed pipeline.
    const replyTool = conversationalReplyTool();
    // The model's explicit "run the pipeline" decision — it can distill a
    // cleaner brief from a rambling message before the expensive generation.
    const proceedTool = proceedWithGenerationTool();
    const toolRunId = `workspace:tool:${crypto.randomUUID()}`;
    const askTool = askClarifyingQuestionTool(
      clarificationBridge,
      toolRunId,
      lease.controller.signal,
    );
    const tools = [
      astryxTool,
      regenerationTool,
      pageTargetingTool,
      proceedTool,
      askTool,
      replyTool,
    ].filter((tool) => tool !== null);
    const capabilityContext = agentCapabilityContext(tools);
    const actionableToolCount = [
      astryxTool,
      regenerationTool,
      pageTargetingTool,
      proceedTool,
    ].filter((tool) => tool !== null).length;
    // askTool is always offered, and its execute() can call clarificationBridge.ask()
    // which emits a `human-loop-asked` run event LIVE, synchronously, from inside the
    // model call below (see clarification-bridge.ts's doc comment). appendRunEvent
    // silently drops any event whose runId isn't already the active run, so the run
    // must be started for toolRunId before runToolLoop can invoke the tool — otherwise
    // the live ask is dropped and the suspended tool call has no visible way to
    // resolve. The astryx/regeneration branches below call startAgentRun again with
    // the same runId, which is a no-op once the run is already active.
    startAgentRun("create", { runId: toolRunId });
    // Project the user's turn into the conversation before the model replies
    // (greetings, questions, and build requests all share this chat surface).
    emitRunEvent(toolRunId, { type: "intent-recorded", intent: text });

    const toolLoop = await runToolLoop(personalizedGenerationRef.current, {
      runId: toolRunId,
      providerId: chat.providerId,
      model: chat.model,
      prompt: [
        "The user is talking to a design-tool Agent. Call at most one of the non-question tools " +
          "below, and only if the request explicitly matches it. You may also call " +
          "`ask_clarifying_question` first if needed — after it returns an answer, decide whether " +
          "to then call one of the other tools with that answer in hand, or finish.",
        astryxTool
          ? "- `compile_astryx_theme`: the user is asking to map DESIGN.md colors to Astryx theme " +
            "variables and/or generate/compile an Astryx theme."
          : null,
        regenerationTool
          ? "- `configure_prototype_regeneration`: the user is asking to redo/regenerate the design " +
            "system, or to control whether pages generate in parallel or one at a time, for the " +
            "prototype suite that already exists."
          : null,
        pageTargetingTool
          ? "- `select_pages_to_regenerate`: the user is naming one or more specific existing pages " +
            "to redo, leaving the rest of the prototype suite untouched."
          : null,
        "- `reply_conversationally`: the message is not a build/design request at all — a greeting, " +
          "small talk, a question, or too vague to plan a product from.",
        "- `ask_clarifying_question`: the request IS a real build/design request, but a key decision " +
          "(platform, primary user, a must-have feature) is genuinely ambiguous enough that guessing " +
          "would likely produce the wrong direction. Do not ask for politeness or a detail you can " +
          "reasonably decide yourself.",
        "- `proceed_with_generation`: the message is a real design/build request that is clear enough " +
          "to proceed. Prefer calling this (with a distilled, self-contained brief) over doing nothing " +
          "— especially when the message is rambling or buried in asides and a cleaned-up brief would " +
          "produce a better result. Preserve every concrete requirement; do not add scope.",
        "If none of these fit, call nothing — it falls through to the design pipeline with the " +
          "original message unchanged.",
        "",
        capabilityContext,
        "",
        `User: ${text}`,
      ]
        .filter((line) => line !== null)
        .join("\n"),
      tools,
      // +2 when ask_clarifying_question is on offer: one step to ask, one
      // more to decide-and-call (or finish) after the answer comes back —
      // on top of the existing "more than one actionable tool" allowance.
      maxSteps: (actionableToolCount > 1 ? 3 : 2) + 2,
      signal: lease.controller.signal,
    });
    // A newer submission may have superseded this lease while the model call
    // above was in flight (createAssets begins the lease synchronously,
    // before this await, so a second submission aborts this one). Discard
    // the result instead of firing toasts/clipboard writes/startAgentRun for
    // a turn that's no longer the active run.
    if (!agentRunCoordinatorRef.current.isActive(lease)) {
      return {
        handled: false,
        regenerationDecision: null,
        pageTargetingDecision: null,
        clarifiedBrief: null,
        refinedBrief: null,
      };
    }
    if (!toolLoop.ok) {
      console.info("[Cutout] tool gate failed:", toolLoop.error);
      return {
        handled: false,
        regenerationDecision: null,
        pageTargetingDecision: null,
        clarifiedBrief: null,
        refinedBrief: null,
      };
    }
    if (!toolLoop.data.called) {
      return {
        handled: false,
        regenerationDecision: null,
        pageTargetingDecision: null,
        clarifiedBrief: null,
        refinedBrief: null,
      };
    }

    const conversationalCall = toolLoop.data.calls.find(
      (call) => call.toolName === "reply_conversationally",
    );
    const astryxCall = toolLoop.data.calls.find(
      (call) => call.toolName === "compile_astryx_theme",
    );
    const regenerationCall = toolLoop.data.calls.find(
      (call) => call.toolName === "configure_prototype_regeneration",
    );
    const pageTargetingCall = toolLoop.data.calls.find(
      (call) => call.toolName === "select_pages_to_regenerate",
    );
    const proceedCall = toolLoop.data.calls.find(
      (call) => call.toolName === "proceed_with_generation",
    );
    const refinedBrief =
      proceedCall && !proceedCall.error
        ? (proceedCall.toolOutput as GenerationDecision).refinedBrief
        : null;
    // A single tryToolGate turn can call ask_clarifying_question more than
    // once (e.g. the model asks, gets an answer, and still finds a second
    // ambiguity within the same step budget). Keep every call in order so
    // the fold below can incorporate all of them instead of only the first.
    const askCalls = toolLoop.data.calls.filter(
      (call) => call.toolName === "ask_clarifying_question",
    );

    const failedAskCall = askCalls.find((call) => call.error);
    if (failedAskCall) {
      toast.error("Clarifying question failed", {
        description: failedAskCall.error,
      });
    }

    if (conversationalCall && !conversationalCall.error) {
      const reply = (conversationalCall.toolOutput as ConversationalReplyInput)
        .reply;
      setAgentDockVisible(true);
      setFilesDockVisible(false);
      emitRunEvents(toolLoop.data.events);
      const streamedReply = await streamConversationalReply(
        text,
        reply,
        chat,
        lease,
        capabilityContext,
      );
      if (!agentRunCoordinatorRef.current.isActive(lease)) {
        return {
          handled: true,
          regenerationDecision: null,
          pageTargetingDecision: null,
          clarifiedBrief: null,
          refinedBrief: null,
        };
      }
      emitRunEvent(toolRunId, {
        type: "agent-message",
        message: streamedReply,
      });
      return {
        handled: true,
        regenerationDecision: null,
        pageTargetingDecision: null,
        clarifiedBrief: null,
        refinedBrief: null,
      };
    }

    if (conversationalCall?.error) {
      toast.error("Agent reply failed", {
        description: conversationalCall.error,
      });
      return {
        handled: true,
        regenerationDecision: null,
        pageTargetingDecision: null,
        clarifiedBrief: null,
        refinedBrief: null,
      };
    }

    if (astryxCall) {
      startAgentRun("create", { runId: toolRunId });
      emitRunEvents(toolLoop.data.events);
      // Scoped to astryxCall itself, not "any tool-failed event in the whole
      // turn" — since the gate now registers three tools in one call, an
      // unrelated failure elsewhere in the same turn must not mark a
      // perfectly good Astryx binding as failed.
      const failed = Boolean(astryxCall.error);
      emitRunEvent(
        toolRunId,
        failed
          ? { type: "outcome-evaluated", status: "needs-repair", missing: [] }
          : { type: "outcome-evaluated", status: "satisfied", missing: [] },
      );

      if (failed) {
        toast.error("Astryx theme compilation failed", {
          description:
            toolLoop.data.text ||
            "The Agent could not complete the requested mapping.",
        });
        return {
          handled: true,
          regenerationDecision: null,
          pageTargetingDecision: null,
          clarifiedBrief: null,
          refinedBrief: null,
        };
      }

      const binding = astryxCall.toolOutput as AstryxBinding;
      const themeFile = binding.files.find(
        (file) => file.path.startsWith("astryx/") && file.path.endsWith(".ts"),
      );
      if (themeFile) {
        try {
          await navigator.clipboard.writeText(themeFile.content);
        } catch {
          // best-effort convenience copy only
        }
      }
      toast.success(`Astryx theme "${binding.agentBrief.themeName}" compiled`, {
        description: themeFile
          ? `${themeFile.path} copied to clipboard. Open the Design panel's Astryx tab for the rest of the bundle.`
          : "Open the Design panel's Astryx tab to review the bundle.",
      });
      return {
        handled: true,
        regenerationDecision: null,
        pageTargetingDecision: null,
        clarifiedBrief: null,
        refinedBrief: null,
      };
    }

    // regenerationCall and pageTargetingCall are both pure decisions (never
    // `handled: true`), so both can legitimately fire in the same turn even
    // though the prompt above asks for "at most one". Handle them together
    // in a single block — calling emitRunEvents(toolLoop.data.events) once
    // per branch would double-emit the same event batch if both are present.
    if (regenerationCall || pageTargetingCall) {
      startAgentRun("create", { runId: toolRunId });
      emitRunEvents(toolLoop.data.events);
      const failed =
        Boolean(regenerationCall?.error) || Boolean(pageTargetingCall?.error);
      emitRunEvent(
        toolRunId,
        failed
          ? { type: "outcome-evaluated", status: "needs-repair", missing: [] }
          : { type: "outcome-evaluated", status: "satisfied", missing: [] },
      );

      if (regenerationCall?.error) {
        toast.error("Regeneration strategy request failed", {
          description: regenerationCall.error,
        });
      }
      if (pageTargetingCall?.error) {
        toast.error("Page selection failed", {
          description: pageTargetingCall.error,
        });
      }
    }

    // ask_clarifying_question resolved this turn — fold the Q&A into the
    // brief the same way the existing cross-invocation humanLoop.mode==='ask'
    // answer path already does, and let the fixed pipeline plan from the
    // disambiguated text. This must run regardless of whether the same turn
    // also called configure_prototype_regeneration, otherwise the user's
    // answer (already recorded/shown as resolved) would be silently dropped.
    const successfulAskCalls = askCalls.filter((call) => !call.error);
    if (successfulAskCalls.length > 0) {
      // Fold every ask/answer pair from this turn into the brief, in call
      // order, so a second (or later) clarifying question's answer is not
      // silently dropped in favor of only the first.
      const clarifiedBrief = successfulAskCalls.reduce((brief, call) => {
        const input = call.toolInput as AskClarifyingQuestionInput;
        const answer = call.toolOutput as ResolvedHumanLoopAnswer;
        const loop: PrototypeHumanLoopAsk = { mode: "ask", ...input };
        return composeHumanLoopRequirement(brief, loop, answer);
      }, text);
      return {
        handled: false,
        regenerationDecision:
          regenerationCall && !regenerationCall.error
            ? (regenerationCall.toolOutput as RegenerationDecision)
            : null,
        pageTargetingDecision:
          pageTargetingCall && !pageTargetingCall.error
            ? (pageTargetingCall.toolOutput as PageTargetingDecision)
            : null,
        clarifiedBrief,
        refinedBrief,
      };
    }

    return {
      handled: false,
      regenerationDecision:
        regenerationCall && !regenerationCall.error
          ? (regenerationCall.toolOutput as RegenerationDecision)
          : null,
      pageTargetingDecision:
        pageTargetingCall && !pageTargetingCall.error
          ? (pageTargetingCall.toolOutput as PageTargetingDecision)
          : null,
      clarifiedBrief: null,
      refinedBrief,
    };
  }

  useEffect(() => {
    // Keep the handoff pending until local model assignments have loaded. A
    // premature consume would open Settings and lose the user's auto-run.
    if (assignments.isPending) return;
    const request = getStoreState().consumeAgentRun();
    if (request?.intent === "create-assets") void createAssets();
    // The store request is a one-shot mount handoff. Re-running this effect for
    // changing workspace state would risk duplicate paid generation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignments.isPending, pendingAgentRunId]);

  async function planPrototypeSuite(
    text: string,
    chat: ModelAssignment,
    lease: AgentRunLease,
  ): Promise<PrototypePlan> {
    agentRunCoordinatorRef.current.checkpoint(lease);
    setWorkflowPhase("planning");
    const result = await planPrototype(personalizedGenerationRef.current, {
      providerId: chat.providerId,
      model: chat.model,
      brief: text,
      intent: getStoreState().intent ?? undefined,
      effort: chat.effort,
      signal: lease.controller.signal,
    });
    agentRunCoordinatorRef.current.checkpoint(lease);
    if (isErr(result)) {
      console.info("[Cutout] prototype planner failed:", result.error);
      const displayMessage = userFacingGenerationError(result.error);
      recordAiNativeDiagnostic({
        level: "error",
        scope: "prototype-planner",
        message: result.error,
        details: {
          displayMessage,
          briefLength: text.length,
          hasIntent: Boolean(getStoreState().intent),
          providerId: chat.providerId,
          model: chat.model,
          effort: chat.effort,
        },
      });
      setPrototypePlan(null);
      setPrototypePages([]);
      setPrototypeDesignSystem(null);
      setSelectedPrototypePageId(null);
      setHumanLoopChoiceId(null);
      setHumanLoopCustomAnswer("");
      setLiveAgentOutput("");
      setRunError(displayMessage);
      setWorkflowPhase("idle");
      throw new Error(displayMessage);
    }

    setPrototypePlan(result.data);
    setPrototypePages([]);
    setPrototypeDesignSystem(null);
    setSelectedPrototypePageId(null);
    setHumanLoopChoiceId(defaultHumanLoopChoiceId(result.data));
    setHumanLoopCustomAnswer("");
    setLiveAgentOutput("");
    setWorkflowPhase("review");
    return result.data;
  }

  async function generatePrototypeSuite(
    text: string,
    plan: PrototypePlan,
    route: LockedComposerRoute,
    options: {
      readonly startFresh?: boolean;
      readonly repair?: PrototypeRepairPlan;
      readonly targetPageIds?: readonly string[];
      /** Exact selected material bytes, retained as a visual conditioning reference. */
      readonly materialReference?: Uint8Array;
      /** Overrides the page-count heuristic below when the user explicitly asked for one or the other. */
      readonly forceParallel?: boolean;
    },
    lease: AgentRunLease,
  ): Promise<void> {
    agentRunCoordinatorRef.current.checkpoint(lease);
    const image = route.image;

    const pages = pagesForScope(plan, prototypeScope);
    if (pages.length === 0) throw new Error("The prototype plan has no pages.");
    const pageIds = new Set(pages.map((page) => page.id));
    const targetPageIds = new Set(options.targetPageIds ?? []);
    const reusablePages =
      options.startFresh && targetPageIds.size === 0
        ? []
        : sortPrototypePages(
            prototypePages.filter(
              (artifact) =>
                pageIds.has(artifact.page.id) &&
                !targetPageIds.has(artifact.page.id),
            ),
            pages,
          );
    const reusableDesignSystem =
      options.startFresh || options.repair?.generateDesignSystem
        ? null
        : prototypeDesignSystem;
    const assetManifest = createPrototypeAssetManifest(plan, pages);
    recordAiNativeDiagnostic({
      level: "info",
      scope: "prototype-asset-manifest",
      message: "Generated prototype asset manifest for this run.",
      details: {
        version: assetManifest.version,
        product: assetManifest.product,
        pageCount: assetManifest.pages.length,
        assetCount: assetManifest.assets.length,
        assets: assetManifest.assets.map((asset) => ({
          id: asset.id,
          recommendedName: asset.recommendedName,
          pageId: asset.pageId,
          regionId: asset.regionId,
          assetRoute: asset.assetRoute,
          source: asset.source,
          description: asset.description,
        })),
      },
    });

    if (options.startFresh) {
      setPrototypePages(reusablePages);
      setPrototypeDesignSystem(null);
      setSelectedPrototypePageId(
        reusablePages.length > 0 ? (reusablePages[0]?.page.id ?? null) : null,
      );
    } else if (reusablePages.length > 0) {
      setPrototypePages(reusablePages);
      setSelectedPrototypePageId((selected) =>
        selected && pageIds.has(selected)
          ? selected
          : (reusablePages[0]?.page.id ?? null),
      );
    }
    setWorkflowPhase("design-system");

    const chat = route.chat;
    const generationContext = selectedMaterial
      ? [
          importedDesignMarkdown?.content,
          `An exact visual reference of the selected material is attached. Preserve its identity unless the requested correction explicitly changes it.`,
          `Requested correction for ${selectedMaterial.kind} "${selectedMaterial.label}":\n${text}`,
        ]
          .filter(Boolean)
          .join("\n\n")
      : importedDesignMarkdown?.content;

    let designSystem =
      reusableDesignSystem ??
      (await generatePrototypeDesignSystem(
        plan,
        image,
        chat,
        generationContext,
        options.materialReference,
        lease,
      ));
    if (!reusableDesignSystem) setPrototypeDesignSystem(designSystem);

    if (options.repair?.synthesizeDesignMarkdown && reusableDesignSystem) {
      const designMarkdown =
        (await synthesizeDesignMarkdownFromReference(
          plan,
          chat,
          reusableDesignSystem.bytes,
          importedDesignMarkdown?.content,
          lease,
        )) ?? prototypeDesignMarkdown(plan, importedDesignMarkdown?.content);
      designSystem = { ...reusableDesignSystem, designMarkdown };
      setPrototypeDesignSystem(designSystem);
    }

    if (
      options.repair &&
      !options.repair.generatePages &&
      !options.repair.deconstructPages
    ) {
      setWorkflowPhase("idle");
      return;
    }
    setWorkflowPhase("generating-suite");

    // The image-grounded DESIGN.md stored on the design-system artifact is the
    // final text contract for page generation. The earlier generationContext
    // is only an input to design-system synthesis and must not bypass its result.
    const pageDesignContext =
      !designSystemMarkdownValidationError(designSystem.designMarkdown)
        ? designSystem.designMarkdown
        : generationContext;

    const runSerial =
      options.forceParallel === undefined
        ? pages.length <= SERIAL_REFERENCE_PAGE_LIMIT
        : !options.forceParallel;
    const generated =
      options.repair && !options.repair.generatePages
        ? reusablePages
        : runSerial
          ? await generatePagesSerial(
              plan,
              pages,
              image,
              route.chat,
              designSystem,
              lease,
              pageDesignContext,
              reusablePages,
              options.materialReference,
            )
          : await generatePagesParallel(
              plan,
              pages,
              image,
              route.chat,
              designSystem,
              lease,
              pageDesignContext,
              reusablePages,
              options.materialReference,
            );
    agentRunCoordinatorRef.current.checkpoint(lease);
    const first = options.targetPageIds?.length
      ? generated.find((artifact) => targetPageIds.has(artifact.page.id))
      : generated[0];
    if (!first) throw new Error("The model returned no prototype pages.");

    setSelectedPrototypePageId(first.page.id);
    if (options.repair && !options.repair.deconstructPages) {
      setWorkflowPhase("idle");
      return;
    }
    const nextMockup = await artifactToMockup(first);
    agentRunCoordinatorRef.current.checkpoint(lease);
    setMockup(nextMockup);

    const productionRunId = `asset-production:${lease.id}`;
    const pageSources = await Promise.all(
      generated.map(async (artifact) => ({
        page: artifact.page,
        bytes: artifact.bytes,
        artifactId: await desktopTools.persistReference(
          artifact.bytes,
          artifact.mediaType,
          productionRunId,
        ),
      })),
    );
    const designSystemArtifactId = await desktopTools.persistReference(
      designSystem.bytes,
      designSystem.mediaType,
      productionRunId,
    );
    const productionPlan = await compilePrototypeProductionPlan({
      projectRevisionId:
        designDocument?.revision.id
        ?? `workspace-revision:${designSystemArtifactId.slice(-24)}`,
      designSystemArtifactId,
      manifest: assetManifest,
      pages: pageSources,
    });
    let productionSnapshot = getStoreState().assetProduction;
    const requestedRepairRegions = new Set(options.repair?.targetRegionIds ?? []);
    const previousRun = Object.values(productionSnapshot.runs)
      .filter(
        (run) =>
          run.runId !== productionRunId &&
          run.planHash === productionPlan.planHash &&
          run.status !== "cancelled",
      )
      .sort((left, right) => right.startedAt - left.startedAt)[0];
    const startedProduction = beginPrototypeProduction({
      snapshot: productionSnapshot,
      plan: productionPlan,
      runId: productionRunId,
      at: Date.now(),
    });
    const commitProduction = (next: typeof productionSnapshot) => {
      const expectedRevision = productionSnapshot.revision;
      if (!getStoreState().commitAssetProduction(expectedRevision, next)) {
        throw new Error("Asset production changed while this prototype run was active.");
      }
      productionSnapshot = next;
    };
    commitProduction(startedProduction);

    const targetsKnownTask = productionPlan.tasks.some((task) =>
      requestedRepairRegions.has(task.regionId),
    );
    const canCarryRepair =
      requestedRepairRegions.size > 0 &&
      targetsKnownTask &&
      Boolean(previousRun) &&
      productionPlan.tasks
        .filter((task) => !requestedRepairRegions.has(task.regionId))
        .every((task) => {
          const state = previousRun?.tasks[task.taskId];
          return Boolean(
            state &&
            (state.output ?? state.candidate) &&
            ["ready", "waived"].includes(state.status),
          );
        });
    const executionTargetRegions = canCarryRepair ? requestedRepairRegions : null;
    const carriedBindings: Array<{
      taskId: string;
      outputArtifactId: string;
      readiness: "ready" | "waived";
    }> = [];
    if (executionTargetRegions && previousRun) {
      for (const task of productionPlan.tasks) {
        if (executionTargetRegions.has(task.regionId)) continue;
        commitProduction(
          carryPrototypeTaskPublication({
            snapshot: productionSnapshot,
            fromRunId: previousRun.runId,
            toRunId: productionRunId,
            taskId: task.taskId,
            at: Date.now(),
          }),
        );
        const state = productionSnapshot.runs[productionRunId]!.tasks[task.taskId]!;
        const artifact = state.output ?? state.candidate;
        if (artifact && (state.status === "ready" || state.status === "waived")) {
          carriedBindings.push({
            taskId: task.taskId,
            outputArtifactId: artifact.artifactId,
            readiness: state.status,
          });
        }
      }
    }

    const regionRunId = getStoreState().beginSliceProjection(
      executionTargetRegions ? [...executionTargetRegions] : undefined,
    );
    if (carriedBindings.length > 0) {
      getStoreState().rebindProductionSliceProjection(
        productionRunId,
        carriedBindings,
      );
    }
    autoNamePendingRef.current = false;
    const failOpenTasks = (message: string) => {
      const run = productionSnapshot.runs[productionRunId];
      if (!run) return;
      for (const task of productionPlan.tasks) {
        const status = run.tasks[task.taskId]?.status;
        if (!status || ["ready", "waived", "legacy-ready", "failed", "cancelled"].includes(status)) {
          continue;
        }
        commitProduction(
          failPrototypeTask({
            snapshot: productionSnapshot,
            runId: productionRunId,
            taskId: task.taskId,
            issues: [integrityIssue("production-interrupted", message)],
            at: Date.now(),
          }),
        );
      }
    };

    try {
      const directTasks = productionPlan.tasks.filter(
        (candidate) =>
          candidate.route === "direct-generate" &&
          (!executionTargetRegions || executionTargetRegions.has(candidate.regionId)),
      );
      await forEachConcurrent(
        directTasks,
        PROTOTYPE_GENERATION_CONCURRENCY,
        async (task) => {
        const pageArtifact = generated.find(
          (candidate) => candidate.page.id === task.pageId,
        );
        if (!pageArtifact) {
          commitProduction(
            failPrototypeTask({
              snapshot: productionSnapshot,
              runId: productionRunId,
              taskId: task.taskId,
              issues: [
                integrityIssue(
                  "direct-source-missing",
                  `Source page ${task.pageId} is unavailable for ${task.manifestItemId}.`,
                ),
              ],
              at: Date.now(),
            }),
          );
          return;
        }
        try {
          agentRunCoordinatorRef.current.checkpoint(lease);
          const directPrompt = prototypeDirectAssetPrompt({
            task,
            page: pageArtifact.page,
            styleSummary: plan.designSystem.styleSummary,
            assetDirection: plan.designSystem.assetDirection,
          });
          const providerKind = (providers.data ?? []).find(
            (provider) => provider.id === image.providerId,
          )?.kind;
          const useEdit =
            providerKind === "openai" || providerKind === "openai-compatible";
          const references = [pageArtifact.bytes, designSystem.bytes];
          let generatedAsset: { readonly bytes: Uint8Array; readonly mediaType: string } | null = null;
          const directOutcome = await generateWithQa({
            basePrompt: directPrompt,
            generate: async (prompt, signal) => {
              const result = useEdit
                ? await personalizedGenerationRef.current.editImage({
                    providerId: image.providerId,
                    model: image.model,
                    prompt,
                    images: references,
                    inputFidelity: "high",
                    signal,
                  })
                : await personalizedGenerationRef.current.generateImages({
                    providerId: image.providerId,
                    model: image.model,
                    system: prompt,
                    input: [
                      { type: "text", text: prompt },
                      ...references.map((reference) => ({
                        type: "image" as const,
                        image: reference,
                      })),
                    ],
                    signal,
                  });
              if (isErr(result)) throw new Error(result.error);
              const asset = result.data[0];
              if (!asset) throw new Error(`No direct asset returned for ${task.manifestItemId}.`);
              generatedAsset = asset;
              return asset.bytes;
            },
            review: (bytes, signal) =>
              reviewGeneratedImage(
                personalizedGenerationRef.current,
                route.chat,
                bytes,
                prototypeDirectAssetChecklist(task),
                signal,
              ),
            maxRetries: PROTOTYPE_QA_MAX_RETRIES,
            signal: lease.controller.signal,
          });
          if (!generatedAsset) {
            throw new Error(`No direct asset returned for ${task.manifestItemId}.`);
          }
          const decoded = await decodePrototypeImage(
            generatedAsset,
            (base) => base,
          );
          const persisted = await desktopTools.persistCutout(
            decoded.bytes,
            decoded.mediaType,
            productionRunId,
          );
          const artifactRef: ProductionArtifactRef = {
            ...persisted,
            mediaType: decoded.mediaType,
            width: decoded.width,
            height: decoded.height,
          };
          const reviewIssues: ProductionIssue[] = directOutcome.verdict.pass
            ? []
            : [
                qualityIssue(
                  directOutcome.verdict.unavailable
                    ? "direct-qa-unavailable"
                    : "direct-qa-rejected",
                  directOutcome.verdict.failures.join(" ") || "Direct asset QA rejected the output.",
                ),
              ];
          commitProduction(
            publishPrototypeTaskArtifact({
              snapshot: productionSnapshot,
              runId: productionRunId,
              taskId: task.taskId,
              artifact: artifactRef,
              reviewIssues,
              evidence: {
                sourceArtifactId: pageSources.find(
                  (source) => source.page.id === task.pageId,
                )?.artifactId,
                bounds: { x: 0, y: 0, width: decoded.width, height: decoded.height },
                qaVerdict: {
                  ...directOutcome.verdict,
                  failures: [...directOutcome.verdict.failures],
                },
                providerRoute: `${image.providerId}/${image.model}`,
              },
              at: Date.now(),
            }),
          );
          const taskState = productionSnapshot.runs[productionRunId]!.tasks[task.taskId]!;
          getStoreState().appendSliceProjection(regionRunId, {
            slices: [
              {
                id: `direct:${task.taskId}`,
                index: 0,
                box: { x: 0, y: 0, width: decoded.width, height: decoded.height },
                blob: decoded.blob,
                width: decoded.width,
                height: decoded.height,
                included: isConsumableTask(taskState),
                reviewIssues: taskState.issues.map((issue) => issue.message),
                regionId: task.regionId,
                pageId: task.pageId,
                assetManifestItemId: task.manifestItemId,
                productionTaskId: task.taskId,
                productionRunId,
                outputArtifactId: artifactRef.artifactId,
                readiness: taskState.status,
              },
            ],
          });
          getStoreState().renameSlice(
            `direct:${task.taskId}`,
            task.label ?? task.manifestItemId,
          );
        } catch (error) {
          if (lease.controller.signal.aborted) throw error;
          commitProduction(
            failPrototypeTask({
              snapshot: productionSnapshot,
              runId: productionRunId,
              taskId: task.taskId,
              issues: [
                integrityIssue(
                  "direct-generation-failed",
                  error instanceof Error ? error.message : String(error),
                ),
              ],
              at: Date.now(),
            }),
          );
        }
        },
      );

      const extractionPageIds = new Set(
        selectPagesWithBoardCutouts(generated.map((artifact) => artifact.page)).map(
          (page) => page.id,
        ),
      );
      const extractionTargets = generated.filter((artifact) =>
        extractionPageIds.has(artifact.page.id),
      );
      const cutoutParams = getStoreState().params;
      for (const artifact of extractionTargets) {
        const referenceBytes = generated
          .filter((candidate) => candidate.page.id !== artifact.page.id)
          .map((candidate) => candidate.bytes);
        await runRegionBreakdown(
          {
            generation: personalizedGenerationRef.current,
            providers: { list: async () => providers.data ?? [] },
            decode: (bytes) => decodeImage(bytesToBlob(bytes, "image/png")),
            slice: (bitmap, regionId, pageId, signal) =>
              sliceRegionBoardBitmap(bitmap, cutoutParams, regionId, pageId, signal),
            nameRegion: (boardBytes, slices, context, signal) =>
              nameRegionSlices(
                personalizedGenerationRef.current,
                route.chat,
                boardBytes,
                slices,
                context,
                signal,
              ),
            reviewBoard: PROTOTYPE_QA_ENABLED
              ? (boardBytes, checklist, signal) =>
                  reviewGeneratedImage(
                    personalizedGenerationRef.current,
                    route.chat,
                    boardBytes,
                    checklist,
                    signal,
                  )
              : undefined,
          },
          {
            page: artifact.page,
            pageBytes: artifact.bytes,
            referenceImages: referenceBytes,
            image,
            signal: lease.controller.signal,
            targetRegionIds: executionTargetRegions
              ? [...executionTargetRegions]
              : undefined,
            qaMaxRetries: PROTOTYPE_QA_MAX_RETRIES,
            regionConcurrency: PROTOTYPE_GENERATION_CONCURRENCY,
            textFreeSource: true,
            onTextFreeSourceError: (message) =>
              console.info("[Cutout] text-free page variant failed, using original:", message),
            onRegionSliced: async (regionId, slices, evidence) => {
              agentRunCoordinatorRef.current.checkpoint(lease);
              const tasks = productionPlan.tasks.filter(
                (task) =>
                  task.route === "board-cutout" &&
                  task.pageId === artifact.page.id &&
                  task.regionId === regionId,
              );
              const boardGroupId = tasks[0]?.boardGroupId;
              const layout = productionPlan.boardLayouts.find(
                (candidate) => candidate.boardGroupId === boardGroupId,
              );
              if (!layout || tasks.length === 0) {
                throw new Error(`Board layout is unavailable for ${artifact.page.id}/${regionId}.`);
              }
              const persistedCandidates = await Promise.all(
                slices.map(async (slice) => {
                  const bytes = await blobToBytes(slice.blob);
                  const persisted = await desktopTools.persistCutout(
                    bytes,
                    slice.blob.type || "image/png",
                    productionRunId,
                  );
                  return {
                    slice,
                    candidate: {
                      box: slice.box,
                      artifact: {
                        ...persisted,
                        mediaType: slice.blob.type || "image/png",
                        width: slice.width,
                        height: slice.height,
                      } satisfies ProductionArtifactRef,
                    },
                  };
                }),
              );
              const assignment = assignBoardCandidates(
                layout,
                {
                  width: evidence.boardWidth,
                  height: evidence.boardHeight,
                  candidates: persistedCandidates.map((item) => item.candidate),
                },
                Date.now(),
              );
              const qualityIssues: ProductionIssue[] = [];
              if (!evidence.qaVerdict) {
                qualityIssues.push(
                  qualityIssue(
                    "board-qa-unavailable",
                    "Board QA did not produce a verdict.",
                  ),
                );
              } else if (!evidence.qaVerdict.pass) {
                qualityIssues.push(
                  qualityIssue(
                    evidence.qaVerdict.unavailable
                      ? "board-qa-unavailable"
                      : "board-qa-rejected",
                    evidence.qaVerdict.failures.join(" ") || "Board QA rejected the output.",
                  ),
                );
              }
              if (!evidence.diagnostics.compliant) {
                qualityIssues.push(
                  qualityIssue(
                    "board-background-noncompliant",
                    `Board border white ratio ${(evidence.diagnostics.borderWhiteRatio * 100).toFixed(1)}% is below policy.`,
                    "deterministic-check",
                  ),
                );
              }

              const projected: SliceInput[] = [];
              for (const task of tasks) {
                const assigned = assignment.byTaskId.get(task.taskId);
                if (!assigned) {
                  commitProduction(
                    failPrototypeTask({
                      snapshot: productionSnapshot,
                      runId: productionRunId,
                      taskId: task.taskId,
                      issues:
                        assignment.issues.length > 0
                          ? assignment.issues
                          : [
                              integrityIssue(
                                "board-slot-empty",
                                `No output was assigned to ${task.manifestItemId}.`,
                              ),
                            ],
                      at: Date.now(),
                    }),
                  );
                  continue;
                }
                const source = persistedCandidates.find(
                  (item) => item.candidate === assigned,
                );
                if (!source) {
                  commitProduction(
                    failPrototypeTask({
                      snapshot: productionSnapshot,
                      runId: productionRunId,
                      taskId: task.taskId,
                      issues: [
                        integrityIssue(
                          "board-candidate-source-missing",
                          `Assigned output bytes are unavailable for ${task.manifestItemId}.`,
                        ),
                      ],
                      at: Date.now(),
                    }),
                  );
                  continue;
                }
                commitProduction(
                  publishPrototypeTaskArtifact({
                    snapshot: productionSnapshot,
                    runId: productionRunId,
                    taskId: task.taskId,
                    artifact: assigned.artifact,
                    reviewIssues: [...assignment.issues, ...qualityIssues],
                    evidence: {
                      sourceArtifactId: pageSources.find(
                        (source) => source.page.id === task.pageId,
                      )?.artifactId,
                      bounds: source?.slice.box,
                      cutoutParams,
                      boardDiagnostics: evidence.diagnostics,
                      qaVerdict: evidence.qaVerdict
                        ? {
                            ...evidence.qaVerdict,
                            failures: [...evidence.qaVerdict.failures],
                          }
                        : undefined,
                      providerRoute: `${image.providerId}/${image.model}`,
                    },
                    at: Date.now(),
                  }),
                );
                const taskState = productionSnapshot.runs[productionRunId]!.tasks[task.taskId]!;
                projected.push({
                  ...source.slice,
                  included: isConsumableTask(taskState),
                  reviewIssues: taskState.issues.map((issue) => issue.message),
                  assetManifestItemId: task.manifestItemId,
                  productionTaskId: task.taskId,
                  productionRunId,
                  outputArtifactId: assigned.artifact.artifactId,
                  readiness: taskState.status,
                });
              }
              if (projected.length > 0) {
                getStoreState().appendSliceProjection(regionRunId, { slices: projected });
              }
              if (assignment.issues.length > 0) {
                throw new Error(
                  assignment.issues.map((issue) => issue.message).join(" "),
                );
              }
            },
            onRegionNamed: (renames) => {
              if (!agentRunCoordinatorRef.current.isActive(lease)) return;
              for (const { id, name } of renames) getStoreState().renameSlice(id, name);
            },
            onRegionQa: (regionId, attempt, verdict) => {
              if (!verdict.pass) {
                console.info("[Cutout] board QA rejected:", regionId, attempt, verdict.failures);
              }
            },
            onRegionDiagnostics: (regionId, diagnostics) => {
              if (!diagnostics.compliant) {
                console.info(
                  "[Cutout] board background non-compliant:",
                  regionId,
                  `border ${(diagnostics.borderWhiteRatio * 100).toFixed(1)}% white`,
                );
              }
            },
            onRegionError: (regionId, message) => {
              const tasks = productionPlan.tasks.filter(
                (task) =>
                  task.pageId === artifact.page.id &&
                  task.regionId === regionId &&
                  task.route === "board-cutout",
              );
              for (const task of tasks) {
                const status = productionSnapshot.runs[productionRunId]?.tasks[task.taskId]?.status;
                if (status !== "queued" && status !== "generating") continue;
                commitProduction(
                  failPrototypeTask({
                    snapshot: productionSnapshot,
                    runId: productionRunId,
                    taskId: task.taskId,
                    issues: [integrityIssue("board-production-failed", message)],
                    at: Date.now(),
                  }),
                );
              }
            },
          },
        );
        agentRunCoordinatorRef.current.checkpoint(lease);
      }

      const failedProductionRegions = [...new Set(
        projectProductionReviewQueue(productionSnapshot, productionRunId)
          .filter((item) => item.status === "failed")
          .map((item) => item.regionId),
      )];
      if (failedProductionRegions.length > 0) {
        throw new Error(
          `Reusable material production failed for regions: ${failedProductionRegions.join(", ")}.`,
        );
      }
    } catch (error) {
      if (lease.controller.signal.aborted || !agentRunCoordinatorRef.current.isActive(lease)) {
        const status = productionSnapshot.runs[productionRunId]?.status;
        if (status !== "completed" && status !== "cancelled") {
          commitProduction(
            cancelPrototypeProduction(productionSnapshot, productionRunId, Date.now()),
          );
        }
      } else {
        failOpenTasks(error instanceof Error ? error.message : String(error));
      }
      throw error;
    } finally {
      if (productionSnapshot.runs[productionRunId]?.status !== "cancelled") {
        commitProduction(
          finalizePrototypeProduction(productionSnapshot, productionRunId, Date.now()),
        );
      }
      getStoreState().finishSliceProjection(regionRunId);
      if (agentRunCoordinatorRef.current.isActive(lease)) setNamingStatus("done");
    }
    agentRunCoordinatorRef.current.checkpoint(lease);
  }

  async function generatePrototypeDesignSystem(
    plan: PrototypePlan,
    image: ModelAssignment,
    chat: ModelAssignment,
    designMarkdown: string | undefined,
    materialReference: Uint8Array | undefined,
    lease: AgentRunLease,
  ): Promise<PrototypeDesignSystemArtifact> {
    agentRunCoordinatorRef.current.checkpoint(lease);
    const prompt = applyPendingSteers(
      lease,
      prototypeDesignSystemPrompt(plan, designMarkdown),
    );
    // Attached reference images condition the design system on the user's visual
    // direction (垫图, via editImage). editImage is provider-specific, so on
    // failure — or with no attachments — fall back to a plain prompt generate.
    const references = [
      ...(await Promise.all(
        attachments.map((attachment) => blobToBytes(attachment.blob)),
      )),
      ...(materialReference ? [materialReference] : []),
    ];
    agentRunCoordinatorRef.current.checkpoint(lease);
    const runId = `workspace:${lease.id}`;
    const edited =
      references.length > 0
        ? await invokeDesktopImageTool({
            capability: "edit-image",
            runId,
            label: "Generate design system",
            prompt,
            image,
            references,
            toolCallId: `tool:${lease.id}:design-system:edit`,
            lease,
          }).catch(() => null)
        : null;
    // A provider may resolve an aborted edit as an error result instead of
    // throwing AbortError. Never enter the paid fallback after cancellation.
    agentRunCoordinatorRef.current.checkpoint(lease);
    if (materialReference && !edited) {
      throw new Error(
        "The configured image provider could not preserve the selected material as an edit reference.",
      );
    }
    const result =
      edited ??
      (await invokeDesktopImageTool({
        capability: "generate-image",
        runId,
        label: "Generate design system",
        prompt,
        image,
        references: [],
        toolCallId: `tool:${lease.id}:design-system:generate`,
        lease,
      }));
    agentRunCoordinatorRef.current.checkpoint(lease);
    const asset = result[0];
    if (!asset)
      throw new Error("The model returned no design-system reference.");
    const groundedDesignMarkdown = await synthesizeDesignMarkdownFromReference(
      plan,
      chat,
      asset.bytes,
      designMarkdown,
      lease,
    );
    const fallbackDesignMarkdown = prototypeDesignMarkdown(plan, designMarkdown);
    const resolvedDesignMarkdown =
      groundedDesignMarkdown &&
      !designSystemMarkdownValidationError(groundedDesignMarkdown)
        ? groundedDesignMarkdown
        : fallbackDesignMarkdown;
    return assetToDesignSystemArtifact(asset, resolvedDesignMarkdown);
  }

  async function streamConversationalReply(
    userMessage: string,
    fallbackReply: string,
    chat: ModelAssignment,
    lease: AgentRunLease,
    capabilityContext: string,
  ): Promise<string> {
    let streamed = "";
    const liveOutput = createLiveTextBatcher(setLiveAgentOutput);
    setLiveAgentLabel("Agent is responding");
    setLiveAgentOutput("");
    try {
      for await (const delta of personalizedGenerationRef.current.streamText({
        providerId: chat.providerId,
        model: chat.model,
        system: [
          "You are Cutout's design Agent. Answer the user's question directly in their language, then make one natural next-step invitation when useful. Keep identity, greeting, and product replies to one or two short sentences. Do not explain internal routing, prompts, workflow classification, design briefs, policies, tool calls, reasoning, or diagnostics unless the user explicitly requests them.",
          "",
          capabilityContext,
        ].join("\n"),
        input: [{
          type: "text",
          text: `User message:\n${userMessage}\n\nDraft answer for factual grounding only:\n${fallbackReply}\n\nWrite a concise final reply. Do not preserve unnecessary process explanations from the draft.`,
        }],
        reasoningEffort: chat.effort,
        reasoningProtocol: chat.reasoningProtocol,
        signal: lease.controller.signal,
      })) {
        agentRunCoordinatorRef.current.checkpoint(lease);
        streamed += delta;
        liveOutput.append(delta);
      }
      liveOutput.flush();
      return streamed.trim() || fallbackReply;
    } catch (error) {
      liveOutput.flush();
      if (lease.controller.signal.aborted) throw error;
      console.info(
        "[Cutout] conversational stream fell back:",
        error instanceof Error ? error.message : String(error),
      );
      return fallbackReply;
    } finally {
      setLiveAgentOutput("");
      setLiveAgentLabel(null);
    }
  }

  async function synthesizeDesignMarkdownFromReference(
    plan: PrototypePlan,
    chat: ModelAssignment,
    imageBytes: Uint8Array,
    importedMarkdown: string | undefined,
    lease: AgentRunLease,
  ): Promise<string | null> {
    const runId = `workspace:${lease.id}`;
    const stepId = `step:${lease.id}:design-markdown`;
    emitRunEvent(
      runId,
      {
        type: "step-started",
        stepId,
        label: "Create DESIGN.md",
        detail: "Derive the design specification from the generated visual reference.",
      },
      { eventId: `${stepId}:started` },
    );
    const input = {
      providerId: chat.providerId,
      model: chat.model,
      system: prototypeDesignMarkdownSynthesisSystem(plan, importedMarkdown),
      input: [
        {
          type: "text" as const,
          text: "Read the attached design-system reference image and produce the matching DESIGN.md.",
        },
        { type: "image" as const, image: imageBytes },
      ],
      reasoningEffort: chat.effort,
      reasoningProtocol: chat.reasoningProtocol,
      signal: lease.controller.signal,
    };

    let streamed = "";
    try {
      for await (const delta of personalizedGenerationRef.current.streamText(
        input,
      )) {
        agentRunCoordinatorRef.current.checkpoint(lease);
        streamed += delta;
      }
    } catch (error) {
      if (lease.controller.signal.aborted) {
        emitRunEvent(runId, {
          type: "step-cancelled",
          stepId,
          label: "Create DESIGN.md",
          detail: "Stopped before the design specification was complete.",
        }, { eventId: `${stepId}:cancelled` });
        throw error;
      }
      console.info(
        "[Cutout] image-grounded DESIGN.md stream fell back:",
        error instanceof Error ? error.message : String(error),
      );
      const result =
        await personalizedGenerationRef.current.generateText(input);
      agentRunCoordinatorRef.current.checkpoint(lease);
      if (isErr(result)) {
        console.info(
          "[Cutout] image-grounded DESIGN.md synthesis fell back:",
          result.error,
        );
        emitRunEvent(runId, {
          type: "step-failed",
          stepId,
          label: "Create DESIGN.md",
          detail: "The configured model did not return a design specification.",
        }, { eventId: `${stepId}:failed` });
        return null;
      }
      streamed = result.data;
    }

    const markdown = stripMarkdownFence(streamed).trim();
    if (!markdown.startsWith("---")) {
      console.info(
        "[Cutout] image-grounded DESIGN.md synthesis returned non-DESIGN.md text.",
      );
      emitRunEvent(runId, {
        type: "step-failed",
        stepId,
        label: "Create DESIGN.md",
        detail: "The model response was not a valid DESIGN.md document.",
      }, { eventId: `${stepId}:failed` });
      return null;
    }
    emitRunEvent(runId, {
      type: "step-succeeded",
      stepId,
      label: "Create DESIGN.md",
      detail: "Created the image-grounded design specification.",
    }, { eventId: `${stepId}:succeeded` });
    return markdown;
  }

  async function generatePagesSerial(
    plan: PrototypePlan,
    pages: readonly PrototypePage[],
    image: ModelAssignment,
    chat: ModelAssignment,
    designSystem: PrototypeDesignSystemArtifact,
    lease: AgentRunLease,
    designContext: string | undefined,
    existingPages: readonly PrototypePageArtifact[] = [],
    materialReference?: Uint8Array,
  ): Promise<PrototypePageArtifact[]> {
    return generatePrototypePageSet({
      pages,
      existingArtifacts: existingPages,
      mode: "serial",
      concurrency: PROTOTYPE_GENERATION_CONCURRENCY,
      generate: async (page, predecessor) => {
        agentRunCoordinatorRef.current.checkpoint(lease);
        const artifact = await generatePrototypePage(
          plan,
          page,
          image,
          chat,
          [
            designSystem.bytes,
            ...(materialReference ? [materialReference] : []),
            ...(predecessor ? [predecessor.bytes] : []),
          ],
          designContext,
          lease,
        );
        agentRunCoordinatorRef.current.checkpoint(lease);
        return artifact;
      },
      onProgress: (artifacts) => setPrototypePages(artifacts),
    });
  }

  async function generatePagesParallel(
    plan: PrototypePlan,
    pages: readonly PrototypePage[],
    image: ModelAssignment,
    chat: ModelAssignment,
    designSystem: PrototypeDesignSystemArtifact,
    lease: AgentRunLease,
    designContext: string | undefined,
    existingPages: readonly PrototypePageArtifact[] = [],
    materialReference?: Uint8Array,
  ): Promise<PrototypePageArtifact[]> {
    return generatePrototypePageSet({
      pages,
      existingArtifacts: existingPages,
      mode: "anchor-parallel",
      concurrency: PROTOTYPE_GENERATION_CONCURRENCY,
      generate: async (page, anchor) => {
        agentRunCoordinatorRef.current.checkpoint(lease);
        const artifact = await generatePrototypePage(
          plan,
          page,
          image,
          chat,
          [
            designSystem.bytes,
            ...(materialReference ? [materialReference] : []),
            ...(anchor ? [anchor.bytes] : []),
          ],
          designContext,
          lease,
        );
        agentRunCoordinatorRef.current.checkpoint(lease);
        return artifact;
      },
      onProgress: (artifacts) => setPrototypePages(artifacts),
    });
  }

  async function generatePrototypePage(
    plan: PrototypePlan,
    page: PrototypePage,
    image: ModelAssignment,
    chat: ModelAssignment,
    referenceImages: readonly Uint8Array[],
    designMarkdown: string | undefined,
    lease: AgentRunLease,
  ): Promise<PrototypePageArtifact> {
    agentRunCoordinatorRef.current.checkpoint(lease);
    const basePrompt = applyPendingSteers(
      lease,
      prototypePagePrompt(plan, page, designMarkdown),
    );
    const runId = `workspace:${lease.id}`;
    const referenceIds = await Promise.all(referenceImages.map((bytes) => desktopTools.persistReference(bytes, "image/png", runId)));
    const preferences = desktopTools.visualPreferences();

    // Each attempt re-executes the visual task with the (possibly QA-corrected)
    // prompt; the resolved asset is captured so the artifact keeps its media type.
    // The task runId gets a per-attempt suffix on retries: the runtime's durable
    // store keys results by taskId-derived idempotencyKey (prompt NOT included),
    // so reusing the same taskId would replay attempt 1's cached image and turn
    // every QA re-roll into a no-op. Attempt 1 keeps the plain id so durable
    // recovery of an interrupted first attempt still works.
    let lastAsset: { readonly bytes: Uint8Array; readonly mediaType: string } | null = null;
    let attemptCount = 0;
    const generatePage = async (prompt: string): Promise<Uint8Array> => {
      attemptCount += 1;
      const taskRunId = attemptCount === 1 ? String(lease.id) : `${lease.id}:qa${attemptCount}`;
      const task = createPrototypePageVisualTask({ runId: taskRunId, plan, page, image, prompt, referenceArtifactIds: referenceIds, preferences });
      const execution = await desktopTools.visualRuntime.execute(runId, task, lease.controller.signal);
      agentRunCoordinatorRef.current.checkpoint(lease);
      const asset = execution.promotion ? await desktopTools.resolveArtifact(execution.promotion.masterArtifactId) : null;
      if (!asset) throw new Error(`No image returned for ${page.name}.`);
      lastAsset = asset;
      return asset.bytes;
    };

    if (PROTOTYPE_QA_ENABLED) {
      // Reject/re-roll gate with lesson feedback: a rejected page is regenerated
      // with the QA failures appended as binding corrections (bounded budget);
      // the final attempt ships either way so QA never blocks the pipeline.
      const checklist = buildPageChecklist(plan, page);
      await generateWithQa({
        basePrompt,
        generate: generatePage,
        review: (bytes, signal) =>
          reviewGeneratedImage(
            personalizedGenerationRef.current,
            chat,
            bytes,
            checklist,
            signal,
            (message) => console.info("[Cutout] page QA review failed:", page.id, message),
          ),
        maxRetries: PROTOTYPE_QA_MAX_RETRIES,
        onVerdict: (attempt, verdict) => {
          if (!verdict.pass) {
            console.info("[Cutout] page QA rejected:", page.id, attempt, verdict.failures);
          }
        },
        signal: lease.controller.signal,
      });
    } else {
      await generatePage(basePrompt);
    }
    if (!lastAsset) throw new Error(`No image returned for ${page.name}.`);
    return assetToPageArtifact(page, lastAsset);
  }

  async function invokeDesktopImageTool(input: {
    readonly capability: "generate-image" | "edit-image";
    readonly runId: string;
    readonly toolCallId: string;
    readonly label: string;
    readonly prompt: string;
    readonly image: ModelAssignment;
    readonly references: readonly Uint8Array[];
    readonly lease: AgentRunLease;
  }) {
    agentRunCoordinatorRef.current.checkpoint(input.lease);
    return desktopTools.invoke({
      runId: input.runId,
      toolCallId: input.toolCallId,
      label: input.label,
      capability: input.capability,
      intent: input.label,
      prompt: input.prompt,
      image: input.image,
      inputs: input.references.map((bytes, index) => ({
        id: `${input.toolCallId}:input:${index}`,
        mediaType: "image/png",
        bytes,
      })),
    });
  }

  async function assetToDesignSystemArtifact(
    asset: { readonly bytes: Uint8Array; readonly mediaType: string },
    designMarkdown: string,
  ): Promise<PrototypeDesignSystemArtifact> {
    const artifact = await decodePrototypeImage(asset, (base) => ({
      ...base,
      name: "Design system",
      designMarkdown,
    }));
    const error = prototypeMediaValidationError(artifact);
    if (error) throw new Error(error);
    return artifact;
  }

  async function assetToPageArtifact(
    page: PrototypePage,
    asset: { readonly bytes: Uint8Array; readonly mediaType: string },
  ): Promise<PrototypePageArtifact> {
    return await decodePrototypeImage(asset, (base) => ({ ...base, page }));
  }

  async function decodePrototypeImage<T extends PrototypeImageArtifact>(
    asset: { readonly bytes: Uint8Array; readonly mediaType: string },
    build: (base: PrototypeImageArtifact) => T,
  ): Promise<T> {
    const blob = bytesToBlob(asset.bytes, asset.mediaType);
    const bitmap = await decodeImage(blob);
    try {
      return build({
        blob,
        bytes: asset.bytes,
        mediaType: asset.mediaType,
        width: bitmap.width,
        height: bitmap.height,
      });
    } finally {
      bitmap.close();
    }
  }

  const canvasToolbar = (
    <>
      <CanvasBackgroundPicker
        value={canvasBackground}
        onChange={(hex) => {
          setCanvasBackground(hex);
          writeCanvasBackground(hex);
        }}
      />
      <button
        type="button"
        aria-label="Toggle grid"
        title="Grid"
        aria-pressed={gridVisible}
        className={cn(
          "flex size-8 items-center justify-center rounded-full border bg-background/95 shadow-[0_2px_10px_rgb(0_0_0/0.10)] backdrop-blur transition-all hover:scale-105",
          gridVisible
            ? "border-foreground/30 text-foreground"
            : "border-border/70 text-muted-foreground hover:border-foreground/25 hover:text-foreground",
        )}
        onClick={() => {
          setGridVisible((visible) => {
            const next = !visible;
            try {
              localStorage.setItem("cutout.canvas-grid", next ? "1" : "0");
            } catch {
              // best-effort persistence only
            }
            return next;
          });
        }}
      >
        <Grid3x3 className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Toggle minimap"
        title="Minimap"
        aria-pressed={minimapVisible}
        className={cn(
          "flex size-8 items-center justify-center rounded-full border bg-background/95 shadow-[0_2px_10px_rgb(0_0_0/0.10)] backdrop-blur transition-all hover:scale-105",
          minimapVisible
            ? "border-foreground/30 text-foreground"
            : "border-border/70 text-muted-foreground hover:border-foreground/25 hover:text-foreground",
        )}
        onClick={() => {
          setMinimapVisible((visible) => {
            const next = !visible;
            try {
              localStorage.setItem("cutout.canvas-minimap", next ? "1" : "0");
            } catch {
              // best-effort persistence only
            }
            return next;
          });
        }}
      >
        <MapIcon className="size-4" />
      </button>
    </>
  );

  return (
    <div data-workspace-root className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background text-foreground lg:flex-row">
      <input
        ref={dockAttachInputRef}
        type="file"
        accept="image/*,video/*,.md,.markdown,.mdx"
        multiple
        className="hidden"
        onChange={(event) => {
          onAttachFiles(event.target.files);
          event.target.value = "";
        }}
      />

      <div
        data-workspace-rail
        className={cn(
          "hidden shrink-0 lg:block lg:h-full lg:overflow-hidden lg:transition-[width] lg:duration-300 lg:ease-in-out",
          sidebarCollapsed ? "lg:w-0" : "lg:w-14",
        )}
      >
        <WorkspaceRail
          agentActive={agentDockVisible}
          onToggleAgent={() => {
            setAgentDockVisible((visible) => !visible);
            setFilesDockVisible(false);
            setDesignDockVisible(false);
          }}
          filesActive={filesDockVisible}
          onToggleFiles={() => {
            setFilesDockVisible((visible) => !visible);
            setAgentDockVisible(false);
            setDesignDockVisible(false);
          }}
          onOpenAssets={library.open}
          onOpenDesign={() => {
            setAgentDockVisible(false);
            setFilesDockVisible(false);
            setDesignDockVisible(false);
            onOpenDesignOs("specimen");
          }}
          inspectorActive={designDockVisible}
          onOpenDeliver={() => onOpenDesignOs("delivery")}
          advanced={advanced}
          onOpenAdvanced={onOpenAdvanced}
          onCollapseSidebar={() => setSidebarCollapsed(true)}
        />
      </div>

      <button
        type="button"
        aria-label="Expand sidebar"
        title="Expand sidebar"
        className={cn(
          "group/expand absolute left-3 top-3 z-40 hidden size-8 items-center justify-center text-foreground transition-opacity duration-300 hover:opacity-70 lg:flex",
          sidebarCollapsed ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setSidebarCollapsed(false)}
      >
        <PanelLeft className="size-4" />
      </button>

      <div
        data-workspace-panel={
          designDockVisible
            ? "design-drawer"
            : filesDockVisible
              ? "files-drawer"
              : "agent-drawer"
        }
        className={cn(
          !agentDockVisible && !filesDockVisible && !designDockVisible && "hidden",
          "absolute inset-x-0 bottom-0 z-30 h-[min(70dvh,42rem)] min-h-[19rem] w-full overflow-hidden border-t border-border bg-background shadow-2xl lg:inset-y-0 lg:bottom-auto lg:right-auto lg:h-full lg:w-[24rem] lg:border-r lg:border-t-0 lg:transition-[left] lg:duration-300 lg:ease-in-out 2xl:w-[27rem]",
          sidebarCollapsed ? "lg:left-0" : "lg:left-14",
        )}
      >
        {designDockVisible ? (
          <DesignMarkdownInspector
            docked
            prototypePlan={prototypePlan}
            prototypeDesignSystem={prototypeDesignSystem}
            importedDesignMarkdown={importedDesignMarkdown}
            onChange={updateDesignMarkdownContent}
            onOpenSystem={() => onOpenDesignOs("overview")}
            onClose={() => setDesignDockVisible(false)}
            onOpenSpecimen={() => onOpenDesignOs("specimen")}
          />
        ) : filesDockVisible ? (
          <>
            <button
              type="button"
              aria-label="Hide Files"
              title="Hide Files"
              className="absolute right-2 top-2 z-10 flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => setFilesDockVisible(false)}
            >
              <PanelLeftClose className="size-4" />
            </button>
            <FilesPanel
              nodes={filesTree}
              selectedId={focusedArtifactId}
              className="h-full w-full"
              onSelectFile={(id) => {
                if (id === "design-system") {
                  setDesignDockVisible(true);
                  setFilesDockVisible(false);
                } else if (
                  prototypePages.some((artifact) => artifact.page.id === id)
                ) {
                  setSelectedPrototypePageId(id);
                }
                setFocusedArtifactId(id);
                setFocusRequestId((requestId) => requestId + 1);
              }}
            />
          </>
        ) : (
          <>
            <button
              type="button"
              aria-label="Hide Agent"
              title="Hide Agent"
              className="absolute right-2 top-2 z-10 flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => setAgentDockVisible(false)}
            >
              <PanelLeftClose className="size-4" />
            </button>
            <AgentWorkspaceDock
              viewModel={agentViewModel}
              mode="sheet"
              compact
              className="h-full w-full pt-10"
              composer={{
                value: activeAsk ? humanLoopCustomAnswer : composerDraft,
                placeholder: activeAsk
                  ? t({
                      id: "workspace.human_loop_optional_context_placeholder",
                      message: "Add a constraint or describe another direction…",
                    })
                  : t({
                      id: "workspace.agent_composer_placeholder",
                      message: "Describe a result, correction, or next step…",
                    }),
                disabled: false,
                controlsDisabled: working,
                submitDisabled: working
                  ? false
                  : Boolean(impactPlan.blockedReason),
                // A question always has a selected/default choice — the composer
                // text is optional extra context, per HumanLoopQuestion's own copy
                // ("Choose one direction... then press the arrow"). Without this,
                // choosing a direction with no typed text left the send button
                // permanently disabled (canSubmit requires non-empty value),
                // silently stranding the user — true for both the live in-call ask
                // and the older cross-invocation humanLoop.mode==='ask' fallback.
                allowEmptySubmit: Boolean(activeAsk),
                busy: working,
                attachments: attachments.map((attachment) => ({
                  id: attachment.id,
                  label: attachment.name,
                  mediaType: attachment.mediaType,
                  previewUrl: attachment.url,
                  status: attachment.mediaType.startsWith("video/")
                    ? "Adapter required"
                    : undefined,
                })),
                onChange: (value) => {
                  if (activeAsk) {
                    setHumanLoopCustomAnswer(value);
                  } else {
                    setComposerDraft(value);
                  }
                },
                onSubmit: () => {
                  // A live in-call ask (tool-gate path) resolves the suspended
                  // model call directly via the bridge — it must NOT re-invoke
                  // createAssets(), which is what the older cross-invocation
                  // humanLoop.mode==='ask' path below still does.
                  if (liveAsk) {
                    const active = activeRunRef.current;
                    if (
                      !active ||
                      !agentRunCoordinatorRef.current.isActive(active)
                    ) {
                      toast.error("This request is no longer active.");
                      setHumanLoopChoiceId(null);
                      setHumanLoopCustomAnswer("");
                      return;
                    }
                    const answer = resolveHumanLoopAnswer(
                      liveAsk,
                      humanLoopChoiceId,
                      humanLoopCustomAnswer,
                    );
                    clarificationBridge.answer(liveAsk.askId, answer);
                    setHumanLoopChoiceId(null);
                    setHumanLoopCustomAnswer("");
                    setAgentBusy(true);
                    return;
                  }
                  if (activeAsk) {
                    // The plan-level fallback ask already has its answer in
                    // humanLoopChoiceId/humanLoopCustomAnswer. Resume the
                    // existing plan instead of reading the unrelated message
                    // draft, which is normally empty on this surface.
                    void createAssets("create", { skipToolGate: true });
                    return;
                  }
                  const consumed = consumeComposerDraft(composerDraft);
                  if (!consumed.submitted) return;
                  setComposerDraft(consumed.nextValue);
                  if (working) {
                    const active = activeRunRef.current;
                    const runId = agentRunEvents.activeRunId;
                    if (
                      !active ||
                      !runId ||
                      !agentRunCoordinatorRef.current.steer(
                        active,
                        consumed.submitted,
                      )
                    ) {
                      toast.error("This request is no longer active.");
                      return;
                    }
                    emitRunEvent(runId, {
                      type: "steer-recorded",
                      instruction: consumed.submitted,
                    });
                    return;
                  }
                  setBrief(consumed.submitted);
                  void createAssets("create", {
                    briefOverride: consumed.submitted,
                  });
                },
                onStop:
                  working && activeRunRef.current ? stopActiveRun : undefined,
                onAttach: () => dockAttachInputRef.current?.click(),
                onRemoveAttachment: removeAttachment,
                webSearch: {
                  enabled: webSearchEnabled,
                  disabled: working,
                  onChange: setWebSearchEnabled,
                },
                modelSelection: {
                  value: composerModelValue(composerModelPolicy),
                  options: composerModelOptions,
                  disabled:
                    working || assignments.isPending || providers.isPending,
                  onChange: (value) =>
                    setComposerModelPolicy(
                      parseComposerModelValue(value, assignments.data ?? {}),
                    ),
                },
                thinkingSelection: {
                  value: composerThinkingPolicy,
                  options: [
                    {
                      value: "auto",
                      label: "Auto",
                      description: "Let the Agent Router choose for this task.",
                    },
                    {
                      value: "provider-default",
                      label: "Default",
                      description: "Use the selected provider model default.",
                    },
                    { value: "low", label: "Low" },
                    { value: "medium", label: "Medium" },
                    { value: "high", label: "High" },
                  ],
                  disabled: working,
                  onChange: (value) =>
                    setComposerThinkingPolicy(value as ComposerThinkingPolicy),
                },
                materialContext: selectedMaterial
                  ? {
                      label: selectedMaterial.label,
                      onClear: () => setSelectedMaterial(null),
                    }
                  : undefined,
              }}
              intervention={
                activeAsk ? (
                  <HumanLoopQuestion
                    loop={activeAsk}
                    selectedChoiceId={selectedHumanLoopChoiceId}
                    onChoiceChange={setHumanLoopChoiceId}
                    compact
                  />
                ) : showDockScopePicker && prototypePlan ? (
                  <DockScopePicker
                    scope={prototypeScope}
                    onScopeChange={setPrototypeScope}
                    disabled={working || prototypePages.length > 0}
                    primaryCount={scopedPrimaryPageCount}
                    fullCount={prototypePlan.pages.length}
                  />
                ) : null
              }
              labels={
                repairPlan ? { retry: "Continue" } : undefined
              }
              onCancel={
                working && activeRunRef.current ? stopActiveRun : undefined
              }
              onRetry={
                !working && repairPlan
                  ? () => void createAssets("repair")
                  : undefined
              }
              onApproveTool={(toolCallId, requestId) =>
                void desktopTools.loop.approve(toolCallId, requestId)
              }
              onDenyTool={(toolCallId, requestId) =>
                desktopTools.loop.deny(toolCallId, requestId)
              }
              onCancelTool={(toolCallId, requestId) =>
                desktopTools.loop.cancel(toolCallId, requestId)
              }
              onRetryTool={(toolCallId, requestId) =>
                void desktopTools.loop.retry(toolCallId, requestId)
              }
              onAgentAction={(_eventId, action, actionBrief) => {
                if (action !== "proceed-anyway") return;
                void createAssets("create", {
                  skipToolGate: true,
                  briefOverride: actionBrief,
                });
              }}
              onEditMessage={(targetEventId, message) => {
                const runId = agentRunEvents.activeRunId;
                if (!runId) throw new Error("No Agent run is available for this revision.");
                if (working) {
                  const active = activeRunRef.current;
                  if (!active || !agentRunCoordinatorRef.current.steer(active, message)) {
                    throw new Error("This request is no longer active.");
                  }
                  setBrief(message);
                  emitRunEvent(runId, { type: "message-revised", targetEventId, message });
                  return;
                }
                setBrief(message);
                emitRunEvent(runId, { type: "message-revised", targetEventId, message });
                void createAssets(repairPlan ? "repair" : "create", { briefOverride: message });
              }}
              onOpenArtifact={(kind) => {
                if (kind === "design-system" || kind === "design-markdown") {
                  setDesignDockVisible(true);
                  setAgentDockVisible(false);
                  setFilesDockVisible(false);
                  setFocusedArtifactId("design-system");
                  setFocusRequestId((id) => id + 1);
                  return;
                }
                if (kind === "prototype-page") {
                  const pageId = prototypePages[0]?.page.id;
                  if (pageId) {
                    setSelectedPrototypePageId(pageId);
                    setFocusedArtifactId(pageId);
                    setFocusRequestId((id) => id + 1);
                  }
                  return;
                }
                if (kind === "cutout-slice") {
                  const sliceId = slices[0]?.id;
                  if (sliceId) {
                    setFocusedArtifactId(sliceId);
                    setFocusRequestId((id) => id + 1);
                  }
                }
              }}
            />
          </>
        )}
      </div>

      <main
        data-workspace-panel="canvas-main"
        className="order-1 flex min-h-0 min-w-0 flex-1 flex-col lg:order-none"
      >
        <section
          className={cn(
            "relative min-h-0 flex-1 overflow-hidden",
            !canvasBackground && "bg-muted/10",
          )}
          style={
            canvasBackground ? { background: canvasBackground } : undefined
          }
        >
          <OutputSurface
            canvasBackground={canvasBackground}
            showMinimap={minimapVisible}
            showGrid={gridVisible}
            canvasToolbar={canvasToolbar}
            canvasActions={{
              onImport: openPicker,
              onAskAgent: focusAgentComposer,
              onExportAll: exportAll,
              exportDisabled: exportAllPending || exportableSliceCount === 0,
            }}
            canvasAnnotations={canvasAnnotations}
            onCanvasAnnotationsChange={setCanvasAnnotations}
            designDocument={designDocument}
            librarySavedMaterialIds={librarySavedMaterialIds}
            canSaveApproved={canSaveToLibrary}
            onSaveApprovedToLibrary={async (item) => {
              if (!item.evidenceMaterialId) return;
              let receipts = approvedDeliverables;
              let receipt = receipts.find(
                (candidate) =>
                  candidate.material.id === item.evidenceMaterialId,
              );
              if (!receipt) {
                if (!designDocument || !outcome) return;
                receipts = await approveCurrentDeliverables({
                  document: designDocument,
                  outcome,
                  approvalId: `library-save.${crypto.randomUUID()}`,
                  approvedAt: new Date().toISOString(),
                });
                setApprovedDeliverables(receipts);
                receipt = receipts.find(
                  (candidate) =>
                    candidate.material.id === item.evidenceMaterialId,
                );
                if (!receipt) {
                  throw new Error("The selected result cannot be saved to Library.");
                }
              }
              const libraryItem = await libraryItemFromApproval(receipt);
              const libraryStore = new GlobalLibraryStore(
                createIndexedDbGlobalLibraryBackend(indexedDB),
              );
              const existing = (await libraryStore.catalog()).items.find(
                (candidate) =>
                  candidate.id === libraryItem.id &&
                  candidate.version === libraryItem.version,
              );
              if (existing) {
                toast.info("This approved version is already in Library.");
                return;
              }
              await libraryStore.saveApproved(libraryItem, {
                status: "succeeded",
                approvalId: receipt.approvalId,
                contentSha256: receipt.library.contentSha256,
              });
              toast.success("Saved to Library", {
                description: `${libraryItem.name} · v${libraryItem.version}`,
                action: {
                  label: "Open in Library",
                  onClick: library.openGlobal,
                },
              });
              setLibrarySavedMaterialIds(
                (current) => new Set([...current, receipt.material.id]),
              );
              setSavedLibraryItems((current) => [...current, libraryItem]);
            }}
            prototypePlan={prototypePlan}
            prototypePages={prototypePages}
            prototypeDesignSystem={prototypeDesignSystem}
            selectedPrototypePageId={selectedPrototypePageId}
            onPrototypePageSelect={setSelectedPrototypePageId}
            prototypeScope={prototypeScope}
            onScopeChange={setPrototypeScope}
            onPrimaryAction={() => {
              setSelectedMaterial(null);
              void createAssets(repairPlan ? "repair" : "create", {
                ignoreSelectedMaterial: true,
              });
            }}
            hasSource={hasSource}
            hasSlices={hasSlices}
            productionReviewCount={productionReviewCount}
            productionReviewQueue={productionReviewQueue}
            working={working}
            analysisStatus={analysisStatus}
            runError={runError}
            focusedArtifactId={focusedArtifactId}
            focusRequestId={focusRequestId}
            selectedMaterial={selectedMaterial}
            onSelectMaterial={setSelectedMaterial}
            onRequestMaterialChanges={focusAgentComposer}
            onRequestPlanChanges={focusAgentComposer}
            variantDecision={
              selectedMaterial
                ? decisionFor(creativeBoard, selectedMaterial.id)
                : undefined
            }
            onVariantDecision={(decision) =>
              selectedMaterial &&
              setCreativeBoard((state) =>
                decideVariant(state, {
                  materialId: selectedMaterial.id,
                  version: selectedMaterial.version,
                  decision,
                  referenceGroup: selectedMaterial.kind,
                  referenceLocked:
                    decisionFor(state, selectedMaterial.id)?.referenceLocked ??
                    false,
                }),
              )
            }
            onToggleReferenceLock={() =>
              selectedMaterial &&
              setCreativeBoard((state) => {
                const current = decisionFor(state, selectedMaterial.id);
                return decideVariant(state, {
                  materialId: selectedMaterial.id,
                  version: selectedMaterial.version,
                  decision: current?.decision ?? "undecided",
                  referenceGroup: selectedMaterial.kind,
                  referenceLocked: !(current?.referenceLocked ?? false),
                });
              })
            }
            onMoreLikeThis={(material) => {
              setCreativeBoard((state) =>
                requestMoreLikeThis(state, {
                  materialId: material.id,
                  version: material.version,
                }),
              );
              focusAgentComposer();
            }}
            branchRequestCount={
              selectedMaterial
                ? creativeBoard.branches.filter(
                    (branch) =>
                      branch.baseMaterialId === selectedMaterial.id &&
                      branch.baseVersion === selectedMaterial.version,
                  ).length
                : 0
            }
            creativeBranches={
              selectedMaterial
                ? creativeBoard.branches.filter(
                    (branch) =>
                      branch.baseMaterialId === selectedMaterial.id &&
                      branch.baseVersion === selectedMaterial.version,
                  )
                : []
            }
          />
        </section>
      </main>

      {selectedSlice ? (
        <aside aria-label="Inspector" className="absolute inset-y-0 right-0 z-20 flex h-full min-h-0 w-full max-w-[22rem] shrink-0 flex-col border-l border-border bg-background shadow-xl xl:relative xl:z-auto xl:w-[18.5rem] xl:shadow-none 2xl:w-[21rem]">
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">Result</p><p className="truncate text-[11px] text-muted-foreground">Review and correct</p></div><Button type="button" variant="ghost" size="icon" className="ml-auto size-7" aria-label="Close result inspector" onClick={() => getStoreState().clearSelection()}><X className="size-3.5"/></Button></div>
          <div className="min-h-0 flex-1 overflow-y-auto"><InspectorPanel/></div>
        </aside>
      ) : null}
    </div>
  );
}

function DockScopePicker({
  scope,
  onScopeChange,
  disabled,
  primaryCount,
  fullCount,
}: {
  readonly scope: PrototypeSuiteScope;
  readonly onScopeChange: (scope: PrototypeSuiteScope) => void;
  readonly disabled: boolean;
  readonly primaryCount: number;
  readonly fullCount: number;
}) {
  return (
    <div className="flex items-center gap-1 rounded-md bg-muted/40 p-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onScopeChange("primary-flow")}
        className={cn(
          "h-8 rounded px-3 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
          scope === "primary-flow"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Primary · {primaryCount}
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onScopeChange("full-plan")}
        className={cn(
          "h-8 rounded px-3 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
          scope === "full-plan"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Full · {fullCount}
      </button>
    </div>
  );
}

function emptyInspectorMessage(
  mode: "controls" | "source",
  sourceFormat: DesignSourceFormat | "astryx",
  formatLabels: Record<DesignSourceFormat, string>,
): string {
  if (mode !== "source") return "Import DESIGN.md or generate a design system.";
  if (sourceFormat === "astryx")
    return "Astryx variable mapping will be available once a design system exists.";
  if (sourceFormat === "design-md")
    return "Import DESIGN.md or generate a design system.";
  return `${formatLabels[sourceFormat]} will be derived from DESIGN.md tokens once a design system exists.`;
}

function DesignMarkdownInspector({
  docked = false,
  prototypePlan,
  prototypeDesignSystem,
  importedDesignMarkdown,
  onChange,
  onOpenSystem,
  onClose,
  onOpenSpecimen,
}: {
  readonly docked?: boolean;
  readonly prototypePlan: PrototypePlan | null;
  readonly prototypeDesignSystem: PrototypeDesignSystemArtifact | null;
  readonly importedDesignMarkdown: DesignMarkdownAsset;
  readonly onChange: (content: string) => void;
  readonly onOpenSystem: () => void;
  readonly onClose: () => void;
  readonly onOpenSpecimen?: () => void;
}) {
  const [mode, setMode] = useState<"controls" | "source">("controls");
  const [sourceFormat, setSourceFormat] = useState<
    DesignSourceFormat | "astryx"
  >("design-md");
  const generated = prototypeDesignSystem?.designMarkdown.trim();
  const imported = importedDesignMarkdown?.content.trim();
  const draft =
    !generated && prototypePlan
      ? prototypeDesignMarkdown(prototypePlan, importedDesignMarkdown?.content)
      : null;
  const content = generated || imported || draft;
  const source = generated
    ? "Generated"
    : imported
      ? "Imported"
      : draft
        ? "Draft"
        : "Waiting";
  const name = generated
    ? "Generated DESIGN.md"
    : (importedDesignMarkdown?.name ?? "DESIGN.md");
  const model = content ? parseEditableDesignMarkdown(content) : null;
  const activeFormat: DesignSourceFormat | "astryx" =
    mode === "source" ? sourceFormat : "design-md";
  const formatLabels: Record<DesignSourceFormat, string> = {
    "design-md": "DESIGN.md",
    tailwind: "Tailwind v4",
    "css-variables": "CSS Variables",
    "design-tokens": "Design Tokens",
  };

  async function copyDesignSource(): Promise<void> {
    if (!content || !model || activeFormat === "astryx") return;
    try {
      await navigator.clipboard.writeText(
        renderDesignSource(activeFormat, content, model),
      );
      toast.success(`${formatLabels[activeFormat]} copied`);
    } catch (error) {
      toast.error("Copy failed", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <aside
      aria-label="Design system"
      className={cn(
        "flex h-full min-h-0 w-full shrink-0 flex-col bg-background",
        docked
          ? "border-r border-border"
          : "absolute inset-y-0 right-0 z-20 max-w-[22rem] border-l border-border shadow-xl xl:relative xl:z-auto xl:w-[18.5rem] xl:shadow-none 2xl:w-[21rem]",
      )}
    >
      <div className="flex h-12 items-center gap-2 border-b border-border px-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">Design system</p>
          <p className="truncate text-[11px] text-muted-foreground">
            Canvas
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="ml-auto size-7"
          aria-label="Close design inspector"
          onClick={onClose}
        >
          <X className="size-3.5" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <details className="group/advanced">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between border-b border-border px-4 text-xs font-medium text-muted-foreground hover:text-foreground">
            Advanced design system
            <ChevronUp className="size-3.5 rotate-180 transition-transform group-open/advanced:rotate-0" />
          </summary>
        <section className="border-b border-border p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">DESIGN.md</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {name}
              </p>
            </div>
            <span className="shrink-0 rounded-full border border-border bg-muted/20 px-2 py-0.5 text-[10px] text-muted-foreground">
              {source}
            </span>
          </div>
          {onOpenSpecimen ? (
            <button
              type="button"
              onClick={onOpenSpecimen}
              className="mt-2 flex items-center gap-1 text-xs font-medium text-foreground/80 hover:text-foreground hover:underline"
            >
              <Palette className="size-3.5" />
              View specimen
            </button>
          ) : null}
          <Button type="button" variant="outline" size="sm" className="mt-3 w-full" onClick={onOpenSystem}>
            <Boxes className="size-3.5" /> Open system inspector
          </Button>
          {activeFormat !== "astryx" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 w-full"
              disabled={!content}
              onClick={() => void copyDesignSource()}
            >
              <Tag className="size-3.5" />
              Copy {formatLabels[activeFormat]}
            </Button>
          ) : null}
          <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            <button
              type="button"
              onClick={() => setMode("controls")}
              className={cn(
                "h-7 rounded-md text-xs font-medium transition-colors",
                mode === "controls"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Controls
            </button>
            <button
              type="button"
              onClick={() => setMode("source")}
              className={cn(
                "h-7 rounded-md text-xs font-medium transition-colors",
                mode === "source"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Source
            </button>
          </div>
          {mode === "source" ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {(Object.keys(formatLabels) as DesignSourceFormat[]).map(
                (format) => (
                  <button
                    key={format}
                    type="button"
                    onClick={() => setSourceFormat(format)}
                    aria-pressed={sourceFormat === format}
                    className={cn(
                      "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                      sourceFormat === format
                        ? "border-foreground/25 bg-muted text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {formatLabels[format]}
                  </button>
                ),
              )}
              <button
                type="button"
                onClick={() => setSourceFormat("astryx")}
                aria-pressed={sourceFormat === "astryx"}
                className={cn(
                  "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                  sourceFormat === "astryx"
                    ? "border-foreground/25 bg-muted text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                Astryx
              </button>
            </div>
          ) : null}
        </section>

        {content && model ? (
          <section className="p-4">
            {mode === "controls" ? (
              <DesignMarkdownControls
                content={content}
                model={model}
                onChange={onChange}
              />
            ) : sourceFormat === "design-md" ? (
              <Textarea
                value={content}
                onChange={(event) => onChange(event.target.value)}
                className="min-h-[calc(100vh-17rem)] resize-none font-mono text-[11px] leading-5"
              />
            ) : sourceFormat === "astryx" ? (
              <AstryxMappingPanel model={model} />
            ) : (
              <pre className="min-h-[calc(100vh-17rem)] overflow-x-auto rounded-md border border-border bg-muted/20 p-3 font-mono text-[11px] leading-5">
                {renderDesignSource(sourceFormat, content, model)}
              </pre>
            )}
          </section>
        ) : (
          <section className="p-4">
            <div className="rounded-md border border-border bg-muted/10 p-3">
              <p className="text-xs font-medium text-muted-foreground">
                {emptyInspectorMessage(mode, sourceFormat, formatLabels)}
              </p>
            </div>
          </section>
        )}
        </details>
      </div>
    </aside>
  );
}

function AstryxMappingPanel({
  model,
}: {
  readonly model: EditableDesignMarkdown;
}) {
  const choices = useMemo(() => astryxColorChoices(model), [model]);
  const choiceKey = choices.map((choice) => choice.controlId).join("|");
  const seedMapping = () =>
    Object.fromEntries(
      [...automaticAstryxMapping(choices)].filter(
        (entry): entry is [string, string] => entry[1] !== null,
      ),
    );
  const [themeName, setThemeName] = useState("cutout-theme");
  const [mapping, setMapping] = useState<Record<string, string>>(seedMapping);
  const [binding, setBinding] = useState<AstryxBinding | null>(null);
  const [busy, setBusy] = useState(false);
  const seededKeyRef = useRef(choiceKey);

  useEffect(() => {
    if (seededKeyRef.current === choiceKey) return;
    seededKeyRef.current = choiceKey;
    setMapping(seedMapping());
    setBinding(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choiceKey]);

  if (!choices.length) {
    return (
      <p className="text-xs text-muted-foreground">
        No color tokens in DESIGN.md yet — add one under Tokens to map it to
        Astryx.
      </p>
    );
  }

  const themeNameValid = /^[a-z][a-z0-9-]*$/.test(themeName);
  const mappedCount = Object.values(mapping).filter(Boolean).length;
  const themePath = `astryx/${themeName}.ts`;
  const themeFile = binding?.files.find((file) => file.path === themePath);
  const otherFiles =
    binding?.files.filter(
      (file) =>
        file.path !== themePath &&
        file.path !== "astryx/component-mapping.json" &&
        file.path !== "astryx/cli-plan.json",
    ) ?? [];

  async function generate(): Promise<void> {
    if (!themeNameValid || mappedCount === 0) return;
    setBusy(true);
    try {
      const result = await compileAstryxThemeFromDesignMarkdown(
        model,
        themeName,
        Object.entries(mapping)
          .filter((entry): entry is [string, string] => Boolean(entry[1]))
          .map(([controlId, astryxVariable]) => ({
            controlId,
            astryxVariable,
          })),
      );
      setBinding(result);
    } catch (error) {
      toast.error("Could not compile Astryx theme", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  }

  async function copyFile(path: string, content: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(content);
      toast.success(`${path.split("/").pop()} copied`);
    } catch (error) {
      toast.error("Copy failed", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor="astryx-theme-name"
          className="text-[11px] font-medium text-muted-foreground"
        >
          Theme name
        </label>
        <Input
          id="astryx-theme-name"
          value={themeName}
          spellCheck={false}
          aria-invalid={!themeNameValid}
          onChange={(event) => {
            setThemeName(event.target.value.trim().toLocaleLowerCase());
            setBinding(null);
          }}
          className="mt-1 h-8 font-mono text-xs"
        />
        {!themeNameValid ? (
          <p className="mt-1 text-[10px] text-destructive">
            Lowercase letters, numbers and hyphens only, starting with a letter.
          </p>
        ) : null}
      </div>

      <div className="rounded-md border border-border bg-muted/10 p-3">
        <p className="text-xs font-medium">Automatic mapping</p>
        <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
          {mappedCount} theme roles will be inferred from your palette. The remaining colors are preserved as custom tokens.
        </p>
        <details className="group/astryx mt-2">
          <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
            Customize mapping
          </summary>
          <div className="mt-3 space-y-2">
            {choices.map((choice) => (
              <AstryxMappingRow
                key={choice.controlId}
                choice={choice}
                value={mapping[choice.controlId] ?? ""}
                onChange={(next) => {
                  setMapping((prev) => ({ ...prev, [choice.controlId]: next }));
                  setBinding(null);
                }}
              />
            ))}
          </div>
        </details>
      </div>

      <Button
        type="button"
        size="sm"
        className="w-full"
        disabled={!themeNameValid || mappedCount === 0 || busy}
        onClick={() => void generate()}
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <WandSparkles className="size-3.5" />
        )}
        Generate Astryx bundle
      </Button>

      {themeFile ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                <Check className="size-3 text-emerald-600" /> {themePath}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px]"
                onClick={() => void copyFile(themePath, themeFile.content)}
              >
                <Tag className="size-3" /> Copy
              </Button>
            </div>
            <pre className="max-h-64 overflow-auto rounded-md border border-border bg-muted/20 p-3 font-mono text-[11px] leading-5">
              {themeFile.content}
            </pre>
          </div>

          {otherFiles.length ? (
            <div className="space-y-1 rounded-md border border-border bg-muted/10 p-2">
              <p className="px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Also generated
              </p>
              {otherFiles.map((file) => (
                <div
                  key={file.path}
                  className="flex items-center justify-between gap-2 px-1 py-0.5"
                >
                  <span className="truncate font-mono text-[11px] text-foreground">
                    {file.path.replace(/^astryx\//, "")}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 shrink-0 px-2 text-[11px]"
                    onClick={() => void copyFile(file.path, file.content)}
                  >
                    <Tag className="size-3" /> Copy
                  </Button>
                </div>
              ))}
            </div>
          ) : null}

          {binding ? (
            <div className="space-y-1.5 rounded-md border border-dashed border-border p-2">
              <p className="px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                README.md &amp; AGENTS.md
              </p>
              <p className="px-1 text-[10px] leading-4 text-muted-foreground">
                Cutout's Agent doesn't have a "write this doc" tool yet — this
                isn't a generated file, it's a grounded brief you can hand to
                any capable assistant to draft them.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full text-[11px]"
                onClick={() =>
                  void copyFile(
                    "agent brief",
                    astryxAgentPrompt(binding.agentBrief),
                  )
                }
              >
                <Tag className="size-3" /> Copy brief for the Agent
              </Button>
            </div>
          ) : null}

          <p className="text-[10px] leading-4 text-muted-foreground">
            {binding?.capability.status === "available"
              ? "Astryx packages detected in this project. Run:"
              : "Install @astryxdesign/core, @astryxdesign/theme-neutral and @astryxdesign/cli, then run:"}{" "}
            <code className="rounded bg-muted px-1 py-0.5">
              npx astryx theme build ./{themePath}
            </code>
          </p>
        </div>
      ) : null}
    </div>
  );
}

function AstryxMappingRow({
  choice,
  value,
  onChange,
}: {
  readonly choice: AstryxColorChoice;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const isKnown = value === "" || ASTRYX_COMMON_VARIABLES.includes(value);
  const [customMode, setCustomMode] = useState(!isKnown);

  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="size-4 shrink-0 rounded-full border border-border"
        style={{ background: choice.value }}
      />
      <span className="w-16 shrink-0 truncate text-xs" title={choice.label}>
        {choice.label}
      </span>
      {customMode ? (
        <Input
          value={value}
          spellCheck={false}
          placeholder="--color-accent"
          aria-label={`Astryx variable for ${choice.label}`}
          aria-invalid={value !== "" && !/^--[a-z][a-z0-9-]*$/.test(value)}
          onChange={(event) =>
            onChange(event.target.value.trim().toLocaleLowerCase())
          }
          className="h-7 flex-1 font-mono text-[11px]"
        />
      ) : (
        <select
          value={value}
          aria-label={`Astryx variable for ${choice.label}`}
          onChange={(event) => {
            if (event.target.value === "__custom__") {
              setCustomMode(true);
              return;
            }
            onChange(event.target.value);
          }}
          className="h-7 flex-1 rounded-md border border-border bg-background px-1.5 text-[11px] text-foreground"
        >
          <option value="">— unmapped —</option>
          {ASTRYX_COMMON_VARIABLES.map((variable) => (
            <option key={variable} value={variable}>
              {variable}
            </option>
          ))}
          <option value="__custom__">Custom…</option>
        </select>
      )}
    </div>
  );
}

function DesignMarkdownControls({
  content,
  model,
  onChange,
}: {
  readonly content: string;
  readonly model: ReturnType<typeof parseEditableDesignMarkdown>;
  readonly onChange: (content: string) => void;
}) {
  const frontmatterControls = model.controls.filter(
    (control) =>
      control.source.type === "frontmatter" && control.kind === "text",
  );
  const tokenControls = model.controls.filter(
    (control) => control.kind !== "text",
  );
  const bodyControls = model.controls.filter(
    (control) =>
      control.source.type !== "frontmatter" && control.kind === "text",
  );

  return (
    <div className="space-y-4">
      {model.frontmatterError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs leading-5 text-destructive">
          {model.frontmatterError}
        </div>
      ) : null}

      <DesignControlGroup title="Contract" count={frontmatterControls.length}>
        {frontmatterControls.map((control) => (
          <DesignControlRow
            key={control.id}
            control={control}
            content={content}
            onChange={onChange}
          />
        ))}
      </DesignControlGroup>

      <DesignControlGroup title="Tokens" count={tokenControls.length}>
        {tokenControls.map((control) => (
          <DesignControlRow
            key={control.id}
            control={control}
            content={content}
            onChange={onChange}
          />
        ))}
      </DesignControlGroup>

      <DesignControlGroup title="Rules" count={bodyControls.length}>
        {bodyControls.map((control) => (
          <DesignControlRow
            key={control.id}
            control={control}
            content={content}
            onChange={onChange}
          />
        ))}
      </DesignControlGroup>

      <DesignTablesEditor
        content={content}
        tables={model.tables}
        onChange={onChange}
      />

      <section className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold">Sections</p>
            <p className="font-mono text-[10px] text-muted-foreground">
              {model.sections.length}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange(appendDesignMarkdownSection(content))}
          >
            <Plus className="size-3.5" />
            Add
          </Button>
        </div>
        <div className="divide-y divide-border">
          {model.sections.length > 0 ? (
            model.sections.map((section) => (
              <DesignSectionEditor
                key={section.id}
                content={content}
                section={section}
                onChange={onChange}
              />
            ))
          ) : (
            <p className="p-3 text-xs text-muted-foreground">
              No markdown sections.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function DesignTablesEditor({
  content,
  tables,
  onChange,
}: {
  readonly content: string;
  readonly tables: readonly EditableDesignTable[];
  readonly onChange: (content: string) => void;
}) {
  const visibleTables = tables.filter(isUsefulDesignTable)
  if (visibleTables.length === 0) return null

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <p className="text-xs font-semibold">Tables</p>
        <span className="font-mono text-[10px] text-muted-foreground">{visibleTables.length}</span>
      </div>
      <div className="space-y-4 p-3">
        {visibleTables.map((table) => (
          <DesignTableEditor
            key={table.id}
            content={content}
            table={table}
            onChange={onChange}
          />
        ))}
      </div>
    </section>
  );
}

function DesignTableEditor({
  content,
  table,
  onChange,
}: {
  readonly content: string;
  readonly table: EditableDesignTable;
  readonly onChange: (content: string) => void;
}) {
  const [activeCell, setActiveCell] = useState<{
    readonly rowIndex: number;
    readonly cellIndex: number;
  } | null>(null);
  // A markdown table can have many columns — too many rich editors for the narrow
  // panel. Cells are plain compact inputs in a horizontally-scrollable grid with a
  // sensible min column width. Rich color/number controls are shown only for the
  // selected cell below the table, so the grid stays readable.
  const columns = `repeat(${table.headers.length}, minmax(4.25rem, 1fr)) 1.75rem`
  const activeValue =
    activeCell ? table.rows[activeCell.rowIndex]?.[activeCell.cellIndex] ?? '' : ''
  const activeMeta = activeCell ? parseEditableDesignValue(activeValue) : null
  const activeHeader =
    activeCell ? table.headers[activeCell.cellIndex] ?? `Column ${activeCell.cellIndex + 1}` : ''
  const semanticShape = semanticDesignTableShape(table)

  if (semanticShape) {
    return (
      <DesignSemanticTableEditor
        content={content}
        table={table}
        shape={semanticShape}
        onChange={onChange}
      />
    )
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto pb-0.5">
        <div className="w-max min-w-full space-y-1">
          <div className="grid gap-1" style={{ gridTemplateColumns: columns }}>
            {table.headers.map((header, cellIndex) => (
              <Input
                key={`${table.id}:header:${cellIndex}`}
                value={header}
                aria-label={`Table header ${cellIndex + 1}`}
                onFocus={() => setActiveCell(null)}
                onChange={(event) =>
                  onChange(
                    updateDesignMarkdownTableCell(
                      content,
                      table,
                      "header",
                      cellIndex,
                      event.target.value,
                    ),
                  )
                }
                className="h-7 px-2 font-mono text-[11px] font-semibold"
              />
            ))}
            <span aria-hidden />
          </div>

          {table.rows.map((row, rowIndex) => (
            <div
              key={`${table.id}:row:${rowIndex}`}
              className="grid gap-1"
              style={{ gridTemplateColumns: columns }}
            >
              {table.headers.map((_, cellIndex) => (
                <Input
                  key={`${table.id}:row:${rowIndex}:cell:${cellIndex}`}
                  value={row[cellIndex] ?? ""}
                  aria-label={`Table row ${rowIndex + 1} cell ${cellIndex + 1}`}
                  onFocus={() => setActiveCell({ rowIndex, cellIndex })}
                  onChange={(event) =>
                    onChange(
                      updateDesignMarkdownTableCell(
                        content,
                        table,
                        rowIndex,
                        cellIndex,
                        event.target.value,
                      ),
                    )
                  }
                  className={cn(
                    "h-7 px-2 font-mono text-[11px]",
                    activeCell?.rowIndex === rowIndex &&
                      activeCell.cellIndex === cellIndex &&
                      "border-foreground/60 ring-1 ring-foreground/15",
                  )}
                />
              ))}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete table row ${rowIndex + 1}`}
                onClick={() => {
                  setActiveCell(null);
                  onChange(
                    removeDesignMarkdownTableRow(content, table, rowIndex),
                  );
                }}
                className="size-7 self-center"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange(appendDesignMarkdownTableRow(content, table))}
        className="w-full"
      >
        <Plus className="size-3.5" />
        Add row
      </Button>
      {activeCell && activeMeta && activeMeta.kind !== "text" ? (
        <div className="space-y-2 rounded-lg border border-border bg-background/60 p-2">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-xs font-medium">
              {activeHeader}
            </p>
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
              Row {activeCell.rowIndex + 1}
            </span>
          </div>
          <DesignValueEditor
            value={activeValue}
            label={`${activeHeader} row ${activeCell.rowIndex + 1}`}
            onChange={(nextValue) =>
              onChange(
                updateDesignMarkdownTableCell(
                  content,
                  table,
                  activeCell.rowIndex,
                  activeCell.cellIndex,
                  formatEditedDesignValue(activeValue, nextValue),
                ),
              )
            }
          />
        </div>
      ) : null}
    </div>
  );
}

function DesignSemanticTableEditor({
  content,
  table,
  shape,
  onChange,
}: {
  readonly content: string
  readonly table: EditableDesignTable
  readonly shape: SemanticDesignTableShape
  readonly onChange: (content: string) => void
}) {
  const valueHeader = table.headers[shape.valueIndex] ?? 'Value'
  const noteHeader = shape.noteIndex !== null ? table.headers[shape.noteIndex] ?? 'Note' : null

  return (
    <div className="space-y-2">
      <div className="space-y-2">
        {table.rows.map((row, rowIndex) => {
          const name = row[shape.nameIndex] ?? ''
          const value = row[shape.valueIndex] ?? ''
          const note = shape.noteIndex !== null ? row[shape.noteIndex] ?? '' : ''
          if (!isUsefulTableRow(row)) return null

          return (
            <div
              key={`${table.id}:semantic:${rowIndex}`}
              className="space-y-2 rounded-lg border border-border bg-background/60 p-2"
            >
              <div className="flex items-center gap-2">
                <Input
                  value={name}
                  aria-label={`Table row ${rowIndex + 1} name`}
                  onChange={(event) =>
                    onChange(updateDesignMarkdownTableCell(
                      content,
                      table,
                      rowIndex,
                      shape.nameIndex,
                      event.target.value,
                    ))
                  }
                  className="h-7 min-w-0 flex-1 px-2 text-xs font-semibold"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete table row ${rowIndex + 1}`}
                  onClick={() => onChange(removeDesignMarkdownTableRow(content, table, rowIndex))}
                  className="size-7 shrink-0"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-medium uppercase text-muted-foreground">
                  {valueHeader}
                </p>
                <DesignValueEditor
                  value={value}
                  label={`${name || valueHeader} value`}
                  onChange={(nextValue) =>
                    onChange(updateDesignMarkdownTableCell(
                      content,
                      table,
                      rowIndex,
                      shape.valueIndex,
                      formatEditedDesignValue(value, nextValue),
                    ))
                  }
                />
              </div>

              {shape.noteIndex !== null ? (
                <div className="space-y-1">
                  <p className="text-[10px] font-medium uppercase text-muted-foreground">
                    {noteHeader}
                  </p>
                  <Input
                    value={note}
                    aria-label={`Table row ${rowIndex + 1} note`}
                    onChange={(event) =>
                      onChange(updateDesignMarkdownTableCell(
                        content,
                        table,
                        rowIndex,
                        shape.noteIndex ?? 0,
                        event.target.value,
                      ))
                    }
                    className="h-7 px-2 text-xs"
                  />
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange(appendDesignMarkdownTableRow(content, table))}
        className="w-full"
      >
        <Plus className="size-3.5" />
        Add row
      </Button>
    </div>
  )
}

interface SemanticDesignTableShape {
  readonly nameIndex: number
  readonly valueIndex: number
  readonly noteIndex: number | null
}

function semanticDesignTableShape(table: EditableDesignTable): SemanticDesignTableShape | null {
  const valueIndex = findTableHeader(table, [
    'value',
    '值',
    'token value',
    '数值',
    'color',
    '颜色',
    'size',
    '尺寸',
    'style',
    '样式',
  ])
  if (valueIndex < 0) return null

  const nameIndex = findTableHeader(table, [
    'name',
    'token',
    'key',
    'property',
    '属性',
    '变量',
    '名称',
    '状态',
  ])
  if (nameIndex < 0 || nameIndex === valueIndex) return null

  const noteIndex = findTableHeader(table, [
    'usage',
    'use',
    '用途',
    'description',
    'desc',
    '说明',
    'note',
    'notes',
  ])

  return {
    nameIndex,
    valueIndex,
    noteIndex: noteIndex >= 0 && noteIndex !== nameIndex && noteIndex !== valueIndex
      ? noteIndex
      : null,
  }
}

function findTableHeader(table: EditableDesignTable, candidates: readonly string[]): number {
  return table.headers.findIndex((header) => {
    const normalized = normalizeTableText(header)
    return candidates.some((candidate) => normalized === normalizeTableText(candidate))
  })
}

function isUsefulDesignTable(table: EditableDesignTable): boolean {
  if (table.headers.length < 2 || table.headers.length > 6) return false
  if (!table.headers.every(isUsefulTableCell)) return false
  return table.rows.some(isUsefulTableRow)
}

function isUsefulTableRow(row: readonly string[]): boolean {
  return row.filter(isUsefulTableCell).length >= 2
}

function isUsefulTableCell(cell: string): boolean {
  const text = cell.trim()
  if (!text) return false
  if (/^[|\-:—_\s`]+$/.test(text)) return false
  const signal = text.match(/[a-z0-9\u4e00-\u9fa5#%]/gi)?.length ?? 0
  return signal > 0
}

function normalizeTableText(value: string): string {
  return value
    .replace(/`+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function DesignControlGroup({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  readonly title: string;
  readonly count: number;
  readonly defaultOpen?: boolean;
  readonly children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen)
  if (count === 0) return null

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/30"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <ChevronRight
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-90",
            )}
          />
          <span className="truncate text-xs font-semibold">{title}</span>
        </span>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
          {count}
        </span>
      </button>
      {open ? (
        <div className="space-y-2.5 border-t border-border p-3">
          {children}
        </div>
      ) : null}
    </section>
  );
}

function DesignControlRow({
  control,
  content,
  onChange,
}: {
  readonly control: EditableDesignControl;
  readonly content: string;
  readonly onChange: (content: string) => void;
}) {
  const editor = (
    <DesignValueEditor
      value={control.value}
      label={control.label}
      onChange={(nextValue) =>
        onChange(
          updateDesignMarkdownControl(
            content,
            control,
            formatEditedDesignValue(control.value, nextValue),
          ),
        )
      }
    />
  );

  // Short tokens (colour / dimension) read best as a single `label · value` line;
  // free text (contract fields, rules) keeps a full-width input under its label.
  if (control.kind === "color" || control.kind === "number") {
    return (
      <div className="flex items-center gap-3">
        <span
          className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
          title={control.label}
        >
          {control.label}
        </span>
        <div className="w-[56%] shrink-0">{editor}</div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <p
        className="truncate text-xs text-muted-foreground"
        title={control.label}
      >
        {control.label}
      </p>
      {editor}
    </div>
  );
}

function DesignValueEditor({
  value,
  label,
  onChange,
}: {
  readonly value: string;
  readonly label: string;
  readonly onChange: (value: string) => void;
}) {
  const meta = parseEditableDesignValue(value);
  const color = meta.kind === "color" ? extractEditableColor(value) : null;
  const numberValue =
    meta.kind === "number"
      ? Number.parseFloat(editableDesignValueLiteral(value))
      : Number.NaN;

  // Colour: a swatch + the raw value (no clutter).
  if (meta.kind === "color" && color) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={color}
          aria-label={label}
          onChange={(event) =>
            onChange(replaceFirstColor(value, event.target.value))
          }
          className="size-7 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
        />
        <Input
          value={value}
          aria-label={`${label} value`}
          onChange={(event) => onChange(event.target.value)}
          className="h-7 min-w-0 font-mono text-[11px]"
        />
      </div>
    );
  }

  // Dimension: one compact input + a unit suffix. Native spinners cover stepping;
  // no slider / ± box — that clutter is what made the narrow panel unreadable.
  if (meta.kind === "number" && Number.isFinite(numberValue)) {
    const step = numericStepForUnit(meta.unit);
    const updateNumber = (nextValue: number) => {
      const clamped = Math.min(meta.max, Math.max(meta.min, nextValue));
      onChange(formatNumberValue(clamped, meta.unit, step));
    };
    return (
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          value={Number(numberValue.toFixed(decimalPlacesForStep(step)))}
          aria-label={label}
          min={meta.min}
          max={meta.max}
          step={step}
          onChange={(event) => {
            const next = Number.parseFloat(event.target.value);
            if (Number.isFinite(next)) updateNumber(next);
          }}
          className="h-7 min-w-0 font-mono text-[11px] tabular-nums"
        />
        {meta.unit ? (
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
            {meta.unit}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <Input
      value={value}
      aria-label={label}
      onChange={(event) => onChange(event.target.value)}
      className="h-7 text-[11px]"
    />
  );
}

function DesignSectionEditor({
  content,
  section,
  onChange,
}: {
  readonly content: string;
  readonly section: EditableDesignSection;
  readonly onChange: (content: string) => void;
}) {
  return (
    <div className="p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold">{section.title}</p>
          <p className="font-mono text-[10px] text-muted-foreground">
            {"#".repeat(section.level)}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${section.title}`}
          onClick={() =>
            onChange(removeDesignMarkdownSection(content, section))
          }
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      <Textarea
        value={section.body}
        rows={Math.min(7, Math.max(3, section.body.split("\n").length + 1))}
        onChange={(event) =>
          onChange(
            updateDesignMarkdownSection(content, section, event.target.value),
          )
        }
        className="resize-y text-xs leading-5"
      />
    </div>
  );
}

function extractEditableColor(value: string): string | null {
  const match = /#[0-9a-f]{3}(?:[0-9a-f]{3})?/i.exec(value);
  if (!match) return null;
  const hex = match[0];
  if (hex.length === 4) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`.toLowerCase();
  }
  return hex.slice(0, 7).toLowerCase();
}

function replaceFirstColor(value: string, color: string): string {
  return value.replace(/#[0-9a-f]{3}(?:[0-9a-f]{3})?(?:[0-9a-f]{2})?/i, color);
}

function numericStepForUnit(unit: string | null): number {
  if (unit === "rem" || unit === "em" || unit === "s" || unit === null)
    return 0.1;
  if (unit === "ms") return 10;
  return 1;
}

function decimalPlacesForStep(step: number): number {
  const text = String(step);
  const index = text.indexOf(".");
  return index < 0 ? 0 : text.length - index - 1;
}

function formatNumberValue(
  value: number,
  unit: string | null,
  step: number,
): string {
  const decimals = decimalPlacesForStep(step);
  const rounded = Number(value.toFixed(Math.max(0, decimals)));
  return `${rounded}${unit ?? ""}`;
}

function prototypeImageVersion(artifact: PrototypeImageArtifact): string {
  return `${artifact.bytes.byteLength}:${artifact.width}x${artifact.height}`;
}

interface LibraryArtifactMeta {
  readonly path: string;
  readonly sha256: string;
  readonly mediaType: string;
  readonly size: number;
}

/**
 * Nest a saved Library item's flat, content-addressed artifact list
 * (`GlobalLibraryItem.content.artifacts`, real relative paths + hashes) into
 * a folder tree by path segment. These are genuine catalog entries, not
 * fabricated — the manifest records paths/hashes only, so leaves carry no
 * preview bytes.
 */
function buildArtifactTree(
  parentId: string,
  artifacts: readonly LibraryArtifactMeta[],
): FilesPanelNode[] {
  interface Trie {
    readonly folders: Map<string, Trie>;
    readonly artifacts: LibraryArtifactMeta[];
  }
  const root: Trie = { folders: new Map(), artifacts: [] };

  for (const artifact of artifacts) {
    const segments = artifact.path.split("/");
    let node = root;
    for (let depth = 0; depth < segments.length - 1; depth += 1) {
      const segment = segments[depth];
      let child = node.folders.get(segment);
      if (!child) {
        child = { folders: new Map(), artifacts: [] };
        node.folders.set(segment, child);
      }
      node = child;
    }
    node.artifacts.push(artifact);
  }

  function toNodes(trie: Trie, pathPrefix: string): FilesPanelNode[] {
    const folderNodes: FilesPanelNode[] = [...trie.folders.entries()].map(
      ([name, child]) => ({
        kind: "folder",
        id: `${parentId}:${pathPrefix}${name}`,
        name,
        children: toNodes(child, `${pathPrefix}${name}/`),
      }),
    );
    const fileNodes: FilesPanelNode[] = trie.artifacts.map((artifact) => ({
      kind: "artifact",
      id: `${parentId}:${artifact.path}`,
      name: artifact.path.split("/").pop() ?? artifact.path,
      mediaType: artifact.mediaType,
      size: artifact.size,
      sha256: artifact.sha256,
    }));
    return [...folderNodes, ...fileNodes];
  }

  return toNodes(root, "");
}

function repairForMaterialImpact(
  plan: MaterialImpactPlan,
): PrototypeRepairPlan | null {
  if (plan.blockedReason) return null;
  if (plan.scope === "design") {
    return {
      synthesizeDesignMarkdown: false,
      generateDesignSystem: true,
      generatePages: false,
      deconstructPages: false,
      targetRegionIds: [],
    };
  }
  if (plan.scope === "page") {
    return {
      synthesizeDesignMarkdown: false,
      generateDesignSystem: false,
      generatePages: true,
      deconstructPages: true,
      targetRegionIds: [],
    };
  }
  return null;
}

function OutputSurface({
  canvasBackground,
  showMinimap,
  showGrid,
  canvasToolbar,
  canvasActions,
  canvasAnnotations,
  onCanvasAnnotationsChange,
  designDocument,
  librarySavedMaterialIds,
  canSaveApproved,
  onSaveApprovedToLibrary,
  prototypePlan,
  prototypePages,
  prototypeDesignSystem,
  selectedPrototypePageId,
  onPrototypePageSelect,
  prototypeScope,
  onScopeChange,
  onPrimaryAction,
  hasSource,
  hasSlices,
  productionReviewCount,
  productionReviewQueue,
  working,
  analysisStatus,
  runError,
  focusedArtifactId,
  focusRequestId,
  selectedMaterial,
  onSelectMaterial,
  onRequestMaterialChanges,
  onRequestPlanChanges,
  variantDecision,
  onVariantDecision,
  onToggleReferenceLock,
  onMoreLikeThis,
  branchRequestCount,
  creativeBranches,
}: {
  readonly canvasBackground: string | null;
  readonly showMinimap: boolean;
  readonly showGrid: boolean;
  readonly canvasToolbar: ReactNode;
  readonly canvasActions: NonNullable<OutputCanvasProps["actions"]>;
  readonly canvasAnnotations: readonly CanvasAnnotation[];
  readonly onCanvasAnnotationsChange: (
    annotations: readonly CanvasAnnotation[],
  ) => void;
  readonly designDocument: DesignDocument | null;
  readonly librarySavedMaterialIds: ReadonlySet<string>;
  readonly canSaveApproved: boolean;
  readonly onSaveApprovedToLibrary: (item: CanvasImageItem) => Promise<void>;
  readonly prototypePlan: PrototypePlan | null;
  readonly prototypePages: readonly PrototypePageArtifact[];
  readonly prototypeDesignSystem: PrototypeDesignSystemArtifact | null;
  readonly selectedPrototypePageId: string | null;
  readonly onPrototypePageSelect: (pageId: string) => void;
  readonly prototypeScope: PrototypeSuiteScope;
  readonly onScopeChange: (scope: PrototypeSuiteScope) => void;
  readonly onPrimaryAction: () => void;
  readonly hasSource: boolean;
  readonly hasSlices: boolean;
  readonly productionReviewCount: number;
  readonly productionReviewQueue: readonly ProductionReviewProjection[];
  readonly working: boolean;
  readonly analysisStatus: ReturnType<typeof useStatus>;
  readonly runError: string | null;
  readonly focusedArtifactId: string | null;
  readonly focusRequestId: number;
  readonly selectedMaterial: MaterialRef | null;
  readonly onSelectMaterial: (material: MaterialRef) => void;
  readonly onRequestMaterialChanges: (material: MaterialRef) => void;
  readonly onRequestPlanChanges: () => void;
  readonly variantDecision?: CreativeVariantDecision;
  readonly onVariantDecision: (decision: "favorite" | "rejected") => void;
  readonly onToggleReferenceLock: () => void;
  readonly onMoreLikeThis: (material: MaterialRef) => void;
  readonly branchRequestCount: number;
  readonly creativeBranches: CreativeBoardState["branches"];
}) {
  const [previewPageId, setPreviewPageId] = useState<string | null>(null);
  const prototypeArtifacts = useMemo(
    () =>
      projectPrototypeArtifacts({
        designSystem: prototypeDesignSystem,
        pages: prototypePages,
      }),
    [prototypeDesignSystem, prototypePages],
  );
  const previewArtifact =
    prototypeArtifacts.pages.find(
      (artifact) => artifact.page.id === previewPageId,
    ) ??
    null;
  const canvasSlices = useSlices();
  const plannedPages = prototypePlan
    ? pagesForScope(prototypePlan, prototypeScope)
    : [];
  const generatedPageIds = new Set(
    prototypeArtifacts.pages.map((artifact) => artifact.page.id),
  );
  const missingPageCount = plannedPages.filter(
    (page) => !generatedPageIds.has(page.id),
  ).length;
  const hasPrototypeArtifacts =
    Boolean(prototypeArtifacts.designSystem) || prototypeArtifacts.pages.length > 0;
  const needsContinuation =
    Boolean(prototypePlan) &&
    hasPrototypeArtifacts &&
    !hasSlices &&
    !working &&
    prototypePlan?.humanLoop.mode !== "ask";
  const continuationDetail = !prototypeArtifacts.designSystem
    ? "The design system is not finished yet."
    : missingPageCount > 0
      ? `${missingPageCount} prototype page${missingPageCount === 1 ? "" : "s"} still needs to be generated.`
      : "Prototype screens are available. Continue to extract assets.";

  // Constrained orchestration board: once a prototype result exists, results +
  // materials are arranged on one governed canvas (design system · pages · assets).
  if (prototypeArtifacts.designSystem || prototypeArtifacts.pages.length > 0) {
    const evidenceFor = (materialId: string) => {
      const material = designDocument?.materials.find(
        (candidate) => candidate.id === materialId,
      );
      return material
        ? { materialId: material.id, revisionId: material.currentRevisionId }
        : null;
    };
    const designSystemEvidence = evidenceFor("material:design-system");
    const canvasDesignSystem: CanvasImageItem | null = prototypeArtifacts.designSystem
      ? {
          id: "design-system",
          label: prototypeArtifacts.designSystem.name || "Design system",
          blob: prototypeArtifacts.designSystem.blob,
          material: {
            id: "design-system",
            kind: "design-system",
            label: prototypeArtifacts.designSystem.name || "Design system",
            version: prototypeImageVersion(prototypeArtifacts.designSystem),
            provenance: { source: "prototype-generation" },
          },
          evidenceMaterialId: designSystemEvidence?.materialId,
          revisionId: designSystemEvidence?.revisionId,
          healthDetail:
            prototypeArtifacts.documentation.status === "repair-required"
              ? "DESIGN.md needs repair"
              : undefined,
        }
      : null;
    const canvasPages: CanvasImageItem[] = prototypeArtifacts.pages.map((artifact) => {
      const evidence = evidenceFor(
        `material:prototype-page:${artifact.page.id}`,
      );
      return {
        id: artifact.page.id,
        label: artifact.page.name,
        blob: artifact.blob,
        material: {
          id: artifact.page.id,
          kind: "prototype-page",
          label: artifact.page.name,
          version: prototypeImageVersion(artifact),
          provenance: { source: "prototype-generation" },
        },
        pageId: artifact.page.id,
        evidenceMaterialId: evidence?.materialId,
        revisionId: evidence?.revisionId,
      };
    });
    const canvasAssets: CanvasImageItem[] = canvasSlices.map((slice) => {
      const evidence = evidenceFor(`material:cutout-slice:${slice.id}`);
      return {
        id: slice.id,
        label: slice.name,
        url: slice.objectUrl,
        material: {
          id: slice.id,
          kind: "cutout-slice",
          label: slice.name,
          version: `${slice.blob.size}:${slice.width}x${slice.height}:${slice.box.x},${slice.box.y}`,
          provenance: {
            source: "page-deconstruction",
          sourcePageId: slice.pageId ?? undefined,
            independentlyEditable: false,
          },
        },
        pageId: slice.pageId ?? undefined,
        evidenceMaterialId: evidence?.materialId,
        revisionId: evidence?.revisionId,
      };
    });
    const taskStatus = runError
      ? "failed" as const
      : working
        ? "generating" as const
        : "queued" as const;
    const missingDesignSystemStatus = working
      ? "generating" as const
      : prototypeArtifacts.pages.length > 0 || runError
        ? "failed" as const
        : "queued" as const;
    const pendingDesignSystem: CanvasImageItem | null = prototypePlan && !prototypeArtifacts.designSystem
      ? {
          id: "design-system",
          label: "Design system",
          material: {
            id: "design-system",
            kind: "design-system",
            label: "Design system",
            version: "pending",
            provenance: { source: "prototype-generation" },
          },
          status: missingDesignSystemStatus,
          statusDetail:
            missingDesignSystemStatus === "generating"
              ? "Generating"
              : missingDesignSystemStatus === "failed"
                ? "Needs repair"
                : "Queued",
        }
      : null;
    const pendingPages: CanvasImageItem[] = plannedPages
      .filter((page) => !generatedPageIds.has(page.id))
      .map((page) => ({
        id: page.id,
        label: page.name,
        material: {
          id: page.id,
          kind: "prototype-page",
          label: page.name,
          version: "pending",
          provenance: { source: "prototype-generation" },
        },
        status: taskStatus,
        statusDetail: taskStatus === "generating" ? "Generating" : taskStatus === "failed" ? "Needs retry" : "Queued",
      }));
    const pendingAssets: CanvasImageItem[] = prototypePages.length > 0
      ? prototypePlan?.pages.flatMap((page) => page.regions)
          .filter((region) => region.assetRoute === "board-cutout")
          .filter((region) => !canvasSlices.some((slice) => slice.regionId === region.id))
          .map((region) => {
            const blocker = productionReviewQueue.find(
              (item) => item.regionId === region.id,
            );
            return {
              id: `task:region:${region.id}`,
              label: region.name,
              material: {
                id: `task:region:${region.id}`,
                kind: "cutout-slice" as const,
                label: region.name,
                version: "pending",
                provenance: { source: "page-deconstruction" as const },
              },
              status: blocker ? "failed" as const : taskStatus,
              statusDetail: blocker
                ? blocker.status === "failed" ? "Needs retry" : "Needs review"
                : taskStatus === "generating" ? "Extracting" : "Queued",
            };
          }) ?? []
      : [];
    return (
      <div className="relative h-full min-h-0">
        <OutputCanvas
          showMinimap={showMinimap}
          showGrid={showGrid}
          background={canvasBackground}
          toolbar={canvasToolbar}
          actions={canvasActions}
          annotations={canvasAnnotations}
          onAnnotationsChange={onCanvasAnnotationsChange}
          designSystem={canvasDesignSystem}
          pages={canvasPages}
          assets={canvasAssets}
          pendingDesignSystem={pendingDesignSystem}
          pendingPages={pendingPages}
          pendingAssets={pendingAssets}
          focusArtifactId={focusedArtifactId}
          focusRequestId={focusRequestId}
          selectedMaterialId={selectedMaterial?.id}
          onSelectMaterial={onSelectMaterial}
          onRequestMaterialChanges={onRequestMaterialChanges}
          variantDecision={variantDecision}
          onVariantDecision={onVariantDecision}
          onToggleReferenceLock={onToggleReferenceLock}
          onMoreLikeThis={onMoreLikeThis}
          branchRequestCount={branchRequestCount}
          creativeBranches={creativeBranches}
          onSaveToLibrary={
            canSaveApproved
              ? (item) =>
                  void onSaveApprovedToLibrary(item).catch((error) =>
                    toast.error("Could not save to Library", {
                      description:
                        error instanceof Error ? error.message : String(error),
                    }),
                  )
              : undefined
          }
          librarySavedMaterialIds={librarySavedMaterialIds}
        />
        {needsContinuation ? (
          <ContinueAssetsCallout
            detail={runError ?? continuationDetail}
            onContinue={onPrimaryAction}
          />
        ) : null}
      </div>
    );
  }

  if (hasSlices || productionReviewCount > 0) {
    const showPrototypeContext =
      Boolean(prototypePlan) || Boolean(prototypeDesignSystem) || prototypePages.length > 0
    return (
      // Fixed-height column: the parent never scrolls. The strip is pinned and
      // only the slice grid scrolls, so browsing assets never hides the header.
      <div className="relative flex h-full min-h-0 flex-col">
        {showPrototypeContext ? (
          <div className="shrink-0 p-3 pb-0">
            {prototypePages.length > 0 ? (
              <PrototypeSuiteStrip
                designSystem={prototypeDesignSystem}
                pages={prototypePages}
                selectedPageId={selectedPrototypePageId}
                onSelectPage={(pageId) => {
                  onPrototypePageSelect(pageId)
                  setPreviewPageId(pageId)
                }}
              />
            ) : (
              <PrototypeContextStrip
                plan={prototypePlan}
                designSystem={prototypeDesignSystem}
                onContinue={onPrimaryAction}
              />
            )}
            <PrototypePreviewDialog
              artifact={previewArtifact}
              open={previewArtifact !== null}
              onOpenChange={(open) => {
                if (!open) setPreviewPageId(null);
              }}
            />
          </div>
        ) : null}
        <div className="min-h-0 flex-1">
          <SliceOutcomeTabs onRetry={onPrimaryAction} />
        </div>
      </div>
    );
  }

  if (runError) {
    return (
      <CenteredState
        icon={PackageOpen}
        title="No result yet"
        detail="Review the Agent timeline, then retry when ready."
      />
    );
  }

  if (prototypePlan && prototypePages.length === 0 && !working) {
    if (prototypePlan.humanLoop.mode === "ask") {
      return (
        <CenteredState
          icon={MessageCircle}
          title="Answer in the Agent panel"
          detail="Choose a direction on the left, or write a custom answer, then continue."
        />
      );
    }

    return (
      <PrototypePlanReview
        plan={prototypePlan}
        scope={prototypeScope}
        onScopeChange={onScopeChange}
        onRequestChanges={onRequestPlanChanges}
      />
    );
  }

  if (prototypePages.length > 0) {
    return (
      <div className="relative h-full min-h-0">
        <PrototypeSuitePreview
          designSystem={prototypeDesignSystem}
          pages={prototypePages}
          selectedPageId={selectedPrototypePageId}
          onSelectPage={onPrototypePageSelect}
        />
      </div>
    );
  }

  if (analysisStatus === "error") {
    return (
      <CenteredState
        icon={PackageOpen}
        title="No assets found"
        detail="This run did not produce usable cutouts."
      />
    );
  }

  if (hasSource) {
    return (
      <div className="relative flex h-full min-h-0 p-4">
        <SourceCanvas />
      </div>
    );
  }

  if (working) {
    return (
      <div className="relative h-full min-h-0">
        <OutputCanvas
          showMinimap={showMinimap}
          showGrid={showGrid}
          background={canvasBackground}
          toolbar={canvasToolbar}
          actions={canvasActions}
          annotations={canvasAnnotations}
          onAnnotationsChange={onCanvasAnnotationsChange}
          designSystem={null}
          pages={[]}
          assets={[]}
          emptyHint="Results will appear here when ready"
        />
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-0">
      <OutputCanvas
        showMinimap={showMinimap}
        showGrid={showGrid}
        background={canvasBackground}
        toolbar={canvasToolbar}
        actions={canvasActions}
        annotations={canvasAnnotations}
        onAnnotationsChange={onCanvasAnnotationsChange}
        designSystem={null}
        pages={[]}
        assets={[]}
        emptyHint="Get started by describing your idea to the Agent"
      />
    </div>
  );
}

function ScopePicker({
  scope,
  onScopeChange,
  disabled,
  primaryCount,
  fullCount,
}: {
  readonly scope: PrototypeSuiteScope;
  readonly onScopeChange: (scope: PrototypeSuiteScope) => void;
  readonly disabled: boolean;
  readonly primaryCount: number;
  readonly fullCount: number;
}) {
  if (primaryCount >= fullCount) return null;

  return (
    <div role="group" aria-label="Generation range" className="inline-flex h-8 items-stretch border border-border bg-background">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onScopeChange("primary-flow")}
        className={cn(
          "min-w-28 px-3 text-left text-xs transition-colors disabled:pointer-events-none disabled:opacity-60",
          scope === "primary-flow"
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        )}
      >
        <span className="font-medium">Primary flow</span>
        <span className="ml-1 opacity-70">{primaryCount}</span>
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onScopeChange("full-plan")}
        className={cn(
          "min-w-28 border-l border-border px-3 text-left text-xs transition-colors disabled:pointer-events-none disabled:opacity-60",
          scope === "full-plan"
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        )}
      >
        <span className="font-medium">Full plan</span>
        <span className="ml-1 opacity-70">{fullCount}</span>
      </button>
    </div>
  );
}

function PrototypePlanReview({
  plan,
  scope,
  onScopeChange,
  onRequestChanges,
}: {
  readonly plan: PrototypePlan;
  readonly scope: PrototypeSuiteScope;
  readonly onScopeChange: (scope: PrototypeSuiteScope) => void;
  readonly onRequestChanges: () => void;
}) {
  const scopedPages = pagesForScope(plan, scope);
  const primaryCount = pagesForScope(plan, "primary-flow").length;
  const fullCount = plan.pages.length;
  const reviewMarkdown = prototypeReviewMarkdown(plan, scope);

  const copyReview = async () => {
    try {
      await navigator.clipboard.writeText(reviewMarkdown);
      toast.success("Plan copied");
    } catch (error) {
      toast.error("Copy failed", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const downloadReview = () => {
    const blob = new Blob([reviewMarkdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const filename = plan.product.name
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, "") || "plan-review";
    anchor.href = url;
    anchor.download = `${filename}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Plan downloaded");
  };

  return (
    <RichTextArtifact
      label="Plan review"
      title={plan.product.name}
      meta={`${scopedPages.length} pages · ready for review`}
      markdown={reviewMarkdown}
      actions={
        <>
          {primaryCount < fullCount ? (
            <ScopePicker scope={scope} onScopeChange={onScopeChange} disabled={false} primaryCount={primaryCount} fullCount={fullCount} />
          ) : null}
          <Button type="button" variant="ghost" size="sm" onClick={() => void copyReview()}><Copy /> Copy</Button>
          <Button type="button" variant="ghost" size="sm" onClick={downloadReview}><Download /> Download</Button>
          <Button type="button" variant="ghost" size="sm" onClick={onRequestChanges}><MessageSquareText /> Request changes</Button>
        </>
      }
    />
  );
}

function HumanLoopQuestion({
  loop,
  selectedChoiceId,
  onChoiceChange,
  compact = false,
}: {
  readonly loop: HumanLoopAskLike;
  readonly selectedChoiceId: string | null;
  readonly onChoiceChange: (id: string) => void;
  readonly compact?: boolean;
}) {
  const { t } = useLingui();
  const useJudgmentLabel = t({
    id: "workspace.human_loop_use_judgment",
    message: "Use your judgment",
  });
  return (
    <section
      role="group"
      aria-label={t({
        id: "workspace.human_loop_choose_direction",
        message: "Choose a direction",
      })}
      className={cn(
        "rounded-lg border border-primary/35 bg-background shadow-sm",
        compact ? "p-3" : "p-4",
      )}
    >
      <div>
        <h3
          className={cn(
            "min-w-0 font-semibold leading-6",
            compact ? "text-sm" : "text-base",
          )}
        >
          {loop.question}
        </h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {t({
            id: "workspace.human_loop_instruction",
            message: "Choose one direction. Add optional context below, then press the arrow.",
          })}
        </p>
      </div>

      <div
        className={cn("grid gap-2", compact ? "mt-3" : "mt-4 md:grid-cols-2")}
      >
        <button
          type="button"
          aria-label={useJudgmentLabel}
          onClick={() => onChoiceChange(loop.defaultChoiceId)}
          className="rounded-md border border-primary/50 bg-primary/10 p-2.5 text-left transition-colors hover:bg-primary/15"
        >
          <span className="text-xs font-semibold">{useJudgmentLabel}</span>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {t({
              id: "workspace.human_loop_use_judgment_hint",
              message: "Continue with the Agent's recommended direction.",
            })}
          </p>
        </button>
        {loop.choices
          .filter((choice) => choice.id !== loop.defaultChoiceId)
          .slice(0, 2)
          .map((choice) => {
            const selected = choice.id === selectedChoiceId;
            return (
              <button
                key={choice.id}
                type="button"
                onClick={() => onChoiceChange(choice.id)}
                className={cn(
                  "rounded-md border text-left transition-colors",
                  compact ? "min-h-0 p-2.5" : "min-h-24 p-3",
                  selected
                    ? "border-primary bg-primary/10"
                    : "border-border bg-muted/10 hover:bg-muted/40",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <span
                    className={cn(
                      "font-semibold",
                      compact ? "text-xs" : "text-sm",
                    )}
                  >
                    {choice.label}
                  </span>
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      selected ? "bg-primary" : "bg-muted-foreground/30",
                    )}
                  />
                </div>
                <p
                  className={cn(
                    "mt-2 text-xs leading-5 text-muted-foreground",
                    compact ? "line-clamp-3" : null,
                  )}
                >
                  {choice.description}
                </p>
              </button>
            );
          })}
      </div>
    </section>
  );
}

function PrototypeSuitePreview({
  designSystem,
  pages,
  selectedPageId,
  onSelectPage,
}: {
  readonly designSystem: PrototypeDesignSystemArtifact | null;
  readonly pages: readonly PrototypePageArtifact[];
  readonly selectedPageId: string | null;
  readonly onSelectPage: (pageId: string) => void;
}) {
  const [previewArtifact, setPreviewArtifact] =
    useState<PrototypePageArtifact | null>(null);
  const selected =
    pages.find((page) => page.page.id === selectedPageId) ?? pages[0];
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto p-4">
      {designSystem ? <DesignSystemReference artifact={designSystem} /> : null}
      <PrototypePageRail
        pages={pages}
        selectedPageId={selected?.page.id ?? null}
        onSelectPage={onSelectPage}
      />
      {selected ? (
        <PrototypePagePreview
          artifact={selected}
          onOpenPreview={() => setPreviewArtifact(selected)}
        />
      ) : null}
      <PrototypePreviewDialog
        artifact={previewArtifact}
        open={Boolean(previewArtifact)}
        onOpenChange={(open) => {
          if (!open) setPreviewArtifact(null);
        }}
      />
    </div>
  );
}

function PrototypeSuiteStrip({
  designSystem,
  pages,
  selectedPageId,
  onSelectPage,
}: {
  readonly designSystem: PrototypeDesignSystemArtifact | null;
  readonly pages: readonly PrototypePageArtifact[];
  readonly selectedPageId: string | null;
  readonly onSelectPage: (pageId: string) => void;
}) {
  return (
    <section className="mb-3 rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Prototype suite</h3>
          <p className="text-xs text-muted-foreground">
            Planned pages used to seed this asset set.
          </p>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">
          {pages.length} pages
        </span>
      </div>
      {designSystem ? (
        <DesignSystemReference artifact={designSystem} compact />
      ) : null}
      <PrototypePageRail
        pages={pages}
        selectedPageId={selectedPageId}
        onSelectPage={onSelectPage}
        compact
        opensPreview
      />
    </section>
  );
}

function PrototypeContextStrip({
  plan,
  designSystem,
  onContinue,
}: {
  readonly plan: PrototypePlan | null
  readonly designSystem: PrototypeDesignSystemArtifact | null
  readonly onContinue: () => void
}) {
  const pages = plan?.pages ?? []

  return (
    <section className="mb-3 rounded-lg border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Prototype suite</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {pages.length > 0
              ? 'The plan is available, but prototype screens are not attached to this result yet.'
              : 'Prototype screens should be generated before assets are treated as the final result.'}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onContinue}
          className="shrink-0"
        >
          <WandSparkles className="size-3.5" />
          Continue
        </Button>
      </div>

      {designSystem ? (
        <div className="mt-3">
          <DesignSystemReference artifact={designSystem} compact />
        </div>
      ) : null}

      {pages.length > 0 ? (
        <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {pages.slice(0, 6).map((page) => (
            <div
              key={page.id}
              className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5"
            >
              <Route className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-xs font-medium">{page.name}</span>
              <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                planned
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function DesignSystemReference({
  artifact,
  compact = false,
}: {
  readonly artifact: PrototypeDesignSystemArtifact;
  readonly compact?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const next = URL.createObjectURL(artifact.blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [artifact.blob]);

  async function copyDesignMd(): Promise<void> {
    try {
      await navigator.clipboard.writeText(artifact.designMarkdown);
      toast.success("DESIGN.md copied");
    } catch (error) {
      toast.error("Copy failed", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <section className="mb-3 rounded-md border border-border bg-background p-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Open design system reference"
          onClick={() => setOpen(true)}
          className={cn(
            "shrink-0 overflow-hidden rounded-sm border border-border bg-muted/30 outline-none transition-all hover:border-ring/50 focus-visible:ring-3 focus-visible:ring-ring/40",
            compact ? "size-16" : "h-20 w-32",
          )}
        >
          {url ? (
            <img src={url} alt="" className="h-full w-full object-cover" />
          ) : (
            <Layers3 className="m-auto size-5 text-muted-foreground" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">Design system</p>
          <p className="mt-1 truncate text-[11px] text-muted-foreground">
            DESIGN.md + visual reference · {artifact.width}×{artifact.height}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void copyDesignMd()}
        >
          <Tag className="size-3.5" />
          DESIGN.md
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          aria-describedby={undefined}
          className="w-fit max-w-[94vw] gap-0 p-2"
        >
          <DialogTitle className="sr-only">Design system reference</DialogTitle>
          {url ? (
            <div className="grid gap-2">
              <div className="flex min-w-0 items-center justify-between gap-4 px-1 pt-1">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    Design system
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    DESIGN.md-compatible style contract
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void copyDesignMd()}
                >
                  <Tag className="size-3.5" />
                  Copy DESIGN.md
                </Button>
              </div>
              <img
                src={url}
                alt=""
                className="max-h-[82vh] max-w-[90vw] rounded-md object-contain"
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function PrototypePageRail({
  pages,
  selectedPageId,
  onSelectPage,
  compact = false,
  opensPreview = false,
}: {
  readonly pages: readonly PrototypePageArtifact[];
  readonly selectedPageId: string | null;
  readonly onSelectPage: (pageId: string) => void;
  readonly compact?: boolean;
  readonly opensPreview?: boolean;
}) {
  return (
    <div
      role="listbox"
      aria-label="Prototype pages"
      className="mb-3 flex gap-2 overflow-x-auto pb-1"
    >
      {pages.map((artifact) => (
        <PrototypePageThumb
          key={artifact.page.id}
          artifact={artifact}
          selected={artifact.page.id === selectedPageId}
          onSelect={() => onSelectPage(artifact.page.id)}
          compact={compact}
          opensPreview={opensPreview}
        />
      ))}
    </div>
  );
}

function PrototypePageThumb({
  artifact,
  selected,
  onSelect,
  compact,
  opensPreview,
}: {
  readonly artifact: PrototypePageArtifact;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly compact: boolean;
  readonly opensPreview: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const next = URL.createObjectURL(artifact.blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [artifact.blob]);

  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      aria-label={`${opensPreview ? "Open preview for" : "Show"} ${artifact.page.name}`}
      onClick={onSelect}
      className={cn(
        "w-36 shrink-0 rounded-md border bg-background p-2 text-left outline-none transition-all",
        opensPreview ? "cursor-zoom-in" : "cursor-pointer",
        "hover:border-ring/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40",
        selected
          ? "border-primary shadow-sm ring-1 ring-primary/30"
          : "border-border",
        compact ? "w-32" : null,
      )}
    >
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-sm bg-muted/30">
        {url ? (
          <img
            src={url}
            alt={artifact.page.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <ImageIcon className="size-5 text-muted-foreground" />
        )}
      </div>
      <p className="mt-2 truncate text-xs font-semibold">
        {artifact.page.name}
      </p>
      <p className="truncate font-mono text-[10px] text-muted-foreground">
        {artifact.page.route}
      </p>
    </button>
  );
}

function PrototypePreviewDialog({
  artifact,
  open,
  onOpenChange,
}: {
  readonly artifact: PrototypePageArtifact | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!artifact) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(artifact.blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [artifact]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="w-fit max-w-[94vw] gap-0 p-2"
      >
        <DialogTitle className="sr-only">
          {artifact
            ? `Prototype preview: ${artifact.page.name}`
            : "Prototype preview"}
        </DialogTitle>
        {artifact && url ? (
          <div className="grid gap-2">
            <div className="flex min-w-0 items-center justify-between gap-4 px-1 pt-1">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {artifact.page.name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {artifact.page.route} · {artifact.width}×{artifact.height}
                </p>
              </div>
            </div>
            <img
              src={url}
              alt=""
              className="max-h-[82vh] max-w-[90vw] rounded-md object-contain"
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PrototypePagePreview({
  artifact,
  onOpenPreview,
}: {
  readonly artifact: PrototypePageArtifact;
  readonly onOpenPreview: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const next = URL.createObjectURL(artifact.blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [artifact.blob]);

  return (
    <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-background p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">
            {artifact.page.name}
          </h2>
          <p className="truncate text-xs text-muted-foreground">
            {artifact.page.purpose}
          </p>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">
          {artifact.width}×{artifact.height}
        </span>
      </div>
      <button
        type="button"
        aria-label={`Open preview for ${artifact.page.name}`}
        onClick={onOpenPreview}
        className="flex h-[calc(100%-3.25rem)] w-full cursor-zoom-in items-center justify-center overflow-hidden rounded-md bg-muted/20 outline-none transition-colors hover:bg-muted/30 focus-visible:ring-3 focus-visible:ring-ring/40"
      >
        {url ? (
          <img
            src={url}
            alt={artifact.page.name}
            className="max-h-full max-w-full rounded-sm object-contain"
          />
        ) : (
          <ImageIcon className="size-8 text-muted-foreground" />
        )}
      </button>
    </div>
  );
}

function CenteredState({
  icon: Icon,
  title,
  detail,
}: {
  readonly icon: ComponentType<{ className?: string }>;
  readonly title: string;
  readonly detail: string;
}) {
  const { ref, style } = useCenteredSafeArea();
  return (
    <div ref={ref} style={style} data-slot="canvas-centered-overlay" className="pointer-events-none absolute z-10 min-w-0 text-center">
      <div className="min-w-0 text-center">
        <Icon className="mx-auto mb-4 size-9 text-muted-foreground/60" />
        <h2 className="break-words text-lg font-semibold">{title}</h2>
        <p className="mt-2 max-w-sm break-words text-sm text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

function useCenteredSafeArea() {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>();
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const workspace = element.closest("[data-workspace-root]");
    const measure = () => {
      const bounds = element.parentElement?.getBoundingClientRect();
      if (!bounds) return;
      const panels = [...(workspace?.querySelectorAll<HTMLElement>('[data-workspace-panel="agent-drawer"], [data-workspace-panel="files-drawer"], [data-workspace-panel="design-drawer"], [aria-label="Inspector"]') ?? [])];
      const { left, right, bottom } = projectVisiblePanelInsets(bounds, panels.map((panel) => ({ bounds: panel.getBoundingClientRect(), visible: visiblyOccupiesSpace(panel) })));
      const area = projectCanvasSafeArea({ viewport: { width: bounds.width, height: bounds.height }, agentDrawer: { open: left > 0, size: left }, inspector: { open: right > 0, size: right }, bottomOverlay: { open: bottom > 0, size: bottom }, centeredOverlay: { maxWidth: 448, margin: 24 } });
      const anchor = projectCanvasOverlayAnchor(area, "center");
      setStyle({ left: anchor.x, top: anchor.y, width: `min(28rem, ${anchor.maxWidth}px)`, transform: "translate(-50%, -50%)" });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element.parentElement ?? element);
    workspace?.querySelectorAll<HTMLElement>("[data-workspace-panel], [aria-label=\"Inspector\"]").forEach((panel) => observer.observe(panel));
    const mutations = new MutationObserver(measure);
    if (workspace) mutations.observe(workspace, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style", "data-workspace-panel"] });
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); mutations.disconnect(); window.removeEventListener("resize", measure); };
  }, []);
  return { ref, style };
}

function ContinueAssetsCallout({
  detail,
  onContinue,
}: {
  readonly detail: string;
  readonly onContinue: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-24 z-10 flex justify-center px-4">
      <div className="pointer-events-none flex w-full max-w-xl items-center justify-between gap-4 rounded-lg border border-border bg-background/95 px-4 py-3 shadow-lg backdrop-blur">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Continue generation</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {detail}
          </p>
        </div>
        <Button
          type="button"
          onClick={onContinue}
          className="pointer-events-auto shrink-0"
        >
          <WandSparkles className="size-4" />
          Continue assets
        </Button>
      </div>
    </div>
  );
}

function useElapsedSeconds(startedAt: number | null, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAt || !active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [active, startedAt]);

  if (!startedAt) return 0;
  const displayNow = active ? Math.max(now, Date.now()) : now;
  return Math.max(0, Math.floor((displayNow - startedAt) / 1000));
}

function resolveAssetStage({
  genPhase,
  analysisStatus,
  naming,
  hasMockup,
  hasSource,
  hasSlices,
  agentBusy,
  workflowPhase,
  hasPlan,
  hasDesignSystem,
  hasPrototypePages,
  productionStatus,
}: {
  readonly genPhase: ReturnType<typeof useStore.getState>["genPhase"];
  readonly analysisStatus: ReturnType<typeof useStatus>;
  readonly naming: boolean;
  readonly hasMockup: boolean;
  readonly hasSource: boolean;
  readonly hasSlices: boolean;
  readonly agentBusy: boolean;
  readonly workflowPhase: WorkflowPhase;
  readonly hasPlan: boolean;
  readonly hasDesignSystem: boolean;
  readonly hasPrototypePages: boolean;
  readonly productionStatus: ProductionRunStatus | null;
}): AssetStageId {
  if (workflowPhase === "planning") return "planning";
  if (workflowPhase === "review") return "review";
  if (workflowPhase === "design-system") return "design-system";
  if (workflowPhase === "generating-suite") return "mockup";
  if (genPhase === "generating-mockup") return "mockup";
  if (genPhase === "deconstructing") return "deconstruct";
  if (analysisStatus === "running") return "cutout";
  if (hasPlan && productionStatus === "completed") return "done";
  if (
    hasPlan &&
    productionStatus &&
    ["running", "partial", "needs-review", "failed"].includes(productionStatus)
  ) {
    return "cutout";
  }
  if (naming) return "naming";
  if (!hasPlan && hasSlices) return "done";
  if (hasPrototypePages) return "mockup";
  if (hasDesignSystem) return "design-system";
  if (hasPlan) return "review";
  if (agentBusy) {
    if (hasSource) return "cutout";
    if (hasMockup) return "deconstruct";
    return "preparing";
  }
  return "idle";
}

function applyLocalSemanticSliceNames(
  plan: PrototypePlan | null,
  scope: PrototypeSuiteScope,
  onlyGeneric: boolean,
): number {
  if (!plan) return 0;
  const snapshot = getStoreState();
  const slices = snapshot.analysis.slices;
  if (slices.length === 0) return 0;

  const names = fallbackPrototypeSliceNames(
    plan,
    pagesForScope(plan, scope),
    slices.length,
  );
  let renamed = 0;
  for (let index = 0; index < slices.length; index += 1) {
    const slice = slices[index];
    const name = names[index];
    if (!slice || !name) continue;
    if (onlyGeneric && !isGenericSliceFilename(slice.name)) continue;
    snapshot.renameSlice(slice.id, name);
    renamed += 1;
  }
  return renamed;
}

function buildAssetStages({
  activeStage,
  hasMockup,
  hasSource,
  hasSlices,
  namingStatus,
  hasPlan,
  hasDesignSystem,
  hasPrototypePages,
  productionStatus,
}: {
  readonly activeStage: AssetStageId;
  readonly hasMockup: boolean;
  readonly hasSource: boolean;
  readonly hasSlices: boolean;
  readonly namingStatus:
    "idle" | "pending" | "running" | "done" | "skipped" | "error";
  readonly hasPlan: boolean;
  readonly hasDesignSystem: boolean;
  readonly hasPrototypePages: boolean;
  readonly productionStatus: ProductionRunStatus | null;
}): readonly AssetStage[] {
  const isDone = (id: AssetStage["id"]): boolean => {
    if (id === "planning")
      return (
        hasPlan || hasPrototypePages || hasMockup || hasSource || hasSlices
      );
    if (id === "design-system")
      return (
        hasDesignSystem ||
        hasPrototypePages ||
        hasMockup ||
        hasSource ||
        hasSlices
      );
    if (id === "mockup")
      return hasPrototypePages || hasMockup || hasSource || hasSlices;
    if (id === "deconstruct") return hasSource || hasSlices;
    if (id === "cutout")
      return productionStatus === "completed" || (!hasPlan && hasSlices);
    if (id === "naming") return namingStatus === "done";
    return (
      activeStage !== "idle" &&
      activeStage !== "preparing" &&
      activeStage !== "review"
    );
  };
  const isRunning = (id: AssetStage["id"]): boolean => activeStage === id;

  const stage = (
    id: AssetStage["id"],
    label: string,
    detail: string,
    icon: AssetStage["icon"],
  ): AssetStage => ({
    id,
    label,
    detail,
    icon,
    status: isDone(id) ? "done" : isRunning(id) ? "running" : "pending",
  });

  return [
    stage("planning", "Plan", "Map pages, flows, and scope.", WandSparkles),
    stage(
      "design-system",
      "Design system",
      "Create DESIGN.md and visual reference.",
      Layers3,
    ),
    stage("mockup", "Prototype suite", "Generate planned pages.", ImageIcon),
    stage(
      "deconstruct",
      "Asset board",
      "Regenerate valuable visual layers.",
      Layers3,
    ),
    stage("cutout", "Cutout", "Detect and split atomic assets.", ScanLine),
    stage("naming", "Names", "Apply semantic filenames.", Tag),
  ];
}

function stripMarkdownFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/i);
  return (fenced?.[1] ?? trimmed).trim();
}

function sortPrototypePages(
  pages: readonly PrototypePageArtifact[],
  order: readonly PrototypePage[],
): PrototypePageArtifact[] {
  const index = new Map(order.map((page, i) => [page.id, i]));
  return pages.toSorted((a, b) => {
    return (index.get(a.page.id) ?? 999) - (index.get(b.page.id) ?? 999);
  });
}

function isPrototypeSuiteComplete(
  plan: PrototypePlan,
  scope: PrototypeSuiteScope,
  pages: readonly PrototypePageArtifact[],
  designSystem: PrototypeDesignSystemArtifact | null,
): boolean {
  if (!designSystem) return false;
  const generatedIds = new Set(pages.map((artifact) => artifact.page.id));
  return pagesForScope(plan, scope).every((page) => generatedIds.has(page.id));
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function userFacingGenerationError(message: string): string {
  const lower = message.toLowerCase();

  if (
    lower.includes("api_key") ||
    lower.includes("api key") ||
    lower.includes("unauthorized") ||
    lower.includes("invalid key")
  ) {
    return "The selected AI provider needs a valid API key. Open Settings and update the provider.";
  }

  if (
    lower.includes("timed out") ||
    lower.includes("timeout") ||
    lower.includes("request failed") ||
    lower.includes("network") ||
    lower.includes("fetch failed")
  ) {
    return "The connection to the AI provider was interrupted. Try again to continue.";
  }

  if (
    lower.includes("schema") ||
    lower.includes("json") ||
    lower.includes("structured")
  ) {
    return "The AI response could not be processed. Try again to continue.";
  }

  if (message.trim().length === 0) return "Generation stopped.";
  return message.length > 180
    ? "Generation stopped. Try again to continue."
    : message;
}

function recoverWorkflowPhase(
  snapshot: WorkspaceSnapshot | null | undefined,
  artifacts: ReturnType<typeof recoverPrototypeArtifacts>,
): WorkflowPhase {
  if (!snapshot?.prototypePlan) return "idle";
  if (artifacts.pages.length > 0 || artifacts.designSystem)
    return "idle";
  return "review";
}

function persistPrototypeImage(
  artifact: PrototypeImageArtifact,
): PersistedPrototypeImage {
  return {
    bytes: artifact.bytes,
    mediaType: artifact.mediaType,
    width: artifact.width,
    height: artifact.height,
  };
}

function persistPrototypeDesignSystem(
  artifact: PrototypeDesignSystemArtifact,
): PersistedPrototypeDesignSystem {
  return {
    ...persistPrototypeImage(artifact),
    name: artifact.name,
    designMarkdown: artifact.designMarkdown,
  };
}

function persistPrototypePage(
  artifact: PrototypePageArtifact,
): PersistedPrototypePage {
  return {
    ...persistPrototypeImage(artifact),
    page: artifact.page,
  };
}

async function artifactToMockup(artifact: PrototypePageArtifact) {
  const bitmap = await decodeImage(artifact.blob);
  return {
    bitmap,
    blob: artifact.blob,
    width: bitmap.width,
    height: bitmap.height,
  };
}

function defaultHumanLoopChoiceId(plan: PrototypePlan): string | null {
  return plan.humanLoop.mode === "ask" ? plan.humanLoop.defaultChoiceId : null;
}

function resolveHumanLoopAnswer(
  loop: Pick<HumanLoopAskLike, "defaultChoiceId" | "choices">,
  choiceId: string | null,
  customAnswer: string,
): ResolvedHumanLoopAnswer {
  const normalizedCustom = customAnswer.trim();
  if (choiceId === CUSTOM_HUMAN_LOOP_ID && normalizedCustom.length > 0) {
    return { kind: "custom", text: normalizedCustom };
  }
  const id =
    choiceId === CUSTOM_HUMAN_LOOP_ID
      ? loop.defaultChoiceId
      : (choiceId ?? loop.defaultChoiceId);
  const answer =
    loop.choices.find((choice) => choice.id === id) ?? loop.choices[0];
  if (!answer) throw new Error("Human-in-the-loop question has no choices.");
  return {
    kind: "choice",
    choice: answer,
    note: normalizedCustom.length > 0 ? normalizedCustom : null,
  };
}

function composeHumanLoopRequirement(
  brief: string,
  loop: PrototypeHumanLoopAsk,
  answer: ResolvedHumanLoopAnswer,
): string {
  const answerLines =
    answer.kind === "custom"
      ? ["Selected choice: Custom option", `Custom answer: ${answer.text}`]
      : [
          `Selected choice: ${answer.choice.label}`,
          `Choice description: ${answer.choice.description}`,
          `Expected planning impact: ${answer.choice.impact}`,
          ...(answer.note ? [`Additional guidance: ${answer.note}`] : []),
        ];

  return [
    brief.trim(),
    "",
    "Human-in-the-loop answer:",
    `Question: ${loop.question}`,
    ...answerLines,
    "",
    'Re-plan from the original requirement and this answer. If the answer resolves the material ambiguity, set humanLoop.mode to "continue". Ask another question only if a new, higher-impact ambiguity still blocks a useful prototype suite.',
  ].join("\n");
}

function WorkspaceRail({
  agentActive,
  onToggleAgent,
  filesActive,
  onToggleFiles,
  onOpenAssets,
  onOpenDesign,
  inspectorActive,
  onOpenDeliver,
  advanced,
  onOpenAdvanced,
  onCollapseSidebar,
}: {
  readonly agentActive: boolean;
  readonly onToggleAgent: () => void;
  readonly filesActive: boolean;
  readonly onToggleFiles: () => void;
  readonly onOpenAssets: () => void;
  readonly onOpenDesign: () => void;
  readonly inspectorActive: boolean;
  readonly onOpenDeliver: () => void;
  readonly advanced?: boolean;
  readonly onOpenAdvanced?: () => void;
  readonly onCollapseSidebar: () => void;
}) {
  return (
    <nav
      aria-label="Workspace panels"
      className="hidden h-full w-14 flex-col items-center gap-1 border-r border-border bg-background py-3 lg:flex"
    >
      <button
        type="button"
        aria-label="Collapse sidebar"
        title="Collapse sidebar"
        className="group/logo mb-2 flex size-8 shrink-0 items-center justify-center text-foreground transition-opacity hover:opacity-70"
        onClick={onCollapseSidebar}
      >
        <PanelLeftClose className="size-4" />
      </button>
      <RailItem
        icon={<Sparkles className="size-4" />}
        label="Agent"
        active={agentActive}
        onClick={onToggleAgent}
      />
      <RailItem
        icon={<FilesIcon className="size-4" />}
        label="Files"
        active={filesActive}
        onClick={onToggleFiles}
      />
      <RailItem
        icon={<ImageIcon className="size-4" />}
        label="Assets"
        onClick={onOpenAssets}
      />
      <RailItem
        icon={<PanelLeft className="size-4" />}
        label="Design"
        active={inspectorActive}
        onClick={onOpenDesign}
      />
      <RailItem
        icon={<PackageCheck className="size-4" />}
        label="Deliver"
        onClick={onOpenDeliver}
      />
      {advanced && onOpenAdvanced ? (
        <RailItem
          icon={<ShieldCheck className="size-4" />}
          label="Advanced"
          onClick={onOpenAdvanced}
        />
      ) : null}
    </nav>
  );
}

function RailItem({
  icon,
  label,
  active = false,
  onClick,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly active?: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flex w-12 flex-col items-center gap-1 rounded-md px-1 py-2 text-[10px] transition-colors",
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
      onClick={onClick}
    >
      {icon}
      <span className="leading-none">{label}</span>
    </button>
  );
}

import {
  lazy,
  Suspense,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AuthoringKind } from "@/design-os-operations";
import type { GameAssetLaunchRequest } from "@/game-asset-profile";
import {
  acceptCommerceProjectLifecycleRecord,
  createCommerceProjectLifecycleRecord,
  requestCommerceProjectDownload,
  type CommerceProjectLifecycleRecord,
} from "@/commerce-profile/project-lifecycle";
import { downloadCommerceProjectFiles } from "@/commerce-profile/project-download";
import type { WorkspaceWorkbenchTab } from "@/workspace/navigation";
import {
  Boxes,
  ArrowLeft,
  Check,
  CheckCircle2,
  CircleAlert,
  Code2,
  Component,
  ExternalLink,
  FileArchive,
  FileSearch,
  PenTool,
  FolderInput,
  Gamepad2,
  Layers3,
  Download,
  LibraryBig,
  PackageCheck,
  Palette,
  RefreshCw,
  Upload,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Workflow,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  DesignOsPanel,
  type DesignOsPanelModel,
} from "@/components/design-os/DesignOsPanel";
import {
  DeliveryCenterPanel,
  type DeliveryCenterViewModel,
} from "./DeliveryCenterPanel";
import { CommerceLifecycleEvidence } from "./CommerceProjectLifecycleReview";
import {
  WorkflowPackCatalogPanel,
  type WorkflowPackCatalogItem,
} from "./WorkflowPackCatalogPanel";
import { GovernanceSummary } from "@/components/design-governance/GovernanceSummary";
import type { GovernanceReceipt, GovernanceScenario } from "@/design-governance";
import {
  projectStarterReadiness,
  type StarterTarget,
} from "./starter-readiness";
import { projectComponentReadiness } from "./component-readiness";
import { deliveryWorkspaceClasses } from "@/workspace/delivery-workspace-ui";
import {
  DESIGN_OS_PROFILE_DESCRIPTORS,
  createDesignOsWorkbenchNavigationState,
  defaultDestinationForSection,
  destinationForProfile,
  reduceDesignOsWorkbenchNavigation,
  type DesignOsCreateDetail,
  type DesignOsDeliverDetail,
  type DesignOsInspectDetail,
  type DesignOsProfileId,
  type DesignOsWorkbenchDestination,
  type DesignOsWorkbenchSection,
} from "./workbench-navigation";

const GameAssetProductionPanel = lazy(() =>
  import("./GameAssetProductionPanel").then((module) => ({
    default: module.GameAssetProductionPanel,
  })),
);

const CommerceProductionPanel = lazy(() =>
  import("./CommerceProductionPanel").then((module) => ({
    default: module.CommerceProductionPanel,
  })),
);

export type DesignOsReadiness = "ready" | "blocked" | "pending" | "unavailable";
export type DesignOsWorkbenchTab = WorkspaceWorkbenchTab;
type DesignOsWorkbenchLens = "designer" | "builder";

export interface FigmaWorkbenchPreview {
  readonly id: string;
  readonly fileName: string;
  readonly summary: string;
  readonly collections: number;
  readonly tokens: number;
  readonly components: number;
  readonly codeConnect: number;
  readonly warnings: readonly string[];
}

export interface DesignOsSourceItem {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
  readonly role: string;
  readonly license: string;
  readonly provenance: string;
  readonly detail?: string;
  readonly href?: string;
}

export interface DesignOsIngestPreview {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly sourceCount: number;
  readonly warnings?: readonly string[];
  readonly repository?: {
    readonly fileCount: number;
    readonly frameworks: readonly {
      readonly name: string;
      readonly confidence: string;
      readonly evidence: readonly string[];
    }[];
    readonly exclusions: readonly {
      readonly label: string;
      readonly count: number;
    }[];
    readonly role: string;
    readonly license: string;
  };
}

export interface DesignOsReceipt {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly createdAt?: string;
  readonly digest?: string;
}

export interface DesignOsDeliverableItem {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly readiness: DesignOsReadiness;
  readonly blockers?: readonly string[];
  readonly preview?: DesignOsReceipt;
  readonly receipt?: DesignOsReceipt;
}

export interface DesignOsWorkbenchModel {
  readonly projectTitle?: string;
  readonly brief?: string;
  readonly summary: DesignOsPanelModel;
  readonly sources: readonly DesignOsSourceItem[];
  readonly ingestPreview?: DesignOsIngestPreview;
  readonly kits: readonly DesignOsDeliverableItem[];
  readonly components: readonly DesignOsDeliverableItem[];
  readonly componentReadinessFacts?: {
    readonly hasStructuredPrototype: boolean;
    readonly hasTokens: boolean;
    readonly hasExplicitCandidates: boolean;
  };
  readonly starters: readonly DesignOsDeliverableItem[];
  readonly figmaPreview?: FigmaWorkbenchPreview;
  readonly figmaExportReady?: boolean;
  readonly authoringPreview?: {
    readonly id: string;
    readonly kind: AuthoringKind;
    readonly summary: string;
  };
  readonly authoringValues?: Partial<Record<AuthoringKind, unknown>>;
  readonly delivery?: DeliveryCenterViewModel;
  readonly governance?: {
    readonly receipt: GovernanceReceipt;
    readonly scenarios?: readonly GovernanceScenario[];
  };
  readonly workflowPacks?: readonly WorkflowPackCatalogItem[];
  readonly commerceProjectLifecycle?: CommerceProjectLifecycleRecord;
  /**
   * Present once a design kit has been compiled for the current revision.
   * `files` mirrors DesignKit['files'] — the same tokens.json/DESIGN.md/
   * design-system.html/demo.html set the Kits tab exports to disk, kept in
   * memory here so the Specimen tab can render and re-download them without
   * a second compile.
   */
  readonly specimen?: {
    readonly revisionId: string;
    readonly files: readonly { readonly path: string; readonly content: string }[];
    /** False when demo.html fell back to the deterministic template (no chat model configured, or the Agent call failed). */
    readonly composedByAgent: boolean;
    /** True once this exact specimen has been saved to the Global Library — lets the UI show "Saved" instead of re-offering the action. */
    readonly savedToLibrary?: boolean;
    /** True once the document has moved past the revision this specimen was compiled for — still shown, just flagged. */
    readonly stale: boolean;
  };
  /**
   * Present when a re-synced demo.html's custom-property values differ from
   * the current tokens. Requires explicit approval (onApplyTokenSync) —
   * never applied automatically.
   */
  readonly tokenSyncPreview?: {
    readonly changes: readonly {
      readonly tokenId: string;
      readonly name: string;
      readonly previousValue: string;
      readonly nextValue: string;
    }[];
  };
}

export interface DesignOsWorkbenchCallbacks {
  readonly onRequestSourceIngest?: () => void;
  readonly onApproveSourceIngest?: (previewId: string) => void;
  readonly onOpenSource?: (sourceId: string) => void;
  readonly onExportKit?: (itemId: string) => void;
  /** Compiles (or recompiles) the in-memory kit backing the Specimen tab. */
  readonly onGenerateSpecimen?: () => void;
  /**
   * Re-ingests a hand-edited demo.html as a licensed reference source (so it
   * becomes durable, provenanced Design IR material) and diffs its custom
   * property values against the current tokens. A resulting change set shows
   * up as `tokenSyncPreview` for explicit review — never applied silently.
   */
  readonly onSyncDemoHtml?: (file: File) => void;
  /** Applies the currently previewed token value changes from tokenSyncPreview. */
  readonly onApplyTokenSync?: () => void;
  /** Discards the currently previewed token value changes without applying them. */
  readonly onDiscardTokenSync?: () => void;
  /** Saves the currently compiled design-system.html + demo.html into the Global Library as a design-system-kit item. */
  readonly onSaveSpecimenToLibrary?: () => void;
  readonly onExportComponent?: (itemId: string) => void;
  readonly onExportStarter?: (itemId: string) => void;
  readonly onPrepareFigmaSnapshot?: (snapshot: unknown) => void;
  readonly onApproveFigmaSnapshot?: (previewId: string) => void;
  readonly onExportFigmaVariables?: () => void;
  readonly onPrepareAuthoring?: (kind: AuthoringKind, value: unknown) => void;
  readonly onApproveAuthoring?: (previewId: string) => void;
  readonly onPreviewDelivery?: (targetIds: readonly string[]) => void;
  readonly onApproveDelivery?: (planId: string) => void;
  readonly onPrepareMissingDelivery?: () => void;
  readonly onAddDeliveryDestination?: () => void;
  readonly onRequestGovernanceRepair?: (input: {
    receiptId: string;
    failedFindingIds: readonly string[];
    requiresApproval: boolean;
  }) => void;
  readonly onInstallWorkflowPack?: (id: string, version: string) => void;
  readonly onUpgradeWorkflowPack?: (id: string) => void;
  readonly onEvaluateWorkflowPack?: (id: string) => void;
  readonly onOpenProductCanvas?: () => void;
  readonly onCommerceLifecycleChange?: (
    record: CommerceProjectLifecycleRecord | undefined,
  ) => void;
}

export interface DesignOsWorkbenchProps {
  readonly model: DesignOsWorkbenchModel;
  readonly callbacks?: DesignOsWorkbenchCallbacks;
  readonly defaultTab?: DesignOsWorkbenchTab;
  readonly className?: string;
  readonly surfaceMode?: "inspector" | "deliver";
  readonly gameAssetLaunch?: GameAssetLaunchRequest;
  readonly onBackToWorkspace?: () => void;
  readonly backLabel?: string;
  readonly backMobileLabel?: string;
}

const READINESS_LABEL: Record<DesignOsReadiness, string> = {
  ready: "Ready",
  blocked: "Blocked",
  pending: "Pending",
  unavailable: "Unavailable",
};

const READINESS_VARIANT: Record<
  DesignOsReadiness,
  "secondary" | "destructive" | "outline"
> = {
  ready: "secondary",
  blocked: "destructive",
  pending: "outline",
  unavailable: "outline",
};

export function DesignOsWorkbench({
  model,
  callbacks,
  defaultTab = "overview",
  className,
  surfaceMode = "inspector",
  gameAssetLaunch,
  onBackToWorkspace,
  backLabel = "Back to workspace",
  backMobileLabel = "Back",
}: DesignOsWorkbenchProps) {
  const [navigation, dispatchNavigation] = useReducer(
    reduceDesignOsWorkbenchNavigation,
    defaultTab,
    createDesignOsWorkbenchNavigationState,
  );
  const [lens, setLens] = useState<DesignOsWorkbenchLens>("designer");
  useEffect(() => {
    dispatchNavigation({ type: "sync-legacy-tab", tab: defaultTab });
  }, [defaultTab]);
  const section = navigation.current.section;
  const rememberedCreate = navigation.remembered.create;
  const createDestination =
    navigation.current.section === "create"
      ? navigation.current
      : rememberedCreate?.section === "create"
        ? rememberedCreate
        : destinationForProfile("product-uiux");
  const lifecycleScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scrollActiveTabIntoView = () => {
      const activeTab = lifecycleScrollRef.current?.querySelector<HTMLElement>(
        '[role="tab"][aria-selected="true"]',
      );
      activeTab?.scrollIntoView?.({ block: "nearest", inline: "start" });
    };
    scrollActiveTabIntoView();
    window.addEventListener("resize", scrollActiveTabIntoView);
    return () => window.removeEventListener("resize", scrollActiveTabIntoView);
  }, [section]);
  const navigate = (destination: DesignOsWorkbenchDestination) =>
    destination.section === "create"
      && destination.profileId === "product-uiux"
      && destination.detail === "canvas"
      && callbacks?.onOpenProductCanvas
      ? callbacks.onOpenProductCanvas()
      : dispatchNavigation({ type: "navigate", destination });
  const selectSection = (nextSection: DesignOsWorkbenchSection) => {
    const destination = navigation.remembered[nextSection]
      ?? defaultDestinationForSection(nextSection);
    if (
      destination.section === "create"
      && destination.profileId === "product-uiux"
      && destination.detail === "canvas"
      && callbacks?.onOpenProductCanvas
    ) {
      callbacks.onOpenProductCanvas();
      return;
    }
    dispatchNavigation({ type: "select-section", section: nextSection });
  };
  return (
    <section
      aria-label="Project workbench"
      data-slot="design-os-workbench"
      className={cn(
        "flex min-h-0 min-w-0 flex-col overflow-hidden bg-background text-foreground",
        className,
      )}
    >
      <header
        className={cn(
          "shrink-0 border-b border-border py-3 pl-3 sm:pl-4",
          surfaceMode === "inspector" ? "pr-12" : "pr-3 sm:pr-4",
        )}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          {surfaceMode === "deliver" && onBackToWorkspace ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="min-h-11 min-w-11 shrink-0"
              onClick={onBackToWorkspace}
              aria-label={backLabel}
              title={backLabel}
            >
              <ArrowLeft className="size-4" />
              <span className="sr-only">{backMobileLabel}</span>
            </Button>
          ) : null}
          <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted">
            <Boxes aria-hidden="true" className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 data-governance-probe="title" className="text-sm font-semibold">
              Project workbench
            </h2>
            <p className="truncate text-xs text-muted-foreground">
              {model.projectTitle ?? model.summary.documentId}
            </p>
          </div>
          <WorkbenchLensControl
            lens={lens}
            onChange={setLens}
            className="flex"
          />
          <Badge variant="outline" className="shrink-0">
            Revision {model.summary.revisionNumber}
          </Badge>
        </div>
      </header>

      <Tabs
        value={section}
        onValueChange={(value) =>
          selectSection(value as DesignOsWorkbenchSection)
        }
        className="min-h-0 min-w-0 flex-1 gap-0"
      >
        <div className={cn(deliveryWorkspaceClasses.modeHeader, "min-w-0")}>
          <div ref={lifecycleScrollRef} className="min-w-0 flex-1 overflow-x-auto">
            <TabsList
              aria-label="Project lifecycle"
              variant="line"
              className={cn(
                deliveryWorkspaceClasses.subnav,
                "pr-8 sm:pr-0",
              )}
            >
              <WorkbenchTab value="brief" icon={<Boxes />}>
                Brief
              </WorkbenchTab>
              <WorkbenchTab value="sources" icon={<FolderInput />}>
                Sources
              </WorkbenchTab>
              <WorkbenchTab value="create" icon={<Sparkles />}>
                Create
              </WorkbenchTab>
              <WorkbenchTab value="review" icon={<CheckCircle2 />}>
                Review
              </WorkbenchTab>
              <WorkbenchTab value="deliver" icon={<PackageCheck />}>
                Deliver
              </WorkbenchTab>
              <WorkbenchTab value="inspect" icon={<FileSearch />}>
                Inspect
              </WorkbenchTab>
            </TabsList>
          </div>
        </div>

        <div
          className={cn(
            "min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain",
            section === "deliver"
              ? deliveryWorkspaceClasses.content
              : "p-3 sm:p-4",
          )}
        >
          {lens === "builder" ? (
            <BuilderContext destination={navigation.current} model={model} />
          ) : null}
          <TabsContent value="brief" className="m-0">
            <Overview model={model} />
          </TabsContent>
          <TabsContent value="sources" className="m-0">
            <Sources model={model} callbacks={callbacks} />
          </TabsContent>
          <TabsContent
            value="create"
            forceMount
            className="m-0 data-[state=inactive]:hidden"
          >
            <CreateWorkspace
              destination={createDestination}
              model={model}
              callbacks={callbacks}
              gameAssetLaunch={gameAssetLaunch}
              onNavigate={navigate}
            />
          </TabsContent>
          <TabsContent value="review" className="m-0">
            <ReviewWorkspace
              model={model}
              callbacks={callbacks}
              onNavigate={navigate}
            />
          </TabsContent>
          <TabsContent value="deliver" className="m-0">
            <DeliverWorkspace
              detail={
                navigation.current.section === "deliver"
                  ? navigation.current.detail
                  : "delivery"
              }
              model={model}
              callbacks={callbacks}
              onNavigateDestination={navigate}
              onNavigate={(detail) =>
                navigate({ section: "deliver", detail })
              }
            />
          </TabsContent>
          <TabsContent value="inspect" className="m-0">
            <InspectWorkspace
              detail={
                navigation.current.section === "inspect"
                  ? navigation.current.detail
                  : "system"
              }
              model={model}
              callbacks={callbacks}
              onNavigate={(detail) =>
                navigate({ section: "inspect", detail })
              }
            />
          </TabsContent>
        </div>
      </Tabs>
    </section>
  );
}

function WorkbenchLensControl({
  lens,
  onChange,
  className,
}: {
  readonly lens: DesignOsWorkbenchLens;
  readonly onChange: (lens: DesignOsWorkbenchLens) => void;
  readonly className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Workbench lens"
      className={cn(
        "h-8 shrink-0 items-center rounded-md bg-muted p-0.5",
        className,
      )}
    >
      {(
        [
          ["designer", "Designer", <PenTool key="designer" />],
          ["builder", "Builder", <Code2 key="builder" />],
        ] as const
      ).map(([value, label, icon]) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={lens === value}
          aria-label={label}
          title={`${label} lens`}
          onClick={() => onChange(value)}
          className={cn(
            "flex h-7 min-w-8 items-center justify-center gap-1.5 rounded px-0 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-w-24 sm:px-2",
            lens === value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <span className="[&>svg]:size-3.5" aria-hidden="true">
            {icon}
          </span>
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}

function BuilderContext({
  destination,
  model,
}: {
  readonly destination: DesignOsWorkbenchDestination;
  readonly model: DesignOsWorkbenchModel;
}) {
  const deliverables = [...model.kits, ...model.components, ...model.starters];
  const receipts = deliverables.flatMap((item) =>
    item.receipt
      ? [
          {
            deliverableId: item.id,
            receiptId: item.receipt.id,
            digest: item.receipt.digest,
          },
        ]
      : [],
  );
  const projection =
    destination.section === "create"
      ? `${destination.section}/${destination.profileId}/${destination.detail}`
      : "detail" in destination
        ? `${destination.section}/${destination.detail}`
        : destination.section;
  return (
    <section
      aria-label="Builder context"
      className="mb-4 min-w-0 border-b border-border pb-4"
    >
      <div className="flex min-w-0 items-center gap-2">
        <Code2 className="size-4 shrink-0 text-muted-foreground" />
        <h3 className="text-xs font-semibold">Builder context</h3>
        <span className="ml-auto truncate font-mono text-[10px] text-muted-foreground">
          {projection}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
        <BuilderBinding label="Document" value={model.summary.documentId} />
        <BuilderBinding label="Revision" value={model.summary.revisionId} />
        <BuilderBinding label="Sources" value={String(model.sources.length)} />
        <BuilderBinding label="Receipts" value={String(receipts.length)} />
      </dl>
      <details className="mt-3 text-xs">
        <summary className="min-h-8 cursor-pointer py-2 font-medium text-muted-foreground">
          Bindings and provenance
        </summary>
        <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words border-t border-border pt-3 font-mono text-[10px]">
          {JSON.stringify(
            {
              destination,
              sources: model.sources.map(({ id, provenance, license }) => ({
                id,
                provenance,
                license,
              })),
              deliverables: deliverables.map(({ id, readiness }) => ({
                id,
                readiness,
              })),
              receipts,
            },
            null,
            2,
          )}
        </pre>
      </details>
    </section>
  );
}

function BuilderBinding({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate font-mono text-[11px]" title={value}>
        {value}
      </dd>
    </div>
  );
}

function ProfileIcon({ profileId }: { readonly profileId: DesignOsProfileId }) {
  switch (profileId) {
    case "product-uiux":
      return <PenTool />;
    case "brand":
      return <Palette />;
    case "commerce":
      return <ReceiptText />;
    case "game-asset":
      return <Gamepad2 />;
    case "motion":
      return <Workflow />;
  }
}

function CreateWorkspace({
  destination,
  model,
  callbacks,
  gameAssetLaunch,
  onNavigate,
}: {
  readonly destination: Extract<
    DesignOsWorkbenchDestination,
    { section: "create" }
  >;
  readonly model: DesignOsWorkbenchModel;
  readonly callbacks?: DesignOsWorkbenchCallbacks;
  readonly gameAssetLaunch?: GameAssetLaunchRequest;
  readonly onNavigate: (destination: DesignOsWorkbenchDestination) => void;
}) {
  const profileScrollRef = useRef<HTMLDivElement>(null);
  const [mountedProfiles, setMountedProfiles] = useState<
    readonly DesignOsProfileId[]
  >([destination.profileId]);
  useEffect(() => {
    const activeTab = profileScrollRef.current?.querySelector<HTMLElement>(
      '[role="tab"][aria-selected="true"]',
    );
    activeTab?.scrollIntoView?.({ block: "nearest", inline: "start" });
  }, [destination.profileId]);
  useEffect(() => {
    setMountedProfiles((current) =>
      current.includes(destination.profileId)
        ? current
        : [...current, destination.profileId],
    );
  }, [destination.profileId]);
  const isMounted = (profileId: DesignOsProfileId) =>
    profileId === destination.profileId || mountedProfiles.includes(profileId);
  return (
    <div className="grid min-h-0 min-w-0 gap-4 lg:grid-cols-[12rem_minmax(0,1fr)]">
      <div
        ref={profileScrollRef}
        role="tablist"
        aria-label="Production profiles"
        className="flex min-w-0 gap-1 overflow-x-auto border-b border-border pb-2 lg:flex-col lg:overflow-visible lg:border-r lg:border-b-0 lg:pr-3 lg:pb-0"
      >
        {DESIGN_OS_PROFILE_DESCRIPTORS.map((profile) => {
          const selected = destination.profileId === profile.id;
          return (
            <button
              key={profile.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onNavigate(destinationForProfile(profile.id))}
              className={cn(
                "flex h-10 shrink-0 items-center gap-2 rounded-md px-2.5 text-left text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring lg:w-full",
                selected
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <span className="[&>svg]:size-4" aria-hidden="true">
                <ProfileIcon profileId={profile.id} />
              </span>
              <span className="whitespace-nowrap">{profile.label}</span>
              {profile.availability === "capability-required" ? (
                <span className="ml-auto size-1.5 rounded-full bg-muted-foreground/50" />
              ) : null}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        aria-label={`${DESIGN_OS_PROFILE_DESCRIPTORS.find((profile) => profile.id === destination.profileId)?.label ?? destination.profileId} production`}
        className="min-w-0"
      >
        {isMounted("product-uiux") ? (
          <div hidden={destination.profileId !== "product-uiux"}>
            <ProductUiuxWorkspace
              detail={destination.detail}
              model={model}
              callbacks={callbacks}
              onNavigate={(detail) =>
                onNavigate({
                  section: "create",
                  profileId: "product-uiux",
                  detail,
                })
              }
            />
          </div>
        ) : null}
        {isMounted("brand") ? (
          <div hidden={destination.profileId !== "brand"} className="min-w-0 space-y-3">
            <SectionHeading title="Brand" description="Brand system and kit" />
            <KitWorkspace
              model={model}
              callbacks={callbacks}
              initialTarget="brand"
              purpose="create"
              onOpenDelivery={() =>
                onNavigate({ section: "deliver", detail: "kits" })
              }
            />
          </div>
        ) : null}
        {isMounted("commerce") ? (
          <div hidden={destination.profileId !== "commerce"}>
            <Suspense fallback={<ProductionLoading label="Loading Commerce production" />}>
              <CommerceProductionPanel
                modeScope="project"
                retainedResult={model.commerceProjectLifecycle?.result}
                retainedResultStale={
                  model.commerceProjectLifecycle !== undefined
                  && model.commerceProjectLifecycle.designRevisionId !== model.summary.revisionId
                }
                onCompleted={(result) =>
                  callbacks?.onCommerceLifecycleChange?.(
                    createCommerceProjectLifecycleRecord({
                      designRevisionId: model.summary.revisionId,
                      result,
                    }),
                  )
                }
                onReset={() => callbacks?.onCommerceLifecycleChange?.(undefined)}
                onRequestReview={() => onNavigate({ section: "review" })}
              />
            </Suspense>
          </div>
        ) : null}
        {isMounted("game-asset") ? (
          <div hidden={destination.profileId !== "game-asset"}>
            <Suspense fallback={<ProductionLoading label="Loading Game Asset production" />}>
              <GameAssetProductionPanel launch={gameAssetLaunch} />
            </Suspense>
          </div>
        ) : null}
        {isMounted("motion") ? (
          <div hidden={destination.profileId !== "motion"} className="min-w-0 space-y-3">
            <SectionHeading title="Motion" description="Temporal production" />
            <EmptyState
              icon={<Workflow />}
              title="Temporal Host required"
              detail="Motion production remains unavailable until an authorized temporal Host is connected."
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ProductUiuxWorkspace({
  detail,
  model,
  callbacks,
  onNavigate,
}: {
  readonly detail: DesignOsCreateDetail;
  readonly model: DesignOsWorkbenchModel;
  readonly callbacks?: DesignOsWorkbenchCallbacks;
  readonly onNavigate: (detail: "canvas" | "specimen" | "figma") => void;
}) {
  const view = detail === "figma" || detail === "specimen" ? detail : "canvas";
  return (
    <div className="min-w-0 space-y-3">
      <div className="flex min-w-0 flex-col gap-2 border-b border-border pb-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Product UI/UX</h3>
          <p className="text-xs text-muted-foreground">Product canvas and systems</p>
        </div>
        <div
          role="tablist"
          aria-label="Product UI/UX views"
          className="flex h-9 items-center gap-1 rounded-md bg-muted p-1"
        >
          <ContextTab
            selected={view === "canvas"}
            onClick={() => onNavigate("canvas")}
          >
            Canvas
          </ContextTab>
          <ContextTab
            selected={view === "specimen"}
            onClick={() => onNavigate("specimen")}
          >
            System
          </ContextTab>
          <ContextTab
            selected={view === "figma"}
            onClick={() => onNavigate("figma")}
          >
            Figma snapshot
          </ContextTab>
        </div>
      </div>
      {view === "canvas" ? (
        <EmptyState
          icon={<PenTool />}
          title="Product canvas unavailable"
          detail="This host did not provide the existing Product canvas route."
        />
      ) : view === "figma" ? (
        <FigmaSnapshot model={model} />
      ) : (
        <Specimen model={model} callbacks={callbacks} />
      )}
    </div>
  );
}

function ReviewWorkspace({
  model,
  callbacks,
  onNavigate,
}: {
  readonly model: DesignOsWorkbenchModel;
  readonly callbacks?: DesignOsWorkbenchCallbacks;
  readonly onNavigate: (destination: DesignOsWorkbenchDestination) => void;
}) {
  const items = [...model.kits, ...model.components, ...model.starters];
  const ready = items.filter((item) => item.readiness === "ready");
  const blocked = items.filter((item) => item.readiness === "blocked");
  const receipts = items.flatMap((item) =>
    item.receipt ? [{ item, receipt: item.receipt }] : [],
  );
  const blockers = [
    ...new Set(
      blocked.flatMap((item) =>
        (item.blockers ?? []).map((blocker) => `${item.label}: ${blocker}`),
      ),
    ),
  ];
  const findings = model.governance?.receipt.findings ?? [];
  const failedFindings = findings.filter((finding) => finding.status === "failed");
  const commerce = model.commerceProjectLifecycle;
  const commerceCurrent = commerce?.designRevisionId === model.summary.revisionId;
  const commerceReceiptCount = commerce?.result.deliverables.reduce(
    (count, deliverable) =>
      count + 1 + (deliverable.playbackSourceReceipt ? 1 : 0) + (deliverable.qa ? 1 : 0),
    0,
  ) ?? 0;
  const hasEvidence = Boolean(
    model.governance
      || receipts.length
      || commerce
      || model.figmaPreview
      || model.tokenSyncPreview?.changes.length,
  );

  return (
    <section aria-label="Project review" className="min-w-0 space-y-4">
      <SectionHeading title="Review" description="Current revision evidence" />
      <dl className="grid grid-cols-2 gap-px overflow-hidden border-y border-border bg-border sm:grid-cols-4">
        <ReviewMetric label="Ready" value={ready.length} />
        <ReviewMetric label="Blocked" value={blocked.length} />
        <ReviewMetric label="Findings" value={failedFindings.length} />
        <ReviewMetric label="Receipts" value={receipts.length + commerceReceiptCount} />
      </dl>

      {commerce ? (
        <section aria-label="Commerce review" className="min-w-0 border-y border-border py-3">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-xs font-semibold">Commerce material set</h4>
                <Badge
                  variant={
                    commerceCurrent && commerce.review ? "secondary" : "outline"
                  }
                >
                  {!commerceCurrent
                    ? "Stale revision"
                    : commerce.review
                      ? "Accepted"
                      : "Review required"}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {commerce.result.deliverables.length} retained artifacts · {commerceReceiptCount} Provider and QA receipts
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {!commerceCurrent ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onNavigate(destinationForProfile("commerce"))}
                >
                  <RefreshCw /> Regenerate
                </Button>
              ) : !commerce.review ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={!callbacks?.onCommerceLifecycleChange}
                  onClick={() =>
                    callbacks?.onCommerceLifecycleChange?.(
                      acceptCommerceProjectLifecycleRecord(commerce),
                    )
                  }
                >
                  <Check /> Accept for delivery
                </Button>
              ) : null}
            </div>
          </div>
          <CommerceReviewArtifacts record={commerce} />
        </section>
      ) : null}

      <ProductUiuxReviewChanges model={model} callbacks={callbacks} />

      {blockers.length ? (
        <section className="min-w-0 border-b border-border pb-4">
          <h4 className="text-xs font-semibold">Blocking work</h4>
          <ul className="mt-2 divide-y divide-border text-xs">
            {blockers.map((blocker) => (
              <li key={blocker} className="flex items-start gap-2 py-2">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                <span className="min-w-0 break-words">{blocker}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {model.governance ? (
        <GovernanceSummary
          receipt={model.governance.receipt}
          scenarios={model.governance.scenarios}
          onRequestRepair={callbacks?.onRequestGovernanceRepair}
        />
      ) : null}

      {receipts.length ? (
        <section className="min-w-0">
          <h4 className="text-xs font-semibold">Verified deliveries</h4>
          <ul className="mt-2 divide-y divide-border border-y border-border text-xs">
            {receipts.map(({ item, receipt }) => (
              <li key={`${item.id}:${receipt.id}`} className="flex min-w-0 items-start gap-3 py-2.5">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{item.label}</p>
                  <p className="mt-0.5 truncate text-muted-foreground">{receipt.title}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!hasEvidence ? (
        <EmptyState
          icon={<CheckCircle2 />}
          title="No review evidence yet"
          detail="Review evidence appears after governance or a verified delivery receipt exists for this revision."
        />
      ) : null}
    </section>
  );
}

function ReviewMetric({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className="min-h-16 bg-background px-3 py-2.5">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-base font-semibold">{value}</dd>
    </div>
  );
}

function CommerceReviewArtifacts({
  record,
}: {
  readonly record: CommerceProjectLifecycleRecord;
}) {
  return (
    <div className="mt-3 min-w-0 border-t border-border pt-3">
      <CommerceLifecycleEvidence record={record} />
    </div>
  );
}

function ProductUiuxReviewChanges({
  model,
  callbacks,
}: {
  readonly model: DesignOsWorkbenchModel;
  readonly callbacks?: DesignOsWorkbenchCallbacks;
}) {
  const tokenChanges = model.tokenSyncPreview?.changes ?? [];
  if (!tokenChanges.length && !model.figmaPreview) return null;
  return (
    <section aria-label="Product UI/UX changes" className="min-w-0 space-y-3 border-b border-border pb-4">
      <div>
        <h4 className="text-xs font-semibold">Product UI/UX changes</h4>
        <p className="mt-1 text-xs text-muted-foreground">
          Apply or discard prepared source changes against the current revision.
        </p>
      </div>
      {tokenChanges.length ? (
        <div className="min-w-0 border-y border-border py-3" data-slot="token-sync-preview">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <CircleAlert className="size-3.5 text-amber-600 dark:text-amber-400" />
            {tokenChanges.length} token value change
            {tokenChanges.length === 1 ? "" : "s"}
          </div>
          <ul aria-label="Token value changes" className="mt-2 divide-y divide-border">
            {tokenChanges.map((change) => (
              <li key={change.tokenId} className="flex min-w-0 items-center gap-2 py-1.5 text-xs">
                <span className="min-w-0 flex-1 truncate font-medium">{change.name}</span>
                <SwatchOrValue value={change.previousValue} />
                <span className="text-muted-foreground" aria-hidden="true">to</span>
                <SwatchOrValue value={change.nextValue} />
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap gap-2">
            {callbacks?.onApplyTokenSync ? (
              <Button size="sm" onClick={callbacks.onApplyTokenSync}>
                <Check /> Apply token changes
              </Button>
            ) : null}
            {callbacks?.onDiscardTokenSync ? (
              <Button size="sm" variant="ghost" onClick={callbacks.onDiscardTokenSync}>
                <X /> Discard
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      {model.figmaPreview ? (
        <div className="min-w-0 space-y-3">
          <FigmaSnapshotFacts preview={model.figmaPreview} />
          {callbacks?.onApproveFigmaSnapshot ? (
            <Button
              size="sm"
              onClick={() =>
                callbacks.onApproveFigmaSnapshot?.(model.figmaPreview!.id)
              }
            >
              <ShieldCheck /> Approve and apply IR patch
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              Figma approval is not available in this host.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}

function DeliverWorkspace({
  detail,
  model,
  callbacks,
  onNavigate,
  onNavigateDestination,
}: {
  readonly detail: DesignOsDeliverDetail;
  readonly model: DesignOsWorkbenchModel;
  readonly callbacks?: DesignOsWorkbenchCallbacks;
  readonly onNavigate: (detail: DesignOsDeliverDetail) => void;
  readonly onNavigateDestination: (
    destination: DesignOsWorkbenchDestination,
  ) => void;
}) {
  return (
    <Tabs value={detail} onValueChange={(value) => onNavigate(value as DesignOsDeliverDetail)} className="min-w-0 gap-0">
      <div className="min-w-0 overflow-x-auto border-b border-border">
        <TabsList aria-label="Delivery views" variant="line" className={deliveryWorkspaceClasses.subnav}>
          <WorkbenchTab value="delivery" icon={<PackageCheck />}>Overview</WorkbenchTab>
          <WorkbenchTab value="kits" icon={<Layers3 />}>Kits</WorkbenchTab>
          <WorkbenchTab value="components" icon={<Component />}>Components</WorkbenchTab>
          <WorkbenchTab value="starter" icon={<FileArchive />}>Starter</WorkbenchTab>
        </TabsList>
      </div>
      <div className="min-w-0 pt-4">
        <TabsContent value="delivery" className="m-0">
          <div className="min-w-0 space-y-5">
            <ProductUiuxDelivery
              model={model}
              callbacks={callbacks}
              onNavigate={onNavigateDestination}
            />
            {model.commerceProjectLifecycle ? (
              <CommerceDelivery
                record={model.commerceProjectLifecycle}
                currentRevisionId={model.summary.revisionId}
                callbacks={callbacks}
                onNavigate={onNavigateDestination}
              />
            ) : null}
            {model.delivery ? (
              <DeliveryCenterPanel
                model={{
                  ...model.delivery,
                  governance: model.delivery.governance ?? model.governance,
                }}
                onPreview={callbacks?.onPreviewDelivery}
                onApprove={callbacks?.onApproveDelivery}
                onPrepareMissing={callbacks?.onPrepareMissingDelivery}
                onAddDestination={callbacks?.onAddDeliveryDestination}
                onRequestGovernanceRepair={callbacks?.onRequestGovernanceRepair}
              />
            ) : (
              <EmptyState
                icon={<PackageCheck />}
                title="No delivery plan yet"
                detail="Delivery targets appear when the current revision has an executable target projection."
              />
            )}
          </div>
        </TabsContent>
        <TabsContent value="kits" className="m-0">
          <KitWorkspace model={model} callbacks={callbacks} />
        </TabsContent>
        <TabsContent value="components" className="m-0">
          <ComponentWorkspace model={model} callbacks={callbacks} />
        </TabsContent>
        <TabsContent value="starter" className="m-0">
          <StarterWorkspace model={model} callbacks={callbacks} />
        </TabsContent>
      </div>
    </Tabs>
  );
}

function ProductUiuxDelivery({
  model,
  callbacks,
  onNavigate,
}: {
  readonly model: DesignOsWorkbenchModel;
  readonly callbacks?: DesignOsWorkbenchCallbacks;
  readonly onNavigate: (destination: DesignOsWorkbenchDestination) => void;
}) {
  const files = model.specimen?.files ?? [];
  const specimenHtml = files.find((file) => file.path === "design-system.html");
  const demoHtml = files.find((file) => file.path === "demo.html");
  const hasSystemOutput = Boolean(specimenHtml || demoHtml);
  if (!hasSystemOutput && !model.figmaExportReady) return null;
  const download = (file: { readonly path: string; readonly content: string }) => {
    const blob = new Blob([file.content], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.path;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section aria-label="Product UI/UX delivery" className="min-w-0 border-y border-border py-4">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">Product UI/UX outputs</h3>
            {model.specimen?.stale ? <Badge variant="outline">Stale specimen</Badge> : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Download or publish current-revision system files and Figma Variables payloads.
          </p>
        </div>
        {model.specimen?.stale ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              onNavigate({
                section: "create",
                profileId: "product-uiux",
                detail: "specimen",
              })
            }
          >
            <RefreshCw /> Regenerate
          </Button>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {!model.specimen?.stale && specimenHtml ? (
          <Button size="sm" variant="outline" onClick={() => download(specimenHtml)}>
            <Download /> Download design-system.html
          </Button>
        ) : null}
        {!model.specimen?.stale && demoHtml ? (
          <Button size="sm" variant="outline" onClick={() => download(demoHtml)}>
            <Download /> Download demo.html
          </Button>
        ) : null}
        {!model.specimen?.stale && hasSystemOutput && callbacks?.onSaveSpecimenToLibrary ? (
          <Button
            size="sm"
            variant={model.specimen?.savedToLibrary ? "secondary" : "outline"}
            disabled={model.specimen?.savedToLibrary}
            onClick={callbacks.onSaveSpecimenToLibrary}
          >
            <LibraryBig /> {model.specimen?.savedToLibrary ? "Saved to Library" : "Save to Library"}
          </Button>
        ) : null}
        {model.figmaExportReady && callbacks?.onExportFigmaVariables ? (
          <Button size="sm" variant="outline" onClick={callbacks.onExportFigmaVariables}>
            <PackageCheck /> Export Figma Variables payload
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function CommerceDelivery({
  record,
  currentRevisionId,
  callbacks,
  onNavigate,
}: {
  readonly record: CommerceProjectLifecycleRecord;
  readonly currentRevisionId: string;
  readonly callbacks?: DesignOsWorkbenchCallbacks;
  readonly onNavigate: (destination: DesignOsWorkbenchDestination) => void;
}) {
  const current = record.designRevisionId === currentRevisionId;
  const deliverable = current && Boolean(record.review);
  const requestDownload = () => {
    if (!deliverable) return;
    downloadCommerceProjectFiles(record.result);
    callbacks?.onCommerceLifecycleChange?.(
      requestCommerceProjectDownload(record),
    );
  };
  return (
    <section aria-label="Commerce delivery" className="min-w-0 border-y border-border py-4">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">Commerce bundle</h3>
            <Badge variant={deliverable ? "secondary" : "outline"}>
              {!current
                ? "Stale revision"
                : record.review
                  ? record.delivery
                    ? "Download requested"
                    : "Ready"
                  : "Review required"}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {record.result.deliverables.length} artifacts · exact manifest and retained bytes
          </p>
        </div>
        {!current ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onNavigate(destinationForProfile("commerce"))}
          >
            <RefreshCw /> Regenerate
          </Button>
        ) : !record.review ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onNavigate({ section: "review" })}
          >
            <ShieldCheck /> Open review
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            disabled={!callbacks?.onCommerceLifecycleChange}
            onClick={requestDownload}
          >
            <Download /> {record.delivery ? "Download files again" : "Download files"}
          </Button>
        )}
      </div>
      {record.delivery ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Browser download requested {record.delivery.requestedAt}. This is not a verified filesystem receipt.
        </p>
      ) : null}
    </section>
  );
}

function InspectWorkspace({
  detail,
  model,
  callbacks,
  onNavigate,
}: {
  readonly detail: DesignOsInspectDetail;
  readonly model: DesignOsWorkbenchModel;
  readonly callbacks?: DesignOsWorkbenchCallbacks;
  readonly onNavigate: (detail: DesignOsInspectDetail) => void;
}) {
  return (
    <Tabs value={detail} onValueChange={(value) => onNavigate(value as DesignOsInspectDetail)} className="min-w-0 gap-0">
      <div className="min-w-0 overflow-x-auto border-b border-border">
        <TabsList aria-label="Inspection views" variant="line" className={deliveryWorkspaceClasses.subnav}>
          <WorkbenchTab value="system" icon={<Boxes />}>System</WorkbenchTab>
          <WorkbenchTab value="workflows" icon={<Workflow />}>Workflows</WorkbenchTab>
          <WorkbenchTab value="commerce-benchmark" icon={<ShieldCheck />}>Labs</WorkbenchTab>
        </TabsList>
      </div>
      <div className="min-w-0 pt-4">
        <TabsContent value="system" className="m-0">
          <section aria-label="System evidence" className="min-w-0 space-y-3">
            <SectionHeading title="System evidence" description="Design IR and capability projection" />
            <DesignOsPanel model={model.summary} className="min-w-0" />
          </section>
        </TabsContent>
        <TabsContent value="workflows" className="m-0">
          {model.workflowPacks ? (
            <WorkflowPackCatalogPanel
              items={model.workflowPacks}
              onInstall={callbacks?.onInstallWorkflowPack}
              onUpgrade={callbacks?.onUpgradeWorkflowPack}
              onEvaluate={callbacks?.onEvaluateWorkflowPack}
            />
          ) : (
            <EmptyState
              icon={<Workflow />}
              title="No workflow catalog"
              detail="This host has no installed workflow catalog projection."
            />
          )}
        </TabsContent>
        <TabsContent value="commerce-benchmark" className="m-0">
          <Suspense fallback={<ProductionLoading label="Loading Commerce benchmark" />}>
            <CommerceProductionPanel modeScope="benchmark" />
          </Suspense>
        </TabsContent>
      </div>
    </Tabs>
  );
}

function ProductionLoading({ label }: { readonly label: string }) {
  return (
    <div className="flex min-h-64 items-center justify-center text-muted-foreground">
      <RefreshCw className="size-4 animate-spin" aria-label={label} />
    </div>
  );
}

function ContextTab({
  selected,
  onClick,
  children,
}: {
  readonly selected: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        "h-7 rounded px-2.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

type KitTarget = "design" | "brand" | "both";
const kitIds: Record<Exclude<KitTarget, "both">, string> = {
  design: "kit:design",
  brand: "kit:brand",
};
function kitBlocker(value: string) {
  if (/logo/i.test(value)) return "Provide an approved logo family.";
  if (/photo/i.test(value)) return "Confirm the photography direction.";
  if (/token|design system/i.test(value))
    return "Complete the Design System tokens.";
  if (/component/i.test(value))
    return "Generate and approve reusable components.";
  if (/license/i.test(value))
    return "Confirm usage rights for the source material.";
  return value;
}

function KitWorkspace({
  model,
  callbacks,
  initialTarget = "both",
  purpose = "deliver",
  onOpenDelivery,
}: {
  readonly model: DesignOsWorkbenchModel;
  readonly callbacks?: DesignOsWorkbenchCallbacks;
  readonly initialTarget?: KitTarget;
  readonly purpose?: "create" | "deliver";
  readonly onOpenDelivery?: () => void;
}) {
  const [target, setTarget] = useState<KitTarget>(initialTarget),
    [advanced, setAdvanced] = useState(false),
    [brandText, setBrandText] = useState(() =>
      JSON.stringify(template("brand"), null, 2),
    ),
    [error, setError] = useState<string>();
  const selected = model.kits.filter(
    (item) => target === "both" || item.id === kitIds[target],
  );
  const governanceHard =
    model.governance?.receipt.findings.filter(
      (finding) => finding.status === "failed" && finding.severity === "hard",
    ) ?? [];
  const blockers = [
    ...new Set([
      ...selected.flatMap((item) => item.blockers ?? []).map(kitBlocker),
      ...governanceHard.map((finding) => finding.summary),
    ]),
  ];
  const ready =
    selected.length > 0 &&
    selected.every((item) => item.readiness === "ready") &&
    governanceHard.length === 0;
  const preview =
    model.authoringPreview?.kind === "brand"
      ? model.authoringPreview
      : undefined;
  const repair = () => {
    if (!model.governance || !governanceHard.length) return;
    const scenarios = model.governance.scenarios ?? [],
      byId = new Map(scenarios.map((s) => [s.scenarioId, s])),
      requiresApproval = governanceHard.some((finding) => {
        const scenario = byId.get(finding.scenarioId);
        return Boolean(
          scenario &&
          (scenario.lockedTokenIds.includes(scenario.foregroundTokenId) ||
            scenario.lockedTokenIds.includes(scenario.backgroundTokenId)),
        );
      });
    callbacks?.onRequestGovernanceRepair?.({
      receiptId: model.governance.receipt.receiptId,
      failedFindingIds: governanceHard.map((finding) => finding.id),
      requiresApproval,
    });
  };
  const action = () => {
    if (governanceHard.length) {
      repair();
      return;
    }
    if (preview && (target === "brand" || target === "both")) {
      callbacks?.onApproveAuthoring?.(preview.id);
      return;
    }
    if (ready) {
      if (purpose === "create") onOpenDelivery?.();
      else selected.forEach((item) => callbacks?.onExportKit?.(item.id));
      return;
    }
    if (blockers.some((value) => /component/i.test(value))) {
      callbacks?.onPrepareAuthoring?.("components", template("components"));
      return;
    }
    if (target === "brand" || target === "both") {
      try {
        callbacks?.onPrepareAuthoring?.("brand", JSON.parse(brandText));
        setError(undefined);
      } catch {
        setError("The advanced brand configuration is not valid JSON.");
      }
    }
  };
  const actionable = governanceHard.length
    ? Boolean(callbacks?.onRequestGovernanceRepair)
    : preview
      ? Boolean(callbacks?.onApproveAuthoring)
      : ready
        ? purpose === "create"
          ? Boolean(onOpenDelivery)
          : Boolean(callbacks?.onExportKit)
        : target !== "design" && Boolean(callbacks?.onPrepareAuthoring);
  const actionLabel = governanceHard.length
    ? "Repair governance blockers"
    : preview
      ? "Approve and continue"
      : ready
        ? purpose === "create"
          ? "Open delivery"
          : "Preview and export"
        : target === "design"
          ? "Review required preparation"
          : "Prepare required materials";
  return (
    <section aria-label="Kit workspace" className={deliveryWorkspaceClasses.primaryColumn}>
      <div>
        <h3 className={deliveryWorkspaceClasses.heading}>
          {purpose === "create" ? "Brand system" : "Kit delivery"}
        </h3>
        <p className={deliveryWorkspaceClasses.description}>
          {purpose === "create"
            ? "Prepare the Brand kit against current approvals, source rights, and governance evidence."
            : "Choose the reusable kit result. Cutout will preserve approvals, source rights, and governance evidence."}
        </p>
      </div>
      <div
        role="radiogroup"
        aria-label="Kit target"
        className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1"
      >
        {(
          [
            ["design", "Design System"],
            ["brand", "Brand VI"],
            ["both", "Both"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={target === value}
            onClick={() => setTarget(value)}
            className={cn(
              "min-h-11 rounded-md px-2 text-xs font-medium",
              target === value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className={deliveryWorkspaceClasses.panel}>
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Kit readiness</p>
            <p className="mt-1 break-words text-xs text-muted-foreground">
              {ready
                ? "The selected kits have verified inputs for the current revision."
                : "Cutout will prepare missing evidence without weakening Brand locks or governance gates."}
            </p>
          </div>
          <Badge className="shrink-0" variant={ready ? "secondary" : "outline"}>
            {ready ? "Ready" : "Needs preparation"}
          </Badge>
        </div>
        {!ready && blockers.length ? (
          <ul
            aria-label="Kit preparation checklist"
            className="mt-3 space-y-1 border-t border-border pt-3 text-xs"
          >
            {blockers.map((value) => (
              <li key={value} className="flex items-start gap-2">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <span className="break-words">{value}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <Button className={cn(deliveryWorkspaceClasses.primaryAction, "min-h-11")} disabled={!actionable} onClick={action}>
        {actionLabel}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        aria-expanded={advanced}
        onClick={() => setAdvanced((value) => !value)}
      >
        Advanced
      </Button>
      {advanced ? (
        <div className={cn(deliveryWorkspaceClasses.advanced, "min-w-0 space-y-3 text-xs")}>
          <div>
            <p className="font-medium">Brand configuration</p>
            <textarea
              aria-label="Brand configuration JSON"
              value={brandText}
              onChange={(event) => setBrandText(event.target.value)}
              spellCheck={false}
              className="mt-2 min-h-36 w-full min-w-0 resize-y rounded-md border border-input bg-background p-2 font-mono text-[10px]"
            />
            <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-1.5 font-medium hover:bg-accent">
              <FolderInput className="size-4" /> Import JSON
              <input
                aria-label="Import Brand configuration JSON"
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void file.text().then(setBrandText);
                }}
              />
            </label>
            {error ? (
              <p role="alert" className="mt-2 text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <details>
            <summary className="cursor-pointer font-medium">
              License, provenance, and raw readiness
            </summary>
            <pre className="mt-2 max-w-full overflow-x-auto whitespace-pre-wrap font-mono text-[10px]">
              {JSON.stringify(
                {
                  revisionId: model.summary.revisionId,
                  sources: model.sources.map(({ id, license, provenance }) => ({
                    id,
                    license,
                    provenance,
                  })),
                  kits: selected.map(
                    ({ id, readiness, blockers, preview, receipt }) => ({
                      id,
                      readiness,
                      blockers,
                      preview,
                      receipt,
                    }),
                  ),
                },
                null,
                2,
              )}
            </pre>
          </details>
          {model.governance ? (
            <GovernanceSummary
              receipt={model.governance.receipt}
              scenarios={model.governance.scenarios}
              onRequestRepair={callbacks?.onRequestGovernanceRepair}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ComponentWorkspace({ model, callbacks }: { readonly model: DesignOsWorkbenchModel; readonly callbacks?: DesignOsWorkbenchCallbacks }) {
  const [advanced, setAdvanced] = useState(false), item = model.components[0]
  const hard = model.governance?.receipt.findings.filter((finding) => finding.status === "failed" && finding.severity === "hard") ?? []
  const facts = model.componentReadinessFacts ?? { hasStructuredPrototype: false, hasTokens: false, hasExplicitCandidates: false }
  const preview = model.authoringPreview?.kind === "components" ? model.authoringPreview : undefined
  const projection = projectComponentReadiness({ item, ...facts, governanceBlockers: hard.map((finding) => finding.summary), hasPreview: Boolean(preview), advancedEvidence: { candidateDeclarations: model.authoringValues?.components ?? null, manifest: item ?? null, governanceReceipt: model.governance?.receipt ?? null } })
  const action = () => {
    if (projection.nextAction.kind === "prepare-prototype" || projection.nextAction.kind === "declare-components") callbacks?.onPrepareAuthoring?.("components", model.authoringValues?.components ?? template("components"))
    else if (projection.nextAction.kind === "resolve-governance" && model.governance) callbacks?.onRequestGovernanceRepair?.({ receiptId: model.governance.receipt.receiptId, failedFindingIds: hard.map((finding) => finding.id), requiresApproval: false })
    else if (projection.nextAction.kind === "preview" && preview) callbacks?.onApproveAuthoring?.(preview.id)
    else if (projection.nextAction.kind === "export" && item) callbacks?.onExportComponent?.(item.id)
  }
  const actionable = (projection.nextAction.kind === "prepare-prototype" || projection.nextAction.kind === "declare-components") ? Boolean(callbacks?.onPrepareAuthoring) : (projection.nextAction.kind === "resolve-governance" && Boolean(callbacks?.onRequestGovernanceRepair)) || (projection.nextAction.kind === "preview" && Boolean(callbacks?.onApproveAuthoring)) || (projection.nextAction.kind === "export" && Boolean(callbacks?.onExportComponent))
  return <section aria-label="Components workspace" className={deliveryWorkspaceClasses.primaryColumn}>
    <div><h3 className={deliveryWorkspaceClasses.heading}>Reusable components</h3><p className={deliveryWorkspaceClasses.description}>Verified components from structured screens, approved tokens, and explicit declarations.</p></div>
    <div className={deliveryWorkspaceClasses.panel}><div className="flex items-center justify-between gap-2"><div><p className="text-sm font-medium">Component readiness</p><p className="mt-1 text-xs text-muted-foreground">Screenshots are reference material, never component declarations.</p></div><Badge variant={projection.readiness === "ready" ? "secondary" : "outline"}>{projection.readiness === "ready" ? "Ready" : "Needs preparation"}</Badge></div><ul aria-label="Component preparation checklist" className="mt-3 space-y-1 border-t border-border pt-3 text-xs">{projection.checklist.map((entry) => <li key={entry.id} className="flex items-start gap-2"><CircleAlert className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"/><span className={entry.complete ? "text-muted-foreground" : undefined}>{entry.label}</span></li>)}</ul></div>
    <Button className={cn(deliveryWorkspaceClasses.primaryAction, "min-h-11")} disabled={!actionable} onClick={action}>{projection.nextAction.label}</Button>
    <Button variant="ghost" size="sm" aria-expanded={advanced} onClick={() => setAdvanced((value) => !value)}>Advanced</Button>
    {advanced ? <div className="min-w-0 space-y-3"><AuthoringEditor kind="components" title="Component declarations" description="Bind explicit APIs to structured prototype pages and Design IR tokens." model={model} callbacks={callbacks}/><details className={deliveryWorkspaceClasses.advanced}><summary className="cursor-pointer text-xs font-medium">Manifest, adapter plan, and receipt evidence</summary><pre className="mt-2 max-w-full overflow-x-auto whitespace-pre-wrap font-mono text-[10px]">{JSON.stringify(projection.advancedEvidence, null, 2)}</pre></details></div> : null}
  </section>
}

function StarterWorkspace({
  model,
  callbacks,
}: {
  readonly model: DesignOsWorkbenchModel;
  readonly callbacks?: DesignOsWorkbenchCallbacks;
}) {
  const [framework, setFramework] = useState<StarterTarget>("next-app-router"),
    [advanced, setAdvanced] = useState(false),
    [configText, setConfigText] = useState(() =>
      JSON.stringify(
        { framework: "next-app-router", assetBindings: [], existingPaths: [] },
        null,
        2,
      ),
    ),
    [configError, setConfigError] = useState<string>(),
    readiness = projectStarterReadiness(model.starters, framework),
    target = model.starters.find(
      (item) =>
        item.id ===
        (
          {
            "next-app-router": "starter:next",
            "vite-react": "starter:vite",
            nuxt: "starter:nuxt",
            "tanstack-start": "starter:tanstack",
          } as const
        )[framework],
    ),
    preview =
      model.authoringPreview?.kind === "starter"
        ? model.authoringPreview
        : undefined,
    ready = readiness.readiness === "ready";
  const parsedConfig = () => {
    try {
      const value = JSON.parse(configText) as Record<string, unknown>;
      setConfigError(undefined);
      return { ...value, framework };
    } catch {
      setConfigError("The advanced configuration is not valid JSON.");
      return null;
    }
  };
  const action = () => {
    if (preview) callbacks?.onApproveAuthoring?.(preview.id);
    else if (ready && target) callbacks?.onExportStarter?.(target.id);
    else if (readiness.nextAction.kind === "prepare-components")
      callbacks?.onPrepareAuthoring?.("components", template("components"));
    else {
      const value = parsedConfig();
      if (value) callbacks?.onPrepareAuthoring?.("starter", value);
    }
  };
  return (
    <section
      aria-label="Starter workspace"
      className={deliveryWorkspaceClasses.primaryColumn}
    >
      <div>
        <h3 className={deliveryWorkspaceClasses.heading}>Starter project</h3>
        <p className={deliveryWorkspaceClasses.description}>
          Choose the application target. Cutout will bind approved materials and
          prepare the project safely.
        </p>
      </div>
      <div
        role="radiogroup"
        aria-label="Starter framework"
        className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 sm:grid-cols-4"
      >
        {(
          [
            ["next-app-router", "Next.js"],
            ["vite-react", "Vite"],
            ["nuxt", "Nuxt"],
            ["tanstack-start", "TanStack"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={framework === value}
            onClick={() => {
              setFramework(value);
              setConfigText(
                JSON.stringify(
                  { framework: value, assetBindings: [], existingPaths: [] },
                  null,
                  2,
                ),
              );
              setConfigError(undefined);
            }}
            className={cn(
              "min-h-11 rounded-md px-2 text-xs font-medium",
              framework === value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className={deliveryWorkspaceClasses.panel}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Starter readiness</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {ready
                ? "The selected target can be generated from the current approved revision."
                : "Cutout will prepare the missing inputs in dependency order."}
            </p>
          </div>
          <Badge variant={ready ? "secondary" : "outline"}>
            {ready ? "Ready" : "Needs preparation"}
          </Badge>
        </div>
        {!ready && readiness.checklist.length ? (
          <ul
            aria-label="Starter preparation checklist"
            className="mt-3 space-y-1 border-t border-border pt-3 text-xs"
          >
            {readiness.checklist.map((item) => (
              <li key={item.id} className="flex items-start gap-2">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <Button
        className={cn(deliveryWorkspaceClasses.primaryAction, "min-h-11")}
        disabled={!callbacks?.onPrepareAuthoring && !callbacks?.onExportStarter}
        onClick={action}
      >
        {preview ? "Approve and continue" : readiness.nextAction.label}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        aria-expanded={advanced}
        onClick={() => setAdvanced((value) => !value)}
      >
        Advanced
      </Button>
      {advanced ? (
        <div className={cn(deliveryWorkspaceClasses.advanced, "min-w-0 text-xs")}>
          <p className="font-medium">Technical configuration</p>
          <textarea
            aria-label="Starter configuration JSON"
            value={configText}
            onChange={(event) => setConfigText(event.target.value)}
            spellCheck={false}
            className="mt-2 min-h-32 w-full min-w-0 resize-y rounded-md border border-input bg-background p-2 font-mono text-[10px]"
          />
          <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-accent">
            <FolderInput className="size-4" /> Import JSON
            <input
              aria-label="Import Starter configuration JSON"
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void file.text().then(setConfigText);
              }}
            />
          </label>
          {configError ? (
            <p role="alert" className="mt-2 text-destructive">
              {configError}
            </p>
          ) : null}
          <p className="mt-2 text-muted-foreground">
            Revision {model.summary.revisionId} · Evidence:{" "}
            {target?.receipt?.digest ??
              target?.preview?.digest ??
              "No verified export receipt yet."}
          </p>
          <details className="mt-2">
            <summary className="cursor-pointer font-medium">
              All target evidence
            </summary>
            <pre className="mt-2 max-w-full overflow-x-auto whitespace-pre-wrap font-mono text-[10px]">
              {JSON.stringify(readiness.advancedEvidence, null, 2)}
            </pre>
          </details>
        </div>
      ) : null}
    </section>
  );
}

function AuthoringEditor({
  kind,
  title,
  description,
  model,
  callbacks,
}: {
  readonly kind: AuthoringKind;
  readonly title: string;
  readonly description: string;
  readonly model: DesignOsWorkbenchModel;
  readonly callbacks?: DesignOsWorkbenchCallbacks;
}) {
  const persisted = JSON.stringify(
    model.authoringValues?.[kind] ?? template(kind),
    null,
    2,
  );
  const [text, setText] = useState(persisted);
  const [error, setError] = useState<string>();
  useEffect(() => {
    setText(persisted);
    setError(undefined);
  }, [model.summary.revisionId, persisted]);
  const preview =
    model.authoringPreview?.kind === kind ? model.authoringPreview : undefined;
  const prepare = () => {
    try {
      callbacks?.onPrepareAuthoring?.(kind, JSON.parse(text) as unknown);
      setError(undefined);
    } catch {
      setError("The declaration is not valid JSON.");
    }
  };
  const load = async (file: File | undefined) => {
    if (!file) return;
    const next = await file.text();
    setText(next);
    try {
      JSON.parse(next);
      setError(undefined);
    } catch {
      setError("The selected file is not valid JSON.");
    }
  };
  return (
    <Card
      data-slot={`authoring-${kind}`}
      size="sm"
      className="mb-3 min-w-0 rounded-lg"
    >
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <textarea
          aria-label={`${title} JSON`}
          value={text}
          onChange={(event) => setText(event.target.value)}
          spellCheck={false}
          className="min-h-40 w-full resize-y rounded-md border border-input bg-background p-2 font-mono text-xs"
        />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={prepare}>
            <FileSearch /> Validate and preview
          </Button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-accent">
            <FolderInput className="size-4" /> Import JSON
            <input
              aria-label={`Import ${title} JSON`}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(event) => void load(event.target.files?.[0])}
            />
          </label>
        </div>
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
        {preview ? (
          <div className="rounded-md border border-border p-3 text-xs">
            <p className="font-medium">Validated preview</p>
            <p className="mt-1 text-muted-foreground">{preview.summary}</p>
            <Button
              className="mt-3"
              size="sm"
              onClick={() => callbacks?.onApproveAuthoring?.(preview.id)}
            >
              <ShieldCheck /> Approve and save
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function template(kind: AuthoringKind): unknown {
  if (kind === "components")
    return [
      {
        id: "component:example",
        name: "Example",
        kind: "composite",
        sourcePageIds: [],
        tokenRefs: [],
        props: [],
        variants: [],
        slots: [],
        status: "draft",
      },
    ];
  if (kind === "starter")
    return {
      framework: "next-app-router",
      assetBindings: [],
      existingPaths: [],
    };
  return {
    brandId: "",
    logo: { variants: [] },
    clearspace: { rule: "", evidence: {} },
    minSize: [],
    colors: [],
    type: [],
    icon: { guidance: "", evidence: {} },
    photo: { guidance: "", evidence: {} },
    voice: { guidance: "", evidence: {} },
    assetRecipes: [],
  };
}

function FigmaSnapshot({
  model,
}: {
  readonly model: DesignOsWorkbenchModel;
}) {
  return (
    <div className="min-w-0 space-y-3">
      <SectionHeading
        title="Figma Snapshot"
        description="Inspect a caller-authorized offline snapshot. Import stays in Sources and approval stays in Review."
      />
      {model.figmaPreview ? (
        <>
          <FigmaSnapshotFacts preview={model.figmaPreview} />
          <p className="text-xs text-muted-foreground">
            Review and apply this prepared change from the Project Review stage.
          </p>
        </>
      ) : (
        <EmptyState
          icon={<FolderInput />}
          title="No Figma snapshot prepared"
          detail="Import a caller-authorized JSON snapshot from Sources. Live sync is unavailable."
        />
      )}
    </div>
  );
}

function FigmaSnapshotFacts({ preview }: { readonly preview: FigmaWorkbenchPreview }) {
  return (
    <Card
      data-slot="figma-snapshot-preview"
      size="sm"
      className="min-w-0 rounded-lg"
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>{preview.fileName}</CardTitle>
            <CardDescription>{preview.summary}</CardDescription>
          </div>
          <Badge variant="outline">Offline only</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label="Collections" value={preview.collections} icon={<Layers3 className="size-4" />} />
          <Metric label="Token modes" value={preview.tokens} icon={<Sparkles className="size-4" />} />
          <Metric label="Components" value={preview.components} icon={<Component className="size-4" />} />
          <Metric label="Code Connect" value={preview.codeConnect} icon={<Boxes className="size-4" />} />
        </div>
        {preview.warnings.length ? (
          <ul
            aria-label="Figma snapshot warnings"
            className="space-y-1 text-xs text-amber-700 dark:text-amber-300"
          >
            {preview.warnings.map((warning) => (
              <li key={warning}>• {warning}</li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            No adapter conflicts or incomplete binding warnings detected.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function WorkbenchTab({
  value,
  icon,
  children,
}: {
  value: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <TabsTrigger value={value} className="h-9 px-2.5 text-xs sm:text-sm">
      {icon}
      {children}
    </TabsTrigger>
  );
}

function Overview({ model }: { readonly model: DesignOsWorkbenchModel }) {
  const ready = [...model.kits, ...model.components, ...model.starters].filter(
    (item) => item.readiness === "ready",
  ).length;
  const blocked = [
    ...model.kits,
    ...model.components,
    ...model.starters,
  ].filter((item) => item.readiness === "blocked").length;

  return (
    <section aria-label="Project brief" className="min-w-0 space-y-4">
      <div className="border-b border-border pb-4">
        <p className="text-[11px] font-medium uppercase text-muted-foreground">
          Product brief
        </p>
        <h3 className="mt-1 text-lg font-semibold">
          {model.projectTitle ?? model.summary.documentId}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Revision {model.summary.revisionNumber} · {model.summary.revisionId}
        </p>
        {model.brief?.trim() ? (
          <p className="mt-3 max-w-3xl whitespace-pre-wrap text-sm leading-6">
            {model.brief.trim()}
          </p>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">
            No project brief is bound to this revision.
          </p>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-px overflow-hidden border-y border-border bg-border sm:grid-cols-5">
        <ReviewMetric label="Sources" value={model.summary.counts.sources} />
        <ReviewMetric label="Materials" value={model.summary.counts.materials} />
        <ReviewMetric label="Tokens" value={model.summary.counts.tokens} />
        <ReviewMetric label="Ready" value={ready} />
        <ReviewMetric label="Blocked" value={blocked} />
      </dl>
      <div className="grid gap-2 sm:grid-cols-2">
        {model.summary.capabilities.map((capability) => (
          <div
            key={capability.id}
            className="flex min-w-0 items-start gap-2 border-b border-border py-2.5 text-xs"
          >
            <span
              className={cn(
                "mt-1 size-2 shrink-0 rounded-full",
                capability.status === "available"
                  ? "bg-emerald-500"
                  : "bg-muted-foreground/40",
              )}
            />
            <div className="min-w-0">
              <p className="font-medium">{capability.label}</p>
              {capability.detail ? (
                <p className="mt-0.5 break-words text-muted-foreground">
                  {capability.detail}
                </p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Mirrors the compiled design-system.html directly rather than reimplementing
 * its palette/type-scale/source-browser UI natively — that file is already a
 * complete, self-contained specimen sheet (it embeds demo.html itself), so
 * hosting it in an iframe keeps one source of truth instead of two renderers
 * that could drift apart.
 */
function Specimen({
  model,
  callbacks,
}: {
  readonly model: DesignOsWorkbenchModel;
  readonly callbacks?: DesignOsWorkbenchCallbacks;
}) {
  const files = model.specimen?.files ?? [];
  const specimenHtml = files.find((file) => file.path === "design-system.html")?.content;
  const demoHtml = files.find((file) => file.path === "demo.html")?.content;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <SectionHeading
        title="Specimen"
        description="A palette, type scale, and source browser compiled from the current tokens — with a live demo of them applied to a real screen."
        action={
          callbacks?.onGenerateSpecimen ? (
            <Button size="sm" variant="outline" onClick={callbacks.onGenerateSpecimen}>
              <RefreshCw /> {specimenHtml ? "Regenerate" : "Generate specimen"}
            </Button>
          ) : undefined
        }
      />

      {model.specimen?.stale ? (
        <p role="status" className="flex items-center gap-1.5 rounded-md border border-amber-500/25 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-300">
          <CircleAlert className="size-3.5 shrink-0" />
          Tokens changed since this specimen was generated — Regenerate to see the current design.
        </p>
      ) : null}

      {specimenHtml ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {demoHtml ? (
              <Badge variant={model.specimen?.composedByAgent ? "secondary" : "outline"}>
                {model.specimen?.composedByAgent
                  ? "demo.html: composed for this product"
                  : "demo.html: generic template"}
              </Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Import edited source files from Sources, review prepared changes in Review,
            and download or publish accepted outputs from Deliver.
          </p>

          <iframe
            title="Design system specimen"
            srcDoc={specimenHtml}
            sandbox="allow-scripts"
            className="h-[70vh] min-h-[420px] w-full rounded-lg border border-border bg-background"
          />
        </>
      ) : (
        <EmptyState
          icon={<Palette />}
          title="No specimen generated yet"
          detail="Generate a specimen to see the palette, type scale, spacing, and a live demo of the current tokens."
        />
      )}
    </div>
  );
}

function Sources({
  model,
  callbacks,
}: {
  readonly model: DesignOsWorkbenchModel;
  readonly callbacks?: DesignOsWorkbenchCallbacks;
}) {
  // The project's own brief is always projected as a synthetic "idea"
  // source so the Design IR has a requirement to point provenance at. It
  // was never imported by the user, so it doesn't belong in a list whose
  // job is to show what external material was brought in and under what
  // license.
  const importedSources = model.sources.filter((source) => source.kind !== "idea");
  return (
    <div className="min-w-0 space-y-3">
      <SectionHeading
        title="Sources"
        description="Role, license, and provenance remain attached to every input."
        action={
          callbacks?.onRequestSourceIngest ? (
            <Button
              size="sm"
              variant="outline"
              onClick={callbacks.onRequestSourceIngest}
            >
              <FolderInput /> Preview ingest
            </Button>
          ) : undefined
        }
      />

      {model.ingestPreview ? (
        <IngestPreview
          preview={model.ingestPreview}
          onApprove={callbacks?.onApproveSourceIngest}
        />
      ) : null}

      <ProductUiuxSourceActions callbacks={callbacks} />

      {importedSources.length > 0 ? (
        <ul
          aria-label="Design sources"
          className="divide-y divide-border border-y border-border"
        >
          {importedSources.map((source) => (
            <li key={source.id} className="min-w-0 py-3">
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <p className="min-w-0 break-words text-sm font-medium">
                      {source.label}
                    </p>
                    <Badge variant="outline">{source.kind}</Badge>
                  </div>
                  {source.detail ? (
                    <p className="mt-1 break-words text-xs text-muted-foreground">
                      {source.detail}
                    </p>
                  ) : null}
                  <dl className="mt-2 grid min-w-0 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
                    <SourceFact label="Role" value={source.role} />
                    <SourceFact label="License" value={source.license} />
                    <SourceFact label="Provenance" value={source.provenance} />
                  </dl>
                </div>
                {callbacks?.onOpenSource ? (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Open ${source.label}`}
                    onClick={() => callbacks.onOpenSource?.(source.id)}
                  >
                    <ExternalLink />
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<FileSearch />}
          title="No external sources imported yet"
          detail="Import a repository, Figma file, or reference image to see its role, license, and provenance here."
        />
      )}
    </div>
  );
}

function ProductUiuxSourceActions({
  callbacks,
}: {
  readonly callbacks?: DesignOsWorkbenchCallbacks;
}) {
  const [figmaError, setFigmaError] = useState<string>();
  if (!callbacks?.onSyncDemoHtml && !callbacks?.onPrepareFigmaSnapshot) {
    return null;
  }
  const prepareFigma = async (file: File | undefined) => {
    if (!file) return;
    try {
      const value: unknown = JSON.parse(await file.text());
      setFigmaError(undefined);
      callbacks.onPrepareFigmaSnapshot?.(value);
    } catch {
      setFigmaError("The selected file is not valid JSON.");
    }
  };
  return (
    <section aria-label="Product UI/UX source actions" className="min-w-0 border-y border-border py-3">
      <div className="mb-3">
        <h4 className="text-xs font-semibold">Product UI/UX sources</h4>
        <p className="mt-1 text-xs text-muted-foreground">
          Import caller-authorized files here before reviewing any resulting change.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {callbacks.onSyncDemoHtml ? (
          <div className="min-w-0 border-b border-border pb-3 sm:border-b-0 sm:border-r sm:pr-3 sm:pb-0">
            <p className="text-xs font-medium">Edited demo.html</p>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              Ingest the edited demo as a provenanced source and prepare a token diff.
            </p>
            <Button asChild size="sm" variant="outline" className="mt-3">
              <label>
                <Upload /> Choose demo.html
                <input
                  type="file"
                  accept=".html,text/html"
                  className="sr-only"
                  aria-label="Sync from edited demo.html"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) callbacks.onSyncDemoHtml?.(file);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            </Button>
          </div>
        ) : null}
        {callbacks.onPrepareFigmaSnapshot ? (
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-medium">Figma snapshot</p>
              <Badge variant="outline">Offline only</Badge>
            </div>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              Import a caller-authorized JSON snapshot. Live Figma sync is unavailable.
            </p>
            <Button asChild size="sm" variant="outline" className="mt-3">
              <label>
                <FolderInput /> Choose snapshot JSON
                <input
                  aria-label="Choose Figma snapshot JSON"
                  type="file"
                  accept="application/json,.json"
                  className="sr-only"
                  onChange={(event) => {
                    void prepareFigma(event.currentTarget.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            </Button>
            {figmaError ? (
              <p role="alert" className="mt-2 text-xs text-destructive">
                {figmaError}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function IngestPreview({
  preview,
  onApprove,
}: {
  readonly preview: DesignOsIngestPreview;
  readonly onApprove?: (id: string) => void;
}) {
  return (
    <Card
      data-slot="source-ingest-preview"
      size="sm"
      className="min-w-0 rounded-lg border border-border ring-0"
    >
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldCheck
            aria-hidden="true"
            className="size-4 text-muted-foreground"
          />
          <CardTitle>{preview.title}</CardTitle>
        </div>
        <CardDescription>{preview.summary}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {preview.sourceCount} sources in this preview. No source has been
          ingested yet.
        </p>
        {preview.repository ? (
          <div
            data-slot="repository-scan-summary"
            className="space-y-2 rounded-md border border-border p-3 text-xs"
          >
            <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-3">
              <SourceFact
                label="Safe files"
                value={String(preview.repository.fileCount)}
              />
              <SourceFact label="Role" value={preview.repository.role} />
              <SourceFact label="License" value={preview.repository.license} />
            </dl>
            <div>
              <p className="font-medium">Framework evidence</p>
              <p className="mt-1 break-words text-muted-foreground">
                {preview.repository.frameworks.length
                  ? preview.repository.frameworks
                      .map(
                        (hint) =>
                          `${hint.name} (${hint.confidence}): ${hint.evidence.join(", ")}`,
                      )
                      .join(" · ")
                  : "No supported framework inferred from safe paths."}
              </p>
            </div>
            <div>
              <p className="font-medium">Excluded</p>
              <p className="mt-1 text-muted-foreground">
                {preview.repository.exclusions
                  .filter((item) => item.count > 0)
                  .map((item) => `${item.label} ${item.count}`)
                  .join(" · ") || "None"}
              </p>
            </div>
          </div>
        ) : null}
        {preview.warnings?.length ? (
          <ul
            aria-label="Ingest warnings"
            className="space-y-1 text-xs text-amber-700 dark:text-amber-300"
          >
            {preview.warnings.map((warning) => (
              <li key={warning}>• {warning}</li>
            ))}
          </ul>
        ) : null}
        {onApprove ? (
          <Button size="sm" onClick={() => onApprove(preview.id)}>
            <ShieldCheck /> Approve ingest
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            Approval is not available in this host.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function Deliverables({
  title,
  description,
  items,
  actionLabel,
  onAction,
}: {
  readonly title: string;
  readonly description: string;
  readonly items: readonly DesignOsDeliverableItem[];
  readonly actionLabel: string;
  readonly onAction?: (id: string) => void;
}) {
  return (
    <div className="min-w-0 space-y-3">
      <SectionHeading title={title} description={description} />
      {items.length > 0 ? (
        <div className="grid min-w-0 gap-3 xl:grid-cols-2">
          {items.map((item) => (
            <Deliverable
              key={item.id}
              item={item}
              actionLabel={actionLabel}
              onAction={onAction}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<PackageCheck />}
          title="Nothing declared"
          detail="The canonical design document has no output in this category."
        />
      )}
    </div>
  );
}

function Deliverable({
  item,
  actionLabel,
  onAction,
}: {
  readonly item: DesignOsDeliverableItem;
  readonly actionLabel: string;
  readonly onAction?: (id: string) => void;
}) {
  const executable = item.readiness === "ready" && Boolean(onAction);

  return (
    <Card size="sm" className="min-w-0 rounded-lg">
      <CardHeader>
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="break-words">{item.label}</CardTitle>
            {item.description ? (
              <CardDescription className="mt-1 break-words">
                {item.description}
              </CardDescription>
            ) : null}
          </div>
          <Badge variant={READINESS_VARIANT[item.readiness]}>
            {READINESS_LABEL[item.readiness]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {item.blockers?.length ? (
          <div>
            <p className="text-xs font-medium">Blocking reasons</p>
            <ul
              aria-label={`${item.label} blockers`}
              className="mt-1 space-y-1 text-xs text-muted-foreground"
            >
              {item.blockers.map((blocker) => (
                <li key={blocker}>• {blocker}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {item.preview ? (
          <Receipt
            receipt={item.preview}
            label="Export preview"
            icon={<Sparkles />}
          />
        ) : null}
        {item.receipt ? (
          <Receipt
            receipt={item.receipt}
            label="Export receipt"
            icon={<ReceiptText />}
          />
        ) : null}
        {executable ? (
          <Button size="sm" onClick={() => onAction?.(item.id)}>
            <PackageCheck /> {actionLabel}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Receipt({
  receipt,
  label,
  icon,
}: {
  readonly receipt: DesignOsReceipt;
  readonly label: string;
  readonly icon: ReactNode;
}) {
  return (
    <section
      aria-label={`${label}: ${receipt.title}`}
      className="min-w-0 border-l-2 border-border pl-2.5"
    >
      <div className="flex items-center gap-1.5 text-xs font-medium">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-1 break-words text-xs">{receipt.title}</p>
      <p className="mt-0.5 break-words text-[11px] text-muted-foreground">
        {receipt.detail}
      </p>
      {receipt.digest ? (
        <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
          {receipt.digest}
        </p>
      ) : null}
      {receipt.createdAt ? (
        <time className="mt-1 block text-[10px] text-muted-foreground">
          {receipt.createdAt}
        </time>
      ) : null}
    </section>
  );
}

function SectionHeading({
  title,
  description,
  action,
}: {
  readonly title: string;
  readonly description: string;
  readonly action?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}

const CSS_COLOR_VALUE = /^(#[0-9a-f]{3,8}|rgb|hsl|oklch|oklab|lab|lch)/i;

/** A compact value chip, prefixed with a live color swatch when the value looks like a CSS color. */
function SwatchOrValue({ value }: { readonly value: string }) {
  return (
    <span className="inline-flex max-w-28 shrink-0 items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px]">
      {CSS_COLOR_VALUE.test(value.trim()) ? (
        <span
          aria-hidden="true"
          className="size-2.5 shrink-0 rounded-full border border-border/60"
          style={{ background: value }}
        />
      ) : null}
      <span className="truncate" title={value}>{value}</span>
    </span>
  );
}

function SourceFact({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words font-medium">{value}</dd>
    </div>
  );
}

function Metric({
  label,
  value,
  icon,
}: {
  readonly label: string;
  readonly value: number;
  readonly icon: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 border border-border p-2.5">
      {icon}
      <div>
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  detail,
}: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly detail: string;
}) {
  return (
    <div className="flex min-h-36 flex-col items-center justify-center border border-dashed border-border px-4 text-center">
      <div className="text-muted-foreground [&_svg]:size-5">{icon}</div>
      <p className="mt-2 text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

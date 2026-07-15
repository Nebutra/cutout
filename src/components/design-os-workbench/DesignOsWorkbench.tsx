import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AuthoringKind } from "@/design-os-operations";
import {
  legacyTabForNavigation,
  migrateLegacyDesignOsView,
} from "@/workspace/navigation";
import {
  Boxes,
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  Component,
  ExternalLink,
  FileArchive,
  FileSearch,
  PenTool,
  FolderInput,
  Layers3,
  Download,
  PackageCheck,
  Palette,
  RefreshCw,
  Upload,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Workflow,
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

export type DesignOsReadiness = "ready" | "blocked" | "pending" | "unavailable";
export type DesignOsWorkbenchTab =
  | "overview"
  | "delivery"
  | "workflows"
  | "sources"
  | "specimen"
  | "figma"
  | "kits"
  | "components"
  | "starter";

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
   * Re-ingests a hand-edited demo.html as a licensed reference source, so it
   * becomes durable, provenanced Design IR material instead of a disposable
   * export — the same ingest-preview/approve gate the Sources tab already
   * uses, not a bespoke token-mutation path.
   */
  readonly onSyncDemoHtml?: (file: File) => void;
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
}

export interface DesignOsWorkbenchProps {
  readonly model: DesignOsWorkbenchModel;
  readonly callbacks?: DesignOsWorkbenchCallbacks;
  readonly defaultTab?: DesignOsWorkbenchTab;
  readonly className?: string;
  readonly surfaceMode?: "inspector" | "deliver";
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
  onBackToWorkspace,
  backLabel = "Back to workspace",
  backMobileLabel = "Back",
}: DesignOsWorkbenchProps) {
  const [tab, setTab] = useState<DesignOsWorkbenchTab>(() =>
    legacyTabForNavigation(migrateLegacyDesignOsView(defaultTab)),
  );
  return (
    <section
      aria-label={surfaceMode === "deliver" ? "Deliver" : "Canvas inspector"}
      data-slot="design-os-workbench"
      className={cn(
        "flex min-h-0 min-w-0 flex-col overflow-hidden bg-background text-foreground",
        className,
      )}
    >
      {surfaceMode === "inspector" ? <header className="shrink-0 border-b border-border px-3 py-3 sm:px-4">
        <div className="flex min-w-0 items-start gap-2.5">
          <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted">
            <Boxes aria-hidden="true" className="size-4" />
          </div>
          <div className="min-w-0">
            <h2 data-governance-probe="title" className="text-sm font-semibold">
              Canvas inspector
            </h2>
            <p
              className="truncate text-xs text-muted-foreground"
              title={`${model.summary.documentId} · ${model.summary.revisionId}`}
            >
              Revision {model.summary.revisionNumber}
            </p>
          </div>
        </div>
      </header> : null}

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as DesignOsWorkbenchTab)}
        className="min-h-0 min-w-0 flex-1 gap-0"
      >
        <div className={cn(deliveryWorkspaceClasses.modeHeader,"flex min-w-0 flex-col items-stretch sm:flex-row sm:items-center")}>
          {surfaceMode === "deliver" && onBackToWorkspace ? (
            <Button type="button" variant="ghost" size="sm" className="min-h-11 self-start px-2 sm:mr-3 sm:self-auto" onClick={onBackToWorkspace} aria-label={backLabel}>
              <ArrowLeft className="size-4" />
              <span className="sm:hidden">{backMobileLabel}</span>
              <span className="hidden sm:inline">{backLabel}</span>
            </Button>
          ) : null}
          <div className="min-w-0 flex-1 overflow-x-auto">
          <TabsList
            aria-label={surfaceMode === "deliver" ? "Deliver sections" : "Canvas inspector sections"}
            variant="line"
            className={deliveryWorkspaceClasses.subnav}
          >
            {surfaceMode === "inspector" ? (
              <>
                <WorkbenchTab value="overview" icon={<Boxes />}>
                  Overview
                </WorkbenchTab>
                {model.workflowPacks ? (
                  <WorkbenchTab value="workflows" icon={<Workflow />}>
                    Workflows
                  </WorkbenchTab>
                ) : null}
                <WorkbenchTab value="sources" icon={<FolderInput />}>
                  Sources
                </WorkbenchTab>
                <WorkbenchTab value="specimen" icon={<Palette />}>
                  Specimen
                </WorkbenchTab>
                <WorkbenchTab value="figma" icon={<PenTool />}>
                  Figma
                </WorkbenchTab>
              </>
            ) : (
              <>
                {model.delivery ? (
                  <WorkbenchTab value="delivery" icon={<PackageCheck />}>
                    Delivery center
                  </WorkbenchTab>
                ) : null}
                <WorkbenchTab value="kits" icon={<Layers3 />}>
                  Kits
                </WorkbenchTab>
                <WorkbenchTab value="components" icon={<Component />}>
                  Components
                </WorkbenchTab>
                <WorkbenchTab value="starter" icon={<FileArchive />}>
                  Starter
                </WorkbenchTab>
              </>
            )}
          </TabsList>
          </div>
        </div>

        <div className={cn("min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain",surfaceMode === "deliver" ? deliveryWorkspaceClasses.content : "p-3 sm:p-4")}>
          <TabsContent value="overview" className="m-0">
            <Overview model={model} />
          </TabsContent>
          {model.delivery ? (
            <TabsContent value="delivery" className="m-0">
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
            </TabsContent>
          ) : null}
          {model.workflowPacks ? (
            <TabsContent value="workflows" className="m-0">
              <WorkflowPackCatalogPanel
                items={model.workflowPacks}
                onInstall={callbacks?.onInstallWorkflowPack}
                onUpgrade={callbacks?.onUpgradeWorkflowPack}
                onEvaluate={callbacks?.onEvaluateWorkflowPack}
              />
            </TabsContent>
          ) : null}
          <TabsContent value="sources" className="m-0">
            <Sources model={model} callbacks={callbacks} />
          </TabsContent>
          <TabsContent value="specimen" className="m-0">
            <Specimen model={model} callbacks={callbacks} />
          </TabsContent>
          <TabsContent value="figma" className="m-0">
            <FigmaSnapshot model={model} callbacks={callbacks} />
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
    </section>
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
}: {
  readonly model: DesignOsWorkbenchModel;
  readonly callbacks?: DesignOsWorkbenchCallbacks;
}) {
  const [target, setTarget] = useState<KitTarget>("both"),
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
      selected.forEach((item) => callbacks?.onExportKit?.(item.id));
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
        ? Boolean(callbacks?.onExportKit)
        : target !== "design" && Boolean(callbacks?.onPrepareAuthoring);
  const actionLabel = governanceHard.length
    ? "Repair governance blockers"
    : preview
      ? "Approve and continue"
      : ready
        ? "Preview and export"
        : target === "design"
          ? "Review required preparation"
          : "Prepare required materials";
  return (
    <section aria-label="Kit workspace" className={deliveryWorkspaceClasses.primaryColumn}>
      <div>
        <h3 className={deliveryWorkspaceClasses.heading}>Kit delivery</h3>
        <p className={deliveryWorkspaceClasses.description}>
          Choose the reusable kit result. Cutout will preserve approvals, source
          rights, and governance evidence.
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
  callbacks,
}: {
  readonly model: DesignOsWorkbenchModel;
  readonly callbacks?: DesignOsWorkbenchCallbacks;
}) {
  const [fileError, setFileError] = useState<string>();
  const load = async (file: File | undefined) => {
    if (!file) return;
    try {
      const value: unknown = JSON.parse(await file.text());
      setFileError(undefined);
      callbacks?.onPrepareFigmaSnapshot?.(value);
    } catch {
      setFileError("The selected file is not valid JSON.");
    }
  };
  return (
    <div className="min-w-0 space-y-3">
      <SectionHeading
        title="Figma Snapshot"
        description="Review a caller-authorized snapshot offline. Cutout never signs in, calls Figma, guesses layout, or converts screenshots to code."
      />
      <Card size="sm" className="min-w-0 rounded-lg">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Authorized JSON snapshot</CardTitle>
              <CardDescription className="mt-1">
                Live sync requires a separately authorized host connector and is
                currently unavailable.
              </CardDescription>
            </div>
            <Badge variant="outline">Offline only</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-accent">
            <FolderInput className="size-4" /> Choose snapshot JSON
            <input
              aria-label="Choose Figma snapshot JSON"
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(event) => void load(event.target.files?.[0])}
            />
          </label>
          {fileError ? (
            <p role="alert" className="text-xs text-destructive">
              {fileError}
            </p>
          ) : null}
        </CardContent>
      </Card>
      {model.figmaPreview ? (
        <Card
          data-slot="figma-snapshot-preview"
          size="sm"
          className="min-w-0 rounded-lg"
        >
          <CardHeader>
            <CardTitle>{model.figmaPreview.fileName}</CardTitle>
            <CardDescription>{model.figmaPreview.summary}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric
                label="Collections"
                value={model.figmaPreview.collections}
                icon={<Layers3 className="size-4" />}
              />
              <Metric
                label="Token modes"
                value={model.figmaPreview.tokens}
                icon={<Sparkles className="size-4" />}
              />
              <Metric
                label="Components"
                value={model.figmaPreview.components}
                icon={<Component className="size-4" />}
              />
              <Metric
                label="Code Connect"
                value={model.figmaPreview.codeConnect}
                icon={<Boxes className="size-4" />}
              />
            </div>
            {model.figmaPreview.warnings.length ? (
              <ul
                aria-label="Figma snapshot warnings"
                className="space-y-1 text-xs text-amber-700 dark:text-amber-300"
              >
                {model.figmaPreview.warnings.map((warning) => (
                  <li key={warning}>• {warning}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                No adapter conflicts or incomplete binding warnings detected.
              </p>
            )}
            {callbacks?.onApproveFigmaSnapshot ? (
              <Button
                size="sm"
                onClick={() =>
                  callbacks.onApproveFigmaSnapshot?.(model.figmaPreview!.id)
                }
              >
                <ShieldCheck /> Approve and apply IR patch
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
      {model.figmaExportReady && callbacks?.onExportFigmaVariables ? (
        <Button
          size="sm"
          variant="outline"
          onClick={callbacks.onExportFigmaVariables}
        >
          <PackageCheck /> Export Figma Variables payload
        </Button>
      ) : null}
    </div>
  );
}

function WorkbenchTab({
  value,
  icon,
  children,
}: {
  value: DesignOsWorkbenchTab;
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
    <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.72fr)]">
      <DesignOsPanel model={model.summary} className="min-w-0" />
      <Card size="sm" className="min-w-0 rounded-lg">
        <CardHeader>
          <CardTitle>Delivery readiness</CardTitle>
          <CardDescription>
            Ready items have everything needed to export. Blocked items are
            missing something required first.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2">
          <Metric
            label="Ready"
            value={ready}
            icon={<CheckCircle2 className="size-4 text-emerald-600" />}
          />
          <Metric
            label="Blocked"
            value={blocked}
            icon={<CircleAlert className="size-4 text-destructive" />}
          />
        </CardContent>
      </Card>
    </div>
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
  const syncInputRef = useRef<HTMLInputElement>(null);
  const files = model.specimen?.files ?? [];
  const specimenHtml = files.find((file) => file.path === "design-system.html")?.content;
  const demoHtml = files.find((file) => file.path === "demo.html")?.content;

  const download = (path: string, content: string) => {
    const blob = new Blob([content], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = path;
    link.click();
    URL.revokeObjectURL(url);
  };

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

      {specimenHtml ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => download("design-system.html", specimenHtml)}>
              <Download /> Download design-system.html
            </Button>
            {demoHtml ? (
              <Button size="sm" variant="outline" onClick={() => download("demo.html", demoHtml)}>
                <Download /> Download demo.html
              </Button>
            ) : null}
            {callbacks?.onSyncDemoHtml ? (
              <>
                <Button size="sm" variant="ghost" onClick={() => syncInputRef.current?.click()}>
                  <Upload /> Sync from edited demo.html
                </Button>
                <input
                  ref={syncInputRef}
                  type="file"
                  accept=".html,text/html"
                  className="sr-only"
                  aria-label="Sync from edited demo.html"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) callbacks.onSyncDemoHtml?.(file);
                    event.target.value = "";
                  }}
                />
              </>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Hand-edit the downloaded demo.html, or ask the Agent to adjust it, then sync it back —
            changes go through the same review you already use for Sources, nothing is applied silently.
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
                  {source.detail && !source.detail.startsWith("cutout://legacy/") ? (
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

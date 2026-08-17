// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  acceptCommerceProjectLifecycleRecord,
  createCommerceProjectLifecycleRecord,
} from "@/commerce-profile/project-lifecycle";
import { createCommerceProjectContractResult } from "@/commerce-profile/project-production.test-fixture";
import type { CommerceProjectProductionResult } from "@/commerce-profile/project-production";
import {
  DesignOsWorkbench,
  type DesignOsWorkbenchModel,
} from "./DesignOsWorkbench";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const model: DesignOsWorkbenchModel = {
  summary: {
    documentId: "project:acme",
    revisionId: "revision:12",
    revisionNumber: 12,
    counts: { sources: 2, tokens: 18, components: 3, materials: 7 },
    capabilities: [
      { id: "export", label: "Verified export", status: "available" },
    ],
  },
  sources: [
    {
      id: "source:repo",
      label: "Acme storefront",
      kind: "Repository",
      role: "Existing implementation",
      license: "Apache-2.0",
      provenance: "git:abc123",
      detail: "Routes, components, and design tokens.",
    },
  ],
  ingestPreview: {
    id: "preview:1",
    title: "Repository ingest preview",
    summary: "Scanned without mutating the project.",
    sourceCount: 12,
    warnings: ["One asset has no declared license."],
    repository: {
      fileCount: 12,
      frameworks: [
        {
          name: "vite",
          confidence: "high",
          evidence: ["vite.config.ts", "src/main.tsx"],
        },
      ],
      exclusions: [{ label: "secret path", count: 1 }],
      role: "reference",
      license: "proprietary",
    },
  },
  kits: [
    {
      id: "kit:design",
      label: "Design System Kit",
      readiness: "ready",
      preview: {
        id: "preview:kit",
        title: "8 files",
        detail: "Dry-run only.",
        digest: "sha256:preview",
      },
      receipt: {
        id: "receipt:kit",
        title: "Last verified export",
        detail: ".cutout/exports/design-kit",
        digest: "sha256:actual",
      },
    },
    {
      id: "kit:brand",
      label: "Brand VI Kit",
      readiness: "blocked",
      blockers: [
        "Logo family is missing.",
        "Photography direction is unresolved.",
      ],
    },
  ],
  components: [
    {
      id: "component:registry",
      label: "Component registry",
      readiness: "pending",
    },
  ],
  starters: [
    {
      id: "starter:next",
      label: "Next.js starter",
      readiness: "unavailable",
      blockers: ["No starter plan."],
    },
  ],
  figmaPreview: {
    id: "figma:1",
    fileName: "Product UI",
    summary: "Authorized snapshot.",
    collections: 2,
    tokens: 14,
    components: 4,
    codeConnect: 3,
    warnings: ["One node ref is informational only."],
  },
  figmaExportReady: true,
};

let root: Root | undefined;
let container: HTMLDivElement | undefined;
let commerceResult: CommerceProjectProductionResult;

beforeAll(async () => {
  commerceResult = await createCommerceProjectContractResult();
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

function mount(element: ReturnType<typeof createElement>) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(element));
  return container;
}

function activateTab(tab: HTMLElement) {
  act(() => {
    tab.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0 }),
    );
    tab.click();
  });
}

describe("DesignOsWorkbench", () => {
  it("SSR renders one six-stage Project lifecycle without global domain tabs", () => {
    const html = renderToStaticMarkup(
      createElement(DesignOsWorkbench, { model }),
    );

    expect(html).toContain('aria-label="Project workbench"');
    expect(html).toContain('aria-label="Project lifecycle"');
    expect(html).not.toContain(">Design OS<");
    for (const label of ["Brief", "Sources", "Create", "Review", "Deliver", "Inspect"]) {
      expect(html).toContain(`>${label}</button>`);
    }
    expect(html).not.toContain(">Commerce</button>");
    expect(html).not.toContain(">Game Asset</button>");
    expect(html).not.toContain(">Kits</button>");
    expect(html).not.toContain(">Components</button>");
    expect(html).not.toContain(">Starter</button>");
    expect(html).toContain("Project brief");
    expect(html).not.toContain("Advanced system evidence");
    expect(html.indexOf("Revision 12")).toBeGreaterThan(
      html.indexOf("Project workbench"),
    );
    expect(html).not.toContain("Only verified outputs");
  });

  it("uses the shared lifecycle shell and contextual delivery views in Deliver mode", () => {
    const html = renderToStaticMarkup(
      createElement(DesignOsWorkbench, {
        model: { ...model, delivery: { targets: [] } },
        surfaceMode: "deliver",
        defaultTab: "delivery",
      }),
    );
    for (const label of ["Brief", "Sources", "Create", "Review", "Deliver", "Inspect"]) {
      expect(html).toContain(`>${label}</button>`);
    }
    expect(html).toContain('aria-label="Delivery views"');
    expect(html).toContain(">Overview</button>");
    expect(html).toContain(">Kits</button>");
    expect(html).toContain(">Components</button>");
    expect(html).toContain(">Starter</button>");
    expect(html).not.toContain("System inspector");
    expect(html).not.toContain("Axe host required");
    expect(html.match(/>Overview<\/button>/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Project workbench"');
  });

  it("returns from Deliver through the workspace callback with responsive copy", () => {
    const onBack = vi.fn();
    const view = mount(createElement(DesignOsWorkbench, {
      model: { ...model, delivery: { targets: [] } },
      surfaceMode: "deliver",
      defaultTab: "delivery",
      onBackToWorkspace: onBack,
      backLabel: "Back to Agent",
      backMobileLabel: "Back",
    }));
    const button = view.querySelector<HTMLButtonElement>('button[aria-label="Back to Agent"]');
    expect(button?.className).toContain("min-h-11");
    expect(button?.className).toContain("min-w-11");
    expect(button?.title).toBe("Back to Agent");
    expect(button?.textContent).toContain("Back");
    act(() => button?.click());
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("defaults Create to Product UI/UX and switches Profiles without changing the lifecycle", () => {
    const onOpenCanvas = vi.fn();
    const view = mount(createElement(DesignOsWorkbench, {
      model,
      callbacks: { onOpenProductCanvas: onOpenCanvas },
    }));
    const lifecycle = view.querySelector('[role="tablist"][aria-label="Project lifecycle"]');
    const create = Array.from(lifecycle?.querySelectorAll('[role="tab"]') ?? []).find(
      (tab) => tab.textContent?.includes("Create"),
    ) as HTMLElement;
    activateTab(create);

    expect(onOpenCanvas).toHaveBeenCalledOnce();
    expect(view.textContent).not.toContain("Open canvas");
    expect(view.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain("Brief");

    act(() =>
      root?.render(createElement(DesignOsWorkbench, {
        model,
        defaultTab: "specimen",
        callbacks: { onOpenProductCanvas: onOpenCanvas },
      })),
    );
    const productViews = view.querySelector('[role="tablist"][aria-label="Product UI/UX views"]');
    const canvas = Array.from(productViews?.querySelectorAll('[role="tab"]') ?? []).find(
      (tab) => tab.textContent?.includes("Canvas"),
    ) as HTMLElement;
    activateTab(canvas);
    expect(onOpenCanvas).toHaveBeenCalledTimes(2);

    const profiles = view.querySelector('[role="tablist"][aria-label="Production profiles"]');
    const motion = Array.from(profiles?.querySelectorAll('[role="tab"]') ?? []).find(
      (tab) => tab.textContent?.includes("Motion"),
    ) as HTMLElement;
    activateTab(motion);
    expect(view.textContent).toContain("Temporal Host required");
    expect(view.textContent).toContain(
      "Motion production remains unavailable until an authorized temporal Host is connected.",
    );
    expect(view.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain("Create");
  });

  it("changes Designer and Builder presentation without changing destination or command authority", () => {
    const onGenerate = vi.fn();
    const view = mount(
      createElement(DesignOsWorkbench, {
        model,
        defaultTab: "specimen",
        callbacks: { onGenerateSpecimen: onGenerate },
      }),
    );
    const selectedLifecycle = () =>
      view.querySelector(
        '[role="tablist"][aria-label="Project lifecycle"] [role="tab"][aria-selected="true"]',
      );
    const selectedProfile = () =>
      view.querySelector(
        '[role="tablist"][aria-label="Production profiles"] [role="tab"][aria-selected="true"]',
      );

    expect(view.querySelector('[aria-label="Builder context"]')).toBeNull();
    act(() => view.querySelector<HTMLButtonElement>('button[aria-label="Builder"]')?.click());
    expect(view.textContent).toContain("Builder context");
    expect(view.textContent).toContain("revision:12");
    expect(view.textContent).toContain("git:abc123");
    expect(selectedLifecycle()?.textContent).toContain("Create");
    expect(selectedProfile()?.textContent).toContain("Product UI/UX");

    const generate = Array.from(view.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Generate specimen"),
    );
    act(() => generate?.click());
    expect(onGenerate).toHaveBeenCalledOnce();

    act(() => view.querySelector<HTMLButtonElement>('button[aria-label="Designer"]')?.click());
    expect(view.querySelector('[aria-label="Builder context"]')).toBeNull();
    expect(selectedLifecycle()?.textContent).toContain("Create");
    expect(selectedProfile()?.textContent).toContain("Product UI/UX");
  });

  it("moves a ready Brand kit into Deliver instead of exporting from Create", () => {
    const onExport = vi.fn();
    const brandReady: DesignOsWorkbenchModel = {
      ...model,
      kits: model.kits.map((item) =>
        item.id === "kit:brand"
          ? { ...item, readiness: "ready" as const, blockers: undefined }
          : item,
      ),
    };
    const view = mount(
      createElement(DesignOsWorkbench, {
        model: brandReady,
        defaultTab: "specimen",
        callbacks: { onExportKit: onExport },
      }),
    );
    const profiles = view.querySelector(
      '[role="tablist"][aria-label="Production profiles"]',
    );
    const brand = Array.from(profiles?.querySelectorAll('[role="tab"]') ?? []).find(
      (tab) => tab.textContent?.includes("Brand"),
    ) as HTMLElement;
    activateTab(brand);

    expect(view.textContent).toContain("Prepare the Brand kit");
    const openDelivery = Array.from(view.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Open delivery"),
    );
    act(() => openDelivery?.click());

    expect(onExport).not.toHaveBeenCalled();
    expect(
      view.querySelector(
        '[role="tablist"][aria-label="Project lifecycle"] [role="tab"][aria-selected="true"]',
      )?.textContent,
    ).toContain("Deliver");
    expect(view.textContent).toContain("Kit delivery");
    expect(view.querySelector('[role="tablist"][aria-label="Delivery views"]')).toBeTruthy();
  });

  it("projects only current readiness, blockers, governance, and receipts into Review", () => {
    const view = mount(
      createElement(DesignOsWorkbench, { model, defaultTab: "overview" }),
    );
    const lifecycle = view.querySelector('[role="tablist"][aria-label="Project lifecycle"]');
    const review = Array.from(lifecycle?.querySelectorAll('[role="tab"]') ?? []).find(
      (tab) => tab.textContent?.includes("Review"),
    ) as HTMLElement;
    activateTab(review);

    expect(view.textContent).toContain("Current revision evidence");
    expect(view.textContent).toContain("Brand VI Kit: Logo family is missing.");
    expect(view.textContent).toContain("Verified deliveries");
    expect(view.textContent).toContain("Last verified export");
    expect(view.textContent).not.toContain("No review evidence yet");
  });

  it("states explicitly when Review has no governance or receipt evidence", () => {
    const noEvidence: DesignOsWorkbenchModel = {
      ...model,
      kits: model.kits.map(({ receipt: _receipt, ...item }) => item),
      components: model.components.map(({ receipt: _receipt, ...item }) => item),
      starters: model.starters.map(({ receipt: _receipt, ...item }) => item),
      governance: undefined,
      figmaPreview: undefined,
    };
    const view = mount(
      createElement(DesignOsWorkbench, { model: noEvidence }),
    );
    const lifecycle = view.querySelector('[role="tablist"][aria-label="Project lifecycle"]');
    const review = Array.from(lifecycle?.querySelectorAll('[role="tab"]') ?? []).find(
      (tab) => tab.textContent?.includes("Review"),
    ) as HTMLElement;
    activateTab(review);

    expect(view.textContent).toContain("No review evidence yet");
    expect(view.textContent).toContain(
      "Review evidence appears after governance or a verified delivery receipt exists for this revision.",
    );
    expect(view.textContent).not.toContain("Verified deliveries");
  });

  it("keeps Commerce production mounted from Create into Review and gates Deliver on acceptance", async () => {
    const onLifecycleChange = vi.fn();
    const record = createCommerceProjectLifecycleRecord({
      designRevisionId: model.summary.revisionId,
      result: commerceResult,
    });
    const view = mount(createElement(DesignOsWorkbench, {
      model: { ...model, commerceProjectLifecycle: record },
      defaultTab: "commerce",
      callbacks: { onCommerceLifecycleChange: onLifecycleChange },
    }));
    await vi.waitFor(() => {
      expect(view.querySelector('[data-slot="commerce-production"]')).toBeTruthy();
    });

    const commerceProduction = view.querySelector('[data-slot="commerce-production"]');
    const lifecycle = view.querySelector('[role="tablist"][aria-label="Project lifecycle"]');
    const review = Array.from(lifecycle?.querySelectorAll('[role="tab"]') ?? []).find(
      (tab) => tab.textContent?.includes("Review"),
    ) as HTMLElement;
    activateTab(review);

    expect(commerceProduction?.isConnected).toBe(true);
    expect(view.textContent).toContain("Commerce material set");
    expect(view.textContent).toContain("Review required");
    expect(view.querySelector('[aria-label="Commerce retained artifact previews"]')?.children).toHaveLength(11);
    expect(view.textContent).toContain("Receipt and QA closure");
    expect(view.textContent).toContain("QA passed");
    expect(view.textContent).toContain("Provider receipt:project-lifecycle:");
    expect(view.textContent).not.toContain("Review materials");
    expect(view.textContent).not.toContain("Download files");
    const accept = Array.from(view.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Accept for delivery"),
    );
    act(() => accept?.click());
    expect(onLifecycleChange).toHaveBeenCalledOnce();
    expect(onLifecycleChange.mock.calls[0]?.[0]?.review?.status).toBe("accepted");

    const accepted = acceptCommerceProjectLifecycleRecord(record);
    act(() => root?.render(createElement(DesignOsWorkbench, {
      model: { ...model, commerceProjectLifecycle: accepted },
      defaultTab: "delivery",
      callbacks: { onCommerceLifecycleChange: onLifecycleChange },
    })));
    expect(view.textContent).toContain("Commerce bundle");
    expect(view.textContent).toContain("Download files");
    expect(view.textContent).not.toContain("Download bundle");
  });

  it("blocks review acceptance and delivery when Commerce belongs to a stale revision", () => {
    const stale = createCommerceProjectLifecycleRecord({
      designRevisionId: "revision:older",
      result: commerceResult,
    });
    const view = mount(createElement(DesignOsWorkbench, {
      model: { ...model, commerceProjectLifecycle: stale },
      defaultTab: "overview",
    }));
    const lifecycle = view.querySelector('[role="tablist"][aria-label="Project lifecycle"]');
    const review = Array.from(lifecycle?.querySelectorAll('[role="tab"]') ?? []).find(
      (tab) => tab.textContent?.includes("Review"),
    ) as HTMLElement;
    activateTab(review);
    expect(view.textContent).toContain("Stale revision");
    expect(view.textContent).not.toContain("Accept for delivery");

    const deliver = Array.from(lifecycle?.querySelectorAll('[role="tab"]') ?? []).find(
      (tab) => tab.textContent?.includes("Deliver"),
    ) as HTMLElement;
    activateTab(deliver);
    expect(view.textContent).toContain("Regenerate");
    expect(view.textContent).not.toContain("Download files");
  });

  it("keeps Figma import, approval, and export in Sources, Review, and Deliver", () => {
    const prepare = vi.fn();
    const approve = vi.fn();
    const exportVariables = vi.fn();
    const view = mount(
      createElement(DesignOsWorkbench, {
        model,
        defaultTab: "figma",
        callbacks: {
          onPrepareFigmaSnapshot: prepare,
          onApproveFigmaSnapshot: approve,
          onExportFigmaVariables: exportVariables,
        },
      }),
    );
    expect(view.textContent).toContain(
      "Inspect a caller-authorized offline snapshot. Import stays in Sources and approval stays in Review.",
    );
    expect(view.textContent).toContain("Figma snapshot");
    expect(view.textContent).not.toContain("Figma handoff");
    expect(view.textContent).toContain("Product UI");
    expect(view.textContent).toContain("Code Connect");
    expect(view.textContent).toContain("One node ref is informational only.");
    expect(view.querySelector('[aria-label="Choose Figma snapshot JSON"]')).toBeNull();
    expect(view.textContent).not.toContain("Approve and apply IR patch");
    expect(view.textContent).not.toContain("Export Figma Variables payload");

    const lifecycle = view.querySelector('[role="tablist"][aria-label="Project lifecycle"]');
    const sources = Array.from(lifecycle?.querySelectorAll('[role="tab"]') ?? []).find(
      (tab) => tab.textContent?.includes("Sources"),
    ) as HTMLElement;
    activateTab(sources);
    expect(view.querySelector('[aria-label="Choose Figma snapshot JSON"]')).toBeTruthy();

    const review = Array.from(lifecycle?.querySelectorAll('[role="tab"]') ?? []).find(
      (tab) => tab.textContent?.includes("Review"),
    ) as HTMLElement;
    activateTab(review);
    const apply = Array.from(view.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Approve and apply"),
    );
    act(() => apply?.click());
    expect(approve).toHaveBeenCalledWith("figma:1");

    const deliver = Array.from(lifecycle?.querySelectorAll('[role="tab"]') ?? []).find(
      (tab) => tab.textContent?.includes("Deliver"),
    ) as HTMLElement;
    activateTab(deliver);
    const exportButton = Array.from(view.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Export Figma Variables"),
    );
    act(() => exportButton?.click());
    expect(exportVariables).toHaveBeenCalledOnce();
  });

  it("shows source facts and approval only when an approval callback exists", () => {
    const onApprove = vi.fn();
    const view = mount(
      createElement(DesignOsWorkbench, {
        model,
        defaultTab: "sources",
        callbacks: { onApproveSourceIngest: onApprove },
      }),
    );

    expect(view.textContent).toContain("Existing implementation");
    expect(view.textContent).toContain("Apache-2.0");
    expect(view.textContent).toContain("git:abc123");
    expect(view.textContent).toContain("No source has been ingested yet.");
    expect(view.textContent).toContain(
      "vite (high): vite.config.ts, src/main.tsx",
    );
    expect(view.textContent).toContain("secret path 1");
    const approve = Array.from(view.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Approve ingest"),
    );
    expect(approve).toBeTruthy();
    act(() => approve?.click());
    expect(onApprove).toHaveBeenCalledWith("preview:1");

    act(() =>
      root?.render(
        createElement(DesignOsWorkbench, { model, defaultTab: "sources" }),
      ),
    );
    expect(view.textContent).toContain(
      "Approval is not available in this host.",
    );
    expect(
      Array.from(view.querySelectorAll("button")).some((button) =>
        button.textContent?.includes("Approve ingest"),
      ),
    ).toBe(false);
  });

  it("hides the synthetic project-brief source and shows an import-focused empty state when nothing was imported", () => {
    const briefOnlyModel: DesignOsWorkbenchModel = {
      ...model,
      sources: [
        {
          id: "source:project",
          label: "Untitled project",
          kind: "idea",
          role: "requirement",
          license: "Proprietary · Project owner",
          provenance: "workspace.v1-projection",
          detail: "cutout://workspace/61dea8f3-e271-4ae0-8b22-245241bd8b54/brief",
        },
      ],
      ingestPreview: undefined,
    };
    const view = mount(
      createElement(DesignOsWorkbench, { model: briefOnlyModel, defaultTab: "sources" }),
    );
    expect(view.textContent).not.toContain("cutout://workspace/");
    expect(view.textContent).not.toContain("workspace.v1-projection");
    expect(view.querySelector('[aria-label="Design sources"]')).toBeNull();
    expect(view.textContent).toContain("No external sources imported yet");
  });

  it("prompts to generate a specimen before one has been compiled for this revision", () => {
    const onGenerate = vi.fn();
    const view = mount(
      createElement(DesignOsWorkbench, {
        model,
        defaultTab: "specimen",
        callbacks: { onGenerateSpecimen: onGenerate },
      }),
    );
    expect(view.textContent).toContain("No specimen generated yet");
    expect(view.querySelector("iframe")).toBeNull();
    const generate = Array.from(view.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Generate specimen"),
    );
    act(() => generate?.click());
    expect(onGenerate).toHaveBeenCalledOnce();
  });

  it("inspects the specimen in Create, syncs it in Sources, and downloads it in Deliver", () => {
    const onSync = vi.fn();
    const specimenModel: DesignOsWorkbenchModel = {
      ...model,
      specimen: {
        revisionId: "revision:12",
        composedByAgent: true,
        stale: false,
        files: [
          { path: "design-system.html", content: "<html><body>specimen</body></html>" },
          { path: "demo.html", content: "<html><body>demo</body></html>" },
          { path: "tokens.json", content: "{}" },
        ],
      },
    };
    const view = mount(
      createElement(DesignOsWorkbench, {
        model: specimenModel,
        defaultTab: "specimen",
        callbacks: { onGenerateSpecimen: vi.fn(), onSyncDemoHtml: onSync },
      }),
    );
    const iframe = view.querySelector("iframe") as HTMLIFrameElement;
    expect(iframe).toBeTruthy();
    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts");
    expect(iframe.getAttribute("srcdoc")).toContain("specimen");
    expect(view.textContent).toContain("Regenerate");
    expect(view.textContent).toContain("demo.html: composed for this product");
    expect(view.textContent).not.toContain("Tokens changed since this specimen was generated");
    expect(view.textContent).not.toContain("Download demo.html");
    expect(view.querySelector('[aria-label="Sync from edited demo.html"]')).toBeNull();

    const lifecycle = view.querySelector('[role="tablist"][aria-label="Project lifecycle"]');
    const sources = Array.from(lifecycle?.querySelectorAll('[role="tab"]') ?? []).find(
      (tab) => tab.textContent?.includes("Sources"),
    ) as HTMLElement;
    activateTab(sources);
    const input = view.querySelector('[aria-label="Sync from edited demo.html"]') as HTMLInputElement;
    const file = new File(["<html></html>"], "demo.html", { type: "text/html" });
    Object.defineProperty(input, "files", { value: [file] });
    act(() => input.dispatchEvent(new Event("change", { bubbles: true })));
    expect(onSync).toHaveBeenCalledWith(file);

    const deliver = Array.from(lifecycle?.querySelectorAll('[role="tab"]') ?? []).find(
      (tab) => tab.textContent?.includes("Deliver"),
    ) as HTMLElement;
    activateTab(deliver);
    expect(view.textContent).toContain("Download demo.html");
  });

  it("marks the demo as a generic template when composition fell back to the deterministic renderer", () => {
    const view = mount(
      createElement(DesignOsWorkbench, {
        model: {
          ...model,
          specimen: {
            revisionId: "revision:12",
            composedByAgent: false,
            stale: false,
            files: [
              { path: "design-system.html", content: "<html></html>" },
              { path: "demo.html", content: "<html></html>" },
            ],
          },
        },
        defaultTab: "specimen",
      }),
    );
    expect(view.textContent).toContain("demo.html: generic template");
    expect(view.textContent).not.toContain("composed for this product");
  });

  it("shows a staleness banner instead of forgetting the specimen once tokens have moved past it", () => {
    const view = mount(
      createElement(DesignOsWorkbench, {
        model: {
          ...model,
          specimen: {
            revisionId: "revision:11",
            composedByAgent: true,
            stale: true,
            files: [
              { path: "design-system.html", content: "<html><body>old specimen</body></html>" },
              { path: "demo.html", content: "<html><body>old demo</body></html>" },
            ],
          },
        },
        defaultTab: "specimen",
      }),
    );
    expect(view.textContent).toContain("Tokens changed since this specimen was generated");
    // stale content is still shown, not hidden behind the banner.
    expect(view.querySelector("iframe")).toBeTruthy();
    expect(view.textContent).toContain("Regenerate");
  });

  it("offers to save the specimen to Library, and shows a saved state once it has been", () => {
    const onSave = vi.fn();
    const specimenModel: DesignOsWorkbenchModel = {
      ...model,
      specimen: {
        revisionId: "revision:12",
        composedByAgent: false,
        stale: false,
        files: [
          { path: "design-system.html", content: "<html></html>" },
          { path: "demo.html", content: "<html></html>" },
        ],
      },
    };
    const view = mount(
      createElement(DesignOsWorkbench, {
        model: specimenModel,
        defaultTab: "specimen",
        callbacks: { onSaveSpecimenToLibrary: onSave },
      }),
    );
    const lifecycle = view.querySelector('[role="tablist"][aria-label="Project lifecycle"]');
    const deliver = Array.from(lifecycle?.querySelectorAll('[role="tab"]') ?? []).find(
      (tab) => tab.textContent?.includes("Deliver"),
    ) as HTMLElement;
    activateTab(deliver);
    const save = Array.from(view.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Save to Library"),
    ) as HTMLButtonElement;
    expect(save).toBeTruthy();
    expect(save.disabled).toBe(false);
    act(() => save.click());
    expect(onSave).toHaveBeenCalledOnce();

    act(() =>
      root?.render(
        createElement(DesignOsWorkbench, {
          model: { ...specimenModel, specimen: { ...specimenModel.specimen!, savedToLibrary: true } },
          defaultTab: "specimen",
          callbacks: { onSaveSpecimenToLibrary: onSave },
        }),
      ),
    );
    expect(view.textContent).toContain("Saved to Library");
    const savedButton = Array.from(view.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Saved to Library"),
    ) as HTMLButtonElement;
    expect(savedButton.disabled).toBe(true);
  });

  it("does not show the Library action when no callback is provided", () => {
    const view = mount(
      createElement(DesignOsWorkbench, {
        model: {
          ...model,
          specimen: {
            revisionId: "revision:12",
            composedByAgent: false,
            stale: false,
            files: [{ path: "design-system.html", content: "<html></html>" }],
          },
        },
        defaultTab: "specimen",
      }),
    );
    expect(view.textContent).not.toContain("Save to Library");
  });

  it("reviews a synced token diff only in Review", () => {
    const apply = vi.fn();
    const discard = vi.fn();
    const diffModel: DesignOsWorkbenchModel = {
      ...model,
      figmaPreview: undefined,
      tokenSyncPreview: {
        changes: [{
          tokenId: "token:color:accent",
          name: "Accent",
          previousValue: "#111111",
          nextValue: "#22cc88",
        }],
      },
    };
    const view = mount(createElement(DesignOsWorkbench, {
      model: diffModel,
      defaultTab: "specimen",
      callbacks: {
        onApplyTokenSync: apply,
        onDiscardTokenSync: discard,
      },
    }));
    expect(view.querySelector('[data-slot="token-sync-preview"]')).toBeNull();

    const lifecycle = view.querySelector('[role="tablist"][aria-label="Project lifecycle"]');
    const review = Array.from(lifecycle?.querySelectorAll('[role="tab"]') ?? []).find(
      (tab) => tab.textContent?.includes("Review"),
    ) as HTMLElement;
    activateTab(review);
    expect(view.querySelector('[data-slot="token-sync-preview"]')).toBeTruthy();
    expect(view.textContent).toContain("Accent");
    const applyButton = Array.from(view.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Apply token changes"),
    );
    const discardButton = Array.from(view.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Discard"),
    );
    act(() => applyButton?.click());
    act(() => discardButton?.click());
    expect(apply).toHaveBeenCalledOnce();
    expect(discard).toHaveBeenCalledOnce();
  });

  it("keeps kit evidence progressive and exports only the selected ready target", () => {
    const onExport = vi.fn();
    const view = mount(
      createElement(DesignOsWorkbench, {
        model,
        defaultTab: "kits",
        callbacks: { onExportKit: onExport },
      }),
    );

    expect(view.textContent).toContain("Needs preparation");
    expect(view.textContent).toContain("Provide an approved logo family.");
    expect(view.textContent).not.toContain("Logo family is missing.");
    expect(view.textContent).not.toContain("sha256:actual");
    const design = view.querySelector(
      '[role="radiogroup"][aria-label="Kit target"] [role="radio"]',
    ) as HTMLButtonElement;
    act(() => design.click());
    const exportButton = Array.from(view.querySelectorAll("button")).find((button) => button.textContent?.includes("Preview and export"));
    act(() => exportButton?.click());
    expect(onExport).toHaveBeenCalledWith("kit:design");
    const advanced = Array.from(view.querySelectorAll("button")).find((button) => button.textContent?.trim()==="Advanced");
    act(() => advanced?.click());
    expect(view.querySelector('textarea[aria-label="Brand configuration JSON"]')).toBeTruthy();
    expect(view.querySelector('input[aria-label="Import Brand configuration JSON"]')).toBeTruthy();
    expect(view.textContent).toContain("License, provenance, and raw readiness");
  });

  it("keeps starter configuration progressive and requires explicit approval", () => {
    const prepare = vi.fn();
    const approve = vi.fn();
    const blocked = {
      ...model,
      starters: model.starters.map((item) => ({
        ...item,
        readiness: "blocked" as const,
        blockers: ["Approve materials first."],
      })),
    };
    const view = mount(
      createElement(DesignOsWorkbench, {
        model: blocked,
        defaultTab: "starter",
        callbacks: { onPrepareAuthoring: prepare, onApproveAuthoring: approve },
      }),
    );
    expect(view.querySelector("textarea")).toBeNull();
    const prepareButton = Array.from(view.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Review required preparation"),
    );
    act(() => prepareButton?.click());
    expect(prepare).toHaveBeenCalledTimes(1);
    const authored = {
      ...blocked,
      authoringPreview: {
        id: "authoring:1",
        kind: "starter" as const,
        summary: "vite-react; no implicit assets.",
      },
    };
    act(() =>
      root?.render(
        createElement(DesignOsWorkbench, {
          model: authored,
          defaultTab: "starter",
          callbacks: {
            onPrepareAuthoring: prepare,
            onApproveAuthoring: approve,
          },
        }),
      ),
    );
    const approveButton = Array.from(view.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Approve and continue"),
    );
    act(() => approveButton?.click());
    expect(approve).toHaveBeenCalledWith("authoring:1");
  });

  it("does not render an export command for ready data when its host callback is absent", () => {
    const html = renderToStaticMarkup(
      createElement(DesignOsWorkbench, { model, defaultTab: "kits" }),
    );

    expect(html).toContain("Kit delivery");
    expect(html).toContain("Needs preparation");
    expect(html).not.toContain("Preview and export</button>");
  });

  it("switches tabs interactively and keeps long content inside min-width constrained surfaces", () => {
    const view = mount(createElement(DesignOsWorkbench, { model }));
    const sources = Array.from(view.querySelectorAll('[role="tab"]')).find(
      (tab) => tab.textContent?.includes("Sources"),
    ) as HTMLElement;
    act(() => {
      sources.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0 }),
      );
      sources.click();
    });

    expect(view.textContent).toContain("Acme storefront");
    expect(
      view.querySelector('[data-slot="design-os-workbench"]')?.className,
    ).toContain("min-w-0");
    expect(
      view.querySelector('[data-slot="tabs-content"]')?.parentElement
        ?.className,
    ).toContain("overflow-y-auto");
  });
});

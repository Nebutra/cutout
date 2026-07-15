// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
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

describe("DesignOsWorkbench", () => {
  it("SSR renders the Canvas inspector shell with a dedicated Figma surface", () => {
    const html = renderToStaticMarkup(
      createElement(DesignOsWorkbench, { model }),
    );

    expect(html).toContain('aria-label="Canvas inspector"');
    expect(html).toContain('aria-label="Canvas inspector sections"');
    expect(html).not.toContain(">Design OS<");
    expect(html).toContain("Overview");
    expect(html).toContain("Sources");
    expect(html).toContain("Figma");
    expect(html).not.toContain(">Kits</button>");
    expect(html).not.toContain(">Components</button>");
    expect(html).not.toContain(">Starter</button>");
    expect(html).toContain("project:acme");
    expect(html).toContain("Delivery readiness");
    expect(html).toContain("missing something required first");
    expect(html).not.toContain("Only verified outputs");
  });

  it("shows only delivery surfaces in Deliver mode", () => {
    const html = renderToStaticMarkup(
      createElement(DesignOsWorkbench, {
        model: { ...model, delivery: { targets: [] } },
        surfaceMode: "deliver",
        defaultTab: "delivery",
      }),
    );
    expect(html).toContain(">Delivery center</button>");
    expect(html).toContain(">Kits</button>");
    expect(html).toContain(">Components</button>");
    expect(html).toContain(">Starter</button>");
    expect(html).not.toContain(">Overview</button>");
    expect(html).not.toContain(">Sources</button>");
    expect(html).not.toContain(">Figma</button>");
    expect(html).not.toContain("Canvas inspector");
    expect(html).not.toContain("Axe host required");
    expect(html.match(/>Delivery center<\/button>/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Deliver"');
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
    expect(button?.textContent).toContain("Back to Agent");
    expect(button?.textContent).toContain("Back");
    act(() => button?.click());
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("reviews authorized Figma snapshot facts and requires explicit approval", () => {
    const approve = vi.fn();
    const exportVariables = vi.fn();
    const view = mount(
      createElement(DesignOsWorkbench, {
        model,
        defaultTab: "figma",
        callbacks: {
          onApproveFigmaSnapshot: approve,
          onExportFigmaVariables: exportVariables,
        },
      }),
    );
    expect(view.textContent).toContain(
      "Live sync requires a separately authorized host connector and is currently unavailable.",
    );
    expect(view.textContent).toContain("Product UI");
    expect(view.textContent).toContain("Code Connect");
    expect(view.textContent).toContain("One node ref is informational only.");
    const apply = Array.from(view.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Approve and apply"),
    );
    act(() => apply?.click());
    expect(approve).toHaveBeenCalledWith("figma:1");
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
          detail: "cutout://legacy/61dea8f3-e271-4ae0-8b22-245241bd8b54/brief",
        },
      ],
      ingestPreview: undefined,
    };
    const view = mount(
      createElement(DesignOsWorkbench, { model: briefOnlyModel, defaultTab: "sources" }),
    );
    expect(view.textContent).not.toContain("cutout://legacy/");
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

  it("hosts the compiled design-system.html in an iframe and offers demo.html for download and sync", () => {
    const onSync = vi.fn();
    const specimenModel: DesignOsWorkbenchModel = {
      ...model,
      specimen: {
        revisionId: "revision:12",
        composedByAgent: true,
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
    expect(view.textContent).toContain("Download demo.html");
    expect(view.textContent).toContain("demo.html: composed for this product");

    const input = view.querySelector('[aria-label="Sync from edited demo.html"]') as HTMLInputElement;
    const file = new File(["<html></html>"], "demo.html", { type: "text/html" });
    Object.defineProperty(input, "files", { value: [file] });
    act(() => input.dispatchEvent(new Event("change", { bubbles: true })));
    expect(onSync).toHaveBeenCalledWith(file);
  });

  it("marks the demo as a generic template when composition fell back to the deterministic renderer", () => {
    const view = mount(
      createElement(DesignOsWorkbench, {
        model: {
          ...model,
          specimen: {
            revisionId: "revision:12",
            composedByAgent: false,
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
    const design = view.querySelector('[role="radio"]') as HTMLButtonElement;
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

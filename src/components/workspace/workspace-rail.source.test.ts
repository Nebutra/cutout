import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("workspace rail source contract", () => {
  const source = readFileSync(
    join(process.cwd(), "src/components/workspace/IntentWorkspace.tsx"),
    "utf8",
  );

  it("owns workspace drawer selection in one explicit state", () => {
    expect(source).toContain(
      'type WorkspacePanel = "agent" | "files" | "git" | "design" | "deliver";',
    );
    expect(source).toContain(
      'useState<WorkspacePanel | null>("agent")',
    );
    expect(source).toContain(
      "setActiveWorkspacePanel((current) => (current === panel ? null : panel))",
    );
    expect(source).not.toMatch(/agentDockVisible|filesDockVisible|designDockVisible|gitDockVisible/);
  });

  it("keeps Design in the drawer contract and restores the panel behind Deliver", () => {
    expect(source).toContain(
      'onOpenDesign={() => toggleWorkspacePanel("design")}',
    );
    expect(source).toContain(
      'const deliveryReturnPanelRef = useRef<WorkspacePanel | null>("agent")',
    );
    expect(source).toContain("deliveryReturnPanelRef.current = current");
    expect(source).toContain(
      "setActiveWorkspacePanel(deliveryReturnPanelRef.current)",
    );
    expect(source).toContain(
      'inspectorActive={activeWorkspacePanel === "design"}',
    );
    expect(source).toContain(
      'deliverActive={activeWorkspacePanel === "deliver"}',
    );
    expect(source).toContain('<DeliveryWorkspaceDock');
    expect(source).toContain('data-workspace-panel={');
    expect(source).toContain('label="Create"');
  });

  it("keeps detailed surfaces secondary to their workspace drawers", () => {
    expect(source).toMatch(
      /onOpenAssets=\{\(\) => \{\s*setActiveWorkspacePanel\(null\);\s*library\.open\(\);/,
    );
    expect(source).toContain('Open delivery workspace');
    expect(source).toContain('onOpenDesignOs("delivery")');
    expect(source).toContain('Open system inspector');
    expect(source).toContain('Game assets');
    expect(source).toContain('Generate and review sprite frames with Qwen');
    expect(source).toContain('onOpenDesignOs("game-assets")');
    expect(source).not.toContain("Advanced design system");
    expect(source).not.toContain("group/advanced");
    expect(source).toContain('<WorkspaceDockHeader');
  });

  it("keeps one accessible, focus-visible RailItem treatment", () => {
    expect(source.match(/<RailItem/g)).toHaveLength(6);
    expect(source).not.toContain('label="Advanced"');
    expect(source).toContain("aria-label={label}");
    expect(source).toContain("aria-pressed={active}");
    expect(source).toContain("flex size-12 shrink-0 flex-col");
    expect(source).toContain("focus-visible:ring-2");
    expect(source).toContain("focus-visible:ring-ring");
  });

  it("never leaves a chrome-less expand control as the only way back", () => {
    expect(source).toContain("workspaceSidebarRestore");
    expect(source).toContain("sidebarRestore.showRestore");
    expect(source).toContain("sidebarRestore.reserveToolbarSlot");
    expect(source).toContain('<ExpandSidebarButton');
    expect(source).toContain('aria-label="Expand sidebar"');
    expect(source).toContain(
      "rounded-full border border-foreground/30 bg-background/95",
    );
    expect(source).not.toContain("group/expand");
    expect(source).not.toMatch(
      /Expand sidebar[\s\S]{0,240}pointer-events-none opacity-0/,
    );
  });
});

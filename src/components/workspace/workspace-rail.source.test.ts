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

  it("toggles Design and Deliver through the same drawer contract", () => {
    expect(source).toContain(
      'onOpenDesign={() => toggleWorkspacePanel("design")}',
    );
    expect(source).toContain(
      'onOpenDeliver={() => toggleWorkspacePanel("deliver")}',
    );
    expect(source).toContain(
      'inspectorActive={activeWorkspacePanel === "design"}',
    );
    expect(source).toContain(
      'deliverActive={activeWorkspacePanel === "deliver"}',
    );
    expect(source).toContain('<DeliveryWorkspaceDock');
    expect(source).toContain('data-workspace-panel={');
  });

  it("keeps detailed surfaces secondary to their workspace drawers", () => {
    expect(source).toMatch(
      /onOpenAssets=\{\(\) => \{\s*setActiveWorkspacePanel\(null\);\s*library\.open\(\);/,
    );
    expect(source).toContain('Open delivery workspace');
    expect(source).toContain('onOpenDesignOs("delivery")');
    expect(source).toContain('Open system inspector');
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
});

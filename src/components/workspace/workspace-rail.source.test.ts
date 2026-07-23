import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("workspace rail source contract", () => {
  const source = readFileSync(
    join(process.cwd(), "src/components/workspace/IntentWorkspace.tsx"),
    "utf8",
  );

  it("toggles Design as a mutually exclusive workspace drawer", () => {
    expect(source).toMatch(
      /onOpenDesign=\{\(\) => \{\s*setDesignDockVisible\(\(visible\) => !visible\);\s*setAgentDockVisible\(false\);\s*setFilesDockVisible\(false\);\s*setGitDockVisible\(false\);/,
    );
    expect(source).toContain("inspectorActive={designDockVisible}");
  });

  it("clears drawer selection before opening Assets or Deliver", () => {
    expect(source).toMatch(
      /onOpenAssets=\{\(\) => \{\s*setAgentDockVisible\(false\);\s*setFilesDockVisible\(false\);\s*setDesignDockVisible\(false\);\s*setGitDockVisible\(false\);\s*library\.open\(\);/,
    );
    expect(source).toMatch(
      /onOpenDeliver=\{\(\) => \{\s*setAgentDockVisible\(false\);\s*setFilesDockVisible\(false\);\s*setDesignDockVisible\(false\);\s*setGitDockVisible\(false\);\s*onOpenDesignOs\("delivery"\);/,
    );
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

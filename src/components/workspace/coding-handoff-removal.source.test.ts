import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("workspace delivery boundary", () => {
  const source = readFileSync(
    join(process.cwd(), "src/components/workspace/IntentWorkspace.tsx"),
    "utf8",
  );

  it("does not advertise or execute a Coding handoff from the design workspace", () => {
    expect(source).not.toMatch(/CodingHandoff|coding-(?:preview|apply)|data-coding-status/);
    expect(source).not.toContain("@/coding-runtime/");
    expect(source).not.toContain("createManagedCodingWorkspace");
  });
});

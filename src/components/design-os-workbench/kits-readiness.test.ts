import { describe, expect, it } from "vitest";
import { projectKitsReadiness } from "./kits-readiness";
import type { DesignOsDeliverableItem } from "./DesignOsWorkbench";
const receipt = { id: "receipt:1", title: "Receipt", detail: "ok" },
  preview = { id: "preview:1", title: "Preview", detail: "ok" };
const item = (
  id: string,
  readiness: DesignOsDeliverableItem["readiness"],
  blockers: string[] = [],
  extra: Partial<DesignOsDeliverableItem> = {},
): DesignOsDeliverableItem => ({
  id,
  label: id,
  readiness,
  blockers,
  ...extra,
});
describe("kits readiness projection", () => {
  it("projects design, brand, or both and deduplicates user checklist language", () => {
    const repeated =
        "No explicit BrandKitDefinition is stored in this workspace revision.",
      result = projectKitsReadiness(
        [
          item("kit:design-system", "ready"),
          item("kit:brand", "blocked", [repeated, repeated]),
        ],
        "both",
      );
    expect(result).toMatchObject({
      target: "both",
      readiness: "blocked",
      nextAction: { kind: "prepare-brand" },
    });
    expect(result.checklist).toEqual([
      {
        id: expect.any(String),
        label: "Confirm the brand definition and its source evidence.",
        complete: false,
        hardGate: false,
      },
    ]);
    expect(result.advancedEvidence[1]).toMatchObject({
      kit: "brand",
      rawBlockers: [repeated, repeated],
    });
  });
  it("never bypasses license, provenance, governance, or brand lock gates", () => {
    for (const blocker of [
      "License evidence is missing.",
      "Provenance is missing.",
      "Governance checks failed.",
      "Brand lock is unresolved.",
    ]) {
      const result = projectKitsReadiness(
        [item("kit:design-system", "blocked", [blocker], { preview, receipt })],
        "design",
      );
      expect(result.nextAction.kind, blocker).toBe("resolve-governance");
      expect(result.checklist[0]?.hardGate, blocker).toBe(true);
      expect(result.nextAction.kind).not.toBe("export");
    }
  });
  it("prepares design before brand when both are incomplete", () => {
    const result = projectKitsReadiness(
      [
        item("kit:design-system", "blocked", ["Tokens missing"]),
        item("kit:brand", "blocked", ["Brand definition missing"]),
      ],
      "both",
    );
    expect(result.nextAction.kind).toBe("prepare-design");
  });
  it("moves ready kits through preview then export without exposing raw evidence in the primary checklist", () => {
    expect(
      projectKitsReadiness([item("kit:design-system", "ready")], "design")
        .nextAction.kind,
    ).toBe("preview");
    const ready = projectKitsReadiness(
      [item("kit:design-system", "ready", [], { preview })],
      "design",
    );
    expect(ready.nextAction.kind).toBe("export");
    expect(ready.checklist).toEqual([]);
    expect(ready.advancedEvidence[0]).toMatchObject({
      previewId: "preview:1",
      rawBlockers: [],
    });
  });
  it("is conservative for absent kit evidence", () => {
    expect(projectKitsReadiness([], "brand")).toMatchObject({
      readiness: "unavailable",
      nextAction: { kind: "prepare-brand" },
      advancedEvidence: [{ itemId: "kit:brand" }],
    });
  });
});

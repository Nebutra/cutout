import { describe, expect, it } from "vitest";
import type { WorkspaceWorkbenchTab } from "@/workspace/navigation";
import {
  DESIGN_OS_PROFILE_DESCRIPTORS,
  DESIGN_OS_WORKBENCH_SECTIONS,
  createDesignOsWorkbenchNavigationState,
  destinationForProfile,
  destinationForWorkbenchTab,
  reduceDesignOsWorkbenchNavigation,
} from "./workbench-navigation";

describe("Design OS workbench navigation", () => {
  it("defines one stable lifecycle and keeps Profiles out of global navigation", () => {
    expect(DESIGN_OS_WORKBENCH_SECTIONS).toEqual([
      "brief",
      "sources",
      "create",
      "review",
      "deliver",
      "inspect",
    ]);
    expect(DESIGN_OS_WORKBENCH_SECTIONS).not.toContain("commerce");
    expect(DESIGN_OS_WORKBENCH_SECTIONS).not.toContain("game-asset");
    expect(DESIGN_OS_PROFILE_DESCRIPTORS.map((profile) => profile.id)).toEqual([
      "product-uiux",
      "brand",
      "commerce",
      "game-asset",
      "motion",
    ]);
    expect(DESIGN_OS_PROFILE_DESCRIPTORS.at(-1)?.availability).toBe(
      "capability-required",
    );
  });

  it("maps every legacy destination into the lifecycle without losing context", () => {
    const expected = {
      overview: { section: "brief" },
      sources: { section: "sources" },
      commerce: {
        section: "create",
        profileId: "commerce",
        detail: "commerce",
      },
      "game-assets": {
        section: "create",
        profileId: "game-asset",
        detail: "game-assets",
      },
      specimen: {
        section: "create",
        profileId: "product-uiux",
        detail: "specimen",
      },
      figma: {
        section: "create",
        profileId: "product-uiux",
        detail: "figma",
      },
      delivery: { section: "deliver", detail: "delivery" },
      kits: { section: "deliver", detail: "kits" },
      components: { section: "deliver", detail: "components" },
      starter: { section: "deliver", detail: "starter" },
      workflows: { section: "inspect", detail: "workflows" },
    } satisfies Record<WorkspaceWorkbenchTab, unknown>;

    for (const [tab, destination] of Object.entries(expected)) {
      expect(destinationForWorkbenchTab(tab as WorkspaceWorkbenchTab)).toEqual(
        destination,
      );
    }
  });

  it("defaults Create to Product UI/UX and remembers contextual destinations", () => {
    let state = createDesignOsWorkbenchNavigationState("figma");
    expect(state.current).toEqual({
      section: "create",
      profileId: "product-uiux",
      detail: "figma",
    });
    state = reduceDesignOsWorkbenchNavigation(state, {
      type: "select-section",
      section: "review",
    });
    state = reduceDesignOsWorkbenchNavigation(state, {
      type: "select-section",
      section: "create",
    });
    expect(state.current).toEqual({
      section: "create",
      profileId: "product-uiux",
      detail: "figma",
    });
  });

  it("selects a Profile as a Create projection without changing Project mode", () => {
    const game = destinationForProfile("game-asset");
    expect(game).toEqual({
      section: "create",
      profileId: "game-asset",
      detail: "game-assets",
    });
    expect(game).not.toHaveProperty("mode");
    expect(game).not.toHaveProperty("installed");
  });
});

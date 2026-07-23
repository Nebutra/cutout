import { describe, expect, it } from "vitest";
import {
  defaultWorkspaceNavigation,
  enterWorkspaceSurface,
  legacyTabForNavigation,
  loadWorkspaceNavigation,
  migrateLegacyDesignOsView,
  migrateWorkspaceNavigation,
  projectDeliverReturnControl,
  projectWorkspaceOpenAction,
  projectWorkspaceSurface,
  returnFromDeliver,
  saveWorkspaceNavigation,
  type WorkspaceNavigation,
} from "./navigation";

function memory(initial: string | null = null) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
    read: () => value,
  };
}

describe("workspace navigation IA", () => {
  it("exposes only Agent, Canvas and Deliver as first-level modes", () => {
    for (const mode of ["agent", "canvas", "deliver"] as const) {
      const value: WorkspaceNavigation = { version: 2, mode };
      expect(migrateWorkspaceNavigation(value).mode).toBe(mode);
    }
    expect(migrateWorkspaceNavigation({ version: 2, mode: "dag" })).toEqual(
      defaultWorkspaceNavigation,
    );
  });

  it("migrates supported legacy Design OS tabs and retires developer tabs", () => {
    expect(migrateLegacyDesignOsView("overview")).toEqual(
      defaultWorkspaceNavigation,
    );
    expect(migrateLegacyDesignOsView("figma")).toMatchObject({
      mode: "canvas",
      inspector: "figma",
    });
    expect(migrateLegacyDesignOsView("delivery")).toMatchObject({
      mode: "deliver",
    });
    expect(migrateLegacyDesignOsView("kits")).toMatchObject({
      mode: "deliver",
      inspector: "kits",
    });
    for (const retired of ["dag", "ir", "receipts"] as const) {
      expect(migrateLegacyDesignOsView(retired)).toEqual(
        defaultWorkspaceNavigation,
      );
    }
  });

  it("drops old developer state and persists only the current schema", () => {
    expect(
      loadWorkspaceNavigation(
        memory(JSON.stringify({ designOsView: "components" })),
      ),
    ).toMatchObject({ version: 2, mode: "deliver", inspector: "components" });
    expect(
      loadWorkspaceNavigation(
        memory(
          JSON.stringify({
            version: 2,
            mode: "canvas",
            inspector: "receipts",
            advanced: true,
          }),
        ),
      ),
    ).toEqual(defaultWorkspaceNavigation);
    expect(
      loadWorkspaceNavigation(
        memory(
          JSON.stringify({
            version: 2,
            mode: "agent",
            inspector: "dag",
            advanced: true,
          }),
        ),
      ),
    ).toEqual(defaultWorkspaceNavigation);
    expect(
      loadWorkspaceNavigation(
        memory(JSON.stringify({ version: 2, mode: "agent", advanced: true })),
      ),
    ).toEqual({ version: 2, mode: "agent" });
    expect(loadWorkspaceNavigation(memory("{bad"))).toEqual(
      defaultWorkspaceNavigation,
    );

    const store = memory();
    saveWorkspaceNavigation(
      { version: 2, mode: "canvas", inspector: "figma" },
      store,
    );
    expect(JSON.parse(store.read()!)).toEqual({
      version: 2,
      mode: "canvas",
      inspector: "figma",
    });
  });

  it("maps the current IA back to existing workbench surfaces", () => {
    expect(legacyTabForNavigation({ version: 2, mode: "agent" })).toBe(
      "overview",
    );
    expect(
      legacyTabForNavigation({
        version: 2,
        mode: "canvas",
        inspector: "sources",
      }),
    ).toBe("sources");
    expect(
      legacyTabForNavigation({
        version: 2,
        mode: "deliver",
        inspector: "starter",
      }),
    ).toBe("starter");
  });
});

describe("workspace surface contract", () => {
  it("routes Deliver and Starter inline with matching titles", () => {
    expect(projectWorkspaceOpenAction("deliver")).toMatchObject({
      route: "deliver",
      surface: "inline-main",
      title: "Deliver",
      tab: "delivery",
    });
    expect(projectWorkspaceOpenAction("starter")).toMatchObject({
      route: "deliver",
      surface: "inline-main",
      title: "Starter",
      tab: "starter",
    });
  });

  it("keeps deliver tabs out of Canvas inspector", () => {
    expect(
      projectWorkspaceSurface({
        version: 2,
        mode: "canvas",
        inspector: "starter",
      }),
    ).toMatchObject({
      surface: "canvas-inspector",
      tab: "overview",
      title: "Canvas",
    });
    expect(
      projectWorkspaceSurface({
        version: 2,
        mode: "canvas",
        inspector: "figma",
      }),
    ).toMatchObject({
      surface: "canvas-inspector",
      tab: "figma",
      title: "System",
    });
  });
});

describe("Deliver return contract", () => {
  it("returns explicitly to the exact Canvas navigation without browser history", () => {
    const canvas = {
      version: 2,
      mode: "canvas",
      inspector: "figma",
    } as const;
    const entered = enterWorkspaceSurface({ current: canvas }, "starter");
    expect(entered).toMatchObject({
      current: { mode: "deliver", inspector: "starter" },
      returnTo: canvas,
    });
    expect(returnFromDeliver(entered)).toEqual({ current: canvas });
  });

  it("preserves an Agent return target through Deliver sub-tabs", () => {
    const agent = { version: 2, mode: "agent" } as const;
    const delivery = enterWorkspaceSurface({ current: agent }, "deliver");
    const starter = enterWorkspaceSurface(delivery, "starter");
    expect(starter.returnTo).toBe(agent);
    expect(returnFromDeliver(starter).current).toBe(agent);
    expect(projectDeliverReturnControl(starter)).toEqual({
      visible: true,
      label: "Back to Agent",
      placement: "top-bar",
      mobileLabel: "Back",
    });
  });

  it("falls back safely and never returns to Deliver recursively", () => {
    const deliver = { version: 2, mode: "deliver" } as const;
    expect(returnFromDeliver({ current: deliver })).toEqual({
      current: defaultWorkspaceNavigation,
    });
    expect(
      enterWorkspaceSurface({ current: deliver, returnTo: deliver }, "kits")
        .returnTo,
    ).toEqual(defaultWorkspaceNavigation);
    expect(
      projectDeliverReturnControl({ current: defaultWorkspaceNavigation })
        .visible,
    ).toBe(false);
  });
});

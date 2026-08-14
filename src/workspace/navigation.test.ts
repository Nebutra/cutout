import { describe, expect, it } from "vitest";
import {
  defaultWorkspaceNavigation,
  enterWorkspaceSurface,
  loadWorkspaceNavigation,
  navigationForWorkbenchTab,
  projectDeliverReturnControl,
  projectWorkspaceOpenAction,
  projectWorkspaceSurface,
  resolveWorkspaceNavigation,
  returnFromDeliver,
  saveWorkspaceNavigation,
  workbenchTabForNavigation,
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
  it("accepts only the current Agent, Canvas and Deliver schema", () => {
    for (const mode of ["agent", "canvas", "deliver"] as const) {
      const value: WorkspaceNavigation = { version: 2, mode };
      expect(resolveWorkspaceNavigation(value)).toEqual(value);
    }
    expect(resolveWorkspaceNavigation({ version: 2, mode: "dag" })).toEqual(
      defaultWorkspaceNavigation,
    );
    expect(resolveWorkspaceNavigation({ mode: "agent" })).toEqual(
      defaultWorkspaceNavigation,
    );
  });

  it("rejects retired persisted shapes instead of decoding them", () => {
    expect(
      loadWorkspaceNavigation(
        memory(JSON.stringify({ designOsView: "components" })),
      ),
    ).toEqual(defaultWorkspaceNavigation);
    expect(
      loadWorkspaceNavigation(
        memory(
          JSON.stringify({
            version: 2,
            mode: "canvas",
            inspector: "receipts",
          }),
        ),
      ),
    ).toEqual(defaultWorkspaceNavigation);
    expect(loadWorkspaceNavigation(memory("{bad"))).toEqual(
      defaultWorkspaceNavigation,
    );
  });

  it("round-trips only the current schema", () => {
    const store = memory();
    saveWorkspaceNavigation(
      { version: 2, mode: "canvas", inspector: "figma" },
      store,
    );
    expect(loadWorkspaceNavigation(store)).toEqual({
      version: 2,
      mode: "canvas",
      inspector: "figma",
    });
  });

  it("projects current workbench tabs without a second persisted shape", () => {
    for (const tab of [
      "overview",
      "sources",
      "commerce",
      "specimen",
      "figma",
      "workflows",
      "delivery",
      "kits",
      "components",
      "starter",
    ] as const) {
      expect(workbenchTabForNavigation(navigationForWorkbenchTab(tab))).toBe(
        tab,
      );
    }
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

  it("keeps deliver tabs out of the current Canvas schema", () => {
    const invalid = resolveWorkspaceNavigation({
      version: 2,
      mode: "canvas",
      inspector: "starter",
    });
    expect(invalid).toEqual(defaultWorkspaceNavigation);
    expect(projectWorkspaceSurface(invalid)).toMatchObject({
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

import { describe, expect, it } from "vitest";
import { workspaceSidebarRestore } from "./sidebar-restore";

describe("workspaceSidebarRestore", () => {
  it("hides restore while the rail is visible", () => {
    expect(
      workspaceSidebarRestore({ sidebarCollapsed: false, drawerOpen: true }),
    ).toEqual({ showRestore: false, reserveToolbarSlot: false });
    expect(
      workspaceSidebarRestore({ sidebarCollapsed: false, drawerOpen: false }),
    ).toEqual({ showRestore: false, reserveToolbarSlot: false });
  });

  it("keeps a shell restore on the drawer when only the rail is collapsed", () => {
    expect(
      workspaceSidebarRestore({ sidebarCollapsed: true, drawerOpen: true }),
    ).toEqual({ showRestore: true, reserveToolbarSlot: false });
  });

  it("reserves the canvas tool origin when rail and drawer are both gone", () => {
    expect(
      workspaceSidebarRestore({ sidebarCollapsed: true, drawerOpen: false }),
    ).toEqual({ showRestore: true, reserveToolbarSlot: true });
  });
});

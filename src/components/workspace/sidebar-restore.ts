export function workspaceSidebarRestore(input: {
  readonly sidebarCollapsed: boolean;
  readonly drawerOpen: boolean;
}): {
  readonly showRestore: boolean;
  readonly reserveToolbarSlot: boolean;
} {
  if (!input.sidebarCollapsed) {
    return { showRestore: false, reserveToolbarSlot: false };
  }
  return {
    showRestore: true,
    reserveToolbarSlot: !input.drawerOpen,
  };
}

import { z } from "zod";

export const WORKSPACE_NAVIGATION_KEY = "cutout.workspace-navigation.v2";
export const workspaceModeSchema = z.enum(["agent", "canvas", "deliver"]);
export type WorkspaceMode = z.infer<typeof workspaceModeSchema>;
export const legacyDesignOsViewSchema = z.enum([
  "overview",
  "delivery",
  "workflows",
  "sources",
  "specimen",
  "figma",
  "kits",
  "components",
  "starter",
  "dag",
  "ir",
  "receipts",
]);
export type LegacyDesignOsView = z.infer<typeof legacyDesignOsViewSchema>;
export const workspaceInspectorSchema = z.enum([
  "sources",
  "specimen",
  "figma",
  "workflows",
  "kits",
  "components",
  "starter",
]);
export type WorkspaceInspector = z.infer<typeof workspaceInspectorSchema>;
export const workspaceNavigationSchema = z
  .object({
    version: z.literal(2),
    mode: workspaceModeSchema,
    inspector: workspaceInspectorSchema.optional(),
  })
  .strict();
export type WorkspaceNavigation = z.infer<typeof workspaceNavigationSchema>;
export const defaultWorkspaceNavigation: WorkspaceNavigation = {
  version: 2,
  mode: "canvas",
};

export function migrateLegacyDesignOsView(
  view: LegacyDesignOsView,
): WorkspaceNavigation {
  if (view === "delivery")
    return { version: 2, mode: "deliver" };
  if (view === "kits" || view === "components" || view === "starter")
    return { version: 2, mode: "deliver", inspector: view };
  if (view === "overview")
    return defaultWorkspaceNavigation;
  if (view === "dag" || view === "ir" || view === "receipts")
    return defaultWorkspaceNavigation;
  return { version: 2, mode: "canvas", inspector: view };
}
export function migrateWorkspaceNavigation(
  input: unknown,
): WorkspaceNavigation {
  const current = workspaceNavigationSchema.safeParse(input);
  if (current.success) return current.data;
  if (typeof input === "string") {
    const legacy = legacyDesignOsViewSchema.safeParse(input);
    if (legacy.success) return migrateLegacyDesignOsView(legacy.data);
  }
  if (input && typeof input === "object") {
    const record = input as Record<string, unknown>,
      legacy = legacyDesignOsViewSchema.safeParse(
        record.designOsView ?? record.tab ?? record.view,
      );
    if (legacy.success) return migrateLegacyDesignOsView(legacy.data);
    const oldMode = workspaceModeSchema.safeParse(record.mode);
    if (oldMode.success) {
      const oldInspector = legacyDesignOsViewSchema.safeParse(record.inspector);
      if (
        oldInspector.success &&
        (oldInspector.data === "dag" ||
          oldInspector.data === "ir" ||
          oldInspector.data === "receipts")
      ) {
        return defaultWorkspaceNavigation;
      }
      const currentInspector = workspaceInspectorSchema.safeParse(
        record.inspector,
      );
      if (currentInspector.success) {
        return {
          version: 2,
          mode: oldMode.data,
          inspector: currentInspector.data,
        };
      }
      return { version: 2, mode: oldMode.data };
    }
  }
  return defaultWorkspaceNavigation;
}
export function loadWorkspaceNavigation(storage?: Pick<Storage, "getItem">) {
  try {
    const raw = (
      storage ?? globalThis.document?.defaultView?.localStorage
    )?.getItem(WORKSPACE_NAVIGATION_KEY);
    return raw
      ? migrateWorkspaceNavigation(JSON.parse(raw))
      : defaultWorkspaceNavigation;
  } catch {
    return defaultWorkspaceNavigation;
  }
}
export function saveWorkspaceNavigation(
  value: WorkspaceNavigation,
  storage?: Pick<Storage, "setItem">,
) {
  const parsed = workspaceNavigationSchema.parse(value),
    host = storage ?? globalThis.document?.defaultView?.localStorage;
  if (!host) throw new Error("Workspace navigation storage is unavailable.");
  host.setItem(WORKSPACE_NAVIGATION_KEY, JSON.stringify(parsed));
}

export function legacyTabForNavigation(
  value: WorkspaceNavigation,
): Exclude<LegacyDesignOsView, "dag" | "ir" | "receipts"> {
  if (value.mode === "deliver")
    return value.inspector &&
      ["kits", "components", "starter"].includes(value.inspector)
      ? (value.inspector as "kits" | "components" | "starter")
      : "delivery";
  if (
    value.inspector &&
    ["sources", "specimen", "figma", "workflows"].includes(value.inspector)
  )
    return value.inspector as "sources" | "specimen" | "figma" | "workflows";
  return "overview";
}

export type WorkspaceOpenAction = "canvas" | "system" | "deliver" | "kits" | "components" | "starter";
export interface WorkspaceSurfaceProjection {
  readonly route: WorkspaceMode;
  readonly surface: "inline-main" | "canvas-inspector";
  readonly title: string;
  readonly tab: Exclude<LegacyDesignOsView, "dag" | "ir" | "receipts">;
}

/** UI-only routing contract. It never grants capabilities or changes policy. */
export function projectWorkspaceOpenAction(action: WorkspaceOpenAction): WorkspaceSurfaceProjection {
  if (["deliver", "kits", "components", "starter"].includes(action)) {
    const tab = action === "deliver" ? "delivery" : action as "kits" | "components" | "starter";
    return { route: "deliver", surface: "inline-main", title: action === "deliver" ? "Deliver" : action[0]!.toUpperCase() + action.slice(1), tab };
  }
  return { route: "canvas", surface: "canvas-inspector", title: action === "system" ? "System" : "Canvas", tab: "overview" };
}

export function projectWorkspaceSurface(navigation: WorkspaceNavigation): WorkspaceSurfaceProjection {
  if (navigation.mode === "deliver") {
    const action = navigation.inspector === "kits" || navigation.inspector === "components" || navigation.inspector === "starter" ? navigation.inspector : "deliver";
    return projectWorkspaceOpenAction(action);
  }
  const tab = navigation.inspector && ["sources", "figma", "workflows"].includes(navigation.inspector) ? navigation.inspector as "sources" | "figma" | "workflows" : "overview";
  return { route: navigation.mode, surface: "canvas-inspector", title: tab === "overview" ? "Canvas" : "System", tab };
}

export interface WorkspaceNavigationSession {
  readonly current: WorkspaceNavigation;
  readonly returnTo?: WorkspaceNavigation;
}

/** Enter an inline surface without relying on browser history. */
export function enterWorkspaceSurface(session: WorkspaceNavigationSession, action: WorkspaceOpenAction): WorkspaceNavigationSession {
  const projection = projectWorkspaceOpenAction(action)
  if (projection.surface !== "inline-main") return { ...session, current: migrateLegacyDesignOsView(projection.tab as LegacyDesignOsView) }
  const current = migrateLegacyDesignOsView(projection.tab as LegacyDesignOsView)
  const returnTo = session.current.mode === "deliver" ? session.returnTo : session.current
  return { current, returnTo: returnTo?.mode === "deliver" ? defaultWorkspaceNavigation : returnTo }
}

/** Return from Deliver while preserving the prior Canvas or Agent navigation. */
export function returnFromDeliver(session: WorkspaceNavigationSession): WorkspaceNavigationSession {
  if (session.current.mode !== "deliver") return session
  return { current: session.returnTo?.mode !== "deliver" ? session.returnTo ?? defaultWorkspaceNavigation : defaultWorkspaceNavigation }
}

export function projectDeliverReturnControl(session: WorkspaceNavigationSession) {
  const target = session.returnTo?.mode === "agent" ? "Agent" : "Canvas"
  return { visible: session.current.mode === "deliver", label: `Back to ${target}`, placement: "top-bar" as const, mobileLabel: "Back" }
}

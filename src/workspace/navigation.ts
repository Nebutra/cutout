import { z } from "zod";

export const WORKSPACE_NAVIGATION_KEY = "cutout.workspace-navigation.v2";
export const WORKSPACE_NAVIGATION_EVENT = "cutout:workspace-navigation";
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
  "dag",
  "ir",
  "receipts",
]);
export type WorkspaceInspector = z.infer<typeof workspaceInspectorSchema>;
export const workspaceNavigationSchema = z
  .object({
    version: z.literal(2),
    mode: workspaceModeSchema,
    inspector: workspaceInspectorSchema.optional(),
    advanced: z.boolean().default(false),
  })
  .strict();
export type WorkspaceNavigation = z.infer<typeof workspaceNavigationSchema>;
export const defaultWorkspaceNavigation: WorkspaceNavigation = {
  version: 2,
  mode: "canvas",
  advanced: false,
};
const advancedInspectors = new Set<WorkspaceInspector>([
  "dag",
  "ir",
  "receipts",
]);

export function migrateLegacyDesignOsView(
  view: LegacyDesignOsView,
): WorkspaceNavigation {
  if (view === "delivery")
    return { version: 2, mode: "deliver", advanced: false };
  if (view === "kits" || view === "components" || view === "starter")
    return { version: 2, mode: "deliver", inspector: view, advanced: false };
  if (view === "overview")
    return { version: 2, mode: "canvas", advanced: false };
  if (view === "dag" || view === "ir" || view === "receipts")
    return { version: 2, mode: "canvas", advanced: true, inspector: view };
  return { version: 2, mode: "canvas", inspector: view, advanced: false };
}
export function migrateWorkspaceNavigation(
  input: unknown,
): WorkspaceNavigation {
  const current = workspaceNavigationSchema.safeParse(input);
  if (current.success) return sanitize(current.data);
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
    if (oldMode.success)
      return sanitize({ version: 2, mode: oldMode.data, advanced: false });
  }
  return defaultWorkspaceNavigation;
}
function sanitize(value: WorkspaceNavigation): WorkspaceNavigation {
  return value.inspector &&
    advancedInspectors.has(value.inspector) &&
    !value.advanced
    ? { version: 2, mode: value.mode, advanced: false }
    : value;
}
export function isInspectorVisible(
  inspector: WorkspaceInspector,
  navigation: WorkspaceNavigation,
) {
  return !advancedInspectors.has(inspector) || navigation.advanced;
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
  host.setItem(WORKSPACE_NAVIGATION_KEY, JSON.stringify(sanitize(parsed)));
}
export function setDeveloperMode(
  enabled: boolean,
  storage?: Pick<Storage, "getItem" | "setItem">,
) {
  const current = loadWorkspaceNavigation(storage),
    next = {
      ...current,
      advanced: enabled,
      ...(!enabled &&
      current.inspector &&
      advancedInspectors.has(current.inspector)
        ? { inspector: undefined }
        : {}),
    };
  saveWorkspaceNavigation(next, storage);
  globalThis.document?.defaultView?.dispatchEvent(
    new CustomEvent(WORKSPACE_NAVIGATION_EVENT, { detail: next }),
  );
  return next;
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

export type WorkspaceOpenAction = "canvas" | "system" | "deliver" | "kits" | "components" | "starter" | "developer";
export interface WorkspaceSurfaceProjection {
  readonly route: WorkspaceMode;
  readonly surface: "inline-main" | "canvas-inspector" | "developer-dialog";
  readonly title: string;
  readonly tab: Exclude<LegacyDesignOsView, "dag" | "ir" | "receipts"> | "dag" | "ir" | "receipts";
  readonly exposeAxeHostStatus: boolean;
}

/** UI-only routing contract. It never grants capabilities or changes policy. */
export function projectWorkspaceOpenAction(action: WorkspaceOpenAction): WorkspaceSurfaceProjection {
  if (["deliver", "kits", "components", "starter"].includes(action)) {
    const tab = action === "deliver" ? "delivery" : action as "kits" | "components" | "starter";
    return { route: "deliver", surface: "inline-main", title: action === "deliver" ? "Deliver" : action[0]!.toUpperCase() + action.slice(1), tab, exposeAxeHostStatus: false };
  }
  if (action === "developer") return { route: "canvas", surface: "developer-dialog", title: "Developer audit", tab: "receipts", exposeAxeHostStatus: true };
  return { route: "canvas", surface: "canvas-inspector", title: action === "system" ? "System" : "Canvas", tab: "overview", exposeAxeHostStatus: false };
}

export function projectWorkspaceSurface(navigation: WorkspaceNavigation): WorkspaceSurfaceProjection {
  if (navigation.mode === "deliver") {
    const action = navigation.inspector === "kits" || navigation.inspector === "components" || navigation.inspector === "starter" ? navigation.inspector : "deliver";
    return projectWorkspaceOpenAction(action);
  }
  if (navigation.advanced && navigation.inspector && advancedInspectors.has(navigation.inspector)) return { route: "canvas", surface: "developer-dialog", title: "Developer audit", tab: navigation.inspector, exposeAxeHostStatus: true };
  const tab = navigation.inspector && ["sources", "figma", "workflows"].includes(navigation.inspector) ? navigation.inspector as "sources" | "figma" | "workflows" : "overview";
  return { route: navigation.mode, surface: "canvas-inspector", title: tab === "overview" ? "Canvas" : "System", tab, exposeAxeHostStatus: false };
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
  return { current, returnTo: returnTo?.mode === "deliver" ? { version: 2, mode: "canvas", advanced: false } : returnTo }
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

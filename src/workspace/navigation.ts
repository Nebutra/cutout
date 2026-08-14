import { z } from "zod";

export const WORKSPACE_NAVIGATION_KEY = "cutout.workspace-navigation.v2";
export const workspaceModeSchema = z.enum(["agent", "canvas", "deliver"]);
export type WorkspaceMode = z.infer<typeof workspaceModeSchema>;

export const workspaceInspectorSchema = z.enum([
  "sources",
  "commerce",
  "game-assets",
  "specimen",
  "figma",
  "workflows",
  "kits",
  "components",
  "starter",
]);
export type WorkspaceInspector = z.infer<typeof workspaceInspectorSchema>;

const systemInspectorSchema = z.enum([
  "sources",
  "commerce",
  "game-assets",
  "specimen",
  "figma",
  "workflows",
]);
const deliverInspectorSchema = z.enum(["kits", "components", "starter"]);

export const workspaceNavigationSchema = z.discriminatedUnion("mode", [
  z.object({ version: z.literal(2), mode: z.literal("agent") }).strict(),
  z
    .object({
      version: z.literal(2),
      mode: z.literal("canvas"),
      inspector: systemInspectorSchema.optional(),
    })
    .strict(),
  z
    .object({
      version: z.literal(2),
      mode: z.literal("deliver"),
      inspector: deliverInspectorSchema.optional(),
    })
    .strict(),
]);
export type WorkspaceNavigation = z.infer<typeof workspaceNavigationSchema>;

export const defaultWorkspaceNavigation: WorkspaceNavigation = {
  version: 2,
  mode: "canvas",
};

/** Resolve only the current persisted schema; invalid input starts clean. */
export function resolveWorkspaceNavigation(input: unknown): WorkspaceNavigation {
  const parsed = workspaceNavigationSchema.safeParse(input);
  return parsed.success ? parsed.data : defaultWorkspaceNavigation;
}

export function loadWorkspaceNavigation(storage?: Pick<Storage, "getItem">) {
  try {
    const raw = (
      storage ?? globalThis.document?.defaultView?.localStorage
    )?.getItem(WORKSPACE_NAVIGATION_KEY);
    return raw
      ? resolveWorkspaceNavigation(JSON.parse(raw))
      : defaultWorkspaceNavigation;
  } catch {
    return defaultWorkspaceNavigation;
  }
}

export function saveWorkspaceNavigation(
  value: WorkspaceNavigation,
  storage?: Pick<Storage, "setItem">,
) {
  const parsed = workspaceNavigationSchema.parse(value);
  const host = storage ?? globalThis.document?.defaultView?.localStorage;
  if (!host) throw new Error("Workspace navigation storage is unavailable.");
  host.setItem(WORKSPACE_NAVIGATION_KEY, JSON.stringify(parsed));
}

export const workspaceWorkbenchTabSchema = z.enum([
  "overview",
  "delivery",
  "workflows",
  "sources",
  "commerce",
  "game-assets",
  "specimen",
  "figma",
  "kits",
  "components",
  "starter",
]);
export type WorkspaceWorkbenchTab = z.infer<typeof workspaceWorkbenchTabSchema>;

export function navigationForWorkbenchTab(
  tab: WorkspaceWorkbenchTab,
): WorkspaceNavigation {
  if (tab === "delivery") return { version: 2, mode: "deliver" };
  if (tab === "kits" || tab === "components" || tab === "starter") {
    return { version: 2, mode: "deliver", inspector: tab };
  }
  if (tab === "overview") return defaultWorkspaceNavigation;
  return { version: 2, mode: "canvas", inspector: tab };
}

export function workbenchTabForNavigation(
  value: WorkspaceNavigation,
): WorkspaceWorkbenchTab {
  if (value.mode === "deliver") {
    return value.inspector === "kits" ||
      value.inspector === "components" ||
      value.inspector === "starter"
      ? value.inspector
      : "delivery";
  }
  if (value.mode === "agent") return "overview";
  return value.inspector === "sources" ||
    value.inspector === "commerce" ||
    value.inspector === "game-assets" ||
    value.inspector === "specimen" ||
    value.inspector === "figma" ||
    value.inspector === "workflows"
    ? value.inspector
    : "overview";
}

export type WorkspaceOpenAction =
  | "canvas"
  | "system"
  | "deliver"
  | "kits"
  | "components"
  | "starter";

export interface WorkspaceSurfaceProjection {
  readonly route: WorkspaceMode;
  readonly surface: "inline-main" | "canvas-inspector";
  readonly title: string;
  readonly tab: WorkspaceWorkbenchTab;
}

/** UI-only routing contract. It never grants capabilities or changes policy. */
export function projectWorkspaceOpenAction(
  action: WorkspaceOpenAction,
): WorkspaceSurfaceProjection {
  if (
    action === "deliver" ||
    action === "kits" ||
    action === "components" ||
    action === "starter"
  ) {
    const tab = action === "deliver" ? "delivery" : action;
    return {
      route: "deliver",
      surface: "inline-main",
      title:
        action === "deliver"
          ? "Deliver"
          : action[0]!.toUpperCase() + action.slice(1),
      tab,
    };
  }
  return {
    route: "canvas",
    surface: "canvas-inspector",
    title: action === "system" ? "System" : "Canvas",
    tab: "overview",
  };
}

export function projectWorkspaceSurface(
  navigation: WorkspaceNavigation,
): WorkspaceSurfaceProjection {
  if (navigation.mode === "deliver") {
    const action =
      navigation.inspector === "kits" ||
      navigation.inspector === "components" ||
      navigation.inspector === "starter"
        ? navigation.inspector
        : "deliver";
    return projectWorkspaceOpenAction(action);
  }
  const tab = workbenchTabForNavigation(navigation);
  return {
    route: navigation.mode,
    surface: "canvas-inspector",
    title: tab === "overview" ? "Canvas" : "System",
    tab,
  };
}

export interface WorkspaceNavigationSession {
  readonly current: WorkspaceNavigation;
  readonly returnTo?: WorkspaceNavigation;
}

/** Enter an inline surface without relying on browser history. */
export function enterWorkspaceSurface(
  session: WorkspaceNavigationSession,
  action: WorkspaceOpenAction,
): WorkspaceNavigationSession {
  const projection = projectWorkspaceOpenAction(action);
  const current = navigationForWorkbenchTab(projection.tab);
  if (projection.surface !== "inline-main") {
    return { ...session, current };
  }
  const returnTo =
    session.current.mode === "deliver" ? session.returnTo : session.current;
  return {
    current,
    returnTo:
      returnTo?.mode === "deliver" ? defaultWorkspaceNavigation : returnTo,
  };
}

/** Return from Deliver while preserving the prior Canvas or Agent navigation. */
export function returnFromDeliver(
  session: WorkspaceNavigationSession,
): WorkspaceNavigationSession {
  if (session.current.mode !== "deliver") return session;
  return {
    current:
      session.returnTo?.mode !== "deliver"
        ? (session.returnTo ?? defaultWorkspaceNavigation)
        : defaultWorkspaceNavigation,
  };
}

export function projectDeliverReturnControl(
  session: WorkspaceNavigationSession,
) {
  const target = session.returnTo?.mode === "agent" ? "Agent" : "Canvas";
  return {
    visible: session.current.mode === "deliver",
    label: `Back to ${target}`,
    placement: "top-bar" as const,
    mobileLabel: "Back",
  };
}

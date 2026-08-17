import type { WorkspaceWorkbenchTab } from "@/workspace/navigation";

export const DESIGN_OS_WORKBENCH_SECTIONS = [
  "brief",
  "sources",
  "create",
  "review",
  "deliver",
  "inspect",
] as const;

export type DesignOsWorkbenchSection =
  (typeof DESIGN_OS_WORKBENCH_SECTIONS)[number];

export const DESIGN_OS_PROFILE_IDS = [
  "product-uiux",
  "brand",
  "commerce",
  "game-asset",
  "motion",
] as const;

export type DesignOsProfileId = (typeof DESIGN_OS_PROFILE_IDS)[number];

export interface DesignOsProfileDescriptor {
  readonly id: DesignOsProfileId;
  readonly label: string;
  readonly availability: "available" | "capability-required";
}

export const DESIGN_OS_PROFILE_DESCRIPTORS = [
  { id: "product-uiux", label: "Product UI/UX", availability: "available" },
  { id: "brand", label: "Brand", availability: "available" },
  { id: "commerce", label: "Commerce", availability: "available" },
  { id: "game-asset", label: "Game Asset", availability: "available" },
  { id: "motion", label: "Motion", availability: "capability-required" },
] as const satisfies readonly DesignOsProfileDescriptor[];

export type DesignOsCreateDetail =
  | "canvas"
  | "specimen"
  | "figma"
  | "brand"
  | "commerce"
  | "game-assets"
  | "motion";
export type DesignOsDeliverDetail =
  | "delivery"
  | "kits"
  | "components"
  | "starter";
export type DesignOsInspectDetail = "system" | "workflows" | "commerce-benchmark";

export type DesignOsWorkbenchDestination =
  | { readonly section: "brief" }
  | { readonly section: "sources" }
  | {
      readonly section: "create";
      readonly profileId: DesignOsProfileId;
      readonly detail: DesignOsCreateDetail;
    }
  | { readonly section: "review" }
  | {
      readonly section: "deliver";
      readonly detail: DesignOsDeliverDetail;
    }
  | {
      readonly section: "inspect";
      readonly detail: DesignOsInspectDetail;
    };

export function defaultDestinationForSection(
  section: DesignOsWorkbenchSection,
): DesignOsWorkbenchDestination {
  switch (section) {
    case "brief":
      return { section };
    case "sources":
      return { section };
    case "create":
      return {
        section,
        profileId: "product-uiux",
        detail: "canvas",
      };
    case "review":
      return { section };
    case "deliver":
      return { section, detail: "delivery" };
    case "inspect":
      return { section, detail: "system" };
  }
}

export function destinationForProfile(
  profileId: DesignOsProfileId,
): Extract<DesignOsWorkbenchDestination, { section: "create" }> {
  switch (profileId) {
    case "product-uiux":
      return { section: "create", profileId, detail: "canvas" };
    case "brand":
      return { section: "create", profileId, detail: "brand" };
    case "commerce":
      return { section: "create", profileId, detail: "commerce" };
    case "game-asset":
      return { section: "create", profileId, detail: "game-assets" };
    case "motion":
      return { section: "create", profileId, detail: "motion" };
  }
}

export function destinationForWorkbenchTab(
  tab: WorkspaceWorkbenchTab,
): DesignOsWorkbenchDestination {
  switch (tab) {
    case "overview":
      return { section: "brief" };
    case "sources":
      return { section: "sources" };
    case "commerce":
      return destinationForProfile("commerce");
    case "game-assets":
      return destinationForProfile("game-asset");
    case "specimen":
      return {
        section: "create",
        profileId: "product-uiux",
        detail: "specimen",
      };
    case "figma":
      return {
        section: "create",
        profileId: "product-uiux",
        detail: "figma",
      };
    case "delivery":
    case "kits":
    case "components":
    case "starter":
      return { section: "deliver", detail: tab };
    case "workflows":
      return { section: "inspect", detail: "workflows" };
  }
}

export interface DesignOsWorkbenchNavigationState {
  readonly current: DesignOsWorkbenchDestination;
  readonly remembered: Readonly<
    Partial<Record<DesignOsWorkbenchSection, DesignOsWorkbenchDestination>>
  >;
}

export type DesignOsWorkbenchNavigationAction =
  | {
      readonly type: "select-section";
      readonly section: DesignOsWorkbenchSection;
    }
  | {
      readonly type: "navigate";
      readonly destination: DesignOsWorkbenchDestination;
    }
  | { readonly type: "sync-legacy-tab"; readonly tab: WorkspaceWorkbenchTab };

export function createDesignOsWorkbenchNavigationState(
  tab: WorkspaceWorkbenchTab,
): DesignOsWorkbenchNavigationState {
  const current = destinationForWorkbenchTab(tab);
  return {
    current,
    remembered: { [current.section]: current },
  };
}

export function reduceDesignOsWorkbenchNavigation(
  state: DesignOsWorkbenchNavigationState,
  action: DesignOsWorkbenchNavigationAction,
): DesignOsWorkbenchNavigationState {
  switch (action.type) {
    case "select-section": {
      const destination =
        state.remembered[action.section] ??
        defaultDestinationForSection(action.section);
      return { ...state, current: destination };
    }
    case "navigate":
      return {
        current: action.destination,
        remembered: {
          ...state.remembered,
          [action.destination.section]: action.destination,
        },
      };
    case "sync-legacy-tab":
      return createDesignOsWorkbenchNavigationState(action.tab);
  }
}

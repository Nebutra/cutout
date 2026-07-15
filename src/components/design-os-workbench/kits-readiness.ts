import type {
  DesignOsDeliverableItem,
  DesignOsReadiness,
} from "./DesignOsWorkbench";
export type KitsTarget = "design" | "brand" | "both";
type KitsNextActionKind =
  | "prepare-design"
  | "prepare-brand"
  | "resolve-governance"
  | "preview"
  | "export";
export interface KitsReadinessSummary {
  readonly target: KitsTarget;
  readonly readiness: DesignOsReadiness;
  readonly checklist: readonly {
    readonly id: string;
    readonly label: string;
    readonly complete: false;
    readonly hardGate: boolean;
  }[];
  readonly nextAction: {
    readonly kind: KitsNextActionKind;
    readonly label: string;
  };
  readonly advancedEvidence: readonly {
    readonly kit: "design" | "brand";
    readonly itemId: string;
    readonly readiness: DesignOsReadiness;
    readonly rawBlockers: readonly string[];
    readonly previewId?: string;
    readonly receiptId?: string;
  }[];
}
const ids = { design: "kit:design-system", brand: "kit:brand" } as const;
export function projectKitsReadiness(
  items: readonly DesignOsDeliverableItem[],
  target: KitsTarget,
): KitsReadinessSummary {
  const byId = new Map(items.map((item) => [item.id, item])),
    kits =
      target === "both" ? (["design", "brand"] as const) : ([target] as const),
    selected = kits.map((kit) => ({ kit, item: byId.get(ids[kit]) })),
    raw = selected.flatMap(({ item }) => item?.blockers ?? []),
    checklist = [
      ...new Map(
        raw.map((blocker) => {
          const label = userBlocker(blocker);
          return [
            label.toLowerCase(),
            {
              id: `check:${safe(label)}`,
              label,
              complete: false as const,
              hardGate: isHardGate(blocker),
            },
          ];
        }),
      ).values(),
    ],
    readiness = combine(
      selected.map(({ item }) => item?.readiness ?? "unavailable"),
    ),
    hard = raw.some(isHardGate);
  let nextAction: KitsReadinessSummary["nextAction"];
  if (hard)
    nextAction = {
      kind: "resolve-governance",
      label:
        "Resolve license, provenance, governance, or brand lock requirements",
    };
  else if (
    selected.some(
      ({ kit, item }) => kit === "design" && item?.readiness !== "ready",
    )
  )
    nextAction = {
      kind: "prepare-design",
      label: "Prepare the Design System Kit",
    };
  else if (
    selected.some(
      ({ kit, item }) => kit === "brand" && item?.readiness !== "ready",
    )
  )
    nextAction = { kind: "prepare-brand", label: "Prepare the Brand VI Kit" };
  else if (selected.some(({ item }) => !item?.preview && !item?.receipt))
    nextAction = {
      kind: "preview",
      label: `Preview ${target === "both" ? "both kits" : "the kit"}`,
    };
  else
    nextAction = {
      kind: "export",
      label: `Export ${target === "both" ? "both kits" : "the kit"}`,
    };
  return {
    target,
    readiness,
    checklist,
    nextAction,
    advancedEvidence: selected.map(({ kit, item }) => ({
      kit,
      itemId: item?.id ?? ids[kit],
      readiness: item?.readiness ?? "unavailable",
      rawBlockers: item?.blockers ?? [],
      ...(item?.preview ? { previewId: item.preview.id } : {}),
      ...(item?.receipt ? { receiptId: item.receipt.id } : {}),
    })),
  };
}
function combine(values: readonly DesignOsReadiness[]): DesignOsReadiness {
  if (values.every((value) => value === "ready")) return "ready";
  if (values.some((value) => value === "blocked")) return "blocked";
  if (values.some((value) => value === "pending")) return "pending";
  return "unavailable";
}
function isHardGate(value: string) {
  return /(?:license|provenance|governance|brand\s*lock|locked\s*brand|source\s*evidence)/i.test(
    value,
  );
}
function userBlocker(value: string) {
  if (/BrandKitDefinition/i.test(value))
    return "Confirm the brand definition and its source evidence.";
  if (/Design Kit/i.test(value) && /missing|no /i.test(value))
    return "Prepare the Design System Kit for this revision.";
  if (/license/i.test(value))
    return "Confirm that every source has an allowed license.";
  if (/provenance|source evidence/i.test(value))
    return "Attach provenance evidence to every generated or imported asset.";
  if (/governance/i.test(value))
    return "Resolve the blocking design governance findings.";
  if (/brand\s*lock|locked\s*brand/i.test(value))
    return "Resolve the locked brand decision before generating kits.";
  return value.trim().replace(/\s+/g, " ");
}
function safe(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "requirement"
  );
}

/**
 * Areas-of-work vocabulary for the first-run onboarding modal.
 *
 * The six areas mirror the Home composer presets one-for-one and deliberately
 * REUSE their lingui ids, so onboarding owes zero new label translations and
 * can never drift into a second product taxonomy. Declared locally on purpose:
 * `ProjectHome.tsx` owns its own copy and this module must never import from
 * it, so the two surfaces stay independently editable.
 *
 * The selection is capped at three. The cap is the whole reason the dialog
 * shows an "n of 3" counter — it is a real constraint, not decoration.
 *
 * CONSUMPTION IS INERT: the stored selection may reorder or prefill UI and
 * nothing else. It must never install, enable, gate or route a Design Profile
 * (see `src/design-profile-platform/scenario-routing.ts`).
 */
import {
  Blocks,
  Globe,
  Images,
  Monitor,
  Palette,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import { z } from "zod";

export const WORK_AREA_IDS = [
  "web",
  "mobile",
  "miniapp",
  "desktop",
  "brand",
  "poster",
] as const;

export type WorkAreaId = (typeof WORK_AREA_IDS)[number];

export const workAreaIdSchema = z.enum(WORK_AREA_IDS);

/** Selection cap. The reference's "n / 3" counter is grounded in this. */
export const WORK_AREA_CAP = 3;

/** Same lucide glyphs the Home composer presets use, keyed by area id. */
export const WORK_AREA_ICONS: Record<WorkAreaId, LucideIcon> = {
  web: Globe,
  mobile: Smartphone,
  miniapp: Blocks,
  desktop: Monitor,
  brand: Palette,
  poster: Images,
};

/**
 * Toggle an area, honouring the cap.
 *
 * Deselecting always works. Selecting past `WORK_AREA_CAP` is a no-op — the UI
 * additionally disables over-cap tiles, so this is the belt to that braces.
 * Order is preserved (selection order), which is what any future "surface my
 * areas first" ordering would read.
 */
export function toggleWorkArea(
  selected: readonly WorkAreaId[],
  id: WorkAreaId,
): readonly WorkAreaId[] {
  if (selected.includes(id)) return selected.filter((value) => value !== id);
  if (selected.length >= WORK_AREA_CAP) return selected;
  return [...selected, id];
}

/** True when the tile must render `disabled` (over cap, not already chosen). */
export function isWorkAreaBlocked(
  selected: readonly WorkAreaId[],
  id: WorkAreaId,
): boolean {
  return !selected.includes(id) && selected.length >= WORK_AREA_CAP;
}

/** De-duplicate, drop unknown ids and clamp to the cap. */
export function normalizeWorkAreas(
  areas: readonly string[],
): readonly WorkAreaId[] {
  const seen = new Set<WorkAreaId>();
  for (const area of areas) {
    const parsed = workAreaIdSchema.safeParse(area);
    if (!parsed.success) continue;
    seen.add(parsed.data);
    if (seen.size >= WORK_AREA_CAP) break;
  }
  return [...seen];
}

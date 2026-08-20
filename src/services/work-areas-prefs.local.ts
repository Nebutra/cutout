/**
 * Persisted "areas of work" selection.
 *
 * A NEW, versioned sibling key — never a schema change. It mirrors
 * `src/workspace/navigation.ts` (versioned `cutout.*.vN` localStorage key,
 * strict Zod schema, safe default on invalid input) rather than
 * `personalizationSettingsSchema`, which is `.strict()` on
 * `version: z.literal(1)` and has a test rejecting retired aliases.
 *
 * localStorage (not the plugin-store) is deliberate: the startup gate has to
 * run synchronously inside a `useEffect`, exactly the way
 * `src/updater/release-notes.ts` does.
 */
import { z } from "zod";
import {
  WORK_AREA_CAP,
  normalizeWorkAreas,
  workAreaIdSchema,
  type WorkAreaId,
} from "@/components/onboarding/areas-of-work";

export const WORK_AREAS_STORAGE_KEY = "cutout.work-areas.v1";

const STATE_PROTOCOL = "cutout.work-areas.v1";

const workAreasStateSchema = z
  .object({
    protocol: z.literal(STATE_PROTOCOL),
    /** Selection order is meaningful; the cap is enforced on read and write. */
    areas: z.array(workAreaIdSchema).max(WORK_AREA_CAP),
    /** True once the user has confirmed or skipped the onboarding step. */
    acknowledged: z.boolean(),
  })
  .strict();

export type WorkAreasStateV1 = z.infer<typeof workAreasStateSchema>;

export const DEFAULT_WORK_AREAS_STATE: WorkAreasStateV1 = {
  protocol: STATE_PROTOCOL,
  areas: [],
  acknowledged: false,
};

export type WorkAreasStorage = Pick<Storage, "getItem" | "setItem">;

/** Read persisted state. Missing/invalid/unavailable → `undefined`. */
export function readWorkAreasState(
  storage: Pick<Storage, "getItem">,
): WorkAreasStateV1 | undefined {
  try {
    const raw = storage.getItem(WORK_AREAS_STORAGE_KEY);
    if (raw == null) return undefined;
    const parsed = workAreasStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

function writeWorkAreasState(
  storage: Pick<Storage, "setItem">,
  state: WorkAreasStateV1,
): void {
  try {
    storage.setItem(WORK_AREAS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Onboarding state is optional UI state and must never block startup.
  }
}

/** Persist a confirmed (or skipped, i.e. empty) selection. */
export function saveWorkAreas(
  storage: WorkAreasStorage,
  areas: readonly string[],
): WorkAreasStateV1 {
  const state: WorkAreasStateV1 = {
    protocol: STATE_PROTOCOL,
    areas: [...normalizeWorkAreas(areas)],
    acknowledged: true,
  };
  writeWorkAreasState(storage, state);
  return state;
}

/** The stored selection, or an empty list. Safe on a cold/corrupt store. */
export function selectedWorkAreas(
  storage: Pick<Storage, "getItem">,
): readonly WorkAreaId[] {
  return readWorkAreasState(storage)?.areas ?? DEFAULT_WORK_AREAS_STATE.areas;
}

export type WorkAreasLifecycleDecision = {
  readonly shouldOpen: boolean;
  readonly state: WorkAreasStateV1;
};

/**
 * Startup gate, mirroring `initializeReleaseNotesLifecycle`.
 *
 * On a cold profile it SEEDS the key and returns `shouldOpen: false`, so a
 * first run never gets a blocking overlay — every Playwright run uses a fresh
 * BrowserContext, i.e. every run is a first run.
 *
 * It currently returns `shouldOpen: false` unconditionally: the trigger policy
 * (auto-open on first run vs. an inline Home entry point vs. a Settings
 * section) is an open product decision, deferred out of this pass. When one is
 * chosen, this is the single place that changes.
 */
export function initializeWorkAreasOnboarding(input: {
  readonly storage: WorkAreasStorage;
}): WorkAreasLifecycleDecision {
  const stored = readWorkAreasState(input.storage);
  if (!stored) {
    writeWorkAreasState(input.storage, DEFAULT_WORK_AREAS_STATE);
    return { shouldOpen: false, state: DEFAULT_WORK_AREAS_STATE };
  }
  return { shouldOpen: false, state: stored };
}

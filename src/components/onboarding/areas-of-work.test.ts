import { beforeEach, describe, expect, it } from "vitest";

import {
  WORK_AREA_CAP,
  WORK_AREA_ICONS,
  WORK_AREA_IDS,
  isWorkAreaBlocked,
  normalizeWorkAreas,
  toggleWorkArea,
  type WorkAreaId,
} from "./areas-of-work";
import {
  DEFAULT_WORK_AREAS_STATE,
  WORK_AREAS_STORAGE_KEY,
  initializeWorkAreasOnboarding,
  readWorkAreasState,
  saveWorkAreas,
  selectedWorkAreas,
} from "@/services/work-areas-prefs.local";

function memoryStorage(seed?: Record<string, string>) {
  const map = new Map<string, string>(Object.entries(seed ?? {}));
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

describe("areas-of-work vocabulary", () => {
  it("is exactly the six Home composer areas, each with an icon", () => {
    expect([...WORK_AREA_IDS]).toEqual([
      "web",
      "mobile",
      "miniapp",
      "desktop",
      "brand",
      "poster",
    ]);
    expect(new Set(WORK_AREA_IDS).size).toBe(WORK_AREA_IDS.length);
    for (const id of WORK_AREA_IDS) expect(WORK_AREA_ICONS[id]).toBeTruthy();
  });

  it("caps the selection at three", () => {
    expect(WORK_AREA_CAP).toBe(3);
  });
});

describe("toggleWorkArea", () => {
  it("adds in selection order and removes on a second toggle", () => {
    let selected: readonly WorkAreaId[] = [];
    selected = toggleWorkArea(selected, "brand");
    selected = toggleWorkArea(selected, "web");
    expect(selected).toEqual(["brand", "web"]);
    selected = toggleWorkArea(selected, "brand");
    expect(selected).toEqual(["web"]);
  });

  it("refuses to add past the cap but still allows removal", () => {
    const full: readonly WorkAreaId[] = ["web", "mobile", "miniapp"];
    expect(toggleWorkArea(full, "poster")).toEqual(full);
    expect(toggleWorkArea(full, "mobile")).toEqual(["web", "miniapp"]);
  });

  it("blocks only unselected tiles once the cap is reached", () => {
    const full: readonly WorkAreaId[] = ["web", "mobile", "miniapp"];
    expect(isWorkAreaBlocked(full, "poster")).toBe(true);
    expect(isWorkAreaBlocked(full, "web")).toBe(false);
    expect(isWorkAreaBlocked(["web"], "poster")).toBe(false);
  });
});

describe("normalizeWorkAreas", () => {
  it("drops unknown ids, de-duplicates and clamps to the cap", () => {
    expect(
      normalizeWorkAreas(["web", "web", "nope", "mobile", "brand", "poster"]),
    ).toEqual(["web", "mobile", "brand"]);
  });
});

describe("work-areas persistence", () => {
  let storage: ReturnType<typeof memoryStorage>;

  beforeEach(() => {
    storage = memoryStorage();
  });

  it("reads nothing from a cold profile", () => {
    expect(readWorkAreasState(storage)).toBeUndefined();
    expect(selectedWorkAreas(storage)).toEqual([]);
  });

  it("round-trips a confirmed selection under a versioned sibling key", () => {
    const saved = saveWorkAreas(storage, ["mobile", "brand"]);
    expect(saved).toEqual({
      protocol: "cutout.work-areas.v1",
      areas: ["mobile", "brand"],
      acknowledged: true,
    });
    expect(storage.map.has(WORK_AREAS_STORAGE_KEY)).toBe(true);
    expect(selectedWorkAreas(storage)).toEqual(["mobile", "brand"]);
  });

  it("records a skip as an acknowledged empty selection", () => {
    expect(saveWorkAreas(storage, []).acknowledged).toBe(true);
    expect(selectedWorkAreas(storage)).toEqual([]);
  });

  it("clamps an over-cap write instead of persisting it", () => {
    expect(
      saveWorkAreas(storage, ["web", "mobile", "miniapp", "desktop"]).areas,
    ).toEqual(["web", "mobile", "miniapp"]);
  });

  it("degrades to the default on unparseable or invalid stored blobs", () => {
    const broken = memoryStorage({ [WORK_AREAS_STORAGE_KEY]: "{not json" });
    expect(readWorkAreasState(broken)).toBeUndefined();

    const wrongShape = memoryStorage({
      [WORK_AREAS_STORAGE_KEY]: JSON.stringify({
        protocol: "cutout.work-areas.v1",
        areas: ["web", "unknown-area"],
        acknowledged: true,
      }),
    });
    expect(readWorkAreasState(wrongShape)).toBeUndefined();
    expect(selectedWorkAreas(wrongShape)).toEqual([]);

    const extraKey = memoryStorage({
      [WORK_AREAS_STORAGE_KEY]: JSON.stringify({
        ...DEFAULT_WORK_AREAS_STATE,
        surprise: true,
      }),
    });
    expect(readWorkAreasState(extraKey)).toBeUndefined();
  });

  it("survives a storage that throws", () => {
    const hostile = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(readWorkAreasState(hostile)).toBeUndefined();
    expect(() => saveWorkAreas(hostile, ["web"])).not.toThrow();
  });
});

describe("initializeWorkAreasOnboarding", () => {
  it("seeds the key on a cold profile and still refuses to open", () => {
    const storage = memoryStorage();
    const decision = initializeWorkAreasOnboarding({ storage });
    expect(decision.shouldOpen).toBe(false);
    expect(decision.state).toEqual(DEFAULT_WORK_AREAS_STATE);
    expect(readWorkAreasState(storage)).toEqual(DEFAULT_WORK_AREAS_STATE);
  });

  it("never auto-opens, even on a seeded-but-unacknowledged profile", () => {
    const storage = memoryStorage();
    initializeWorkAreasOnboarding({ storage });
    // Second launch: the key exists and `acknowledged` is still false. No
    // trigger policy has been chosen, so the gate must stay shut.
    const second = initializeWorkAreasOnboarding({ storage });
    expect(second.state.acknowledged).toBe(false);
    expect(second.shouldOpen).toBe(false);
  });

  it("returns the acknowledged state once a selection exists", () => {
    const storage = memoryStorage();
    saveWorkAreas(storage, ["poster"]);
    const decision = initializeWorkAreasOnboarding({ storage });
    expect(decision.shouldOpen).toBe(false);
    expect(decision.state).toEqual({
      protocol: "cutout.work-areas.v1",
      areas: ["poster"],
      acknowledged: true,
    });
  });
});

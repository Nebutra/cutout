import { describe, expect, it } from "vitest";
import releaseNotesCatalog from "@/release-notes/catalog.json";
import type { LocalizedReleaseNotes } from "./contracts";
import {
  FIRST_RELEASE_NOTES_MIGRATION_VERSION,
  RELEASE_NOTES_READ_STATE_STORAGE_KEY,
  compareSemanticVersions,
  dismissReleaseNotes,
  getBundledReleaseNotes,
  githubReleaseUrl,
  initializeReleaseNotesLifecycle,
  resolveUpdateReleaseNotes,
  selectLocalizedReleaseNotes,
  validateLocalizedReleaseNotes,
} from "./release-notes";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    value: (key: string) => values.get(key),
  };
}

const catalogEntry = releaseNotesCatalog.entries[0]!;
const bundled: LocalizedReleaseNotes = {
  protocol: "cutout.release-notes.v1",
  ...catalogEntry,
};
const migrationBundled: LocalizedReleaseNotes = {
  ...bundled,
  version: FIRST_RELEASE_NOTES_MIGRATION_VERSION,
};

describe("release notes model", () => {
  it("bundles exact-version notes and applies whole-locale English fallback", () => {
    expect(bundled.version).toBe("0.1.17");
    expect(selectLocalizedReleaseNotes(bundled, "zh-CN")?.headline).toContain("图像路由");
    expect(selectLocalizedReleaseNotes(bundled, "de-DE")?.headline).toBe(
      bundled.locales.en.headline,
    );
    expect(getBundledReleaseNotes("0.1.16")).toBeUndefined();
  });

  it("prefers typed localized updater notes and safely falls back to plain text", () => {
    expect(resolveUpdateReleaseNotes({
      version: "0.1.17",
      localizedNotes: bundled,
      notes: "English fallback",
    }, "ja")?.headline).toContain("画像ルーティング");
    expect(resolveUpdateReleaseNotes({
      version: "0.1.18",
      localizedNotes: bundled,
      notes: "Readable English fallback.",
      publishedAt: "2026-08-04T10:00:00Z",
    }, "fr")).toMatchObject({
      version: "0.1.18",
      releasedOn: "2026-08-04",
      highlights: [{ id: "legacy-notes", body: "Readable English fallback." }],
    });
  });

  it("rejects malformed or unbounded projections before rendering", () => {
    expect(validateLocalizedReleaseNotes({
      ...bundled,
      remoteUrl: "https://example.test/notes",
    })).toBeUndefined();
    expect(validateLocalizedReleaseNotes({
      ...bundled,
      locales: {
        ...bundled.locales,
        en: {
          ...bundled.locales.en,
          highlights: bundled.locales.en.highlights.map((highlight, index) =>
            index === 0 ? { ...highlight, body: "x".repeat(601) } : highlight),
        },
      },
    })).toBeUndefined();
    expect(validateLocalizedReleaseNotes({
      ...bundled,
      locales: {
        ...bundled.locales,
        ja: {
          ...bundled.locales.ja,
          highlights: [...bundled.locales.ja.highlights].reverse(),
        },
      },
    })).toBeUndefined();
    expect(resolveUpdateReleaseNotes({
      version: bundled.version,
      localizedNotes: { ...bundled, remoteUrl: "https://example.test" } as LocalizedReleaseNotes,
      notes: "Readable English fallback.",
    }, "fr")).toMatchObject({
      highlights: [{ id: "legacy-notes", body: "Readable English fallback." }],
    });
  });

  it("compares release and prerelease semantic versions", () => {
    expect(compareSemanticVersions("0.1.16", "0.1.15")).toBe(1);
    expect(compareSemanticVersions("0.1.16-beta.2", "0.1.16-beta.1")).toBe(1);
    expect(compareSemanticVersions("0.1.16-beta.1", "0.1.16")).toBe(-1);
    expect(compareSemanticVersions("0.1.016", "0.1.15")).toBeUndefined();
    expect(compareSemanticVersions(`1.0.0-${"a".repeat(100)}`, "1.0.0")).toBeUndefined();
    expect(githubReleaseUrl("0.1.16")).toBe("https://github.com/Nebutra/cutout/releases/tag/v0.1.16");
    expect(githubReleaseUrl("../../unsafe")).toBeUndefined();
  });
});

describe("release notes local lifecycle", () => {
  it("treats missing state as a clean install without auto-opening", () => {
    const storage = memoryStorage();
    const result = initializeReleaseNotesLifecycle({
      storage,
      currentVersion: "0.1.16",
      bundledNotes: migrationBundled,
    });
    expect(result).toMatchObject({ shouldOpen: false, state: { observedVersion: "0.1.16" } });
    expect(result.state?.pendingVersion).toBeUndefined();
  });

  it("uses the existing notification ledger only for the first OTA migration", () => {
    const storage = memoryStorage();
    const result = initializeReleaseNotesLifecycle({
      storage,
      currentVersion: FIRST_RELEASE_NOTES_MIGRATION_VERSION,
      bundledNotes: migrationBundled,
      updateNotificationVersion: FIRST_RELEASE_NOTES_MIGRATION_VERSION,
    });
    expect(result).toMatchObject({
      shouldOpen: true,
      state: { observedVersion: "0.1.16", pendingVersion: "0.1.16" },
    });

    const later = memoryStorage();
    expect(initializeReleaseNotesLifecycle({
      storage: later,
      currentVersion: "0.1.17",
      updateNotificationVersion: "0.1.17",
    }).shouldOpen).toBe(false);
  });

  it("reopens pending notes after a crash and stops after dismissal", () => {
    const storage = memoryStorage({
      [RELEASE_NOTES_READ_STATE_STORAGE_KEY]: JSON.stringify({
        protocol: "cutout.release-notes.read-state.v1",
        observedVersion: "0.1.15",
      }),
    });
    const upgrade = initializeReleaseNotesLifecycle({
      storage,
      currentVersion: "0.1.16",
      bundledNotes: migrationBundled,
    });
    expect(upgrade.shouldOpen).toBe(true);
    expect(initializeReleaseNotesLifecycle({
      storage,
      currentVersion: "0.1.16",
      bundledNotes: migrationBundled,
    }).shouldOpen).toBe(true);

    dismissReleaseNotes(storage, "0.1.16");
    expect(initializeReleaseNotesLifecycle({
      storage,
      currentVersion: "0.1.16",
      bundledNotes: migrationBundled,
    }).shouldOpen).toBe(false);
    expect(JSON.parse(storage.value(RELEASE_NOTES_READ_STATE_STORAGE_KEY)!)).toMatchObject({
      dismissedVersion: "0.1.16",
    });
  });

  it("handles skipped upgrades, missing notes, downgrade, and corrupt state conservatively", () => {
    const skipped = memoryStorage({
      [RELEASE_NOTES_READ_STATE_STORAGE_KEY]: JSON.stringify({
        protocol: "cutout.release-notes.read-state.v1",
        observedVersion: "0.1.12",
      }),
    });
    expect(initializeReleaseNotesLifecycle({
      storage: skipped,
      currentVersion: "0.1.16",
      bundledNotes: migrationBundled,
    }).shouldOpen).toBe(true);

    const missing = memoryStorage({
      [RELEASE_NOTES_READ_STATE_STORAGE_KEY]: JSON.stringify({
        protocol: "cutout.release-notes.read-state.v1",
        observedVersion: "0.1.16",
      }),
    });
    const missingResult = initializeReleaseNotesLifecycle({
      storage: missing,
      currentVersion: "0.1.17",
    });
    expect(missingResult).toMatchObject({ shouldOpen: false, state: { observedVersion: "0.1.17" } });
    expect(missingResult.state?.pendingVersion).toBeUndefined();

    const downgrade = memoryStorage({
      [RELEASE_NOTES_READ_STATE_STORAGE_KEY]: JSON.stringify({
        protocol: "cutout.release-notes.read-state.v1",
        observedVersion: "0.1.17",
      }),
    });
    expect(initializeReleaseNotesLifecycle({
      storage: downgrade,
      currentVersion: "0.1.16",
      bundledNotes: migrationBundled,
    })).toMatchObject({ shouldOpen: false, state: { observedVersion: "0.1.17" } });

    const corrupt = memoryStorage({ [RELEASE_NOTES_READ_STATE_STORAGE_KEY]: "not-json" });
    expect(initializeReleaseNotesLifecycle({
      storage: corrupt,
      currentVersion: "0.1.16",
      bundledNotes: migrationBundled,
      updateNotificationVersion: "0.1.16",
    }).shouldOpen).toBe(false);
  });

  it("keeps future-version dismissal independent", () => {
    const futureNotes = { ...bundled, version: "0.1.17" };
    const storage = memoryStorage({
      [RELEASE_NOTES_READ_STATE_STORAGE_KEY]: JSON.stringify({
        protocol: "cutout.release-notes.read-state.v1",
        observedVersion: "0.1.16",
        dismissedVersion: "0.1.16",
      }),
    });
    expect(initializeReleaseNotesLifecycle({
      storage,
      currentVersion: "0.1.17",
      bundledNotes: futureNotes,
    })).toMatchObject({
      shouldOpen: true,
      state: { pendingVersion: "0.1.17", dismissedVersion: "0.1.16" },
    });
  });

  it("never lets unavailable local storage block startup or dismissal", () => {
    const storage = {
      getItem: () => { throw new DOMException("blocked"); },
      setItem: () => { throw new DOMException("full"); },
    };
    expect(() => initializeReleaseNotesLifecycle({
      storage,
      currentVersion: "0.1.16",
      bundledNotes: migrationBundled,
      updateNotificationVersion: "0.1.16",
    })).not.toThrow();
    expect(initializeReleaseNotesLifecycle({
      storage,
      currentVersion: "0.1.16",
      bundledNotes: migrationBundled,
      updateNotificationVersion: "0.1.16",
    }).shouldOpen).toBe(false);
    expect(() => dismissReleaseNotes(storage, "0.1.16")).not.toThrow();
  });
});

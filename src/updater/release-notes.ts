import { PRODUCT_VERSION } from "@/product-version";
import { SUPPORTED, type Locale } from "@/i18n/config";
import type {
  LocalizedReleaseNotes,
  LocalizedReleaseNotesLocale,
  UpdateRelease,
} from "./contracts";

export const RELEASE_NOTES_READ_STATE_STORAGE_KEY = "cutout.release-notes.read-state.v1";
export const FIRST_RELEASE_NOTES_MIGRATION_VERSION = "0.1.16";

const RELEASE_NOTES_PROTOCOL = "cutout.release-notes.v1";
const STATE_PROTOCOL = "cutout.release-notes.read-state.v1";
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const RELEASE_NOTES_LOCALES = new Set<string>(SUPPORTED);
const RELEASE_NOTES_LIMITS = {
  extensionBytes: 48 * 1024,
  headline: 120,
  highlights: 6,
  id: 64,
  title: 100,
  body: 600,
} as const;
const HIGHLIGHT_ID = /^[a-z0-9](?:[a-z0-9.-]{0,62}[a-z0-9])?$/;
const UNSAFE_MARKUP = /[<>]|\b[a-z][a-z0-9+.-]*:\/\//iu;

interface CatalogEntry {
  readonly version: string;
  readonly releasedOn: string;
  readonly locales: Readonly<Record<string, LocalizedReleaseNotesLocale>>;
}

declare const __CUTOUT_RELEASE_NOTES__: CatalogEntry | undefined;

export interface ReleaseNotesView {
  readonly version: string;
  readonly releasedOn?: string;
  readonly headline?: string;
  readonly highlights: readonly {
    readonly id: string;
    readonly title?: string;
    readonly body: string;
    readonly mediaId?: string;
    readonly alt?: string;
  }[];
}

export interface ReleaseNotesReadStateV1 {
  readonly protocol: typeof STATE_PROTOCOL;
  readonly observedVersion: string;
  readonly pendingVersion?: string;
  readonly dismissedVersion?: string;
}

export interface ReleaseNotesLifecycleDecision {
  readonly shouldOpen: boolean;
  readonly state?: ReleaseNotesReadStateV1;
}

type ReleaseNotesStorage = Pick<Storage, "getItem" | "setItem">;

function parseSemanticVersion(value: string): readonly [number, number, number, readonly string[]] | undefined {
  if (value.length > 100) return undefined;
  const match = SEMVER.exec(value);
  if (!match) return undefined;
  const prerelease = match[4]?.split(".") ?? [];
  if (prerelease.some((part) => /^\d+$/.test(part) && part.length > 1 && part.startsWith("0"))) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3]), prerelease];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function isPlainText(value: unknown, maximum: number): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.trim() === value
    && Array.from(value).length <= maximum
    && !Array.from(value).some((character) => {
      const code = character.codePointAt(0)!;
      return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
    })
    && !UNSAFE_MARKUP.test(value);
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 100) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function normalizeHighlight(value: unknown): LocalizedReleaseNotes["locales"][string]["highlights"][number] | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ["id", "title", "body"])) return undefined;
  if (!isPlainText(value.id, RELEASE_NOTES_LIMITS.id) || !HIGHLIGHT_ID.test(value.id)) return undefined;
  if (!isPlainText(value.title, RELEASE_NOTES_LIMITS.title)) return undefined;
  if (!isPlainText(value.body, RELEASE_NOTES_LIMITS.body)) return undefined;
  return { id: value.id, title: value.title, body: value.body };
}

function normalizeLocale(value: unknown): LocalizedReleaseNotesLocale | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ["headline", "highlights"])) return undefined;
  if (!isPlainText(value.headline, RELEASE_NOTES_LIMITS.headline)) return undefined;
  if (!Array.isArray(value.highlights)
    || value.highlights.length < 1
    || value.highlights.length > RELEASE_NOTES_LIMITS.highlights) return undefined;
  const highlights = value.highlights.map(normalizeHighlight);
  if (highlights.some((highlight) => !highlight)) return undefined;
  return { headline: value.headline, highlights: highlights as LocalizedReleaseNotesLocale["highlights"] };
}

export function validateLocalizedReleaseNotes(
  value: unknown,
  expectedVersion?: string,
): LocalizedReleaseNotes | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ["protocol", "version", "releasedOn", "locales"])) return undefined;
  if (value.protocol !== RELEASE_NOTES_PROTOCOL
    || typeof value.version !== "string"
    || !parseSemanticVersion(value.version)
    || (expectedVersion !== undefined && value.version !== expectedVersion)
    || !isCalendarDate(value.releasedOn)
    || !isRecord(value.locales)) return undefined;
  const localeNames = Object.keys(value.locales);
  if (!localeNames.includes("en")
    || localeNames.length > SUPPORTED.length
    || localeNames.some((locale) => !RELEASE_NOTES_LOCALES.has(locale))) return undefined;
  const locales: Record<string, LocalizedReleaseNotesLocale> = {};
  for (const localeName of localeNames) {
    const locale = normalizeLocale(value.locales[localeName]);
    if (!locale) return undefined;
    locales[localeName] = locale;
  }
  const englishShape = locales.en!.highlights.map(({ id, mediaId }) => ({ id, mediaId }));
  if (Object.values(locales).some((locale) => locale.highlights.some((highlight, index) => {
    const expected = englishShape[index];
    return !expected || highlight.id !== expected.id || highlight.mediaId !== expected.mediaId;
  }) || locale.highlights.length !== englishShape.length)) return undefined;
  const normalized: LocalizedReleaseNotes = {
    protocol: RELEASE_NOTES_PROTOCOL,
    version: value.version,
    releasedOn: value.releasedOn,
    locales,
  };
  return new TextEncoder().encode(JSON.stringify(normalized)).byteLength <= RELEASE_NOTES_LIMITS.extensionBytes
    ? normalized
    : undefined;
}

export function compareSemanticVersions(left: string, right: string): number | undefined {
  const a = parseSemanticVersion(left);
  const b = parseSemanticVersion(right);
  if (!a || !b) return undefined;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index]! < b[index]! ? -1 : 1;
  }
  const aPre = a[3];
  const bPre = b[3];
  if (!aPre.length || !bPre.length) return aPre.length === bPre.length ? 0 : aPre.length ? -1 : 1;
  const length = Math.max(aPre.length, bPre.length);
  for (let index = 0; index < length; index += 1) {
    const aPart = aPre[index];
    const bPart = bPre[index];
    if (aPart === undefined || bPart === undefined) return aPart === bPart ? 0 : aPart === undefined ? -1 : 1;
    if (aPart === bPart) continue;
    const aNumeric = /^\d+$/.test(aPart);
    const bNumeric = /^\d+$/.test(bPart);
    if (aNumeric && bNumeric) return Number(aPart) < Number(bPart) ? -1 : 1;
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    return aPart < bPart ? -1 : 1;
  }
  return 0;
}

function normalizedLocale(locale: string): Locale {
  if (SUPPORTED.includes(locale as Locale)) return locale as Locale;
  const primary = locale.toLowerCase().split("-")[0];
  return SUPPORTED.find((candidate) => candidate.toLowerCase().split("-")[0] === primary) ?? "en";
}

function projectCatalogEntry(entry: CatalogEntry): LocalizedReleaseNotes | undefined {
  return validateLocalizedReleaseNotes({
    protocol: RELEASE_NOTES_PROTOCOL,
    version: entry.version,
    releasedOn: entry.releasedOn,
    locales: entry.locales,
  }, entry.version);
}

export function getBundledReleaseNotes(version: string): LocalizedReleaseNotes | undefined {
  if (!parseSemanticVersion(version)) return undefined;
  const entry = __CUTOUT_RELEASE_NOTES__?.version === version ? __CUTOUT_RELEASE_NOTES__ : undefined;
  return entry ? projectCatalogEntry(entry) : undefined;
}

export const BUNDLED_CURRENT_RELEASE_NOTES = getBundledReleaseNotes(PRODUCT_VERSION);

export function selectLocalizedReleaseNotes(
  notes: LocalizedReleaseNotes,
  locale: string,
): ReleaseNotesView | undefined {
  const normalized = validateLocalizedReleaseNotes(notes);
  if (!normalized) return undefined;
  const localized = normalized.locales[normalizedLocale(locale)] ?? normalized.locales.en;
  if (!localized) return undefined;
  return {
    version: normalized.version,
    releasedOn: normalized.releasedOn,
    headline: localized.headline,
    highlights: localized.highlights,
  };
}

export function resolveUpdateReleaseNotes(
  release: UpdateRelease,
  locale: string,
): ReleaseNotesView | undefined {
  if (release.localizedNotes?.version === release.version) {
    const localized = selectLocalizedReleaseNotes(release.localizedNotes, locale);
    if (localized) return localized;
  }
  const fallback = release.notes?.trim();
  if (!fallback) return undefined;
  const published = release.publishedAt ? new Date(release.publishedAt) : undefined;
  const releasedOn = published && Number.isFinite(published.getTime())
    ? published.toISOString().slice(0, 10)
    : undefined;
  return {
    version: release.version,
    ...(releasedOn ? { releasedOn } : {}),
    highlights: [{ id: "legacy-notes", body: fallback }],
  };
}

function readState(storage: Pick<Storage, "getItem">): {
  readonly exists: boolean;
  readonly state?: ReleaseNotesReadStateV1;
} {
  let raw: string | null;
  try {
    raw = storage.getItem(RELEASE_NOTES_READ_STATE_STORAGE_KEY);
  } catch {
    return { exists: true };
  }
  if (raw === null) return { exists: false };
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || typeof value !== "object" || Array.isArray(value)) return { exists: true };
    const keys = Object.keys(value);
    if (keys.some((key) => !["protocol", "observedVersion", "pendingVersion", "dismissedVersion"].includes(key))) return { exists: true };
    if (value.protocol !== STATE_PROTOCOL || typeof value.observedVersion !== "string" || !parseSemanticVersion(value.observedVersion)) return { exists: true };
    for (const optional of ["pendingVersion", "dismissedVersion"] as const) {
      const candidate = value[optional];
      if (candidate !== undefined && (typeof candidate !== "string" || !parseSemanticVersion(candidate))) return { exists: true };
    }
    return { exists: true, state: value as unknown as ReleaseNotesReadStateV1 };
  } catch {
    return { exists: true };
  }
}

function writeState(storage: Pick<Storage, "setItem">, state: ReleaseNotesReadStateV1): void {
  try {
    storage.setItem(RELEASE_NOTES_READ_STATE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Release-note read state is optional UI state and must never block startup.
  }
}

export function initializeReleaseNotesLifecycle(input: {
  readonly storage: ReleaseNotesStorage;
  readonly currentVersion: string;
  readonly bundledNotes?: LocalizedReleaseNotes;
  readonly updateNotificationVersion?: string;
}): ReleaseNotesLifecycleDecision {
  if (!parseSemanticVersion(input.currentVersion)) return { shouldOpen: false };
  const stored = readState(input.storage);
  if (!stored.state) {
    const migrated = !stored.exists
      && input.currentVersion === FIRST_RELEASE_NOTES_MIGRATION_VERSION
      && input.updateNotificationVersion === input.currentVersion
      && input.bundledNotes?.version === input.currentVersion;
    const state: ReleaseNotesReadStateV1 = {
      protocol: STATE_PROTOCOL,
      observedVersion: input.currentVersion,
      ...(migrated ? { pendingVersion: input.currentVersion } : {}),
    };
    writeState(input.storage, state);
    return { shouldOpen: migrated, state };
  }

  const comparison = compareSemanticVersions(input.currentVersion, stored.state.observedVersion);
  if (comparison === undefined || comparison < 0) return { shouldOpen: false, state: stored.state };
  if (comparison === 0) {
    return {
      shouldOpen: stored.state.pendingVersion === input.currentVersion
        && input.bundledNotes?.version === input.currentVersion,
      state: stored.state,
    };
  }

  const hasNotes = input.bundledNotes?.version === input.currentVersion;
  const state: ReleaseNotesReadStateV1 = {
    protocol: STATE_PROTOCOL,
    observedVersion: input.currentVersion,
    ...(hasNotes ? { pendingVersion: input.currentVersion } : {}),
    ...(stored.state.dismissedVersion ? { dismissedVersion: stored.state.dismissedVersion } : {}),
  };
  writeState(input.storage, state);
  return { shouldOpen: hasNotes, state };
}

export function dismissReleaseNotes(storage: ReleaseNotesStorage, version: string): void {
  if (!parseSemanticVersion(version)) return;
  const stored = readState(storage).state;
  if (!stored || stored.pendingVersion !== version) return;
  writeState(storage, {
    protocol: STATE_PROTOCOL,
    observedVersion: stored.observedVersion,
    dismissedVersion: version,
  });
}

export function githubReleaseUrl(version: string): string | undefined {
  return parseSemanticVersion(version)
    ? `https://github.com/Nebutra/cutout/releases/tag/v${version}`
    : undefined;
}

# Design: localized release notes experience

## Architectural Boundaries

- The repository owns one reviewed release-note catalog. It is editorial data,
  not executable UI markup.
- `createDesktopUpdateOrchestrator` remains the only updater state owner. The
  release-note experience consumes its typed release projection and must not
  fetch GitHub or updater endpoints from the frontend.
- Tauri remains responsible for update discovery, HTTPS/host allowlisting,
  artifact signature verification, download, install, and relaunch.
- Release-note parsing or display failures are non-fatal. They can hide or fall
  back the notes, but can never change update eligibility or install safety.
- Installed-version notes are bundled with the application. Remote updater
  state alone cannot provide them after restart because an up-to-date check
  returns no release.

## Repository Source And Schema

Add a versioned catalog under `src/release-notes/catalog.json` with protocol
`cutout.release-notes.catalog.v1`. Each entry has:

- an exact semantic `version` and ISO calendar `releasedOn` date;
- locale records for the shipped locale vocabulary in `src/i18n/config.ts`;
- one required English record and optional `zh-CN`, `ja`, `fr`, and `es`
  records, with deterministic whole-locale fallback to English;
- a bounded headline and one to six ordered highlights, each with a stable id,
  short title, plain-text body, and optional known `mediaId` plus localized alt
  text.

The validator rejects duplicate versions, unknown locales or fields, invalid
dates/versions, empty English content, inconsistent highlight ids/order, unsafe
control characters, and values over documented length/count limits. Media is a
closed id mapped to a statically imported local asset; content cannot provide a
URL or filesystem path. Unknown media ids are omitted at runtime. This keeps
the packaged CSP (`img-src` local/data/blob) intact and allows text-only notes
to work on older clients.

The initial catalog starts with the next immutable release after `v0.1.15`.
`v0.1.1` through `v0.1.15` are not inferred from commit history. A historical
entry may be added later only with reviewed product copy.

## Generated Release Projections

One repository-owned validator/renderer reads the exact catalog entry selected
by `--version` and produces three projections:

1. Legacy updater `notes`: readable bounded English plain text. Existing
   `v0.1.15` clients render this field verbatim, so it must never contain JSON.
2. `cutoutReleaseNotes`: a bounded structured JSON extension containing the
   protocol, version, date, and locale records for new clients.
3. GitHub Release Markdown: deterministic English product copy written to a
   file and passed to `gh release create --notes-file`.

The same selected entry is embedded into the Vite build for
`__CUTOUT_VERSION__`; only the installed version's normalized note needs to be
included. A normal development build may have no matching note, but a release
validation run requires an exact version match and required English content.
The first shipped entry should contain all five reviewed locales even though
the runtime fallback remains supported for future partial translations.

## Available-Update Data Flow

```text
catalog entry
  -> release validator/renderer
  -> latest.json.notes (legacy English text)
  -> latest.json.cutoutReleaseNotes (structured locales)
  -> existing Tauri updater request
  -> Update.raw_json custom-field projection
  -> Rust bounded validator (non-fatal)
  -> UpdateSnapshot.localizedReleaseNotes
  -> updater service boundary
  -> UpdateRelease.localizedNotes
  -> locale selection with English fallback
  -> Settings preview and What's New dialog
```

`tauri-plugin-updater` 2.10.1 retains the complete response in public
`Update.raw_json`, explicitly for additional fields. The Rust updater command
therefore extracts the custom field from the response already fetched by the
plugin; it does not make a second request or reproduce endpoint-template logic.
The plugin's normal deserializer ignores the extension and continues to use the
standard platform URL/signature fields.

Rust accepts the extension only when its protocol and version match the checked
release, locale/highlight limits hold, and every value is plain bounded text.
Invalid or missing extensions yield no localized projection while preserving
the normal English `releaseNotes` string and the discovered update. TypeScript
maps the native projection at the updater service boundary; rendering
components do not parse raw JSON.

## Installed-Version And Read-State Flow

At startup, AppShell resolves the bundled note for the actual app version and
loads a versioned local state such as:

```ts
interface ReleaseNotesReadStateV1 {
  readonly observedVersion: string
  readonly pendingVersion?: string
  readonly dismissedVersion?: string
}
```

State transitions are owned by a small release-note service and covered as a
table-driven reducer/service test:

- no state on a clean install: store the current version and do not auto-open;
- current semantic version is greater than `observedVersion`: store it as both
  observed and pending, then open its bundled note;
- the process exits before dismissal: retain pending so the next launch opens
  it again;
- close/dismiss: clear pending and store `dismissedVersion=current`;
- downgrade, invalid version, missing bundled note, or same version: do not
  auto-open and do not manufacture an upgrade;
- manual open from Settings ignores dismissal and never changes updater state.

The first release containing this feature has no marker written by older app
versions. For that one migration only, an existing updater notification whose
recorded release version equals the installed version is accepted as evidence
of an OTA upgrade and seeds `pendingVersion`. Otherwise missing state is treated
as a clean install. This is deliberately conservative: a manual overwrite of
an older installation may not auto-open in that first release, but the
persistent Settings entry remains available. Subsequent releases use exact
semantic version comparison.

The state is local, bounded to the latest observed/pending/dismissed versions,
and fail-open for UI only. Corrupt storage is reset without affecting updater
preferences, notifications, trust, or install eligibility.

## UI Composition

AppShell owns the top-level What's New open state so automatic display works on
any screen and Settings does not create a second updater controller. It passes
a narrow `openReleaseNotes(note)` callback through Settings. Available-update
highlights are derived from the shared controller's `state.release`; the manual
entry opens the bundled installed-version note.

The reading surface uses the existing Radix dialog primitive with a responsive
bottom-sheet geometry at narrow widths and a compact centered dialog on larger
windows. It contains:

- product name, localized "What's New" label, version, and localized date;
- one restrained headline and an unframed ordered highlight list;
- optional full-width local media when the id is recognized;
- the existing icon close control and a fixed-origin GitHub Release action.

The surface has a stable max height with internal scrolling, no nested cards,
no decorative hero treatment, keyboard/Escape close, focus restoration, and
reduced-motion classes. Long translations wrap inside bounded controls. UI
chrome is translated through Lingui in all five catalogs; editorial note text
comes from the release-note catalog.

Opening the external Release page must use a fixed
`https://github.com/Nebutra/cutout/releases/tag/v<validated-semver>` target. If
the desktop webview cannot safely open this with existing behavior, use the
official opener plugin with a capability scoped to that exact origin/pattern;
never accept a catalog-provided URL.

## Release Workflow

Add package commands for catalog validation/rendering. In the release workflow:

1. Validate that the selected tag/source version has exactly one valid catalog
   entry before quality/build jobs start.
2. Generate updater metadata from the catalog version. Keep `notes` as English
   plain text and add the structured extension without changing platform,
   signature, allowlist, SBOM, provenance, or source-revision behavior.
3. Generate the GitHub body to a file and replace `--generate-notes` with
   `--notes-file` on the existing single draft publisher.
4. Preserve immutable-release absence checks, attestation ordering, draft
   promotion, stable/beta selection, and least-privilege permissions.

Large/multiline data is passed by file or direct structured function input, not
shell interpolation. Validation of older public manifests stays backward
compatible; a release-only `requireNotes` mode enforces the new source contract.

## Compatibility And Failure Policy

- Old clients see readable English in the standard `notes` field.
- New clients prefer the validated localized extension and fall back to the
  standard English text when the locale/extension is absent.
- Extra top-level manifest data is additive and does not alter Tauri's signed
  artifact selection. A focused Rust fixture proves the pinned updater version
  tolerates and retains the extension in `raw_json`.
- Content is rendered as React text nodes. No Markdown/HTML from the updater is
  evaluated in the desktop UI.
- Missing or malformed notes block release publication when authored locally,
  but malformed remote notes do not block a user from obtaining an otherwise
  valid signed update.

## Rollback

- UI/read-state rollback: remove the AppShell-owned dialog and local state;
  updater behavior remains unchanged.
- Metadata rollback: stop emitting the custom field and return GitHub creation
  to explicit reviewed text. Standard English `notes` remains compatible.
- Full rollback: revert catalog tooling, workflow wiring, native projection,
  frontend projections, and tests together. No user project data or `.cutout`
  Design IR migration is involved.

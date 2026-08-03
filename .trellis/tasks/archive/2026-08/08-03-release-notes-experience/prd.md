# Add release notes experience

## Goal

Give users a clear, localized explanation of what changed before they install
an update and once after the new version restarts, while keeping release copy in
one reviewed source and preserving Cutout's signed updater boundary.

## Background

- The updater already carries English `notes` and `publishedAt` from Rust into
  `UpdateRelease` (`src-tauri/src/commands/updater.rs:345`,
  `src/updater/contracts.ts:10`, and `src/updater/service.ts:68`).
- Settings currently renders non-empty notes as one small verbatim paragraph
  (`src/components/settings/sections/UpdatesSection.tsx:208`). Existing
  `v0.1.15` clients would therefore display JSON if structured localized data
  replaced the standard `notes` string.
- The pinned updater dependency retains additional manifest fields in public
  `Update.raw_json`, so Cutout can project a typed custom field from the same
  native request without fetching the endpoint again
  (`src-tauri/Cargo.toml:56`).
- Release CI currently invokes `pnpm update:generate` without notes and creates
  a GitHub Release with `--generate-notes`
  (`.github/workflows/release-update.yml:350` and
  `.github/workflows/release-update.yml:384`). Public `v0.1.15/latest.json`
  consequently has empty notes and the Release body is a contributor-facing PR
  list rather than reviewed product copy.
- After restart, an up-to-date updater check returns no release
  (`src-tauri/src/commands/updater.rs:368`), so current-version notes must be
  available from the installed bundle.
- AppShell owns the one desktop updater controller and passes it to Settings
  (`src/components/AppShell.tsx:421`).
- Cutout ships English, Simplified Chinese, Japanese, French, and Spanish
  (`src/i18n/config.ts:8`).

## Requirements

### Content And Localization

- Establish one repository-owned, versioned, bounded release-note catalog.
  Generate the legacy updater text, structured updater extension, GitHub
  Release body, and bundled installed-version note from the same exact-version
  entry.
- Begin the catalog with the next immutable release after `v0.1.15`. Do not
  synthesize `v0.1.1` through `v0.1.15` from commit history. Historical entries
  may be added later only when reviewed product copy exists.
- Require reviewed English content and support `en`, `zh-CN`, `ja`, `fr`, and
  `es` with deterministic whole-locale fallback to English. The first shipped
  entry must contain all five locales.
- Limit content to version, date, headline, ordered plain-text highlights, and
  optional known bundled-media ids with localized alt text. Do not accept
  arbitrary URLs, filesystem paths, remote images, HTML, Markdown, videos, or
  executable content.

### Updater And Release Compatibility

- Keep standard `latest.json.notes` as readable English plain text for existing
  clients. Add localized structured content in an additive bounded
  `cutoutReleaseNotes` field.
- Extract the custom field from the updater's existing native `raw_json`,
  validate it against the checked release version, and expose only a typed
  optional projection to TypeScript. Do not issue a second native request or a
  direct frontend GitHub/updater fetch.
- Missing, malformed, mismatched, or unsupported remote localized content must
  fall back to English or hide the notes without affecting update discovery,
  signature verification, download, recovery, install, retry, or relaunch.
- Fail release validation when the selected source/tag version lacks a valid
  exact catalog entry or required English content. Publish updater notes and
  the GitHub body from that entry through file/structured inputs, not shell
  interpolation or GitHub-generated PR notes.
- Preserve the current immutable single-publisher workflow, platform artifact
  matrix, HTTPS/host allowlist, signatures, SBOM/provenance, attestation,
  signing/notarization, draft promotion, and stable/beta rules.

### User Experience And Read State

- Show available-release localized highlights inside Updates & Support before
  download, using the shared AppShell-owned updater controller.
- Provide a permanent localized What's New entry in Updates & Support for the
  installed current version, regardless of whether its automatic dialog was
  dismissed.
- Automatically open the bundled current-version note once after a real
  semantic version upgrade. Do not auto-open on a clean first install, same
  version, downgrade, invalid version, or when no bundled entry exists.
- Store observed, pending, and dismissed versions locally in a bounded,
  versioned release-note state independent from updater preferences and trust.
  Retain pending state until dismissal so a crash cannot permanently skip the
  note; a future version must not be suppressed by an older dismissal.
- For the first feature release only, treat existing updater-notification state
  whose discovered version equals the installed version as OTA-upgrade evidence
  when no release-note state exists. Otherwise initialize missing state as a
  clean install. Do not modify or repurpose notification state.
- Render notes in a dedicated responsive bottom sheet/compact dialog with
  version, localized date, headline, highlights, optional local media, an
  accessible icon close control, and a fixed-origin GitHub Release action.
  Support keyboard close, focus restoration, scrolling, reduced motion, and
  long translated text without reproducing the screenshot's oversized layout.

## Acceptance Criteria

- [ ] Catalog validation rejects missing/mismatched current-version English,
      invalid locales/schema/limits/media ids, duplicate versions, and unsafe
      content; tests cover all five locales and English fallback.
- [ ] The first committed catalog entry is newer than `v0.1.15`, contains
      reviewed copy in all five locales, and no unreviewed historical claims.
- [ ] `latest.json.notes` is readable English, `cutoutReleaseNotes` is the
      matching bounded localized projection, the GitHub Release body is
      deterministic reviewed copy, and all three plus the bundled note derive
      from one exact catalog entry.
- [ ] An existing client can render `notes` without JSON, while a new client
      obtains localized highlights through `Update.raw_json` with no second
      request and falls back safely when the extension is invalid.
- [ ] Available-update highlights appear in Settings without a frontend fetch;
      installed-version notes remain available offline after restart and can
      always be reopened manually.
- [ ] State tests cover clean install, first-release OTA migration, later
      semantic upgrade, crash before dismissal, dismissal, manual reopen, same
      version, skipped version, downgrade, corrupt storage, and future-version
      independence.
- [ ] The reading surface passes keyboard/focus assertions and visual checks at
      desktop and compact sizes in light/dark themes, with reduced motion and
      no clipped or overlapping translations.
- [ ] The release workflow fails before builds for invalid exact-version notes,
      uses a generated notes file instead of `--generate-notes`, and retains all
      existing updater trust and single-publisher contract tests.
- [ ] Existing updater signature, allowlist, platform, recovery, install,
      notification, retry, and relaunch tests remain green.

## Out Of Scope

- A web CMS, remote editorial service, full release-history browser, analytics,
  or cloud-synced read state.
- Backfilling `v0.1.1` through `v0.1.15` without reviewed copy.
- Arbitrary remote HTML/Markdown/media, live GitHub content, or direct frontend
  network access.
- Replacing the updater controller, changing release trust policy, automatic
  download/install, or changing `.cutout` Design IR/provenance contracts.

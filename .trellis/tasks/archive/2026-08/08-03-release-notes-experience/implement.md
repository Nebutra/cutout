# Implementation plan

## 1. Catalog contract and deterministic renderer

- Add the bounded `cutout.release-notes.catalog.v1` source, shared fixtures,
  validator, exact-version lookup, locale fallback, legacy-English renderer,
  updater-extension renderer, and GitHub Markdown renderer.
- Add package commands for normal catalog validation and release-mode exact
  version validation/rendering.
- Add focused tests for duplicates, semantic version/date rules, required
  English, supported locales, highlight parity/limits, safe text, media ids,
  fallback, deterministic output, and escaping.
- Seed no historical versions. Add the next-release entry only with reviewed
  user-facing copy; its first shipped entry contains all five locales.

Validation:
`pnpm exec vitest run scripts/release-notes.test.ts`

## 2. Updater metadata compatibility

- Extend updater document generation with standard English `notes` plus the
  additive `cutoutReleaseNotes` object selected from the catalog.
- Keep legacy `--notes` compatibility where tests/callers need it, but make the
  protected workflow use the catalog/version path directly.
- Add release-only validation that rejects a missing, mismatched, oversized, or
  invalid notes extension without changing validation of old public manifests.
- Cover all-platform manifest generation and prove `notes` remains human
  readable rather than serialized JSON.

Validation:
`pnpm test:update-artifacts`

## 3. Native typed projection

- Read the custom field from the pinned updater's `Update.raw_json` after a
  successful check; do not fetch the endpoint again.
- Add strict Rust structures and bounded validation for protocol/version,
  locales, highlights, text lengths, and media ids. Expose only the validated
  optional projection on `UpdateSnapshot`.
- Treat invalid/missing extension content as absent while retaining the
  standard English notes and normal update state.
- Add Rust tests for valid projection, version mismatch, unknown/oversized
  fields, malformed locale content, and non-interference with update state.

Validation:
`cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
`cargo test --manifest-path src-tauri/Cargo.toml updater`

## 4. Frontend release-note model and local lifecycle

- Extend the updater TypeScript contracts/service mapping with the typed native
  projection and one locale-selection function with English/plain-text fallback.
- Bundle only the source entry matching the build's package version; normal dev
  builds may expose none, while release validation requires one.
- Implement the versioned local read-state service with semantic upgrade,
  clean-install, pending/crash retry, dismissal, downgrade/corruption, and
  first-release updater-notification bootstrap behavior.
- Keep this storage separate from updater preferences and notification state;
  only the migration reader observes existing notification evidence.

Validation:
`pnpm exec vitest run src/updater/release-notes.test.ts src/updater/service.test.ts`

## 5. Responsive UI and AppShell wiring

- Build the reusable What's New dialog with local-only optional media, fixed
  release URL construction, responsive bottom-sheet/desktop geometry, stable
  scrolling, keyboard close, focus restoration, and reduced motion.
- Mount the experience at AppShell, auto-open from the bundled lifecycle
  decision, and pass a narrow manual-open callback to Updates & Support.
- Replace the small verbatim notes paragraph with a compact localized highlight
  preview and details action for an available release. Add a permanent current
  version What's New row even after dismissal.
- Add every new UI string to English, Chinese, Japanese, French, and Spanish
  Lingui catalogs. Release editorial content remains in the versioned catalog.
- If required for reliable desktop external navigation, add the official opener
  plugin with a least-privilege fixed GitHub Release capability and contract
  tests; do not accept source-provided links.

Validation:
`pnpm exec vitest run src/components/settings/sections/UpdatesSection.test.ts src/components/release-notes`
`pnpm i18n:ci`

## 6. Release workflow and local contract tests

- Add exact-version catalog validation before release builds.
- Feed the catalog directly into updater metadata generation and create a
  deterministic GitHub body file. Replace `--generate-notes` with
  `--notes-file` on the existing single publisher.
- Extend workflow tests for validation ordering, exact version wiring,
  human-readable legacy notes, structured extension, notes-file publication,
  immutable release handling, and unchanged attestation/single-writer rules.
- Update `docs/RELEASE_CHECKLIST.md` and the executable release-pipeline spec.
  Do not touch Agent manifests/protocols unless implementation unexpectedly
  changes that surface; if it does, first read the Agent capability contract
  and run `pnpm agent:validate`.

Validation:
`pnpm exec vitest run scripts/release-workflow.test.ts scripts/validate-release-version.test.ts`

## 7. Full quality and visual verification

- Run focused tests above, TypeScript build, lint, full unit tests, Rust fmt/
  check/tests, i18n parity, release contract tests, and the repository quality
  check.
- Exercise clean install, OTA upgrade bootstrap, normal later upgrade, crash
  before dismissal, manual reopen, locale fallback, invalid remote extension,
  available-update preview, and no-update restart states.
- Capture Playwright screenshots at compact and desktop Settings/dialog sizes in
  light and dark themes; verify no clipped text, nested-card styling, overlap,
  blank media, or incoherent focus. Update baselines only after review.
- Verify no frontend GitHub fetch, remote HTML/Markdown render, arbitrary media
  path, second updater controller, or second manifest request was introduced.

Validation:
`pnpm lint`
`pnpm build`
`pnpm test`
`pnpm test:visual`
`cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
`cargo check --manifest-path src-tauri/Cargo.toml`
`cargo test --manifest-path src-tauri/Cargo.toml`

## Rollback points

- Do not wire CI until catalog/updater projection tests pass locally.
- Do not change the public release body until deterministic catalog rendering
  and exact-version validation pass.
- Do not ship the dialog until clean-install and upgrade-state tests prove it
  cannot auto-open repeatedly or affect updater eligibility.
- Do not tag a release without reviewed copy for the exact source version and
  all normal signing, notarization, asset, and publication gates.

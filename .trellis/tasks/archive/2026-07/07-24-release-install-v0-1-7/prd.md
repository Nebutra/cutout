# Release and install Cutout v0.1.7

## Goal

Publish the merged preparation-projection fix as Cutout `0.1.7`, remove the
installed `0.1.6` macOS application, and install the signed/notarized Apple
Silicon `0.1.7` build locally.

## Background

- `/Applications/Cutout.app` is `0.1.6` ARM64, but inspection shows an ad-hoc
  signature, Gatekeeper rejection, and no stapled notarization ticket. It must
  not be treated as release verification evidence.
- The latest public GitHub Release is `v0.1.6`.
- The duplicate preparation projection fix is merged to `github/main` at merge
  commit `9bc348f`, after the `v0.1.6` tag.
- The protected `release` environment contains the required Apple and Tauri
  updater credentials. Windows installers remain intentionally published
  without Authenticode under the reviewed release contract.

## Requirements

- Bump all synchronized product, Tauri, Agent capability, Codex plugin, runtime,
  README, and changelog version surfaces from `0.1.6` to `0.1.7`.
- Regenerate the bundled Codex plugin rather than manually editing generated
  runtime fingerprints.
- Preserve the atomic four-platform workflow, signing, notarization, updater
  signature, checksum, provenance, and publication gates.
- Publish immutable tag and GitHub Release `v0.1.7` from reviewed `main`.
- Download the published Apple Silicon DMG, verify it against `SHA256SUMS`, and
  validate the DMG notarization ticket before replacing the local app.
- Quit Cutout, move the installed `0.1.6` bundle aside, install `0.1.7` into
  `/Applications`, and verify version, architecture, Developer ID signature,
  Gatekeeper, and stapled notarization evidence.
- Preserve all user projects, `.cutout` repositories, IndexedDB/application
  support data, settings, and credentials; only the application bundle changes.

## Acceptance Criteria

- [x] Source version validation passes for `0.1.7` across all required files.
- [x] Focused release tests, full tests, lint, TypeScript, production build,
      Rust checks/tests, Agent validation, and release-local gates pass.
- [x] Release PR merges with required CI and CodeQL checks green.
- [x] Tag `v0.1.7` points to the reviewed merge commit on `main`.
- [x] The protected release workflow publishes all required macOS, Windows,
      Linux, updater, checksum, SBOM, provenance, and metadata assets.
- [x] `/Applications/Cutout.app` reports version/build `0.1.7` and passes
      Developer ID `codesign`, `spctl`, and `stapler validate` checks.
- [x] The previous `0.1.6` application bundle is no longer installed after the
      verified replacement succeeds.

## Out Of Scope

- Changing release signing policy or weakening any required gate.
- Migrating or deleting local application data.
- Adding product behavior beyond the already merged preparation-projection fix.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.

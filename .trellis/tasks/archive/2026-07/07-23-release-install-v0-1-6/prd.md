# Release and install Cutout v0.1.6

## Goal

Publish the merged regenerate activity-bubble fix as Cutout `0.1.6`, remove the
installed `0.1.5` macOS application, and install the signed/notarized Apple
Silicon `0.1.6` build locally.

## Background

- `/Applications/Cutout.app` is signed version `0.1.5`.
- The latest public GitHub Release is `v0.1.5`.
- The regenerate activity projection fix is merged to `github/main` at merge
  commit `7296222`, after the `v0.1.5` tag.
- The protected `release` environment contains the required Apple and Tauri
  updater credentials. Windows installers are intentionally published without
  Authenticode under the current reviewed release contract.

## Requirements

- Bump all synchronized product, Tauri, Agent capability, Codex plugin, runtime,
  README, and changelog version surfaces from `0.1.5` to `0.1.6`.
- Regenerate the bundled Codex plugin rather than manually editing generated
  runtime fingerprints.
- Preserve the existing atomic four-platform workflow, signing, notarization,
  updater signature, checksum, provenance, and publication gates.
- Publish immutable tag and GitHub Release `v0.1.6` from reviewed `main`.
- Download the published Apple Silicon DMG, verify it against `SHA256SUMS`, and
  validate the DMG notarization ticket before replacing the local app.
- Quit Cutout, remove the installed `0.1.5` app, install `0.1.6` into
  `/Applications`, and verify version, Developer ID signature, Gatekeeper, and
  stapled notarization evidence.
- Preserve all user projects, `.cutout` repositories, IndexedDB/application
  support data, settings, and credentials; only the application bundle changes.

## Acceptance Criteria

- [ ] Source version validation passes for `0.1.6` across all required files.
- [ ] Focused release tests, full tests, lint, TypeScript, production build,
      Rust checks/tests, Agent validation, and release-local gates pass.
- [ ] Release PR merges with required CI and CodeQL checks green.
- [ ] Tag `v0.1.6` points to the reviewed merge commit on `main`.
- [ ] The protected release workflow publishes all required macOS, Windows,
      Linux, updater, checksum, SBOM, provenance, and metadata assets.
- [ ] `/Applications/Cutout.app` reports version/build `0.1.6` and passes
      `codesign`, `spctl`, and `stapler validate`.
- [ ] The previous `0.1.5` application bundle is no longer installed.

## Out Of Scope

- Changing release signing policy or weakening any required gate.
- Migrating or deleting local application data.
- Adding new product behavior beyond the already merged bubble fix.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.

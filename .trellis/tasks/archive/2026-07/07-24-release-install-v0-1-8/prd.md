# Release and install Cutout v0.1.8

## Goal

Publish the troubleshooting recovery UX fix as Cutout `0.1.8`, remove the
installed `0.1.7` macOS application, and install the signed/notarized Apple
Silicon `0.1.8` build locally.

## Requirements

- Merge the reviewed troubleshooting UX branch into `main` with required CI
  and CodeQL checks green.
- Bump all synchronized product, Tauri, Agent capability, Codex plugin,
  runtime, README, and changelog version surfaces from `0.1.7` to `0.1.8`.
- Regenerate the bundled Codex plugin rather than manually editing generated
  runtime fingerprints.
- Preserve the atomic four-platform workflow, signing, notarization, updater
  signature, checksum, provenance, and publication gates.
- Publish immutable tag and GitHub Release `v0.1.8` from reviewed `main`.
- Download the published Apple Silicon DMG, verify it against `SHA256SUMS`, and
  validate its notarization ticket before replacing the local app.
- Quit Cutout, move the installed `0.1.7` bundle aside, install `0.1.8` into
  `/Applications`, and verify version, architecture, Developer ID signature,
  Gatekeeper, and stapled notarization evidence.
- Preserve all user projects, `.cutout` repositories, IndexedDB/application
  support data, settings, and credentials; only the application bundle changes.

## Acceptance Criteria

- [ ] Troubleshooting UX PR merges to `main` with required checks green.
- [ ] Source version validation passes for `0.1.8` across all required files.
- [ ] Focused release tests, full tests, lint, TypeScript, production build,
      Rust checks/tests, Agent validation, and release-local gates pass.
- [ ] Release PR merges with required CI and CodeQL checks green.
- [ ] Tag `v0.1.8` points to the reviewed release merge commit on `main`.
- [ ] The protected release workflow publishes all required macOS, Windows,
      Linux, updater, checksum, SBOM, provenance, and metadata assets.
- [ ] `/Applications/Cutout.app` reports version/build `0.1.8` and passes
      Developer ID `codesign`, `spctl`, and `stapler validate` checks.
- [ ] The previous `0.1.7` application bundle is no longer installed after the
      verified replacement succeeds.

## Notes

- Windows installers remain intentionally published without Authenticode under
  the reviewed release contract; updater signatures and provenance remain
  mandatory.
- Do not change release policy, delete local application data, or install from
  a draft/workflow artifact.

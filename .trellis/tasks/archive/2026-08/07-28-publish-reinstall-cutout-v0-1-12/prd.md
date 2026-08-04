# Publish and reinstall Cutout v0.1.12

## Goal

Publish the simplified automatic AI setup experience from protected `main` as
the next immutable stable Cutout desktop release, then replace the local
`0.1.11` installation with the verified public Apple Silicon `0.1.12` build.

## Background

- `v0.1.11` is the current public Latest release and `/Applications/Cutout.app`
  currently reports `0.1.11`.
- Protected `github/main` contains the reviewed AI setup simplification from
  PR #46 and its Trellis bookkeeping from PR #47.
- The protected `release` environment contains the required Apple signing,
  notarization, Tauri updater signing, updater public-key, endpoint, and host
  allowlist values.
- `.github/workflows/release-update.yml` is the sole GitHub Release authority.

## Requirements

- Advance every repository-owned product version from `0.1.11` to `0.1.12`
  without changing protocol versions.
- Regenerate the Codex plugin runtime and keep package, Tauri, Cargo, Agent
  capability, plugin, README, lockfile, and changelog release surfaces aligned.
- Release only commits reachable from protected `github/main`; do not bypass
  branch checks, environment protections, signing, notarization, updater
  verification, provenance, or four-platform publication gates.
- Publish a stable, non-draft, non-prerelease `v0.1.12` GitHub Release with the
  complete macOS ARM/Intel, Windows x64, and Linux x64 updater manifest.
- Verify public checksums, updater metadata, signatures, provenance, and macOS
  Developer ID/notarization evidence before replacing the local application.
- Quit Cutout before replacement. Preserve the previous application bundle in
  Trash with a versioned name rather than deleting it irrecoverably.
- Install the public Apple Silicon DMG into `/Applications/Cutout.app`, verify
  version, architecture, Developer ID signature, hardened runtime, Gatekeeper,
  and stapled notarization ticket, then launch the installed bundle.

## Acceptance Criteria

- [x] `node scripts/validate-release-version.mjs --expected 0.1.12` passes and
      the generated plugin runtime is in sync.
- [x] Local Agent, release-contract, frontend, native, build, and diff gates pass.
- [ ] The protected release PR merges and annotated tag `v0.1.12` resolves to a
      commit reachable from `github/main`.
- [ ] The tag-triggered workflow completes successfully and publishes a stable
      Latest Release with all expected assets and updater platforms.
- [ ] Public release evidence and downloaded Apple Silicon assets validate
      before local installation changes begin.
- [ ] The prior `/Applications/Cutout.app` is recoverable from Trash and the
      installed replacement reports `0.1.12`, arm64, accepted Gatekeeper, and a
      stapled notarization ticket.
- [ ] Cutout launches from the installed `0.1.12` bundle.

## Out Of Scope

- Feature changes beyond the already reviewed AI setup simplification.
- Reusing or moving an existing tag, replacing immutable release assets, or
  weakening any release/security gate.
- Destructive removal of user data, projects, settings, or Keychain credentials.

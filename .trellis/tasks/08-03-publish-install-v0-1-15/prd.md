# Publish and install Cutout v0.1.15

## Goal

Publish the independent page-generation/QA convergence already merged to
`github/main` as the next immutable stable Cutout release, then replace the
local macOS installation with the exact published Apple Silicon artifact.

## Confirmed Facts

- `github/main` is `b79b273`; the latest public release and local installation
  are both `0.1.14`.
- The release increment is `0.1.15`. No tag, branch, or public Release currently
  exists for that version.
- The protected `release` environment has all required Apple and Tauri signing
  secrets plus the updater public key, endpoint, and host allowlist variables.
- The local Keychain has a valid Developer ID Application identity for team
  `2L5YC85FQ7`, but GitHub Actions remains the sole publication authority.
- The primary workspace has unrelated uncommitted work and must not be used as
  the release source or modified during this task.

## Requirements

- Synchronize every repository-owned version surface to `0.1.15`, regenerate
  the Codex plugin runtime, and add truthful release notes.
- Preserve the already-reviewed product behavior: page image concurrency stays
  at three, page QA has zero automatic rerolls, and Agent-authored page and
  material scope is unchanged.
- Run release/version, Agent/plugin, updater, workflow, frontend, native, and
  diff gates before the release commit is merged.
- Merge the release branch through a protected PR. Create annotated tag
  `v0.1.15` only from the reviewed merge commit reachable from `main`.
- Let `.github/workflows/release-update.yml` build all four platforms, sign the
  updater artifacts, notarize and staple both macOS architectures, attest the
  release assets, and publish one non-draft stable Release.
- Verify the public `latest.json`, platform coverage, signatures, checksums,
  provenance, release state, and Apple Silicon artifact before installation.
- Quit Cutout, move the existing `/Applications/Cutout.app` to a recoverable
  Trash location, mount the published Apple Silicon DMG, install its app, and
  verify version, architecture, signature, Gatekeeper, stapled ticket, and
  launch from `/Applications`.

## Acceptance Criteria

- [ ] Version validation reports synchronized `0.1.15` source and tag identity.
- [ ] Local release gates and the release PR's required CI checks pass.
- [ ] Annotated `v0.1.15` resolves to the reviewed `main` merge commit.
- [ ] The public stable Release is non-draft, non-prerelease, and contains all
      required macOS, Windows, Linux, updater, checksum, SBOM, metadata, and
      provenance assets.
- [ ] Public `latest.json` reports `0.1.15` for `darwin-aarch64`,
      `darwin-x86_64`, `windows-x86_64`, and `linux-x86_64`, each with a
      non-empty updater signature and approved HTTPS URL.
- [ ] The downloaded Apple Silicon DMG matches `SHA256SUMS`; the DMG and app
      pass Developer ID, Gatekeeper, and stapler verification.
- [ ] `/Applications/Cutout.app` reports version `0.1.15`, contains an `arm64`
      executable, launches successfully, and the previous app remains
      recoverable from Trash.

## Out Of Scope

- Changing release workflow policy or weakening any quality/signing gate.
- Publishing from the dirty primary workspace or including its local changes.
- Replacing immutable release assets after publication.
- Claiming Windows Authenticode signing; Windows installers remain explicitly
  unsigned while their updater artifacts retain Tauri signatures.

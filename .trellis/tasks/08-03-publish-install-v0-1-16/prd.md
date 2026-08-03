# Publish and install Cutout v0.1.16

## Goal

Publish the reviewed localized release-notes experience as the next immutable
stable Cutout release, then replace the local macOS installation with the exact
published Apple Silicon artifact.

## Confirmed Facts

- `github/main` is `0ad6e9b`, the completed `v0.1.15` baseline.
- `feat/release-notes-experience` contains only the reviewed feature commit and
  its Trellis bookkeeping, and is three commits ahead of `github/main`.
- The latest public Release is stable `v0.1.15`; no `v0.1.16` tag or Release
  exists at task start.
- The primary workspace contains unrelated commits and uncommitted work. It is
  not a release source and must remain untouched.
- `src/release-notes/catalog.json` already contains reviewed `0.1.16` copy in
  `en`, `zh-CN`, `ja`, `fr`, and `es`.

## Requirements

- Synchronize every repository-owned product version to `0.1.16`, regenerate
  Codex plugin runtime metadata, update release links, and add a truthful
  changelog entry derived from the reviewed catalog.
- Preserve the release-note compatibility contract: old clients receive
  readable English `notes`; new clients receive bounded localized metadata.
- Run exact-version release-note, version, Agent/plugin, updater/workflow,
  frontend, native, and diff gates before publication.
- Merge through a reviewed PR to `github/main`; create annotated tag `v0.1.16`
  only from the resulting main merge commit.
- Let `.github/workflows/release-update.yml` remain the sole publisher for all
  four platform artifacts, signatures, macOS notarization/stapling,
  attestations, updater metadata, checksums, and the public Release.
- Verify the public Release and `latest.json`, including localized metadata,
  readable legacy notes, platform coverage, signatures, checksums, provenance,
  and the Apple Silicon artifact before local installation.
- Quit Cutout, move `/Applications/Cutout.app` to a recoverable Trash path,
  install the verified public Apple Silicon DMG, and verify version,
  architecture, Developer ID, Gatekeeper, stapled ticket, and launch origin.

## Acceptance Criteria

- [ ] Source and tag identity validate as synchronized `0.1.16`.
- [ ] Exact `0.1.16` release notes validate in all five locales.
- [ ] Local release gates and protected PR checks pass.
- [ ] Annotated `v0.1.16` resolves to the reviewed merge commit on main.
- [ ] The public stable Release is non-draft/non-prerelease with the required
      cross-platform, updater, checksum, SBOM, metadata, and provenance assets.
- [ ] Public `latest.json` contains readable English `notes`, matching bounded
      `cutoutReleaseNotes`, and all four signed updater platform entries.
- [ ] The Apple Silicon DMG matches public checksums and passes Developer ID,
      Gatekeeper, and stapler verification.
- [ ] `/Applications/Cutout.app` reports `0.1.16`, is arm64, launches from the
      installed bundle, and the previous app remains recoverable from Trash.

## Out Of Scope

- Including local-main or dirty-primary changes not present in the reviewed
  release-notes branch.
- Weakening release, approval, signing, notarization, or updater policy.
- Replacing immutable assets after publication or claiming Windows
  Authenticode signing.


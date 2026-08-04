# Publish and install Cutout v0.1.17

## Goal

Publish the image-capability and Provider-routing convergence now merged on
remote `main` as the next immutable stable Cutout desktop release, then replace
the local macOS installation with the exact published Apple Silicon artifact.

## Confirmed Facts

- `github/main` is `79b0b45`, and contains `7d2cf80` through PR #55.
- Source versions remain `0.1.16`; public GitHub Releases currently stop at
  stable `v0.1.15`.
- Annotated tag `v0.1.16` already targets `02ecac7`. Its release workflow passed
  quality gates but waited for the protected `release` environment before any
  platform build. That obsolete run was cancelled and the immutable tag will
  not be moved or reused.
- No `v0.1.17` tag or Release exists at task start.
- The dirty primary workspace is not a release source and must remain untouched.

## Requirements

- Synchronize every repository-owned product version to `0.1.17`, regenerate
  Codex plugin runtime metadata, update release links, and add a truthful
  changelog entry.
- Add one exact `0.1.17` release-note catalog entry in all five shipped locales.
  The copy must explain Provider-neutral edit evidence, independent generation
  and editing routes, and quality ranking as recommendation rather than support.
- Run exact-version release-note, version, Agent/plugin, updater/workflow,
  frontend, native, diff, and secret gates before publication.
- Merge through a reviewed PR to `github/main`; create annotated tag `v0.1.17`
  only from the resulting main merge commit.
- Approve the protected `release` environment only for the exact reviewed tag
  run. Let `.github/workflows/release-update.yml` remain the sole publisher for
  four platform artifacts, updater signatures, Apple signing/notarization,
  checksums, SBOMs, attestations, updater metadata, and the public Release.
- Verify the public Release and `latest.json`, including localized metadata,
  readable legacy notes, platform coverage, signatures, checksums, provenance,
  and the Apple Silicon artifact before local installation.
- Quit Cutout, move `/Applications/Cutout.app` to a recoverable Trash path,
  install the verified public Apple Silicon DMG, and verify version,
  architecture, Developer ID, Gatekeeper, stapled ticket, and launch origin.

## Acceptance Criteria

- [ ] Source and tag identity validate as synchronized `0.1.17`.
- [ ] Exact `0.1.17` release notes validate in all five locales.
- [ ] Local release gates and protected PR checks pass.
- [ ] Annotated `v0.1.17` resolves to the reviewed merge commit on main.
- [ ] The exact tag run receives explicit `release` environment approval and
      publishes a non-draft, non-prerelease stable Release.
- [ ] The Release contains required cross-platform, updater, checksum, SBOM,
      metadata, and provenance assets.
- [ ] Public `latest.json` contains readable English `notes`, matching bounded
      `cutoutReleaseNotes`, and all four signed updater platform entries.
- [ ] The Apple Silicon DMG matches public checksums and passes Developer ID,
      Gatekeeper, and stapler verification.
- [ ] `/Applications/Cutout.app` reports `0.1.17`, is arm64, launches from the
      installed bundle, and the previous app remains recoverable from Trash.

## Out Of Scope

- Publishing or moving the obsolete `v0.1.16` tag.
- Including local-main or dirty-primary changes absent from `github/main`.
- Weakening release, approval, signing, notarization, updater, or evidence policy.
- Adding new Provider adapters or changing the image-routing behavior already
  reviewed and merged in PR #55.

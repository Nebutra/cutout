# Publish and install Cutout v0.1.19

## Goal

Publish the reviewed `release/v0.1.19-rc` candidate as the next immutable
stable Cutout desktop release, then replace the local macOS installation with
the exact verified public Apple Silicon artifact.

## Confirmed Facts

- `github/main` starts at `6f02c5a`; the release candidate is a clean,
  19-commit descendant at `8c6151e`.
- Source versions and the exact five-locale release-note entry validate as
  `0.1.19`.
- No local or remote `v0.1.19` tag and no GitHub `v0.1.19` Release exists.
- The protected `release` environment contains the required Apple and Tauri
  signing secrets plus updater public configuration.
- The obsolete `v0.1.16` tag produced no public Release and remains immutable;
  this release must not repeat tag reuse or a false publication claim.

## Requirements

- Re-run release-critical local gates against the exact candidate.
- Push the candidate branch and merge it through GitHub into protected `main`.
- Create annotated `v0.1.19` only at the reviewed resulting `main` commit, then
  push the tag once.
- Let `.github/workflows/release-update.yml` remain the sole publisher for all
  four platforms, updater signatures, Apple signing/notarization, checksums,
  SBOMs, attestations, updater metadata, and the public Release.
- Approve the protected `release` deployment only when it is bound to the exact
  `v0.1.19` run and reviewed tag SHA.
- Verify the public Release and `latest.json`: stable state, required assets,
  readable English legacy notes, five-locale projection, four signed updater
  platform entries, checksums, provenance, and Apple trust evidence.
- Quit Cutout, move the prior `/Applications/Cutout.app` to a unique
  recoverable Trash path, install from the verified public Apple Silicon DMG,
  and verify version, architecture, signature, Gatekeeper, stapling, and launch
  origin.

## Acceptance Criteria

- [x] Candidate, merged main SHA, annotated tag, and synchronized source all
      resolve to version `0.1.19` without tag movement.
- [x] Exact five-locale release notes and local release-critical gates pass.
- [x] The exact tag workflow succeeds and publishes a non-draft,
      non-prerelease stable GitHub Release.
- [x] Required cross-platform installer/updater, checksum, SBOM, metadata, and
      provenance assets are present and independently validated.
- [x] Public `latest.json` has readable English `notes`, matching localized
      `cutoutReleaseNotes`, and signed entries for all four platform keys.
- [x] The Apple Silicon DMG matches `SHA256SUMS` and passes `hdiutil`,
      Developer ID, Gatekeeper, and stapler verification.
- [x] `/Applications/Cutout.app` reports `0.1.19`, contains `arm64`, launches
      from the installed bundle, and the prior app remains recoverable.

See `verification.md` for the exact public and local evidence.

## Out Of Scope

- Moving or republishing any earlier immutable tag.
- Weakening branch, environment, signing, notarization, updater, or evidence
  policy to make a release pass.
- Changing product behavior after the candidate gate; any required source fix
  means stop and prepare a new reviewed candidate/patch as appropriate.

# Clean local Cutout installs and review updater

## Goal

Leave one trusted local Cutout installation at the latest public stable version
and assess whether the source-to-release-to-desktop update flow follows safe
release engineering best practices.

## Background

- `/Applications/Cutout.app` is version `0.1.1` and fails Gatekeeper validation.
- Two generated `Cutout.app` bundles below `src-tauri/target` are also indexed by
  Spotlight/LaunchServices, which explains the duplicate application results.
- GitHub Release `v0.1.3` is public and contains signed/notarized Apple Silicon
  and Intel DMGs plus signed updater artifacts and metadata.
- A recoverable old `0.1.1` backup already exists in Trash.

## Requirements

- Detect every local `Cutout.app` bundle and record its path/version before
  changing anything.
- Download the Apple Silicon `v0.1.3` DMG and `SHA256SUMS` from the public
  GitHub Release.
- Verify the downloaded DMG digest, Developer ID/Gatekeeper acceptance, and
  notarization ticket before installation.
- Quit Cutout, move the old `/Applications` copy and generated target bundles
  to uniquely named Trash locations, then install exactly one `v0.1.3` app at
  `/Applications/Cutout.app`.
- Refresh LaunchServices/Spotlight registration so duplicate results disappear.
- Launch the installed app and verify its bundle version, signature, Gatekeeper
  acceptance, notarization ticket, and process path.
- Review version synchronization, tag immutability, dual-remote pushes, updater
  manifest/signature validation, rollout, rollback, check cadence, install and
  relaunch behavior, and release workflow protections.
- Report findings ordered by severity with concrete file references; do not
  modify updater/release source unless separately requested.

## Acceptance Criteria

- [x] Only `/Applications/Cutout.app` remains indexed outside Trash and it is
  version `0.1.3`.
- [x] The installed application passes `codesign`, `spctl`, and `stapler`
  validation and launches from `/Applications`.
- [x] Removed bundles remain recoverable in Trash with unambiguous names.
- [x] The updater/release review states whether the mechanism is best practice,
  lists any remaining risks, and distinguishes required fixes from optional
  improvements.

## Completion Evidence

- The only indexed installation is `/Applications/Cutout.app`, version `0.1.3`,
  launched from `/Applications/Cutout.app/Contents/MacOS/app`.
- The installed app passes strict code-signature verification, Gatekeeper with
  `source=Notarized Developer ID`, and stapled-ticket validation.
- Superseded application bundles were moved to timestamped Trash paths and were
  not permanently deleted.
- Focused updater/release tests passed: 6 files and 34 tests. The Agent contract
  validation also passed.
- Required release/updater fixes: protect the GitHub release environment and
  release tags, make rollout/rollback effective or stop exposing them, require
  the complete release quality gate, pin the production updater trust root,
  choose one authoritative release remote, and repair native/frontend retry
  state synchronization.
- Required for mature Windows distribution: Authenticode-sign NSIS/MSI output.
- Optional hardening: signed SLSA/GitHub artifact attestations and commit-SHA
  pinning for every release workflow action.

## Out Of Scope

- Emptying Trash or permanently deleting old applications.
- Changing release/updater code during this review.
- Reissuing or moving published version tags.

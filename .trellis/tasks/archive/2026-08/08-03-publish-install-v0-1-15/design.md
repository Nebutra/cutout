# Design: Cutout v0.1.15 release and local replacement

## Release boundary

The isolated `release/v0.1.15` worktree is based on `github/main@b79b273`.
Only version, generated plugin metadata, README install references, changelog,
and this task's Trellis artifacts change before the release PR. The dirty
primary workspace is neither copied nor rebased.

## Version contract

`package.json`, Tauri config, Cargo package/lock, Agent capability manifest,
Codex plugin manifest, generated plugin runtime data/build metadata, README
references, and changelog advance together from `0.1.14` to `0.1.15`.
Protocol versions remain unchanged. `validate-release-version.mjs` is the
fail-closed authority for synchronized product versions.

## Publication flow

1. Prepare and validate the version-only release candidate locally.
2. Merge the release PR through the protected `main` quality gate.
3. Create and push annotated tag `v0.1.15` at the merge commit.
4. Let the tag workflow validate reachability and source version, rerun the
   complete quality workflow, build four platform artifacts, verify signatures,
   notarize/staple macOS bundles, attest assets, and publish atomically.
5. Download public evidence and the Apple Silicon DMG, verify it independently,
   then replace the local app through a recoverable Trash move.

## Trust and failure boundaries

- GitHub Actions is the only Release mutator; local credentials are diagnostic
  evidence and are not used to assemble alternate public assets.
- A failed matrix, missing signature, rejected notarization, invalid checksum,
  or incomplete manifest stops publication. Never move or reuse the tag; a
  failed immutable release requires a new patch version.
- Installation begins only after the Release is public and its remote evidence
  validates. The existing app is never permanently deleted.
- User data and local Provider credentials remain outside the app bundle and
  are not removed during replacement.

## Rollback

Before replacement, move the existing app to a version-qualified path under
`~/.Trash`. If verification or launch fails, remove only the newly installed
bundle and restore the prior app. Do not overwrite user data or credentials.

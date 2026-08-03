# Design: Cutout v0.1.16 release and local replacement

## Release boundary

Prepare `release/v0.1.16` from `feat/release-notes-experience@9177c8b`, whose
merge base is `github/main@0ad6e9b`. The dirty primary workspace and its
additional local-main commits are excluded.

## Version and content contract

`package.json`, Tauri config, Cargo package/lock, Agent capability package
version, Codex plugin manifest, generated plugin runtime metadata, README links,
and changelog advance together to `0.1.16`. Protocol versions remain unchanged.
The exact catalog entry is validated before build and produces both legacy and
localized updater projections plus the GitHub Release body.

## Publication flow

1. Create the version-only release branch and validate it locally.
2. Push the feature and release branches, merge the feature and release changes
   through protected PRs without importing unrelated local main.
3. Create annotated `v0.1.16` at the reviewed main merge commit.
4. Push the tag and let the repository workflow build/sign/notarize/attest and
   publish the immutable four-platform Release.
5. Poll only aggregate workflow/Release state. After publication, download and
   independently verify public evidence before installing the DMG.

## Trust and rollback

- GitHub Actions is the sole Release mutator and signing/notarization authority.
- A failed immutable tag is never moved; a failed release requires a new patch.
- Installation starts only after public checksums and Apple trust evidence pass.
- The old app moves to a unique Trash path before replacement; user data and
  local credentials remain outside the bundle and are untouched.


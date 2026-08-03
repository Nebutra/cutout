# Design: Cutout v0.1.17 release and local replacement

## Release boundary

Prepare `release/v0.1.17` from `github/main@79b0b45`. The dirty primary
workspace and its additional local commits are excluded. The cancelled
`v0.1.16` run remains historical evidence and its immutable tag is untouched.

## Version and content contract

`package.json`, Tauri config, Cargo package/lock, Agent capability package
version, Codex plugin manifest, generated plugin runtime metadata, README links,
and changelog advance together to `0.1.17`. Protocol versions remain unchanged.
One reviewed catalog entry produces legacy English notes, five-locale updater
metadata, the bundled What's New content, and the GitHub Release body.

## Publication flow

1. Prepare and validate the version-only release branch.
2. Merge through a protected PR without importing dirty primary-workspace state.
3. Create annotated `v0.1.17` at the reviewed `main` merge commit.
4. Push the tag and wait for validation and the reusable quality gate.
5. Approve the pending deployment only after verifying the run tag and SHA.
6. Let the repository workflow build, sign, notarize, attest, and publish.
7. Download and independently verify public evidence before installing the DMG.

## Trust and rollback

- GitHub Actions is the sole Release mutator and signing/notarization authority.
- Environment approval is bound operationally to the inspected `v0.1.17` run;
  no approval is inferred from a previous run.
- A failed immutable tag is never moved; a failed release requires a new patch.
- Installation starts only after public checksums and Apple trust evidence pass.
- The old app moves to a unique Trash path before replacement; user data and
  local credentials remain outside the bundle and are untouched.

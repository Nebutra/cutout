# Publish Cutout OTA v0.1.10

## Goal

Publish the API-key visibility-toggle stability fix from `github/main` as the
next immutable stable Cutout OTA release.

## Background

- `v0.1.9` is the current public Latest release.
- Merge commit `5da7b708ee5d5a3caf4489f9ef5b7b1f4e87c459` contains the reviewed fix.
- `v0.1.10` and its GitHub Release do not exist.
- The repository's tag-triggered release workflow is the sole release
  authority and previously published `v0.1.9` successfully.
- The user's local `main` has unrelated uncommitted work and must remain
  untouched.

## Requirements

- Prepare `0.1.10` from current `github/main` in an isolated worktree.
- Synchronize package, Tauri, Cargo, Agent capability, Codex plugin, generated
  runtime, README, release checklist, lockfile, and changelog version surfaces.
- Describe the secret visibility-toggle stability fix in the changelog.
- Read the Agent capability manifest before changing its package version and
  validate the synchronized Agent surface with `pnpm agent:validate`.
- Reach `github/main` through a reviewed pull request and required Quality
  Gate before tagging.
- Create immutable annotated tag `v0.1.10` only from the reviewed merge commit.
- Publish only through `.github/workflows/release-update.yml`; do not upload or
  replace assets manually.
- Verify the final stable Release, checksums, four-platform updater manifest,
  updater signatures, provenance, and macOS notarization evidence.
- Do not weaken signing, notarization, updater, provenance, or atomic publish
  gates.

## Acceptance Criteria

- [x] All version-bearing release surfaces validate as `0.1.10`.
- [x] Local release checks, Agent validation, lint, tests, build, and native
  checks pass.
- [ ] The release PR passes protected GitHub checks and merges into `main`.
- [ ] Annotated tag `v0.1.10` points to that merge commit and is reachable from
  `main`.
- [ ] The protected release workflow completes successfully.
- [ ] Public `v0.1.10` is non-draft, non-prerelease, and marked Latest.
- [ ] `latest.json` advertises `0.1.10` for macOS ARM/Intel, Windows x64, and
  Linux x64 with valid updater signature sidecars.
- [ ] macOS application and DMG assets are Developer ID signed, notarized, and
  stapled before publication.

## Out Of Scope

- Reinstalling the local app.
- Changing updater UX or notification behavior.
- Changing the current Windows Authenticode policy.
- Publishing unrelated local or in-progress work.

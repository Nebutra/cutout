# Implementation Plan

- [x] Confirm `v0.1.5` and its GitHub Release do not exist.
- [x] Create an isolated release worktree and branch from current
  `github/main`.
- [x] Cherry-pick the reviewed conversation persistence product commit and
  resolve only conflicts caused by newer GitHub release hardening.
- [x] Update changelog, documentation, package/Tauri/Cargo metadata, Agent
  capability metadata, Codex plugin metadata, CLI/runtime versions, UI display
  versions, and the Cargo lockfile to `0.1.5`.
- [x] Regenerate repository-owned Codex plugin runtime outputs.
- [x] Run version validation, `pnpm agent:validate`, focused release tests,
  production build, lint/type checks, and the relevant conversation persistence
  tests.
- [x] Commit only the reviewed product and release metadata changes.
- [ ] Push the release branch, open a pull request, wait for `Quality gate`, and
  merge through the repository ruleset.
- [ ] Verify the merge commit still passes the `0.1.5` version validator and is
  reachable from `github/main`.
- [ ] Confirm every protected secret name, with a hard stop if either Windows
  certificate secret remains absent.
- [ ] Create and push annotated tag `v0.1.5` from the reviewed merge commit.
- [ ] Monitor the protected release workflow until all jobs complete; do not
  leave a partial public Release.
- [ ] Verify the public Release state, expected asset set, checksums,
  `latest.json` four-platform map, updater sidecars, provenance, and macOS
  notarization/signature evidence.
- [ ] Inventory and quit installed Cutout processes/bundles.
- [ ] Move the old installed bundle to a unique Trash path.
- [ ] Download and verify the public Apple Silicon DMG and install exactly one
  `/Applications/Cutout.app`.
- [ ] Refresh registration, launch the app, and verify version, bundle id,
  signature, notarization, process path, and visible UI.
- [ ] Run the Trellis quality check, commit task records separately, archive the
  task, and record the developer journal.

## Validation Commands

```bash
node scripts/validate-release-version.mjs --expected 0.1.5
pnpm agent:validate
pnpm exec vitest run scripts/validate-release-version.test.ts scripts/release-workflow.test.ts scripts/update-artifacts.test.ts
pnpm build
pnpm lint
pnpm exec tsc -b --pretty false
cargo check --manifest-path src-tauri/Cargo.toml
gh secret list --env release --repo Nebutra/cutout
gh variable list --env release --repo Nebutra/cutout
```

## Hard Stops

- Existing `v0.1.5` tag or Release.
- Missing Windows Authenticode, Apple notarization, or updater-signing protected
  configuration.
- Failed required `Quality gate` or any native platform job.
- Version drift, updater signature failure, incomplete asset set, or failed
  notarization/signature verification.

## Current Evidence

- Release candidate worktree: `/private/tmp/cutout-release-v015`
- Pull request: `https://github.com/Nebutra/cutout/pull/17`
- Candidate head: `23824b8c26e8cccb9a4ca57f6439591b20737d8a`
- PR #17 was updated to `github/main` `eed1354` without force-pushing. GitHub
  checks at the updated head are 14 successful, including the aggregate
  `Quality gate`, all three native jobs, and both Windows Node contract jobs.
- Windows Node 22 originally exposed a 5-second default-timeout defect in the
  offline TypeScript compiler test. Commit `b94eb54` gives that real child
  process an explicit 20-second test budget and records the cross-platform rule
  in the release spec.
- PR #17 is current with `github/main` and remains intentionally unmerged until
  the protected Windows signing configuration exists.
- Protected `release` secrets still omit `WINDOWS_CERTIFICATE` and
  `WINDOWS_CERTIFICATE_PASSWORD`; no tag or Release has been created.

# Implementation Plan

- [x] Update changelog and all synchronized `0.1.10` version surfaces.
- [x] Regenerate the repository-owned Codex plugin runtime.
- [x] Run release-version validation, Agent validation, focused release tests,
  lint, type-check, production build, native checks, and diff validation.
- [x] Commit only the release candidate and Trellis planning records.
- [x] Push `release/v0.1.10`, open a PR, and wait for protected checks.
- [x] Merge the PR and verify the merge commit on `github/main`.
- [x] Create and push annotated tag `v0.1.10` from the merge commit.
- [x] Monitor `.github/workflows/release-update.yml` to completion.
- [x] Verify release state, asset set, checksums, updater manifest/platforms,
  signature sidecars, provenance, and macOS notarization evidence.
- [x] Archive the Trellis task and record the session.

## Validation Commands

```bash
node scripts/validate-release-version.mjs --expected 0.1.10
pnpm agent:validate
pnpm exec vitest run scripts/validate-release-version.test.ts scripts/release-workflow.test.ts scripts/update-artifacts.test.ts
pnpm lint
pnpm exec tsc -b --pretty false
pnpm build
cargo check --locked --manifest-path src-tauri/Cargo.toml
git diff --check
```

## Hard Stops

- Existing `v0.1.10` tag or Release.
- Release candidate not based on current `github/main`.
- Missing Apple, updater-signing, or updater-public configuration used by the
  previously successful protected release workflow.
- Failed protected Quality Gate or release workflow job.
- Version drift, incomplete four-platform manifest, missing updater sidecar,
  checksum mismatch, or failed macOS signature/notarization verification.

# Implementation Plan

- [x] Update changelog and every synchronized `0.1.11` version surface.
- [x] Regenerate and validate the Codex plugin runtime.
- [x] Run local release, Agent, frontend, native, and diff gates.
- [x] Project the complete native Agent inventory into localized Settings UI.
- [x] Replace Windows metadata-only credential identity with stable handle IDs.
- [ ] Commit and push `release/v0.1.11`.
- [ ] Merge PR #43, rebase the release branch, and merge the release PR.
- [ ] Create and push annotated tag `v0.1.11` from the merge commit.
- [ ] Verify the protected release publication and all updater assets.
- [ ] Uninstall the old local app and install the published Apple Silicon DMG.
- [ ] Archive the release task and record the release evidence.

## Validation Commands

```bash
node scripts/validate-release-version.mjs --expected 0.1.11
pnpm plugin:build
pnpm agent:validate
pnpm exec vitest run scripts/validate-release-version.test.ts scripts/release-workflow.test.ts scripts/update-artifacts.test.ts
pnpm lint
pnpm exec tsc -b --pretty false
pnpm build
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib
cargo check --locked --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
git diff --check
```

## Hard Stops

- Existing `v0.1.11` tag or Release.
- PR #43 or the release PR has not passed required checks.
- Version drift or Agent/plugin generated-runtime drift.
- Missing platform updater artifact/signature, checksum, provenance, or macOS
  notarization evidence.

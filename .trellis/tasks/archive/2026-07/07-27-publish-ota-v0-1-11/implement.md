# Implementation Plan

- [x] Update changelog and every synchronized `0.1.11` version surface.
- [x] Regenerate and validate the Codex plugin runtime.
- [x] Run local release, Agent, frontend, native, and diff gates.
- [x] Project the complete native Agent inventory into localized Settings UI.
- [x] Replace Windows metadata-only credential identity with stable handle IDs.
- [x] Commit and push `release/v0.1.11`.
- [x] Merge PR #43, rebase the release branch, and merge the release PR.
- [x] Create and push annotated tag `v0.1.11` from the merge commit.
- [x] Verify the protected release publication and all updater assets.
- [x] Uninstall the old local app and install the published Apple Silicon DMG.
- [x] Archive the release task and record the release evidence.

## Release Evidence

- Feature PR: `https://github.com/Nebutra/cutout/pull/43`
- Release PR: `https://github.com/Nebutra/cutout/pull/44`
- Tag commit: `f596be95c23eac65e754f8a0f1ca33c839161401`
- Workflow: `https://github.com/Nebutra/cutout/actions/runs/30258420338`
- Release: `https://github.com/Nebutra/cutout/releases/tag/v0.1.11`
- Publication: stable, non-draft, non-prerelease Latest with 17 assets.
- Updater: `latest.json` reports `0.1.11` for macOS ARM/Intel, Windows x64,
  and Linux x64; every platform has a non-empty updater signature.
- Evidence: `SHA256SUMS`, `provenance.json`, `release-metadata.json`, and
  `sbom.spdx.json` hashes match the downloaded public assets.
- Apple Silicon DMG SHA-256:
  `ef8dada4e4e10f266d7d172ef848be8f86c9aad741ca4d0a313efab8d4901482`.
- macOS verification: Developer ID Application `ZiXian Tang (2L5YC85FQ7)`,
  hardened runtime, Gatekeeper accepted, app and DMG notarization tickets
  stapled, and installed executable is a thin `arm64` Mach-O.
- Local replacement: `/Applications/Cutout.app` reports `0.1.11`; the previous
  `0.1.9` bundle is recoverable at
  `~/.Trash/Cutout-0.1.9-before-v0.1.11.app`.
- Startup: process launched from the installed bundle and its on-screen
  `Cutout` window was observed at `1296x865` after the WebView completed load.

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

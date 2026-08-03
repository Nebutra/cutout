# Implementation Plan

- [x] Synchronize all `0.1.12` version surfaces, README references, changelog,
      Cargo lockfile, and generated Codex plugin runtime.
- [x] Run release version, Agent/plugin, release-workflow, updater, lint,
      TypeScript, frontend build, Rust test/check/fmt, and diff gates.
- [ ] Commit and push `release/v0.1.12`, open a protected PR, and wait for all
      required checks and Quality Gate.
- [ ] Merge the release PR, verify the release commit is on `github/main`, and
      create/push annotated tag `v0.1.12` at that commit.
- [ ] Monitor the protected tag workflow through validation, reusable quality,
      four-platform build, signing/notarization, evidence, and publication.
- [ ] Verify the stable public Release, expected asset set, updater manifest,
      signatures, checksums, provenance, and Apple Silicon DMG hash.
- [ ] Quit the installed app, preserve `0.1.11` in Trash, install the verified
      Apple Silicon bundle, validate version/signing/notarization/architecture,
      and launch it.
- [ ] Archive the task, record release evidence, and merge the bookkeeping PR.

## Validation Commands

```bash
node scripts/validate-release-version.mjs --expected 0.1.12
pnpm plugin:build
pnpm agent:validate
pnpm exec vitest run scripts/validate-release-version.test.ts scripts/release-workflow.test.ts scripts/update-artifacts.test.ts
scripts/release-macos.sh --local
pnpm exec playwright test tests/visual/home-composer-surface.spec.ts tests/visual/update-settings.spec.ts --project=desktop-chrome
pnpm lint
pnpm exec tsc -b --pretty false
pnpm build
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib
cargo check --locked --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
git diff --check
```

## Review Evidence Boundary

- The exact reusable-CI browser gate above passes. The broader all-project
  Playwright catalog is not green (`81` passed, `46` failed, `9` skipped) and
  includes stale visual contracts plus pre-existing project/runtime failures.
  Do not describe the complete visual catalog as passing release evidence.

## Hard Stops

- An existing `v0.1.12` tag or Release.
- Version or generated plugin-runtime drift.
- A release commit not reachable from protected `github/main`.
- Missing or failed platform updater artifact/signature, checksum, provenance,
  Apple signing, notarization, Gatekeeper, or stapling evidence.
- Public artifact verification failure before local replacement.

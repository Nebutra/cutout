# Implementation Plan

1. Audit issue #12 against current HEAD and record fixed/present/partial status
   for all eight finding classes.
2. Enable private vulnerability reporting, add `SECURITY.md`, and harden every
   remaining issue #12 boundary with focused Rust/TypeScript/CLI/MCP tests.
3. Pin production updater configuration to compile-time values, expose channel
   capability, and repair native/frontend cancel and retry transitions.
4. Remove ineffective rollout/rollback generation, workflow inputs, artifacts,
   claims, and tests while preserving signed forward updates.
5. Centralize product-version derivation and expand release drift validation to
   UI, CLI, MCP, Agent, plugin, Tauri, and Cargo surfaces.
6. Add a complete release quality job, immutable action/toolchain pins,
   attestations, Windows Authenticode fail-closed gates, and single-authority
   remote checks.
7. Apply GitHub release-environment and branch/tag rules idempotently, then read
   back the effective settings.
8. Run focused checks after each boundary, then full lint/type/test/build/Rust,
   workflow, Agent, and diff checks.
9. Update executable specs and release/security docs, comment on and close issue
   #12, verify zero open issues, commit only task-owned paths, and push through
   the protected GitHub flow.

## Validation Commands

```bash
pnpm lint
pnpm exec tsc -b --pretty false
pnpm test
pnpm build
pnpm agent:validate
pnpm exec vitest run src/updater scripts/release-workflow.test.ts scripts/update-artifacts.test.ts scripts/validate-release-version.test.ts
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --locked --manifest-path src-tauri/Cargo.toml
cargo check --locked --manifest-path src-tauri/Cargo.toml
git diff --check
gh issue list --repo Nebutra/cutout --state open
```

## Risk And Rollback Points

- Preserve unrelated dirty files and never stage by broad path/glob.
- Capture GitHub environment/ruleset JSON before mutation.
- Do not enable required checks whose contexts do not exist on the protected
  branch; verify check names from GitHub first.
- Do not publish Windows output until Authenticode secrets exist.
- Do not close issue #12 before the private reporting endpoint reads back as
  enabled.

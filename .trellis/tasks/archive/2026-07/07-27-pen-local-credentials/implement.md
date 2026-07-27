# Implementation Plan

1. Update integration manifests, icon registry, process-surface contracts, and
   capability manifests to emit canonical Pen identifiers and display copy.
2. Add explicit legacy Pencil host-kind compatibility in the external-surface
   parser/bridge and update focused SDK/catalog/readiness tests.
3. Synchronize active integration documentation, plugin runtime mirrors,
   production-plan skills, smoke tests, and brand provenance copy.
4. Refactor Codex path handling and add bounded `auth.json` API-key discovery
   plus native secret resolution in `provider_discovery.rs`.
5. Update local-credential source copy across Rust, frontend defaults, and
   localization catalogs.
6. Add Rust tests for auth-only discovery, sanitized serialization, native
   resolution, OAuth-only/missing values, and rejected symlink/oversized auth;
   retain environment-provider coverage.
7. Run focused TypeScript and Rust tests, format, lint, type-check, full tests,
   build, `pnpm agent:validate`, and `git diff --check`.
8. Run Trellis quality/spec checks, commit on the task branch, push a PR, and
   merge to `github/main` without touching the user's dirty local main worktree.

## Review Gates

- Review all remaining active `Pencil` occurrences and classify each as an
  intentional legacy alias, historical record, or unrelated Lucide icon.
- Review serialized discovery output for absence of sentinel credentials.
- Review capability/runtime mirrors for exact equality after validation.
- Stop before merge if protected-branch checks fail or if a test demonstrates
  a secret crossing the native boundary.

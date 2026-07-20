# Cross-platform release pipeline implementation

## Implementation order

1. Extend and test the release-version validator with expected-tag validation.
2. Add and test a cross-platform release-asset collector with collision,
   traversal/symlink, required-artifact, and deterministic-checksum checks.
3. Replace the macOS-only workflow with validate, native matrix build, and
   atomic publish jobs using explicit bundle targets.
4. Update the release checklist to describe the real matrix, permission,
   artifact, and signing/notarization boundaries.
5. Thread the AppShell-owned updater controller into the Home sidebar and add a
   state-projected update action that opens the existing update settings.
6. Run focused tests, lint, TypeScript/build gates, agent contract validation,
   and a workflow syntax/contract inspection.

## Validation commands

```bash
pnpm exec vitest run scripts/validate-release-version.test.ts scripts/collect-release-assets.test.ts scripts/release-workflow.test.ts scripts/update-artifacts.test.ts
pnpm lint
pnpm build
pnpm agent:validate
node scripts/validate-release-version.mjs --expected 0.1.0
```

## Risk and rollback points

- `.github/workflows/release-update.yml` is the release control plane. Keep
  permissions minimal and ensure `publish.needs` includes the entire matrix.
- `src-tauri/tauri.conf.json` has macOS-oriented default bundle targets, so the
  matrix must override targets explicitly rather than broadening global config.
- The collector must never overwrite same-named macOS architecture artifacts.
- The updater manifest remains macOS Apple Silicon-only until multi-platform
  runtime validation exists; do not broaden product claims in this task.
- Reverting the workflow and the two scripts fully restores the previous
  macOS-only behavior without data migration.

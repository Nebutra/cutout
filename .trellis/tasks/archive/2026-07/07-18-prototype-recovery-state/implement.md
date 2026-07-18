# Implementation Plan

1. Add shared prototype artifact runtime types, media validation, recovery, and projection.
2. Add fixture-driven unit tests for valid, degraded-documentation, and invalid-media states.
3. Preserve intrinsic raster dimensions through Design IR and repair zeroed legacy metadata
   from image headers.
4. Refactor `IntentWorkspace` initialization and all status/evidence consumers to use the
   shared projection; remove local restore/type duplication.
5. Add a non-blocking canvas health detail and truthful, always-accessible missing-design-system
   repair action.
6. Add outcome/repair regression coverage proving minimal repair.
7. Run focused tests, lint, type-check/build, `pnpm agent:validate`, and relevant visual tests.
8. Capture the cross-layer recovery invariant in `.trellis/spec/frontend/state-management.md`.
9. Build, replace, ad-hoc sign, launch, and verify `/Applications/Cutout.app`.

## Risky Files

- `src/components/workspace/IntentWorkspace.tsx` has unrelated concurrent edits. Apply only
  narrow patches and stage task hunks, never the whole file.
- `src/components/workspace/OutputCanvas.tsx` also has unrelated UX edits. Keep the health
  rendering change minimal.
- `src/prototype/design-system-validation.*` contains prior worktree changes; preserve them.

## Validation Commands

```bash
pnpm vitest run src/prototype/prototype-artifact-recovery.test.ts \
  src/prototype/design-system-validation.test.ts \
  src/agent-runtime/prototype-outcome.test.ts \
  src/agent-runtime/prototype-repair.test.ts
pnpm lint
pnpm agent:validate
pnpm build
pnpm tauri build --bundles app
```

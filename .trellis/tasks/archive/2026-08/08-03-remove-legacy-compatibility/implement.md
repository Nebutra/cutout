# Remove Legacy Compatibility Surfaces - Implementation

1. Rename and strictify Workspace/Design IR projection; update repository and
   projection tests.
2. Remove asset-production legacy route/status/migration paths and update
   planner, reducer, selectors, repository, and tests.
3. Remove legacy model-binding persistence/schema paths while preserving the
   current derived primary assignment API.
4. Remove Pencil aliases, old navigation decoding, plaintext secret migration,
   and unreachable Canvas visual tests.
5. Remove `estimatedCost` from current tool-approval events and every Agent UI
   projection while preserving internal budget enforcement and receipts.
6. Synchronize specs/contracts and run stale-identifier searches.
7. Run focused tests, lint, type-check, full tests/build, Rust tests/check,
   `pnpm agent:validate`, and `git diff --check`.

## Verification

- Full TypeScript suite: 1,994 passed, 15 skipped.
- Rust library suite: 187 passed, 1 ignored; `cargo check --locked` passed.
- Lint, type-check, production build, plugin build, Agent contract validation,
  and `git diff --check` passed.
- The current approval event schema rejects `estimatedCost`; Agent feed and
  execution timeline projections contain no provider-cost estimate.

## Risk Points

- `project-repository.local.ts` is the authority boundary; rejecting old data
  must not erase a valid current Design IR record.
- `legacy-projection.ts` contains active projection logic despite its name.
- ModelAssignments remains a current convenience API in many consumers; only
  its persistence/migration semantics are removed in this task.
- The primary worktree is dirty. Edits must be additive and must preserve
  unrelated user changes, especially `IntentWorkspace.tsx`.

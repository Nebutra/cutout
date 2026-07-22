# Implementation Plan

1. Remove `PaidActionsSection` from AI settings and delete its component.
2. Delete the paid-tool preference persistence module and its unit tests.
3. Add host-derived estimate lookup in the desktop hook, construct all desktop
   requests with explicit approval, and remove preference-based policy wiring.
4. Replace the prototype visual-task preference input with an explicit,
   host-derived visual budget contract; update workspace integration and tests.
5. Clean Lingui catalogs and update frontend specifications to describe the
   explicit-only desktop behavior.
6. Run focused Vitest coverage for settings grouping, desktop loop/request
   behavior, prototype visual tasks, and the all-routes prototype workflow.
7. Run `pnpm lint`, `pnpm exec tsc -b --pretty false`, `pnpm i18n:ci`,
   `pnpm agent:validate`, `pnpm build`, and `git diff --check`.
8. Review the final diff against the task scope and exclude unrelated working
   tree changes from any commit.

## Risk Points

- A zero or mismatched estimate must fail closed instead of bypassing approval.
- Visual retries must continue to carry the same explicit approval contract.
- Shared protocol and event schemas must not be narrowed to desktop-only
  behavior.
- Locale cleanup must remove only messages orphaned by the deleted component.

# Design OS evidence benchmark - implementation plan

## Order

- [x] Define strict v1 stages, metric definitions, report derivation, decoding
      and same-ruler comparison under `src/design-os-benchmark/`.
- [x] Add the strict Commerce adapter and explicit production-rehearsal blocker.
- [x] Remove the unsound caller-authored trusted Commerce pass path; retain
      fail-closed behavior until the complete verification bundle exists.
- [x] Add focused derivation, drift, regression and hard-gate tests.
- [x] Generate and commit the current Design OS snapshot from the decoded
      Commerce baseline.
- [x] Add `pnpm benchmark:design-os` as an offline validator/renderer.
- [x] Update the executable benchmark spec and run the quality gate.

## Validation

- [x] `pnpm vitest run src/design-os-benchmark src/commerce-profile/benchmark.test.ts`
- [x] `pnpm exec tsc -b --pretty false`
- [x] `pnpm lint`
- [x] `pnpm benchmark:design-os`
- [x] `pnpm agent:validate`
- [x] `rtk git diff --check`

## Risk And Rollback

The work touches an already modified Commerce benchmark. Preserve all unrelated
changes and edit only the trusted pass additions shown in its focused diff.
Snapshot generation must be deterministic and must not rewrite evidence owned
by Commerce. No manifest capability changes are allowed.

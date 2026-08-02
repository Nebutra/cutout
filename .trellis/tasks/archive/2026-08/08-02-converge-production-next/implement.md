# Implementation plan

## 1. Bounded scheduling primitive

- Add a promise-factory concurrency limiter beside `forEachConcurrent`.
- Test width normalization, maximum active work, result/error propagation, and
  draining after rejection.

## 2. Page generation/review lane separation

- Extend `generatePrototypePageSet` with optional inline/overlap review.
- Queue only newly generated artifacts; preserve existing-artifact reuse.
- Keep anchor-first generation and ordered progress publication.
- Join all reviews before exact page-set closure.
- Add deterministic tests proving overlap, ceilings, same-provider-style inline
  behavior, final review join, serial predecessor identity, and failure paths.

## 3. Workspace integration

- Keep `generatePrototypePage` responsible for one paid image attempt only.
- Move observational page QA into the serial/parallel page-set callers.
- Select overlap only when locked image and QA provider identities differ.
- Preserve diagnostic logging, zero rerolls, cancellation, and packaged logical
  image-call accounting.

## 4. Contracts and regression coverage

- Update the prototype-generation spec signature and lane invariants.
- Strengthen source and rendered pipeline tests so a future refactor cannot put
  QA back inside the paid-image worker or silently raise image concurrency.
- Run focused page/QA/full-route/retry/resource tests, then Agent validation,
  lint, build, Rust packaged tests, and diff checks.

## Risk and rollback points

- Do not change Provider request counts or the image concurrency constant.
- Do not review recovered existing pages again.
- Do not return from page-set generation until all queued reviews settle.
- If overlapping reviews expose a shared quota despite distinct provider IDs,
  switch the derived mode to inline without changing persisted artifacts.

## Completion evidence

- Focused scheduling and page-generation tests pass, including distinct-
  provider overlap, same-provider serialization, bounded lanes, cancellation,
  review-failure draining, reuse, ordering, and exact closure.
- Wider prototype and delivery coverage passes: 68 tests passed with one
  credential-gated expected skip.
- Full Vitest passes: 1,934 tests passed and 15 skipped across 373 files.
- CI-equivalent desktop Playwright contracts pass: 2 of 2.
- Packaged Rust E2E tests pass: 16 of 16.
- `pnpm lint`, `pnpm build`, `pnpm agent:validate`, and `git diff --check` pass.
- Production boundaries remain unchanged: image concurrency is three, page QA
  has zero automatic rerolls, and Agent-authored route/material scope is not
  reduced or replaced with quotas.

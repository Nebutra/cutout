# Converge production delivery after v0.1.14

## Goal

Reduce the real prototype-delivery critical path without weakening final
fidelity, increasing paid image calls, or replacing Agent-authored page and
material scope with product quotas. The first convergence step removes the
false dependency that holds a bounded page-image worker until observational
Vision QA finishes when image generation and QA are routed to independent
Providers.

## Confirmed Facts

- Packaged run 041 delivered three complete suites in 57 minutes 44 seconds
  with 50 planned and 50 actual image calls under an image concurrency ceiling
  of three. Its 7, 8, and 7 Agent-authored pages account for 22 of those calls.
- `generatePrototypePageSet` bounds whole `generate` callbacks. The workspace
  callback calls `generatePrototypePage`, which does not return until
  `generateWithQa` has completed both the paid image request and Vision QA.
  Therefore a slow QA request occupies a page-image worker even though no image
  request is active.
- `PROTOTYPE_QA_MAX_RETRIES` is zero. Page QA is observational: it records a
  verdict but never changes or regenerates the bytes shipped by that attempt.
- Cutout resolves separate image and chat/Vision assignments. Independent
  provider identities can execute without sharing a Provider quota, while two
  assignments using the same provider identity may share rate limits.
- The first page remains the immutable visual anchor for every later page.
  Later page generation depends on the anchor bytes, not on the anchor's
  observational QA verdict.

## Requirements

- Keep the page-image lane bounded by the existing concurrency ceiling of
  three. This change must not increase simultaneous paid image requests.
- When image and QA assignments use different provider identities, publish the
  generated anchor bytes immediately, start its bounded QA review, and allow
  later page image requests to proceed while independent QA is active.
- Bound the independent QA lane explicitly. A large Agent-authored route graph
  must never create unbounded QA fan-out.
- When image and QA assignments use the same provider identity, retain inline
  generate-then-review behavior so this change does not amplify a shared quota.
- Await every scheduled QA review before the page set is complete. Downstream
  Asset Production must never observe a terminal page suite while reviews are
  still running.
- Preserve stable anchor conditioning, ordered page publication, existing-page
  reuse, cancellation, fail-closed page identity checks, and exact page-count
  closure.
- Preserve one baseline paid image call per missing page and zero automatic QA
  rerolls. Agent-authored candidate, route, page, material, and board counts
  remain unchanged.
- Keep `.cutout` state and provenance authoritative. Concurrency scheduling is
  ephemeral execution behavior and must not create a second persisted state.

## Acceptance Criteria

- [x] A synthetic distinct-provider run proves that a later image request can
      start while the preceding page's QA is still unresolved.
- [x] The same test proves image concurrency never exceeds three and QA
      concurrency never exceeds its explicit ceiling.
- [x] A same-provider run proves the next page image does not start until the
      preceding inline QA completes.
- [x] Page-set completion waits for all reviews, including the last review
      after all image requests have settled.
- [x] Anchor-parallel and serial page generation retain correct predecessor
      identity, output order, progress, existing-page reuse, and wrong-page
      rejection.
- [x] Workspace wiring performs exactly one paid image invocation and one
      observational review per newly generated page, with no automatic reroll.
- [x] Existing prototype retry, full-route, resource-pack, delivery evidence,
      cancellation, and packaged runner tests remain green.
- [x] `pnpm agent:validate`, lint, focused Vitest, production build, relevant
      Rust tests, and `git diff --check` pass.

## Out Of Scope

- Raising the image Provider concurrency above three.
- Parallelizing complete suite state or changing selected-first scheduling.
- Reducing Agent-authored page or material scope.
- Batching complex standalone assets onto lower-resolution boards.
- Changing board/direct resource QA lanes in this first step.
- Adding automatic paid QA rerolls or changing QA acceptance policy.
- Coding generation, commercial candidate limits, or Provider procurement.

# Technical design: overlap independent page generation and QA

## First-principles boundary

One page attempt has two operations with different outputs and resource
constraints:

1. the paid image operation creates authoritative page bytes;
2. Vision QA observes those bytes and records a verdict.

With a zero reroll budget, QA cannot affect the current image operation. The
only true dependency is `image bytes -> QA`; there is no dependency
`QA(page N) -> image(page N+1)`. The current whole-callback worker pool adds
that second edge accidentally.

The implementation removes only that false edge. Image concurrency remains
three, QA receives its own bounded lane only when its provider identity differs
from the image provider, and page-set completion still joins both lanes.

## Generic page-set contract

Extend `generatePrototypePageSet` with optional review scheduling:

```ts
review?: (artifact: Artifact) => Promise<void>
reviewMode?: 'inline' | 'overlap'
reviewConcurrency?: number
```

Generation and publication retain their current ordering and identity checks.
Newly generated artifacts, but not reused artifacts, enter review exactly once.

- `inline`: publication is followed by awaited review inside the generation
  worker. This preserves the current shared-provider behavior.
- `overlap`: publication queues review through a bounded promise limiter and
  releases the image worker immediately. All queued review promises are joined
  before the function validates and returns the complete ordered page set.

The anchor is generated and published first in both modes. In overlap mode its
review is queued before later images begin, but the review verdict does not
block access to the anchor bytes.

## Bounded limiter

Add a small reusable limiter beside `forEachConcurrent` in
`src/lib/async-pool.ts`. It accepts one promise factory at a time, normalizes
invalid widths to one exactly like the existing pool, starts no more than the
configured number concurrently, and continues draining after fulfillment or
rejection. It owns no cancellation policy; the scheduled operation consumes
the existing run `AbortSignal`.

The limiter exists because a second `forEachConcurrent` pass would introduce a
stage barrier and fail to overlap generation with review.

## Workspace wiring

`generatePrototypePage` becomes the single paid page-image attempt and returns
the decoded page artifact immediately. `generatePagesSerial` and
`generatePagesParallel` provide the review callback that calls
`reviewGeneratedImage`, records rejected/unavailable diagnostics, and uses the
existing run signal.

The review mode is derived from the locked assignments:

```ts
image.providerId === chat.providerId ? 'inline' : 'overlap'
```

This is intentionally provider-identity based rather than model-name based.
Two models behind one configured provider may share the same rate limit and
credential transport. Different provider identities are the strongest local
evidence currently available for independent quotas.

## Failure and cancellation

- Image failures retain the current page-worker failure behavior.
- QA transport/model failures continue to become observational unavailable
  verdicts through `reviewGeneratedImage`.
- Abort rejection propagates when queued reviews are joined; page-set success
  is not published while reviews remain active.
- A programmer error thrown by a review rejects page-set completion. Some later
  image work may already have settled in overlap mode, but no extra retry is
  issued and no partial suite becomes terminal success.

## Compatibility and rollback

No persisted schema, Agent protocol, CLI/MCP surface, page artifact, or Provider
request shape changes. Rollback is local: remove the optional review contract
and restore page-local `generateWithQa`. Existing workspaces and `.cutout`
authority need no migration.

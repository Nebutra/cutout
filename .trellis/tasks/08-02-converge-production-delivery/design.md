# Technical design: converge production delivery

## First-principles boundary

The durable product outcome is a set of complete candidate deliveries. A
candidate is deliverable only when its validated persisted suite artifact
contains the final Design System, complete route graph and page media, an exact
resource-pack manifest-to-artifact binding, provenance, and an explicit review
document. Candidate selection is a scheduling preference and a viewing
projection; it is not permission to omit sibling deliveries.

The existing persisted `PrototypeSuiteCandidateSet` remains authoritative.
Progress UI and packaged-E2E results are sanitized projections of that state.
No second delivery store, approval state, or export authority is introduced.

## Delivery evidence projection

Add a pure projection beside the prototype candidate model. It first calls the
existing candidate-set validator and then derives one record per ready
candidate. Runtime IDs, prompts, Provider payloads, credentials, file paths,
and image bytes never leave the browser state. The projection exposes only:

- ordinal `design-N`, `suite-N`, and `resource-pack-N` identities;
- route strings and bounded counts already exposed by packaged E2E;
- SHA-256 digests of the Design System image and `DESIGN.md`;
- SHA-256 digests of deterministic CSS variables, Tailwind theme, token JSON,
  and Design IR token projections re-derived from the validated `DESIGN.md`;
- route-graph, page-media, manifest, exact binding, resource-pack identity,
  verified bound resource-media, provenance, and review-document digests;
- the explicit review state `recorded`.

The projection fails closed when the final `DESIGN.md` is invalid, any token
projection cannot be derived, `reviewDocument` is absent, the candidate-set
validator rejects pages, bindings, or provenance, or a bound resource artifact
cannot be re-read and matched to its completed Asset Production task digest.
This adds proof, not new state: every digest is computed from validated suite
and production authority.

`src/packaged-e2e/runner.ts` reads these records from a packaged-only DOM data
attribute and validates their exact shape before sending them to Rust. The Rust
protocol mirrors and validates the bounded structure and digest format. A
passed terminal result requires three complete evidence records for the
three-candidate packaged benchmark and retains the existing one-to-one Design
System and distinct-route checks.

## Terminal progress closure

Replace the hard-coded progress writer with a writer accepting
`running | passed | failed`. Completion validates the merged result first,
serializes both files to temporary paths, installs terminal `progress.json`
before `result.json`, and restores the prior progress file on a failed result
rename when possible. Therefore a successful completion return guarantees
that result and progress have identical terminal status and merged phases.

Progress reads include status. Once terminal, later native or web checkpoints
must not reopen the run as `running`. This protects monitoring from late WebKit
or native lifecycle callbacks.

## Failure isolation and retry

Remove the packaged-only branch that cancels planned siblings after one suite
fails. Packaged execution then follows production behavior: record the failed
candidate, continue independent candidates, and finish with an incomplete
frontier. The existing visible Retry continuation retains ready sibling
artifacts and resumes only missing pages or failed material tasks for the
failed candidate.

The regression scenario must fail a non-final candidate and prove that a later
sibling becomes ready before Retry. After Retry, all candidates must be ready,
existing logical page-call IDs must be unchanged, and only the failed frontier
may add attempts.

## Scheduling and concurrency

The selected Design System direction is currently sorted last. Reverse that
comparison so it is generated first. This makes the user's selected direction
the first complete route suite and resource pack while preserving the serial
suite boundary and continuing every sibling afterward.

Do not add cross-suite `Promise.all`. `generateSinglePrototypeSuite` mutates
shared React state, active Asset Production state, slice projections, and
workspace persistence. Safe cross-suite concurrency requires isolated suite
workspaces and one global Provider semaphore, which is a separate architectural
change. Existing bounded page and board concurrency remains the sole Provider
ceiling, and the compiled image request budget remains unchanged.

## Production progress and estimate contract

Promote the current packaged-only suite counters into a production-safe local
observation model. For each candidate, updates are monotonic and retain:

- completed and total pages;
- completed and total resource nodes;
- first observation time and bounded completion samples;
- retry-preserved completed nodes.

A pure projector combines observations with candidate state into `completed`,
`active`, `queued`, `failed`, and `retry-preserved` counts. ETA has only three
states:

- `unavailable` when the resolved graph is unknown or the candidate is not
  actively measurable;
- `collecting` until at least two real node completions and a positive elapsed
  interval exist;
- `bounded` with a conservative lower/upper duration derived from observed
  throughput and remaining logical nodes.

The UI shows logical counts and an approximate range on suite cards. It never
shows a single precise completion timestamp. Ready and failed states stop the
estimate. Retry updates may preserve or increase completion; they may not make
the displayed frontier regress.

This progress state is operational UI only and is reconstructed during a new
run. The persisted candidate artifact remains the completion authority.

## Compatibility and contracts

- Existing workspace snapshots need no migration because no authoritative
  persisted schema changes.
- Existing candidate IDs and resource-pack IDs stay unchanged internally.
- The packaged result protocol remains `cutout.packaged-e2e-result.v1`; the
  suite evidence shape is strengthened within the test-only protocol.
- No CLI, MCP, plugin, or public Agent capability is added. Run
  `pnpm agent:validate` to prove the synchronized Agent contract remains valid.
- `.cutout` Design IR and provenance remain authoritative; token evidence is a
  deterministic projection only.

## Rollout and rollback

Land pure evidence/progress modules with focused tests first, then wire the
workspace and packaged protocol, then change scheduling/failure isolation.
Each slice is independently revertible. Do not release unless focused tests,
full quality gates, and a fresh packaged VM journey all pass. If the real
benchmark increases paid calls or fails to close every delivery, roll back the
scheduling/UI slice while retaining terminal-state and evidence hardening.

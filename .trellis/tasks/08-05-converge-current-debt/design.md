# Converge current production debt - technical design

## Boundaries

The desktop production orchestrator remains the owner of the interactive run.
`.cutout` Design IR and provenance remain authoritative; UI state is a projection
of run evidence. Provider requests continue through the reviewed native boundary.
No new headless provider, cloud service, web fetcher or approval bypass is added.

## Production state and progress

Represent production as finite stage attempts rather than one undifferentiated
`working` flag. Each emitted progress record identifies the run, stage, optional
unit, attempt, completed/total units, start/update timestamps and a safe status.
The projection derives labels, elapsed time and stalled/ retry hints from this
record. Progress events are monotonic within an attempt and terminal events close
the attempt exactly once.

Planning defines the route topology and reusable-material intent. Downstream
fan-out uses bounded concurrency; it does not alter Agent-authored counts. Final
success is gated by a delivery manifest containing the selected design system,
every planned route page, every accepted slice/material and provenance links.

## Deadlines, retries and cancellation

Use one shared request policy at the generation boundary. Each attempt owns an
abort signal and finite deadline. Retry only network failures, 408, 429 and 5xx;
honor a bounded server retry hint where available. Other 4xx, schema/capability
errors and user cancellation do not retry. Backoff and attempt limits are
constants covered by tests, while user-visible progress reports the next retry.
Stage inactivity is distinct from request timeout and reports which unit stopped
making progress. All persisted/displayed errors pass existing redaction.

## Provider capability evidence

Protocol determines request shape. Reviewed adapter/model evidence determines
whether image edit is available; it does not pre-authorize optional fields.
OpenAI `/images/edits` multipart requests normally attempt
`input_fidelity=high` first. Only an HTTP 400 conformance rejection retries once
with the field omitted. This is not a generic retry of an invalid request.
Recommendation metadata may rank high-fidelity models but does not erase valid
edit capability from other models.

## Verification architecture

Keep deterministic UI E2E mandatory in CI using an in-process reviewed Provider
fixture that returns actual encoded images. Exercise the same orchestration,
decode, deconstruction, slicing, artifact and delivery code used by production.
Opt-in live tests remain external evidence because credentials and upstream
health are non-deterministic, but their harness must print per-stage timings and
terminal diagnostics.

## Cleanup and dependencies

Delete the unreferenced session service/query seam from types, context and keys.
Rewrite the six generic frontend guides from source evidence. Upgrade or override
JavaScript transitive dependencies only where package constraints permit a safe
resolved version. Treat the Rust GTK/Tauri `glib` advisory as an upstream stack
upgrade: upgrade only after checking target matrices; otherwise document the
exact unresolved chain rather than forcing duplicate/incompatible GLib versions.

## Rollback

Progress/state additions are additive within the current workspace schema until
their readers are migrated, then obsolete fields are removed in the same change.
Provider option downgrade is isolated behind the reviewed adapter. Dependency and
dead-code changes are separate commits/checkpoints so they can be reverted without
rolling back production correctness fixes.

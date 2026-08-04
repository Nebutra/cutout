# Fix duplicated repair result summary

## Goal

Ensure the notifications menu shows only the latest Agent outcome state instead
of accumulating stale `Result needs repair` entries across create and repair
runs.

## Requirements

- Treat `outcome-evaluated` notifications as current state rather than
  append-only run history.
- A newer outcome from a different run must replace older outcome
  notifications while preserving unrelated approval, failure, and delivery
  notifications.
- Loading existing local notification storage must collapse legacy per-event
  and per-run outcome IDs to the latest outcome entry.
- Keep the Agent event protocol and persisted run-event history unchanged; the
  fix belongs in the local notification projection/storage boundary.

## Acceptance Criteria

- [x] Repeated `needs-repair` evaluations across different run IDs render one
  notification containing only the latest missing-material summary.
- [x] A later `Result ready` notification replaces an earlier repair result,
  including legacy stored outcome notification IDs.
- [x] Non-outcome notifications remain append-only, deduplicated by their own
  IDs, and bounded by the existing item limit.
- [x] Focused notification tests, TypeScript, and Agent contract validation
  pass.

## Result

- Root cause: the previous notification fix keyed current outcome state by
  `runId`, but Retry intentionally creates a new run.
- Fix: use canonical `agent:outcome` identity and normalize legacy outcome IDs
  on both load and append.
- Verification: focused Vitest `8/8`, lint, TypeScript, `pnpm agent:validate`,
  and `git diff --check` pass.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.

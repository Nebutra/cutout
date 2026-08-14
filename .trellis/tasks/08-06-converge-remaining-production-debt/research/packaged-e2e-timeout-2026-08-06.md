# Packaged E2E timeout evidence - 2026-08-06

## Result

The signed, isolated macOS packaged journey reached the one-hour production
budget without writing a terminal `result.json`. The smoke harness exited 1 and
truthfully rejected the run. The app remained alive and background-only until
the exact test process was terminated by harness cleanup.

## Proven milestones

- Automatic native discovery resolved two non-secret Provider records and a
  matching Keychain credential.
- Real planning completed and selected three Design System directions.
- All three Design Systems reached `ready`; the third candidate crossed the
  previously stalled approval boundary and completed at 529,793 ms.
- Suite 1 completed 8/8 pages and 9/9 reusable resources at 1,406,969 ms.
- Suite 2 failed transiently at 3/9 pages, then resumed without replay and
  advanced to 5/9 pages.
- Suite 3 failed transiently at 5/9 pages, then resumed without replay from the
  same 5/9 frontier.

## Timing evidence

| Stage | Elapsed |
| --- | ---: |
| Design Systems ready | 8.83 min |
| Suite 1 ready | 23.45 min |
| Suite 2 first failure | 30.58 min |
| Suite 3 first failure | 38.11 min |
| Suite 3 retry frontier observed | 41.55 min |
| Suite 2 retry frontier observed | 49.29 min |
| Harness timeout | 60 min |

Image invocations frequently occupied most of the 180-second tool budget. The
retry path preserved settled pages and advanced both failed candidates, so the
failure is not a reset/replay or approval-surface bug. The current orchestration
still serializes complete suite candidates, leaving the shared production
concurrency budget underused across independent siblings and making Provider
tail latency cumulative.

## Required correction

- Keep the human-selected suite first so the primary outcome remains available
  earliest.
- Continue independent sibling suites concurrently after the selected suite.
- Enforce one shared paid-image limiter across sibling page and reusable-asset
  work so nested pools cannot amplify Provider traffic beyond the existing
  production ceiling.
- Preserve candidate-local failure isolation, stable logical node identities,
  settled page/resource carry-forward, exact call evidence, and the one-hour
  release gate.
- Repeat the real packaged run. Do not extend the budget to reinterpret this
  result as success.

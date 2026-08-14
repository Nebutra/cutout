# Audit current bugs, WIP, TODO and legacy

## Goal

Read-only evidence-based audit of remaining production defects, unfinished work, TODO markers and legacy compatibility surfaces after convergence.

## Requirements

- Inspect the current `main` worktree, source markers, skipped/disabled tests,
  dependency advisories, archived task evidence and truthful capability states.
- Separate confirmed production defects from unverified risk, intentional
  platform/integration boundaries, historical decode compatibility and test-only
  fixtures.
- Report priority, affected surface and direct evidence for every remaining item.
- Do not modify product code or claim a live integration was tested during this
  read-only audit.

## Acceptance Criteria

- [x] Current worktree and dependency state are verified.
- [x] TODO/WIP/legacy markers and skipped tests are classified from their owners.
- [x] Remaining findings are ordered by user impact and distinguish fact from risk.
- [x] Known non-bugs and verification gaps are stated explicitly.

## Notes

- This is a lightweight, read-only audit; no implementation activation is required.

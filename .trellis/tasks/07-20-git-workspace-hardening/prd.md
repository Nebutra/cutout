# Git workspace hardening and visual fixture

## Goal

Complete missing/ignored diff classification, optional bounded Agent Git context contract review, and executable desktop/narrow visual coverage with success/conflict/stale/failure fixtures.

## Requirements

- Normalize explicit missing and ignored-relevant path presentation.
- Decide through an Agent contract review whether bounded read-only Git context
  should be public; synchronize every contract surface if it is adopted.
- Provide deterministic project-state fixtures for desktop and narrow visual
  checks without invoking generation.
- Expand fixture coverage for conflicts, stale snapshots, failed commands, and
  real temporary repositories.

## Acceptance Criteria

- [ ] Missing and ignored-relevant paths have normalized UI states and tests.
- [ ] Agent Git context is either implemented across all contract surfaces or
      explicitly rejected with the decision recorded in the design.
- [ ] Git desktop/narrow visual tests run without `test.skip` and without overlap.
- [ ] Rust fixtures cover success, conflict, stale state, and command failure.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.

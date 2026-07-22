# Fix Git workspace visual fixture timeout

## Goal

Make the Git workspace Playwright fixture reach assertions reliably and restore visual coverage for the merged Git identity/collapse control.

## Background

- `tests/visual/git-workspace.spec.ts` has used `test.skip` since it was added
  in commit `0de7c27`.
- Its setup installs a replacement `window.__TAURI_INTERNALS__` only after the
  workspace application has loaded, then immediately opens Git and authorizes
  a repository.
- The last attempted visual run timed out in fixture setup before the test body
  could assert the Git dock and diff review.
- Unit coverage for the merged Git/collapse control already passes; this task
  restores the missing browser-level evidence.

## Requirements

- Identify the exact setup step that times out and fix the fixture at the
  boundary that owns the problem.
- Install deterministic Tauri command responses before the application code
  needs them; do not weaken production Git behavior to accommodate the test.
- Wait on observable UI state instead of arbitrary sleeps.
- Remove `test.skip` and keep the fixture runnable in both configured
  Playwright projects.
- Preserve the existing Git status, branch, file, commit, diff, and repository
  authorization data used by the visual fixture.
- Add browser assertions for the single `Hide Git` control: Git glyph by
  default and collapse glyph on hover or keyboard focus.
- Keep desktop and narrow layout overflow assertions and screenshots stable.

## Acceptance Criteria

- [ ] The focused Git workspace visual test reaches its test-body assertions
      without timing out.
- [ ] The Git dock and `Git diff review` region are visible after deterministic
      repository authorization and file selection.
- [ ] The `Hide Git` button visually swaps from Git to collapse state on
      interaction without changing its dimensions.
- [ ] Desktop and mobile/narrow scenarios have no horizontal document overflow.
- [ ] `npx playwright test tests/visual/git-workspace.spec.ts` passes for all
      configured projects with intended snapshots.
- [ ] Relevant unit, lint, TypeScript, and diff checks pass.

## Out Of Scope

- Changing Git workspace product behavior or native command contracts.
- Redesigning the dock, diff review, workspace rail, or repository picker.
- Adding fixed sleeps or increasing global Playwright timeouts to mask the
  failing setup.

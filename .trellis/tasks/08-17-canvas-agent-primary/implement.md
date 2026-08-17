# Implementation Plan

## 1. Primary workspace shell

- [x] Replace six peer rail actions with Agent plus a Project tools menu.
- [x] Keep Files, Git, Library, DESIGN.md, Inspect project and Delivery details
  reachable as secondary actions using existing callbacks and drawer state.
- [x] Preserve sidebar collapse/restore, focus, disabled-state and mobile
  behavior.

## 2. Agent-owned Profile launch

- [x] Add a conservative Commerce intent recognizer and extend the shared
  scenario launch union.
- [x] Add project-bound Home launch forwarding through AppShell and
  PipelineCanvas.
- [x] Route in-project Game/Commerce submissions directly to Canvas Profile
  stages while unmatched/ambiguous prompts retain the general Agent path.

## 3. Canvas production stages

- [x] Add a lazy Canvas Profile stage with a stable close/back-to-board action.
- [x] Mount Game Asset production with its exact existing launch request without
  changing `src/game-asset-profile/**` or its production panel internals.
- [x] Mount Commerce Project production and persist completion/reset against the
  current Design IR revision.
- [x] Add Canvas-native Commerce retained-artifact review, exact acceptance,
  stale blocking and download recording.
- [x] Make Product UI/UX Agent artifact links focus Canvas artifacts instead of
  opening DESIGN.md.

## 4. Compatibility and tests

- [x] Keep Project Workbench reachable only through secondary inspection and
  delivery-detail actions.
- [x] Update workspace rail, scenario routing, AppShell surface and navigation
  contract tests.
- [x] Add component coverage for Profile stage close/restore and Commerce exact
  lifecycle behavior.
- [x] Add headless desktop/mobile coverage proving Agent + Canvas primary
  geometry and no Workbench launch for representative Profile requests.

## 5. Validation

- [x] Run focused Vitest suites for routing, workspace shell, AppShell, Commerce
  lifecycle and Design OS compatibility.
- [x] Run focused Playwright desktop/mobile journeys and inspect screenshots.
- [x] Run `pnpm lint`, `pnpm build`, `pnpm agent:validate`, product skill
  validation through the build gate, and scoped `git diff --check`.
- [x] Confirm no test fixture, mocked Host or unavailable capability is described
  as production, benchmark or SOTA evidence.

## Risk And Rollback Points

- `IntentWorkspace.tsx` is a large shared orchestrator. Keep new Profile stage
  state isolated and lazy; do not refactor unrelated prototype execution.
- AppShell owns Home-to-Project transition timing. Bind pending Profile launches
  to the created Project id so they cannot leak across projects.
- Do not edit `GameAssetProductionPanel.tsx` or `src/game-asset-profile/**` while
  parallel Game work is active.
- Do not remove Workbench routes until Canvas parity tests pass.

## Verification

- Focused Vitest: 8 files, 43 tests passed.
- Playwright: Canvas Profile, Project tools, Commerce, Delivery, centered Canvas,
  Git and outcome-first journeys passed at desktop and native mobile widths.
- Mobile Canvas Profile screenshot inspected; Agent/Project controls no longer
  cover Commerce inputs.
- `pnpm lint`, `pnpm build` and `pnpm agent:validate` passed.
- Scoped `git diff --check` passed.
- Fixture and browser evidence remains contract/UI evidence only; no production,
  benchmark or SOTA claim was added.

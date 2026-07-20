# Implementation Plan

- [x] Update the Tauri initial window dimensions and add/adjust a configuration assertion if one exists.
- [x] Expand Home content measures, hero spacing/type, composer size, and large-screen directory grid.
- [x] Expand workspace drawer and inspector dimensions at wide desktop breakpoints.
- [x] Add focused tests that pin the intended layout classes without coupling to unrelated markup.
- [x] Run targeted tests, lint/type/build checks, and repository agent validation if the build invokes it.
- [x] Run the app and inspect desktop plus minimum-size geometry for overflow and hierarchy.

Playwright inspection passes at the `1440px` desktop viewport, the exact `1040x720` minimum desktop window, and the narrower mobile branch. Home composer snapshots capture the intentional `896px` desktop measure; focused geometry assertions confirm Home controls and workspace panels remain bounded and non-overlapping without global horizontal overflow.

The focused layout checks pass. A current full `pnpm exec tsc -b --pretty false` run is blocked by concurrent, task-external `src/design-governance/` changes that mix the removed `nonColorCue` field with the new required `nonColorCueEvidence` contract; none of the reported diagnostics point to this task's files.

## Risk And Rollback Points

- `ProjectHome.tsx` has existing user changes; edit only layout class strings.
- `IntentWorkspace.tsx` has substantial existing user changes; avoid formatting or adjacent refactors.
- `tauri.conf.json` contains unrelated branding edits; change only window dimensions.

## Validation

- `pnpm vitest run <focused test files>`
- `pnpm lint`
- `pnpm build`
- Playwright/browser screenshots at `1440x960` and `1040x720`

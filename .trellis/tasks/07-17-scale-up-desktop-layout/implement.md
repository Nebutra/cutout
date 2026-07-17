# Implementation Plan

- [x] Update the Tauri initial window dimensions and add/adjust a configuration assertion if one exists.
- [x] Expand Home content measures, hero spacing/type, composer size, and large-screen directory grid.
- [x] Expand workspace drawer and inspector dimensions at wide desktop breakpoints.
- [x] Add focused tests that pin the intended layout classes without coupling to unrelated markup.
- [x] Run targeted tests, lint/type/build checks, and repository agent validation if the build invokes it.
- [ ] Run the app and inspect desktop plus minimum-size screenshots for overflow and hierarchy.

The app is running at `http://127.0.0.1:1420/`, but screenshot inspection was unavailable because the browser runtime reported no available browser instances.

The full `pnpm build` remains blocked by pre-existing TypeScript errors in `src/prototype/generation-qa.test.ts` and `src/prototype/region-deconstruct.ts`; `pnpm exec vite build` passes.

## Risk And Rollback Points

- `ProjectHome.tsx` has existing user changes; edit only layout class strings.
- `IntentWorkspace.tsx` has substantial existing user changes; avoid formatting or adjacent refactors.
- `tauri.conf.json` contains unrelated branding edits; change only window dimensions.

## Validation

- `pnpm vitest run <focused test files>`
- `pnpm lint`
- `pnpm build`
- Playwright/browser screenshots at `1440x960` and `1040x720`

# Implement — Board background compliance diagnostics

## Checklist

- [ ] 1. Recon: read `src/prototype/region-deconstruct.ts` (current working-tree
      version — it has QA callbacks not present in older snapshots),
      `src/algorithm/testFixtures.ts`, `region-deconstruct.test.ts` stub shapes,
      and where `sliceRegionBoardBitmap` is passed as `deps.slice`
      (IntentWorkspace.tsx) — confirm the `deps.slice` return-shape change is
      contained to these sites.
- [ ] 2. Add `BOARD_BORDER_WHITE_MIN_RATIO = 0.55` to `src/algorithm/constants.ts`
      (documented as new/tunable, outside the verbatim-port contract).
- [ ] 3. Create `src/algorithm/boardDiagnostics.ts` per design (single pass,
      reuse `isBackgroundPixel`, band floor 2px, no frame mutation).
- [ ] 4. Create `src/algorithm/boardDiagnostics.test.ts` (cases in design).
- [ ] 5. Wire into `region-deconstruct.ts`: diagnostics computed from the
      pristine frame before `runPipeline`; `deps.slice` return shape
      `{ slices, diagnostics }`; `onRegionDiagnostics` optional callback fired
      before `onRegionSliced`; `diagnosticsByRegion` in the result. Update the
      module doc comment.
- [ ] 6. Update `region-deconstruct.test.ts` stubs + add assertions (callback
      order, result record, no behavior change when compliant).
- [ ] 7. `regionBoardPrompt`: add the no-text-labels sentence; update/add the
      prompt unit test.
- [ ] 8. `IntentWorkspace.tsx`: pass `onRegionDiagnostics` logging non-compliant
      boards via `console.info`, matching the adjacent onRegionError style.
- [ ] 9. Gates:
      - `npx vitest run src/algorithm src/prototype`
      - `npx tsc --noEmit -p tsconfig.app.json`  (NOT `-p .`)
      - `npx oxlint src`
- [ ] 10. Confirm no unrelated files touched (working tree has other in-flight
      work — keep the diff scoped to the files above).

## Rollback

Revert the task commit; additive API only.

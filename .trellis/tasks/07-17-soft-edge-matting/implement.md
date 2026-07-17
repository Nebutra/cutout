# Implement — Soft alpha edge matting

## Checklist

- [ ] 1. Verify `featherEdges` call sites: `grep -rn featherEdges src/` — expect
      only `runPipeline.ts` + its own files.
- [ ] 2. Add matte constants to `src/algorithm/constants.ts`
      (MATTE_FULL_TRANSPARENT_DIST=24, MATTE_FULL_OPAQUE_DIST=96,
      MATTE_ALPHA_FLOOR=1); remove FEATHER_NEAR_WHITE_MIN / FEATHER_ALPHA_CAP;
      rewrite the "Do NOT tweak / verbatim" header to describe the deliberate
      edge-matting behavior (keep the verbatim note for the remaining ported
      constants).
- [ ] 3. Create `src/algorithm/softenMaskEdges.ts` per design.md (smoothstep
      ramp + un-premultiply, mask snapshot, in-place mutation, doc comment
      explaining the white-matting trade-off vs chroma key).
- [ ] 4. Create `src/algorithm/softenMaskEdges.test.ts`:
      - synthetic anti-aliased circle-on-white fixture → band alpha is
        monotonic in distance-to-white; no alpha reaches 0; interior untouched
      - un-premultiply removes white fringe (dark pixel blended 50% toward
        white recovers ≈ original color at alpha ≈ ramp value)
      - background pixels remain alpha 0
- [ ] 5. Swap `featherEdges` → `softenMaskEdges` in `runPipeline.ts`; update the
      stage-order doc comment. Delete `featherEdges.ts` + `featherEdges.test.ts`.
- [ ] 6. Detection invariance: in `runPipeline.test.ts`, assert existing
      fixtures produce identical `boxes` (update/extend fixture assertions if
      they previously asserted feather-specific alpha values).
- [ ] 7. Validation gates:
      - `npx vitest run src/algorithm`
      - `npx tsc --noEmit -p tsconfig.app.json`  (NOT `-p .` — silent no-op)
      - `npx eslint src/algorithm`
- [ ] 8. Full test sweep of anything importing the algorithm barrel
      (`npx vitest run src/workers src/prototype` if such suites exist).

## Rollback

Single revert of the task commit; no migrations.

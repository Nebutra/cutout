# PRD — Board background compliance diagnostics

## Goal

Port the *measured, guarded* half of LayerForge's robustness ideas into the
region-board cutout flow, deliberately excluding the risky halves:

1. **Compliance measurement (#1's detect stage, NOT adaptive keying)**: the
   white-background pipeline silently produces garbage when the image model
   ignores the pure-white instruction (gray/gradient/patterned background).
   Measure per-board background compliance and surface it, so we get real
   failure-frequency data before ever investing in adaptive key-color fallback.
2. **Provenance diagnostics (#4)**: per region, record what the pipeline saw
   and did (board background stats, threshold, box count) so "why did this
   region slice badly" is answerable after the fact.
3. **Prompt guard (#5, adapted)**: forbid the model from adding its own text
   labels/captions/watermarks to region boards (LayerForge skips text elements
   for the same reason — redrawn text becomes garbled pixels).

Explicitly out of scope (negative/zero expected value per trade-off review):
adaptive background-color keying, vision-model bounds/focused retry, batching.

## Requirements

R1. Pure function `computeBoardDiagnostics(frame, threshold)` in
    `src/algorithm/`: returns at least
    `{ borderWhiteRatio, whiteRatio, compliant }` where `borderWhiteRatio` is
    the fraction of border-band pixels (band ≈ 2.5% of min dimension, min 2px —
    LayerForge's convention) that pass `isBackgroundPixel` at the given
    threshold, `whiteRatio` is the same over the full frame, and
    `compliant = borderWhiteRatio >= BOARD_BORDER_WHITE_MIN_RATIO` (new
    constant, start at 0.55).
R2. `sliceRegionBoardBitmap` computes diagnostics for each region board and the
    breakdown flow surfaces them:
    - new optional callback `onRegionDiagnostics(regionId, diagnostics)` in
      `RegionBreakdownParams`, invoked before slicing continues;
    - `RegionBreakdownResult` gains `diagnosticsByRegion` (record keyed by
      region id) for post-run inspection;
    - non-compliant boards do NOT abort slicing (measurement first, guard
      later) but must be observable.
R3. `IntentWorkspace` wires the callback to `console.info("[Cutout] board
    background non-compliant: ...")` when `compliant === false`, matching the
    existing region-error logging pattern, and always logs the ratio at debug
    granularity consistent with surrounding code.
R4. `regionBoardPrompt` gains one sentence forbidding model-added text labels,
    captions, or watermarks. Existing prompt content is otherwise unchanged.
R5. Diagnostics computation must be O(width×height) single pass max, no
    allocation proportional to pixel count (stats only), and must not mutate
    the frame.

## Acceptance criteria

A1. Unit tests: synthetic frames — all-white board → compliant, ratios ≈ 1;
    gray-background board → non-compliant; white board with centered asset →
    compliant with whiteRatio < 1; band sizing respects the min-2px floor.
A2. `runRegionBreakdown` unit tests (existing stub-deps style) assert
    `onRegionDiagnostics` fires per region and `diagnosticsByRegion` is
    populated; existing tests keep passing unchanged.
A3. Prompt test (if `regionBoardPrompt` has tests) asserts the no-text clause.
A4. Gates: `npx vitest run src/algorithm src/prototype`,
    `npx tsc --noEmit -p tsconfig.app.json`, `npx oxlint src`.

## Non-goals / future triggers

- If observed non-compliance frequency is material (data from R2/R3), open a
  follow-up task for adaptive background keying with LayerForge-style rejection
  guards (removedRatio ∈ [0.08, 0.92]).

# Design — Board background compliance diagnostics

## Modules & signatures

### 1. `src/algorithm/boardDiagnostics.ts` (new, pure)

```typescript
export interface BoardDiagnostics {
  readonly borderWhiteRatio: number  // 0..1 over the border band
  readonly whiteRatio: number        // 0..1 over the whole frame
  readonly compliant: boolean        // borderWhiteRatio >= BOARD_BORDER_WHITE_MIN_RATIO
}

export function computeBoardDiagnostics(
  frame: PixelFrame,
  threshold: number,
): BoardDiagnostics
```

- Border band width: `max(2, round(min(width, height) * 0.025))` (LayerForge
  convention).
- A pixel "is white" iff `isBackgroundPixel(data, index, threshold)` — reuse
  the existing predicate so compliance agrees with what floodBackground will
  actually treat as background.
- Single O(w×h) pass computing both ratios; no writes to `frame.data`; only
  scalar accumulators.
- New constant in `constants.ts`: `BOARD_BORDER_WHITE_MIN_RATIO = 0.55`
  (tunable, documented as deliberate/new — NOT part of the verbatim-port set).

### 2. `src/prototype/region-deconstruct.ts`

- `sliceRegionBoardBitmap` gains an optional out-param-free path: compute
  `computeBoardDiagnostics(frame, params.threshold)` right after
  `bitmapToFrame`, BEFORE `runPipeline` (runPipeline mutates the frame's alpha;
  diagnostics must read the pristine board). Return shape changes from
  `Promise<SliceInput[]>` to `Promise<{ slices: SliceInput[]; diagnostics: BoardDiagnostics }>`
  — OR keep the function signature and lift diagnostics computation into a
  sibling pure helper called by the same caller. Prefer the return-shape change
  if `deps.slice` is the only consumer (check test stubs); update the
  `RegionBreakdownDeps['slice']` type accordingly and let stubs return a
  canned diagnostics object.
- `RegionBreakdownParams` gains
  `onRegionDiagnostics?: (regionId: string, diagnostics: BoardDiagnostics) => void`,
  fired as soon as diagnostics exist (before onRegionSliced).
- `RegionBreakdownResult` gains
  `diagnosticsByRegion: Readonly<Record<string, BoardDiagnostics>>`
  (empty record when no regions ran).
- Non-compliant boards continue through slicing unchanged — measurement only.

### 3. `IntentWorkspace.tsx` wiring

Next to the existing `onRegionError` console.info:

```typescript
onRegionDiagnostics: (regionId, d) => {
  if (!d.compliant)
    console.info('[Cutout] board background non-compliant:', regionId,
      `border ${(d.borderWhiteRatio * 100).toFixed(1)}% white`)
},
```

(Store integration deferred — console parity with region errors is the R3 bar.)

### 4. `regionBoardPrompt` (same file)

Append to the existing "Do NOT include assets from any other region..." line:
`Do NOT add any text labels, captions, numbering, or watermarks of your own.`

## Threshold plumbing note

`sliceRegionBoardBitmap` already receives `params: CutoutParams` — use
`params.threshold` for diagnostics so compliance always matches the active
pipeline threshold, not a hard-coded 246.

## Testing strategy

- `boardDiagnostics.test.ts`: synthetic `PixelFrame`s (reuse `testFixtures.ts`
  helpers if suitable): all-white, all-gray(200), white-with-centered-dark-rect
  (border compliant, whiteRatio < 1), tiny 4×4 frame (band floor = 2px ⇒ whole
  frame is band).
- `region-deconstruct.test.ts`: existing stub-deps pattern — stub `slice`
  returns diagnostics; assert callback firing order (diagnostics before
  sliced), `diagnosticsByRegion` contents, and absence of behavior change for
  compliant boards. Prompt clause asserted in the existing regionBoardPrompt
  test (or add one).

## Rollout / rollback

Additive API (optional callback + new result field); single-commit revert.
No worker protocol, store schema, or i18n changes.

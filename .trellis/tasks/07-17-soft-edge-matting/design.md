# Design — Soft alpha edge matting

## Pipeline placement

`runPipeline` stage order stays intact. Change is confined to stages 2–3:

```
1. floodBackground   (unchanged — border-seeded mask, threshold 246)
2. applyAlphaCut     (unchanged — background alpha → 0)
3. featherEdges      → REPLACED by softenMaskEdges (new module)
4..7 detection stages (unchanged)
```

`softenMaskEdges` keeps the same call signature shape as `featherEdges`:
`(frame: PixelFrame, background: BackgroundMask) => void`, mutating in place.

## Algorithm (softenMaskEdges)

Key color = white (255,255,255). Constants (new, in `constants.ts`):

- `MATTE_FULL_TRANSPARENT_DIST = 24` — RGB Euclidean distance to white below
  which a boundary pixel is effectively background fringe (alpha floor applies).
- `MATTE_FULL_OPAQUE_DIST = 96` — distance above which alpha is untouched.
- `MATTE_ALPHA_FLOOR = 1` — boundary foreground pixels never drop to 0
  (preserves `findComponents` foreground classification → detection invariance).
- Band = foreground pixels 4-connected to a background-mask pixel, computed from
  a snapshot copy of the mask (same non-cascading discipline as featherEdges).
  Optionally dilate once (band width 2px) — start with 1px, widen only if the
  visual check still shows staircase.

Per band pixel:

1. `d = sqrt((255−r)² + (255−g)² + (255−b)²)`
2. `t = smoothstep(24, 96, d)`; `alphaNew = max(MATTE_ALPHA_FLOOR, round(t·255))`
   applied as `min(existingAlpha, alphaNew)` (never raise alpha).
3. Un-premultiply against white when `alphaNew < 255`:
   `c' = clamp((c·255 − 255·(255−alphaNew)) / alphaNew)` per channel.
   Skip when alphaNew ≥ 250 (no visible fringe, avoids noise amplification).

`smoothstep(e0, e1, v) = t²(3−2t)` with t clamped to [0,1] — same as LayerForge.

## Why not magenta chroma key (rejected for this task)

- Requires `regionBoardPrompt` contract change → model-compliance and
  color-contamination risk on the generation side; breaks existing white boards
  and re-slice flows.
- Our flood fill already protects light asset interiors; the jaggy symptom lives
  only in the boundary band, which white-matting addresses directly.
- Revisit as an opt-in enhancement with a border-ratio detector (LayerForge's
  `minBorderRatio: 0.08` guard) if white-asset edge erosion is ever reported.

## Detection invariance argument

- `findComponents` treats alpha ≠ 0 as foreground. Band pixels keep alpha ≥ 1.
- Non-band pixels are untouched; background pixels already had alpha 0.
- `filterUiContainers` samples colors/alpha density: band is ≤2px of a box
  perimeter, previously already alpha-capped by featherEdges for near-white
  pixels; density shifts are negligible. Verified by fixture-identical box
  assertions in tests.

## Compatibility / rollout

- Pure function swap inside the worker + main-thread paths that call
  `runPipeline` (both go through `runPipeline`; `featherEdges` has no other
  call sites — verify with grep).
- `featherEdges.ts` + its test are deleted; `FEATHER_*` constants removed.
- Rollback = revert the single commit; no data or protocol migrations.

# Cutout Pipeline (`src/algorithm/`) — Edge Contract

> Executable contract for the white-background cutout CV pipeline. Captured from
> task `07-17-soft-edge-matting` (2026-07-17).

---

## Stage Order (runPipeline)

```
1. floodBackground(frame, threshold)  → border-seeded 4-connected background mask
2. applyAlphaCut(frame, background)   → background alpha = 0 (binary, unchanged)
3. softenMaskEdges(frame, background) → soft alpha matting on the 1px boundary band
4. findComponents → mergeBoxes → splitCompositeBoxes → filterUiContainers → pad/sort
```

`frame.data` is worker-owned; stages 2–3 mutate it in place (spec 4b). This is
deliberate, not an immutability violation.

## Signatures

```typescript
softenMaskEdges(frame: PixelFrame, background: BackgroundMask): void
```

- Operates ONLY on foreground pixels 4-connected to a background-mask pixel,
  using a snapshot copy of the mask (no in-pass cascading).
- Per band pixel: `d = |rgb − white|₂`; `t = smoothstep(MATTE_FULL_TRANSPARENT_DIST=24,
  MATTE_FULL_OPAQUE_DIST=96, d)`; `alpha = min(existing, max(MATTE_ALPHA_FLOOR=1, round(t·255)))`.
- When new alpha < 250, un-premultiply against white:
  `c' = clamp((c·255 − 255·(255−α)) / α)` — removes the white halo.

## Invariants (validation matrix)

| Condition | Guarantee |
|---|---|
| Background-mask pixel | alpha stays 0 (never resurrected) |
| Band foreground pixel | alpha ∈ [1, existing] — never 0, never raised |
| Non-band foreground pixel | byte-identical (untouched) |
| Final `boxes` on any input | identical to pre-matting pipeline (alpha floor keeps `findComponents` classification stable) |

## Design Decision: white matting, NOT magenta chroma key

**Context**: jagged slice edges (binary alpha cut). LayerForge solves this by
generating boards on pure magenta `#FF00FF` and chroma-keying with
smoothstep(24,96) + despill.

**Decision**: keep white boards; port only the smoothstep ramp + de-fringe,
keyed on white. Because `floodBackground` is border-seeded, light asset
interiors are already safe — white ambiguity only exists in the boundary band.
Magenta would require changing the `regionBoardPrompt` generation contract
(model-compliance risk, color contamination, breaks existing white boards).

**Revisit trigger**: reports of near-white assets losing their edges. If adopted,
gate magenta keying behind a border-ratio detector (≈8% of border pixels near
key color) with fallback to the white pipeline.

## Constants contract (`constants.ts`)

- `BACKGROUND_ALPHA_MAX = 8`, `DEFAULT_THRESHOLD = 246`: ported verbatim from
  the original Electron renderer — do NOT tweak (byte-identical port contract).
- `MATTE_*` constants: deliberate new behavior, tunable. Widen the band to 2px
  (dilate once) before touching the distance thresholds if staircase persists.

## Tests Required

`src/algorithm/softenMaskEdges.test.ts` must keep asserting:
- monotonic band alpha vs distance-to-white on an anti-aliased circle fixture
- alpha floor ≥ 1 in band; interior untouched; background stays 0
- de-fringe round-trip: composite-over-white recovers input within ±3
- `runPipeline.test.ts`: exact box geometry unchanged (detection invariance)

Gates: `npx vitest run src/algorithm` · `npx tsc --noEmit -p tsconfig.app.json`
(NOT `-p .`, which is a silent no-op) · `npx oxlint src/algorithm`.

## Wrong vs Correct

```typescript
// Wrong: binary cut + near-white-only feather (pre-2026-07-17 behavior)
if (nearWhite(px) && touchesBackground(px)) px.a = Math.min(px.a, 90)
// → staircase on every dark/colored curved edge

// Correct: continuous ramp + un-premultiply, any color
const t = smoothstep(24, 96, distToWhite(px))
px.a = Math.min(px.a, Math.max(1, Math.round(t * 255)))
unpremultiplyAgainstWhite(px) // when px.a < 250
```

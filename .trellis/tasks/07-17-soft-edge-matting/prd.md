# PRD — Soft alpha edge matting for cutout pipeline

## Problem

Cutout slices (region-board segmentation) show severe jagged edges ("锯齿") on
curved/diagonal boundaries — e.g. circular color-swatch assets. Root cause is in
`src/algorithm/`:

1. `applyAlphaCut` is binary: background alpha → 0, everything else untouched.
   No transition band → staircase edges.
2. `isBackgroundPixel` classifies any pixel with r,g,b ≥ threshold (default 246)
   as background, so the original anti-aliased transition ring (blended toward
   white) is deleted wholesale.
3. `featherEdges` only caps alpha at 90 for *near-white* (r,g,b > 235) 1px edge
   pixels — ineffective for dark/colored edges.

## Decision (trade-off, user-approved direction)

Adopt a **white-matting soft edge** (LayerForge-inspired) rather than LayerForge's
full magenta chroma-key approach:

- LayerForge keys assets on pure magenta `#FF00FF` and computes a continuous
  alpha via `smoothstep(tolerance=24, softTolerance=96)` over RGB distance to the
  key color, plus a despill pass. That removes fg/bg ambiguity at the source but
  requires changing the board-generation prompt contract (model compliance risk,
  color-harmony contamination, incompatibility with existing white boards).
- Our `floodBackground` is border-seeded, so light asset interiors are already
  protected; the white-ambiguity only affects the 1–2px boundary band. A soft
  alpha ramp against WHITE as the key color fixes the visible jaggies with a
  minimal blast radius and no generation-side changes.
- Magenta keying stays a possible future enhancement (guarded by a border-ratio
  detector), out of scope here.

## Requirements

R1. Replace the binary edge treatment with a continuous alpha ramp on the
    background-mask boundary band: for foreground pixels adjacent to the flood
    background mask, alpha = smoothstep of RGB distance to white
    (near-white → transparent-ish, clearly-colored → opaque), LayerForge-style
    constants (tolerance ≈ 24, softTolerance ≈ 96 in RGB Euclidean distance) as
    the starting point.
R2. De-fringe (despill against white): boundary-band pixels that received
    partial alpha have their color un-premultiplied against white
    (c' = (c − 255·(1−α)) / α, clamped) so no white halo remains when composited
    on dark canvases.
R3. Detection invariance: `findComponents`/`mergeBoxes`/`splitCompositeBoxes`/
    `filterUiContainers` results (final `boxes`) must be unchanged for existing
    fixtures — soft alpha must keep boundary foreground pixels' alpha non-zero
    unless they were already background, and interior pixels are untouched.
R4. `featherEdges` (near-white alpha-cap hack) is superseded/removed from the
    pipeline; no dead call sites remain.
R5. Update the "ported verbatim / Do NOT tweak" contract comments in
    `constants.ts` and affected modules to reflect the new, deliberate edge
    behavior.

## Acceptance criteria

A1. Unit tests cover: alpha ramp monotonicity on a synthetic anti-aliased circle
    edge; interior pixels untouched; background stays alpha 0; boxes identical
    to pre-change pipeline on existing fixtures.
A2. `npx vitest run src/algorithm` passes; `tsc --noEmit -p tsconfig.app.json`
    clean; lint clean.
A3. Visual: a cut circle slice composited on dark background shows no staircase
    and no white halo (manual/E2E spot check acceptable).

## Out of scope

- Magenta chroma-key board generation (future task).
- Changes to region prompts, worker protocol, or slice naming.

import type { Box, CutoutParams, PixelFrame } from './types'
import { floodBackground } from './floodBackground'
import { applyAlphaCut } from './applyAlphaCut'
import { matteExteriorHaze } from './matteExteriorHaze'
import { softenMaskEdges } from './softenMaskEdges'
import { findComponents } from './findComponents'
import { mergeBoxes } from './mergeBoxes'
import { splitCompositeBoxes } from './splitCompositeBoxes'
import { filterUiContainers } from './filterUiContainers'
import { padBox } from './boxGeometry'
import { sortBoxes } from './sortBoxes'

/** Result of a full pipeline run: the mutated frame plus final slice boxes. */
export interface PipelineResult {
  /** The same `PixelFrame` passed in, now background-cut and edge-matted in place. */
  readonly frame: PixelFrame
  /** Final slice boxes in reading order (padded, clamped to image bounds). */
  readonly boxes: Box[]
}

/**
 * Pre-merge component cull floor. `findComponents` runs BEFORE the merge, so
 * culling at the full `minArea` here would discard an asset's thin sub-strokes
 * (an icon's inner arc, a glyph's dot) before they can rejoin their parent —
 * truncating multi-stroke line-art. We drop only true antialiasing specks here
 * and apply the real `minArea` to the ASSEMBLED (merged) boxes instead.
 */
const NOISE_FLOOR = 16

/** Thrown by {@link runPipeline} when an abort signal fires between stages. */
export class PipelineAbortError extends Error {
  constructor() {
    super('Pipeline aborted')
    this.name = 'PipelineAbortError'
  }
}

/**
 * Run the 8-stage cutout pipeline, mutating `frame.data` in place (worker-owned).
 *
 * Stage order extends the original Electron renderer with deterministic matte passes:
 *   1. floodBackground  → background mask
 *   2. applyAlphaCut    → zero background alpha
 *   3. matteExteriorHaze → recover broad, background-connected neutral shadow
 *   4. softenMaskEdges  → soft white-matting alpha ramp + de-fringe on the
 *      1px boundary band (deliberate replacement of the original feather hack;
 *      detection stages are unaffected — band alpha never drops to 0)
 *   5. findComponents   → foreground bounding boxes (>= NOISE_FLOOR only)
 *   6. mergeBoxes       → merge boxes within mergeGap, THEN cull those < minArea
 *   7. splitCompositeBoxes / filterUiContainers → refine, drop UI chrome
 *   8. padBox + sort    → pad each merged box, then order top-to-bottom / left-to-right
 *
 * `signal` (if provided) is checked between stages; an aborted signal throws
 * {@link PipelineAbortError} so a superseded run stops promptly (spec §6).
 */
export function runPipeline(
  frame: PixelFrame,
  params: CutoutParams,
  signal?: AbortSignal,
): PipelineResult {
  const { threshold, minArea, mergeGap, padding } = params
  const { width, height } = frame

  const checkAbort = (): void => {
    if (signal?.aborted) throw new PipelineAbortError()
  }

  const background = floodBackground(frame, threshold)
  checkAbort()

  applyAlphaCut(frame, background)
  checkAbort()

  matteExteriorHaze(frame, background)
  checkAbort()

  softenMaskEdges(frame, background)
  checkAbort()

  // Keep sub-`minArea` strokes so they can merge into their parent asset; the
  // real area cull happens on the merged boxes below (`box.pixels` is the summed
  // foreground of the union — see `unionBox`).
  const noiseFloor = Math.min(NOISE_FLOOR, minArea)
  const components = findComponents(frame, noiseFloor)
  checkAbort()

  const merged = mergeBoxes(components, mergeGap).filter(
    (box) => box.pixels >= minArea,
  )
  checkAbort()

  const refined = splitCompositeBoxes(frame, merged, minArea)
  checkAbort()

  const assetBoxes = filterUiContainers(frame, refined)
  checkAbort()

  const padded = assetBoxes.map((box) => padBox(box, padding, width, height))
  const boxes = sortBoxes(padded)

  return { frame, boxes }
}

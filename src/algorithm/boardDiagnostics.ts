import { BOARD_BORDER_WHITE_MIN_RATIO } from './constants'
import { isBackgroundPixel } from './isBackgroundPixel'
import type { PixelFrame } from './types'

/**
 * Background-compliance measurement for a generated cutout board.
 *
 * The white-background pipeline assumes the image model obeyed the pure-white
 * instruction; when it doesn't (gray/gradient/patterned background) slicing
 * silently degrades. This measures how white the board actually is — border
 * band and full frame — so non-compliance is observable BEFORE any adaptive
 * fallback is invested in. Measurement only: callers must not abort on it.
 */
export interface BoardDiagnostics {
  /** Fraction of border-band pixels that pass `isBackgroundPixel` (0..1). */
  readonly borderWhiteRatio: number
  /** Same fraction over the whole frame (0..1). */
  readonly whiteRatio: number
  /** `borderWhiteRatio >= BOARD_BORDER_WHITE_MIN_RATIO`. */
  readonly compliant: boolean
}

/**
 * Measure background compliance of `frame` at the given pipeline `threshold`.
 *
 * Border band width follows the LayerForge convention:
 * `max(2, round(min(width, height) * 0.025))`. A pixel counts as white iff
 * `isBackgroundPixel` accepts it, so compliance agrees exactly with what
 * `floodBackground` will treat as background at the same threshold.
 *
 * Single O(width×height) pass, scalar accumulators only; never mutates the
 * frame.
 */
export function computeBoardDiagnostics(
  frame: PixelFrame,
  threshold: number,
): BoardDiagnostics {
  const { data, width, height } = frame
  const total = width * height
  if (total === 0) {
    return { borderWhiteRatio: 0, whiteRatio: 0, compliant: false }
  }
  const band = Math.max(2, Math.round(Math.min(width, height) * 0.025))
  let white = 0
  let borderTotal = 0
  let borderWhite = 0
  for (let y = 0; y < height; y += 1) {
    const inBandRow = y < band || y >= height - band
    for (let x = 0; x < width; x += 1) {
      const isWhite = isBackgroundPixel(data, y * width + x, threshold)
      if (isWhite) white += 1
      if (inBandRow || x < band || x >= width - band) {
        borderTotal += 1
        if (isWhite) borderWhite += 1
      }
    }
  }
  const borderWhiteRatio = borderTotal > 0 ? borderWhite / borderTotal : 0
  return {
    borderWhiteRatio,
    whiteRatio: white / total,
    compliant: borderWhiteRatio >= BOARD_BORDER_WHITE_MIN_RATIO,
  }
}

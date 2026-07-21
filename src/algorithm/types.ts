/**
 * Core types for the pure pixel pipeline (DOM-free).
 *
 * All modules in `src/algorithm/**` operate on these plain data structures and
 * MUST NOT import any DOM / OffscreenCanvas API. Rendering lives in the worker.
 */

/** Product-owned internal parameters that fully determine pipeline output. */
export interface CutoutParams {
  /** White-background RGB threshold; a pixel is background if r,g,b all >= threshold. */
  readonly threshold: number
  /** Minimum connected-component area (in pixels) to keep as a slice. */
  readonly minArea: number
  /** Boxes whose gap is <= mergeGap on both axes are merged. */
  readonly mergeGap: number
  /** Pixels of padding added around each final box, clamped to image bounds. */
  readonly padding: number
}

/** An axis-aligned rectangle in image space. */
export interface Box {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** A {@link Box} that also carries the foreground pixel count of its component(s). */
export interface ComponentBox extends Box {
  readonly pixels: number
}

/**
 * An RGBA pixel frame.
 *
 * `data` is a tightly-packed `Uint8ClampedArray` of length `width * height * 4`
 * in row-major order (canvas `ImageData` layout). Worker-owned frames may be
 * mutated in place by `applyAlphaCut` / `softenMaskEdges` for performance — see
 * spec 4b. Nothing outside the worker references these buffers.
 */
export interface PixelFrame {
  readonly data: Uint8ClampedArray
  readonly width: number
  readonly height: number
}

/**
 * Per-pixel background flag, length `width * height`, row-major.
 *
 * `mask[y * width + x] === 1` marks a background pixel reachable from the
 * border via 4-connected flood fill.
 */
export type BackgroundMask = Uint8Array

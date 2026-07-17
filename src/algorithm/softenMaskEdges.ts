import type { BackgroundMask, PixelFrame } from './types'
import {
  MATTE_ALPHA_FLOOR,
  MATTE_FULL_OPAQUE_DIST,
  MATTE_FULL_TRANSPARENT_DIST,
} from './constants'

/**
 * Soft white-matting edge pass, IN PLACE. Supersedes the old `featherEdges`
 * near-white alpha-cap hack.
 *
 * For each interior foreground pixel that touches a background-mask pixel
 * (4-connected), compute the RGB Euclidean distance to white and ramp alpha
 * with `smoothstep(MATTE_FULL_TRANSPARENT_DIST, MATTE_FULL_OPAQUE_DIST, d)`:
 * near-white fringe becomes near-transparent, clearly-colored edge pixels stay
 * opaque, and the anti-aliased transition band in between gets a continuous
 * alpha ramp instead of a binary staircase. Partially-transparent pixels are
 * then un-premultiplied against white so no white halo remains when the slice
 * is composited on a dark canvas.
 *
 * Trade-off note: this is white-matting (key color = white), not LayerForge's
 * magenta chroma key. White keying needs no board-generation prompt changes,
 * and the border-seeded flood fill already protects light asset interiors, so
 * the white-ambiguity only affects this 1px boundary band.
 *
 * Detection invariance: band alpha is floored at `MATTE_ALPHA_FLOOR` (never 0)
 * and only ever lowered (`min` with existing alpha), so `findComponents` sees
 * the same foreground set as before.
 *
 * A snapshot (`copy`) of the mask is taken so newly-softened pixels do not
 * cascade within a single pass. Mutates the worker-owned `frame.data` (spec 4b).
 */
export function softenMaskEdges(frame: PixelFrame, background: BackgroundMask): void {
  const { data, width, height } = frame
  const copy = new Uint8Array(background)

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x
      if (copy[index]) continue

      const touchesBackground =
        copy[index - 1] ||
        copy[index + 1] ||
        copy[index - width] ||
        copy[index + width]
      if (!touchesBackground) continue

      const offset = index * 4
      const dr = 255 - data[offset]
      const dg = 255 - data[offset + 1]
      const db = 255 - data[offset + 2]
      const distance = Math.sqrt(dr * dr + dg * dg + db * db)

      const t = smoothstep(MATTE_FULL_TRANSPARENT_DIST, MATTE_FULL_OPAQUE_DIST, distance)
      const alphaNew = Math.min(
        data[offset + 3],
        Math.max(MATTE_ALPHA_FLOOR, Math.round(t * 255)),
      )
      data[offset + 3] = alphaNew

      // De-fringe: un-premultiply against white so partial-alpha pixels do not
      // carry a baked-in white contribution. Skip near-opaque pixels — no
      // visible fringe there, and dividing by alpha would amplify noise.
      if (alphaNew < 250) {
        data[offset] = unpremultiplyAgainstWhite(data[offset], alphaNew)
        data[offset + 1] = unpremultiplyAgainstWhite(data[offset + 1], alphaNew)
        data[offset + 2] = unpremultiplyAgainstWhite(data[offset + 2], alphaNew)
      }
    }
  }
}

/** LayerForge-style smoothstep: t²(3−2t) with t clamped to [0,1]. */
function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * Recover the original color of a pixel that was alpha-blended toward white:
 * c = c'·α + 255·(1−α)  ⇒  c' = (c − 255·(1−α)) / α, clamped to [0, 255].
 */
function unpremultiplyAgainstWhite(channel: number, alpha: number): number {
  const recovered = (channel * 255 - 255 * (255 - alpha)) / alpha
  return Math.min(255, Math.max(0, Math.round(recovered)))
}

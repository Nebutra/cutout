import { describe, it, expect } from 'vitest'
import { softenMaskEdges } from './softenMaskEdges'
import { floodBackground } from './floodBackground'
import { applyAlphaCut } from './applyAlphaCut'
import { alphaAt, frameFromGrid, paintedFrame } from './testFixtures'
import type { PixelFrame } from './types'

type Rgba = [number, number, number, number]

const WHITE: Rgba = [255, 255, 255, 255]
const DARK: Rgba = [10, 10, 10, 255]

/**
 * Synthetic anti-aliased black circle on a white sheet: each pixel's color is
 * black↔white mixed by its coverage of a disc of radius `r` centered in the
 * frame — the same fringe a rasterizer's anti-aliasing produces.
 */
function antiAliasedCircle(size: number, r: number): PixelFrame {
  const c = (size - 1) / 2
  const grid: Rgba[][] = []
  for (let y = 0; y < size; y += 1) {
    const row: Rgba[] = []
    for (let x = 0; x < size; x += 1) {
      const dist = Math.hypot(x - c, y - c)
      const coverage = Math.min(1, Math.max(0, r + 0.5 - dist))
      const v = Math.round(255 * (1 - coverage))
      row.push([v, v, v, 255])
    }
    grid.push(row)
  }
  return frameFromGrid(grid)
}

function rgbaAt(frame: PixelFrame, x: number, y: number): Rgba {
  const o = (y * frame.width + x) * 4
  return [frame.data[o], frame.data[o + 1], frame.data[o + 2], frame.data[o + 3]]
}

function distToWhite(r: number, g: number, b: number): number {
  return Math.hypot(255 - r, 255 - g, 255 - b)
}

describe('softenMaskEdges', () => {
  it('ramps band alpha monotonically with distance-to-white, never to 0, on an AA circle', () => {
    const frame = antiAliasedCircle(15, 4)
    const original = new Uint8ClampedArray(frame.data)
    const mask = floodBackground(frame, 246)
    applyAlphaCut(frame, mask)
    softenMaskEdges(frame, mask)

    // Collect band pixels: foreground pixels 4-adjacent to the mask.
    const band: Array<{ dist: number; alpha: number }> = []
    for (let y = 1; y < frame.height - 1; y += 1) {
      for (let x = 1; x < frame.width - 1; x += 1) {
        const i = y * frame.width + x
        if (mask[i]) continue
        const touches = mask[i - 1] || mask[i + 1] || mask[i - 15] || mask[i + 15]
        if (!touches) continue
        const o = i * 4
        band.push({
          dist: distToWhite(original[o], original[o + 1], original[o + 2]),
          alpha: frame.data[o + 3],
        })
      }
    }
    expect(band.length).toBeGreaterThan(0)

    band.sort((a, b) => a.dist - b.dist)
    for (let i = 1; i < band.length; i += 1) {
      expect(band[i].alpha).toBeGreaterThanOrEqual(band[i - 1].alpha)
    }
    for (const p of band) {
      expect(p.alpha).toBeGreaterThanOrEqual(1) // alpha floor — never 0
    }
  })

  it('leaves interior pixels untouched on the AA circle', () => {
    const frame = antiAliasedCircle(15, 4)
    const mask = floodBackground(frame, 246)
    applyAlphaCut(frame, mask)
    softenMaskEdges(frame, mask)
    // Center pixel: fully covered, not adjacent to background.
    expect(rgbaAt(frame, 7, 7)).toEqual([0, 0, 0, 255])
  })

  it('keeps background pixels at alpha 0', () => {
    const frame = antiAliasedCircle(15, 4)
    const mask = floodBackground(frame, 246)
    applyAlphaCut(frame, mask)
    softenMaskEdges(frame, mask)
    expect(alphaAt(frame, 0, 0)).toBe(0)
    expect(alphaAt(frame, 14, 14)).toBe(0)
  })

  it('un-premultiplies white fringe: round-trip composite over white recovers the input color', () => {
    // A near-white fringe pixel (dark blended ~90% toward white) on the band.
    const FRINGE: Rgba = [230, 230, 230, 255]
    const frame = paintedFrame(3, 3, FRINGE, {})
    const mask = new Uint8Array(9).fill(1)
    mask[4] = 0 // center is foreground
    softenMaskEdges(frame, mask)

    const [r, , , a] = rgbaAt(frame, 1, 1)
    expect(a).toBeGreaterThan(0)
    expect(a).toBeLessThan(255)
    // Fringe color is pulled away from white (halo removed)…
    expect(r).toBeLessThan(230)
    // …and compositing back over white reproduces the original pixel.
    const composited = (r * a) / 255 + 255 * (1 - a / 255)
    expect(Math.abs(composited - 230)).toBeLessThanOrEqual(3)
  })

  it('keeps clearly-colored edge pixels opaque and untouched', () => {
    const frame = paintedFrame(3, 3, DARK, {})
    const mask = new Uint8Array(9).fill(1)
    mask[4] = 0
    softenMaskEdges(frame, mask)
    expect(rgbaAt(frame, 1, 1)).toEqual(DARK)
  })

  it('only lowers alpha, never raises it', () => {
    const frame = paintedFrame(3, 3, [240, 240, 240, 20], {})
    const mask = new Uint8Array(9).fill(1)
    mask[4] = 0
    softenMaskEdges(frame, mask)
    expect(alphaAt(frame, 1, 1)).toBeLessThanOrEqual(20)
    expect(alphaAt(frame, 1, 1)).toBeGreaterThanOrEqual(1)
  })

  it('does not touch foreground away from the mask', () => {
    const frame = paintedFrame(3, 3, WHITE, {})
    const mask = new Uint8Array(9).fill(0)
    softenMaskEdges(frame, mask)
    expect(rgbaAt(frame, 1, 1)).toEqual(WHITE)
  })
})

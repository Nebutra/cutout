import { describe, it, expect } from 'vitest'
import { runPipeline } from './runPipeline'
import type { CutoutParams, PixelFrame } from './types'

/**
 * Regression: multi-stroke line-art icons must survive the pipeline WHOLE.
 *
 * A Wi-Fi glyph is disconnected line-art — concentric arcs + a dot, separated by
 * transparent gaps. Two former bugs truncated or deleted it:
 *   1. `findComponents` culled each thin sub-stroke below `minArea` BEFORE the
 *      merge, so the inner arc + dot were discarded → a truncated top-arcs slice.
 *   2. `filterUiContainers` mistook the sparse, striped whole for a loading
 *      skeleton and removed it entirely.
 * The fixes: cull `minArea` on the MERGED box (deferred past the merge), and gate
 * the skeleton rule on solid (dense) rows. This test pins both: the glyph comes
 * out as exactly ONE box spanning apex-to-dot, at small AND large scale.
 */

const PARAMS: CutoutParams = {
  threshold: 246,
  minArea: 900,
  mergeGap: 18,
  padding: 10,
}

const CX = 120
const CY = 175

function whiteFrame(w: number, h: number): PixelFrame {
  const data = new Uint8ClampedArray(w * h * 4)
  data.fill(255)
  return { data, width: w, height: h }
}

function setBlue(f: PixelFrame, x: number, y: number): void {
  if (x < 0 || y < 0 || x >= f.width || y >= f.height) return
  const o = (y * f.width + x) * 4
  f.data[o] = 37
  f.data[o + 1] = 99
  f.data[o + 2] = 235
  f.data[o + 3] = 255
}

/** Draw a Wi-Fi glyph: 3 concentric upper-fan arcs (+ dot) centred at (CX,CY). */
function drawWifi(f: PixelFrame, outerR: number): void {
  const radii = [outerR * 0.36, outerR * 0.68, outerR]
  for (const r of radii) {
    for (let deg = 200; deg <= 340; deg += 0.5) {
      const a = (deg * Math.PI) / 180
      for (let w = -5; w <= 5; w += 1) {
        setBlue(f, Math.round(CX + (r + w) * Math.cos(a)), Math.round(CY + (r + w) * Math.sin(a)))
      }
    }
  }
  for (let dy = -7; dy <= 7; dy += 1) {
    for (let dx = -7; dx <= 7; dx += 1) {
      if (dx * dx + dy * dy <= 49) setBlue(f, CX + dx, CY + dy)
    }
  }
}

function runWifi(outerR: number) {
  const f = whiteFrame(240, 220)
  drawWifi(f, outerR)
  return runPipeline(f, PARAMS).boxes
}

describe('line-art glyph (Wi-Fi icon) stays whole', () => {
  it('small glyph → one complete box (not truncated, not deleted)', () => {
    const outerR = 70
    const boxes = runWifi(outerR)
    expect(boxes).toHaveLength(1)
    const b = boxes[0]
    // reaches the top arc apex...
    expect(b.y).toBeLessThanOrEqual(CY - outerR + 12)
    // ...all the way down to the dot (CY + 7).
    expect(b.y + b.height).toBeGreaterThanOrEqual(CY + 7)
  })

  it('large glyph → one complete box (skeleton rule does not eat it)', () => {
    const outerR = 100
    const boxes = runWifi(outerR)
    expect(boxes).toHaveLength(1)
    const b = boxes[0]
    expect(b.y).toBeLessThanOrEqual(CY - outerR + 12)
    expect(b.y + b.height).toBeGreaterThanOrEqual(CY + 7)
  })
})

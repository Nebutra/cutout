import { describe, expect, it } from 'vitest'
import { computeBoardDiagnostics } from './boardDiagnostics'
import { DEFAULT_THRESHOLD } from './constants'
import { BLACK, WHITE, paintedFrame } from './testFixtures'

const GRAY: [number, number, number, number] = [200, 200, 200, 255]

describe('computeBoardDiagnostics', () => {
  it('marks an all-white board compliant with ratios ≈ 1', () => {
    const frame = paintedFrame(120, 100, WHITE, {})
    const d = computeBoardDiagnostics(frame, DEFAULT_THRESHOLD)
    expect(d.borderWhiteRatio).toBe(1)
    expect(d.whiteRatio).toBe(1)
    expect(d.compliant).toBe(true)
  })

  it('marks a gray-background board non-compliant', () => {
    const frame = paintedFrame(120, 100, GRAY, {})
    const d = computeBoardDiagnostics(frame, DEFAULT_THRESHOLD)
    expect(d.borderWhiteRatio).toBe(0)
    expect(d.whiteRatio).toBe(0)
    expect(d.compliant).toBe(false)
  })

  it('keeps a white board with a centered asset compliant, with whiteRatio < 1', () => {
    // 120×100 ⇒ band = max(2, round(100 * 0.025)) = 3; a centered dark rect
    // stays clear of the band, so the border remains fully white.
    const paint: Record<string, readonly [number, number, number, number]> = {}
    for (let y = 40; y < 60; y += 1) {
      for (let x = 50; x < 70; x += 1) paint[`${x},${y}`] = BLACK
    }
    const frame = paintedFrame(120, 100, WHITE, paint)
    const d = computeBoardDiagnostics(frame, DEFAULT_THRESHOLD)
    expect(d.borderWhiteRatio).toBe(1)
    expect(d.whiteRatio).toBeLessThan(1)
    expect(d.whiteRatio).toBeGreaterThan(0.9)
    expect(d.compliant).toBe(true)
  })

  it('respects the min-2px band floor: on a 4×4 frame the whole frame is band', () => {
    // band = max(2, round(4 * 0.025)) = 2 ⇒ every pixel is border band.
    const frame = paintedFrame(4, 4, GRAY, { '1,1': WHITE, '2,2': WHITE })
    const d = computeBoardDiagnostics(frame, DEFAULT_THRESHOLD)
    expect(d.borderWhiteRatio).toBe(2 / 16)
    expect(d.whiteRatio).toBe(2 / 16)
    expect(d.compliant).toBe(false)
  })

  it('does not mutate the frame', () => {
    const frame = paintedFrame(10, 10, WHITE, { '5,5': BLACK })
    const before = Uint8ClampedArray.from(frame.data)
    computeBoardDiagnostics(frame, DEFAULT_THRESHOLD)
    expect(frame.data).toEqual(before)
  })
})

import { describe, it, expect } from 'vitest'
import { runPipeline, PipelineAbortError } from './runPipeline'
import { floodBackground } from './floodBackground'
import { applyAlphaCut } from './applyAlphaCut'
import { softenMaskEdges } from './softenMaskEdges'
import { findComponents } from './findComponents'
import { mergeBoxes } from './mergeBoxes'
import { padBox } from './boxGeometry'
import { sortBoxes } from './sortBoxes'
import type { Box, CutoutParams, PixelFrame } from './types'
import { BLACK, WHITE, paintedFrame, alphaAt } from './testFixtures'

const PARAMS: CutoutParams = {
  threshold: 246,
  minArea: 1,
  mergeGap: 0,
  padding: 0,
}

/** Paint a solid opaque square of BLACK into a white frame. */
function frameWithSquares(
  width: number,
  height: number,
  squares: ReadonlyArray<readonly [number, number, number, number]>, // [x,y,w,h]
): PixelFrame {
  const paint: Record<string, readonly [number, number, number, number]> = {}
  for (const [sx, sy, sw, sh] of squares) {
    for (let y = sy; y < sy + sh; y += 1) {
      for (let x = sx; x < sx + sw; x += 1) paint[`${x},${y}`] = BLACK
    }
  }
  return paintedFrame(width, height, WHITE, paint)
}

/** Reference pipeline stages inlined (flood→cut→soften→comp→merge→pad→sort). */
function referencePipeline(frame: PixelFrame, params: CutoutParams): Box[] {
  const bg = floodBackground(frame, params.threshold)
  applyAlphaCut(frame, bg)
  softenMaskEdges(frame, bg)
  const comps = findComponents(frame, params.minArea)
  const merged = mergeBoxes(comps, params.mergeGap)
  const padded = merged.map((b) => padBox(b, params.padding, frame.width, frame.height))
  return sortBoxes(padded)
}

describe('runPipeline', () => {
  it('two separated squares on white -> two boxes in reading order', () => {
    const frame = frameWithSquares(20, 10, [
      [2, 2, 4, 4],
      [12, 3, 4, 4],
    ])
    const { boxes } = runPipeline(frame, PARAMS)
    expect(boxes).toHaveLength(2)
    expect(boxes[0]).toEqual({ x: 2, y: 2, width: 4, height: 4 })
    expect(boxes[1]).toEqual({ x: 12, y: 3, width: 4, height: 4 })
  })

  it('cuts background alpha and keeps foreground opaque', () => {
    const frame = frameWithSquares(8, 8, [[3, 3, 2, 2]])
    runPipeline(frame, PARAMS)
    expect(alphaAt(frame, 0, 0)).toBe(0) // background corner
    expect(alphaAt(frame, 3, 3)).toBe(255) // foreground (dark, feather won't touch)
  })

  it('matches the verbatim reference pipeline (geometry) on a multi-square sheet', () => {
    const build = (): PixelFrame =>
      frameWithSquares(30, 20, [
        [2, 2, 5, 5],
        [10, 2, 5, 5],
        [20, 10, 6, 6],
      ])
    const p: CutoutParams = { threshold: 246, minArea: 4, mergeGap: 3, padding: 2 }
    const mine = runPipeline(build(), p).boxes
    const ref = referencePipeline(build(), p)
    expect(mine).toEqual(ref)
  })

  it('merges nearby squares via mergeGap', () => {
    // two 4x4 squares 2px apart -> merged with mergeGap 3
    const frame = frameWithSquares(20, 10, [
      [2, 2, 4, 4],
      [8, 2, 4, 4], // gap of 2px between (x=6..7 white)
    ])
    const { boxes } = runPipeline(frame, { ...PARAMS, mergeGap: 3 })
    expect(boxes).toHaveLength(1)
    expect(boxes[0]).toEqual({ x: 2, y: 2, width: 10, height: 4 })
  })

  it('applies padding clamped to bounds', () => {
    const frame = frameWithSquares(10, 10, [[4, 4, 2, 2]])
    const { boxes } = runPipeline(frame, { ...PARAMS, padding: 3 })
    expect(boxes[0]).toEqual({ x: 1, y: 1, width: 8, height: 8 })
  })

  it('throws PipelineAbortError when the signal is already aborted', () => {
    const frame = frameWithSquares(10, 10, [[2, 2, 3, 3]])
    const controller = new AbortController()
    controller.abort()
    expect(() => runPipeline(frame, PARAMS, controller.signal)).toThrow(
      PipelineAbortError,
    )
  })
})

describe('runPipeline — property tests (spec §8)', () => {
  const sheet = (): PixelFrame =>
    frameWithSquares(40, 30, [
      [2, 2, 4, 4],
      [8, 2, 4, 4],
      [16, 2, 4, 4],
      [2, 12, 4, 4],
      [20, 18, 6, 6],
    ])

  it('box count is monotonically non-increasing in minArea', () => {
    let prev = Infinity
    for (const minArea of [1, 5, 12, 20, 40]) {
      const n = runPipeline(sheet(), { ...PARAMS, minArea }).boxes.length
      expect(n).toBeLessThanOrEqual(prev)
      prev = n
    }
  })

  it('box count is monotonically non-increasing in mergeGap', () => {
    let prev = Infinity
    for (const mergeGap of [0, 2, 6, 10, 20, 40]) {
      const n = runPipeline(sheet(), { ...PARAMS, mergeGap }).boxes.length
      expect(n).toBeLessThanOrEqual(prev)
      prev = n
    }
  })

  it('every returned box lies within image bounds', () => {
    const { boxes } = runPipeline(sheet(), { ...PARAMS, padding: 5 })
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(0)
      expect(b.y).toBeGreaterThanOrEqual(0)
      expect(b.x + b.width).toBeLessThanOrEqual(40)
      expect(b.y + b.height).toBeLessThanOrEqual(30)
    }
  })
})

import { describe, expect, it } from 'vitest'
import { applyAlphaCut } from './applyAlphaCut'
import { floodBackground } from './floodBackground'
import { runPipeline } from './runPipeline'
import { splitCompositeBoxes } from './splitCompositeBoxes'
import type { ComponentBox, CutoutParams, PixelFrame } from './types'
import { BLACK, WHITE, paintedFrame } from './testFixtures'

function frameWithSquares(
  width: number,
  height: number,
  squares: ReadonlyArray<readonly [number, number, number, number]>,
): PixelFrame {
  const paint: Record<string, readonly [number, number, number, number]> = {}
  for (const [sx, sy, sw, sh] of squares) {
    for (let y = sy; y < sy + sh; y += 1) {
      for (let x = sx; x < sx + sw; x += 1) paint[`${x},${y}`] = BLACK
    }
  }
  return paintedFrame(width, height, WHITE, paint)
}

function cutBackground(frame: PixelFrame): PixelFrame {
  applyAlphaCut(frame, floodBackground(frame, 246))
  return frame
}

describe('splitCompositeBoxes', () => {
  it('splits a wide merged row when transparent gutters separate subjects', () => {
    const frame = cutBackground(
      frameWithSquares(180, 80, [
        [16, 20, 28, 28],
        [76, 20, 28, 28],
        [136, 20, 28, 28],
      ]),
    )
    const merged: ComponentBox = {
      x: 16,
      y: 20,
      width: 148,
      height: 28,
      pixels: 28 * 28 * 3,
    }

    const parts = splitCompositeBoxes(frame, [merged], 20)

    expect(parts).toEqual([
      { x: 16, y: 20, width: 28, height: 28, pixels: 784 },
      { x: 76, y: 20, width: 28, height: 28, pixels: 784 },
      { x: 136, y: 20, width: 28, height: 28, pixels: 784 },
    ])
  })

  it('keeps compact multi-part assets merged', () => {
    const frame = cutBackground(
      frameWithSquares(60, 40, [
        [10, 10, 10, 10],
        [24, 10, 10, 10],
      ]),
    )
    const merged: ComponentBox = {
      x: 10,
      y: 10,
      width: 24,
      height: 10,
      pixels: 200,
    }

    expect(splitCompositeBoxes(frame, [merged], 20)).toEqual([merged])
  })

  it('splits disconnected foreground islands without requiring full gutters', () => {
    const frame = cutBackground(
      frameWithSquares(260, 170, [
        [20, 20, 52, 52],
        [104, 54, 52, 52],
        [188, 88, 52, 52],
      ]),
    )
    const merged: ComponentBox = {
      x: 20,
      y: 20,
      width: 220,
      height: 120,
      pixels: 52 * 52 * 3,
    }

    const parts = splitCompositeBoxes(frame, [merged], 20)

    expect(parts).toEqual([
      { x: 20, y: 20, width: 52, height: 52, pixels: 2704 },
      { x: 104, y: 54, width: 52, height: 52, pixels: 2704 },
      { x: 188, y: 88, width: 52, height: 52, pixels: 2704 },
    ])
  })

  it('keeps compact multi-island pictograms as one designed symbol', () => {
    const frame = cutBackground(
      frameWithSquares(120, 100, [
        [35, 18, 20, 20],
        [60, 18, 20, 20],
        [48, 44, 20, 28],
        [28, 50, 18, 22],
        [72, 50, 18, 22],
      ]),
    )
    const merged: ComponentBox = {
      x: 28,
      y: 18,
      width: 62,
      height: 54,
      pixels: 20 * 20 * 2 + 20 * 28 + 18 * 22 * 2,
    }

    expect(splitCompositeBoxes(frame, [merged], 20)).toEqual([merged])
  })
})

describe('runPipeline composite refinement', () => {
  it('undoes accidental row fusion from a large merge gap', () => {
    const params: CutoutParams = {
      threshold: 246,
      minArea: 20,
      mergeGap: 40,
      padding: 0,
    }
    const frame = frameWithSquares(180, 80, [
      [16, 20, 28, 28],
      [76, 20, 28, 28],
      [136, 20, 28, 28],
    ])

    const { boxes } = runPipeline(frame, params)

    expect(boxes).toHaveLength(3)
    expect(boxes.map((box) => box.x)).toEqual([16, 76, 136])
  })

  it('undoes accidental staggered product fusion from a large merge gap', () => {
    const params: CutoutParams = {
      threshold: 246,
      minArea: 20,
      mergeGap: 48,
      padding: 0,
    }
    const frame = frameWithSquares(260, 170, [
      [20, 20, 52, 52],
      [104, 54, 52, 52],
      [188, 88, 52, 52],
    ])

    const { boxes } = runPipeline(frame, params)

    expect(boxes).toHaveLength(3)
    expect(boxes.map((box) => box.x)).toEqual([20, 104, 188])
  })
})

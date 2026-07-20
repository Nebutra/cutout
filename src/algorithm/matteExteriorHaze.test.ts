import { describe, expect, it } from 'vitest'
import { applyAlphaCut } from './applyAlphaCut'
import { floodBackground } from './floodBackground'
import { matteExteriorHaze } from './matteExteriorHaze'
import { alphaAt, frameFromGrid } from './testFixtures'
import type { PixelFrame } from './types'

type Rgba = [number, number, number, number]

const WHITE: Rgba = [255, 255, 255, 255]
const DARK: Rgba = [20, 20, 20, 255]

function rgbaAt(frame: PixelFrame, x: number, y: number): Rgba {
  const offset = (y * frame.width + x) * 4
  return [
    frame.data[offset]!,
    frame.data[offset + 1]!,
    frame.data[offset + 2]!,
    frame.data[offset + 3]!,
  ]
}

function prepare(grid: Rgba[][]): { frame: PixelFrame; source: Uint8ClampedArray } {
  const frame = frameFromGrid(grid)
  const source = new Uint8ClampedArray(frame.data)
  const background = floodBackground(frame, 246)
  applyAlphaCut(frame, background)
  matteExteriorHaze(frame, background)
  return { frame, source }
}

describe('matteExteriorHaze', () => {
  it('recovers a broad neutral cast shadow connected to a foreground anchor', () => {
    const { frame, source } = prepare([
      [WHITE, WHITE, WHITE, WHITE, WHITE, WHITE, WHITE],
      [WHITE, WHITE, [242, 242, 242, 255], [235, 235, 235, 255], [242, 242, 242, 255], WHITE, WHITE],
      [WHITE, [242, 242, 242, 255], [225, 225, 225, 255], DARK, [225, 225, 225, 255], [242, 242, 242, 255], WHITE],
      [WHITE, WHITE, [242, 242, 242, 255], [235, 235, 235, 255], [242, 242, 242, 255], WHITE, WHITE],
      [WHITE, WHITE, WHITE, WHITE, WHITE, WHITE, WHITE],
    ])

    expect(alphaAt(frame, 2, 2)).toBe(30)
    expect(rgbaAt(frame, 3, 2)).toEqual(DARK)
    const [red, , , alpha] = rgbaAt(frame, 2, 2)
    const composited = (red * alpha) / 255 + 255 * (1 - alpha / 255)
    const sourceRed = source[(2 * frame.width + 2) * 4]!
    expect(Math.abs(composited - sourceRed)).toBeLessThanOrEqual(1)
  })

  it('protects a pale interior enclosed by a dark contour', () => {
    const PALE: Rgba = [230, 230, 230, 255]
    const { frame } = prepare([
      [WHITE, WHITE, WHITE, WHITE, WHITE],
      [WHITE, DARK, DARK, DARK, WHITE],
      [WHITE, DARK, PALE, DARK, WHITE],
      [WHITE, DARK, DARK, DARK, WHITE],
      [WHITE, WHITE, WHITE, WHITE, WHITE],
    ])
    expect(rgbaAt(frame, 2, 2)).toEqual(PALE)
  })

  it('does not matte an unanchored standalone pale-gray asset', () => {
    const PALE: Rgba = [230, 230, 230, 255]
    const { frame } = prepare([
      [WHITE, WHITE, WHITE, WHITE, WHITE],
      [WHITE, PALE, PALE, PALE, WHITE],
      [WHITE, PALE, PALE, PALE, WHITE],
      [WHITE, PALE, PALE, PALE, WHITE],
      [WHITE, WHITE, WHITE, WHITE, WHITE],
    ])
    expect(rgbaAt(frame, 2, 2)).toEqual(PALE)
  })

  it('does not matte pale chromatic artwork connected to a dark anchor', () => {
    const CREAM: Rgba = [235, 225, 190, 255]
    const { frame } = prepare([
      [WHITE, WHITE, WHITE, WHITE, WHITE],
      [WHITE, CREAM, CREAM, CREAM, WHITE],
      [WHITE, CREAM, DARK, CREAM, WHITE],
      [WHITE, CREAM, CREAM, CREAM, WHITE],
      [WHITE, WHITE, WHITE, WHITE, WHITE],
    ])
    expect(rgbaAt(frame, 1, 2)).toEqual(CREAM)
  })

  it('does not reinterpret an existing translucent pixel as white-matted haze', () => {
    const TRANSLUCENT: Rgba = [230, 230, 230, 96]
    const { frame } = prepare([
      [WHITE, WHITE, WHITE],
      [WHITE, TRANSLUCENT, DARK],
      [WHITE, WHITE, WHITE],
    ])
    expect(rgbaAt(frame, 1, 1)).toEqual(TRANSLUCENT)
  })

  it('does not treat existing partial alpha as a foreground anchor', () => {
    const PALE: Rgba = [230, 230, 230, 255]
    const TRANSLUCENT: Rgba = [80, 80, 80, 96]
    const { frame } = prepare([
      [WHITE, WHITE, WHITE, WHITE],
      [WHITE, PALE, TRANSLUCENT, WHITE],
      [WHITE, PALE, PALE, WHITE],
      [WHITE, WHITE, WHITE, WHITE],
    ])
    expect(rgbaAt(frame, 1, 1)).toEqual(PALE)
    expect(rgbaAt(frame, 2, 1)).toEqual(TRANSLUCENT)
  })

  it('never resurrects background pixels or makes foreground alpha zero', () => {
    const { frame } = prepare([
      [WHITE, WHITE, WHITE],
      [WHITE, [240, 240, 240, 255], DARK],
      [WHITE, WHITE, WHITE],
    ])
    expect(alphaAt(frame, 0, 0)).toBe(0)
    expect(alphaAt(frame, 1, 1)).toBeGreaterThanOrEqual(1)
  })
})

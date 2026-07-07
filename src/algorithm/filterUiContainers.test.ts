import { describe, expect, it } from 'vitest'
import { filterUiContainers } from './filterUiContainers'
import { runPipeline } from './runPipeline'
import type { ComponentBox, CutoutParams, PixelFrame } from './types'
import { WHITE, paintedFrame } from './testFixtures'

const CLEAR: [number, number, number, number] = [255, 255, 255, 0]
const PANEL: [number, number, number, number] = [226, 230, 235, 255]
const ACCENT: [number, number, number, number] = [38, 92, 214, 255]
const SKEL: [number, number, number, number] = [218, 224, 232, 255]
const BLACK: [number, number, number, number] = [0, 0, 0, 255]

const PARAMS: CutoutParams = {
  threshold: 246,
  minArea: 20,
  mergeGap: 18,
  padding: 0,
}

function frameWithPaint(
  width: number,
  height: number,
  fill: readonly [number, number, number, number],
  draw: (paint: Record<string, readonly [number, number, number, number]>) => void,
): PixelFrame {
  const paint: Record<string, readonly [number, number, number, number]> = {}
  draw(paint)
  return paintedFrame(width, height, fill, paint)
}

function rect(
  paint: Record<string, readonly [number, number, number, number]>,
  x: number,
  y: number,
  width: number,
  height: number,
  color: readonly [number, number, number, number],
): void {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) paint[`${px},${py}`] = color
  }
}

function roundedRect(
  paint: Record<string, readonly [number, number, number, number]>,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  color: readonly [number, number, number, number],
): void {
  const right = x + width - 1
  const bottom = y + height - 1
  for (let py = y; py <= bottom; py += 1) {
    for (let px = x; px <= right; px += 1) {
      const cx = px < x + radius ? x + radius : px > right - radius ? right - radius : px
      const cy = py < y + radius ? y + radius : py > bottom - radius ? bottom - radius : py
      const dx = px - cx
      const dy = py - cy
      if (dx * dx + dy * dy <= radius * radius) paint[`${px},${py}`] = color
    }
  }
}

function circle(
  paint: Record<string, readonly [number, number, number, number]>,
  cx: number,
  cy: number,
  radius: number,
  color: readonly [number, number, number, number],
): void {
  for (let y = cy - radius; y <= cy + radius; y += 1) {
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      const dx = x - cx
      const dy = y - cy
      if (dx * dx + dy * dy <= radius * radius) paint[`${x},${y}`] = color
    }
  }
}

describe('filterUiContainers', () => {
  it('filters large rounded cards and horizontal list rows', () => {
    const frame = frameWithPaint(260, 160, CLEAR, (paint) => {
      roundedRect(paint, 20, 18, 190, 78, 14, PANEL)
      roundedRect(paint, 20, 112, 210, 38, 12, PANEL)
    })
    const boxes: ComponentBox[] = [
      { x: 20, y: 18, width: 190, height: 78, pixels: 14_000 },
      { x: 20, y: 112, width: 210, height: 38, pixels: 7_600 },
    ]

    expect(filterUiContainers(frame, boxes)).toEqual([])
  })

  it('keeps small icon and badge-shaped assets', () => {
    const frame = frameWithPaint(160, 100, CLEAR, (paint) => {
      circle(paint, 24, 24, 14, ACCENT)
      roundedRect(paint, 72, 16, 64, 64, 18, ACCENT)
    })
    const boxes: ComponentBox[] = [
      { x: 10, y: 10, width: 29, height: 29, pixels: 613 },
      { x: 72, y: 16, width: 64, height: 64, pixels: 3_800 },
    ]

    expect(filterUiContainers(frame, boxes)).toEqual(boxes)
  })

  it('keeps large portrait-like and color-rich rectangular assets', () => {
    const frame = frameWithPaint(300, 180, CLEAR, (paint) => {
      circle(paint, 72, 90, 58, ACCENT)
      for (let y = 32; y < 132; y += 1) {
        for (let x = 160; x < 272; x += 1) {
          paint[`${x},${y}`] = [
            (x * 7 + y * 3) % 180,
            (x * 5 + y * 11) % 190,
            (x * 13 + y * 2) % 200,
            255,
          ]
        }
      }
    })
    const boxes: ComponentBox[] = [
      { x: 14, y: 32, width: 117, height: 117, pixels: 10_569 },
      { x: 160, y: 32, width: 112, height: 100, pixels: 11_200 },
    ]

    expect(filterUiContainers(frame, boxes)).toEqual(boxes)
  })

  it('filters complex UI cards even when they contain an artwork thumbnail', () => {
    const frame = frameWithPaint(320, 160, CLEAR, (paint) => {
      roundedRect(paint, 24, 24, 260, 104, 16, [12, 18, 34, 255])
      for (let y = 44; y < 104; y += 1) {
        for (let x = 44; x < 112; x += 1) {
          paint[`${x},${y}`] = [
            (x * 9 + y * 5) % 220,
            (x * 3 + y * 13) % 180,
            (x * 11 + y * 7) % 230,
            255,
          ]
        }
      }
      roundedRect(paint, 132, 46, 88, 10, 5, SKEL)
      roundedRect(paint, 132, 70, 118, 10, 5, SKEL)
      roundedRect(paint, 132, 94, 72, 18, 8, [228, 52, 142, 255])
    })
    const boxes: ComponentBox[] = [
      { x: 24, y: 24, width: 260, height: 104, pixels: 24_000 },
    ]

    expect(filterUiContainers(frame, boxes)).toEqual([])
  })
})

describe('runPipeline UI-container filtering', () => {
  it('drops skeleton-like horizontal bars after CV splitting', () => {
    const frame = frameWithPaint(180, 90, WHITE, (paint) => {
      rect(paint, 24, 18, 128, 10, SKEL)
      rect(paint, 24, 36, 112, 10, SKEL)
      rect(paint, 24, 54, 132, 10, SKEL)
    })

    expect(runPipeline(frame, PARAMS).boxes).toEqual([])
  })

  it('keeps transparent-gutter split assets as separate boxes', () => {
    const frame = frameWithPaint(180, 80, WHITE, (paint) => {
      rect(paint, 16, 20, 28, 28, BLACK)
      rect(paint, 76, 20, 28, 28, BLACK)
      rect(paint, 136, 20, 28, 28, BLACK)
    })

    const boxes = runPipeline(frame, { ...PARAMS, mergeGap: 40 }).boxes

    expect(boxes).toHaveLength(3)
    expect(boxes.map((box) => box.x)).toEqual([16, 76, 136])
  })
})

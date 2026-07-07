import type { ComponentBox, PixelFrame } from './types'

const SMALL_ASSET_SIDE = 96
const SMALL_ASSET_AREA = 9_216

const MIN_PANEL_WIDTH = 72
const MIN_PANEL_HEIGHT = 36
const MIN_PANEL_AREA = 12_000
const MIN_WIDE_ASPECT = 1.6

const MIN_THIN_BAR_WIDTH = 80
const MAX_THIN_BAR_HEIGHT = 32
const MIN_THIN_BAR_ASPECT = 4

const MIN_SKELETON_WIDTH = 96
const MIN_SKELETON_HEIGHT = 36
const MIN_SKELETON_RUNS = 3
/**
 * A loading skeleton is SOLID bars, so its bar rows are near-full-width (dense).
 * Sparse thin-stroke line-art (e.g. a Wi-Fi glyph's concentric arcs) has ~no
 * dense rows — requiring some guards those icons from being culled as skeletons.
 */
const MIN_SKELETON_DENSE_ROWS = 0.2
const MAX_LOW_DETAIL_ROW_COLORS = 4
const MIN_CONTAINER_LOW_DETAIL_ROWS = 0.28

interface BoxStats {
  readonly alphaDensity: number
  readonly colorComplexity: number
  readonly lowDetailRowRatio: number
  readonly denseRowRatio: number
  readonly denseColumnRatio: number
  readonly stripeRuns: number
  readonly stripeCoverageRatio: number
  readonly frameCoverage: number
}

/**
 * Remove obvious UI containers after CV slicing.
 *
 * This intentionally stays conservative: small pieces are always kept, and
 * visually complex regions are treated as asset-like even if their box is
 * rectangular. The filter only targets simple, regular UI primitives that are
 * cheap to rebuild in code: cards, rows, price panels, and skeleton bars.
 */
export function filterUiContainers(
  frame: PixelFrame,
  boxes: readonly ComponentBox[],
): ComponentBox[] {
  return boxes.filter((box) => !isLikelyUiContainer(frame, box))
}

function isLikelyUiContainer(frame: PixelFrame, box: ComponentBox): boolean {
  if (box.width <= 0 || box.height <= 0) return true

  const area = box.width * box.height
  const maxSide = Math.max(box.width, box.height)
  if (maxSide <= SMALL_ASSET_SIDE && area <= SMALL_ASSET_AREA) return false

  const stats = measureBox(frame, box)

  const aspect = box.width / box.height
  const wideAspect = Math.max(aspect, 1 / aspect)
  const regularRect =
    stats.alphaDensity >= 0.82 &&
    stats.denseRowRatio >= 0.72 &&
    stats.denseColumnRatio >= 0.72

  if (
    regularRect &&
    box.width >= MIN_PANEL_WIDTH &&
    box.height >= MIN_PANEL_HEIGHT &&
    (area >= MIN_PANEL_AREA || wideAspect >= MIN_WIDE_ASPECT)
  ) {
    return (
      !isVisuallyComplex(stats) ||
      stats.lowDetailRowRatio >= MIN_CONTAINER_LOW_DETAIL_ROWS
    )
  }

  if (isVisuallyComplex(stats)) return false

  if (
    box.width >= MIN_THIN_BAR_WIDTH &&
    box.height <= MAX_THIN_BAR_HEIGHT &&
    aspect >= MIN_THIN_BAR_ASPECT &&
    stats.alphaDensity >= 0.55 &&
    stats.denseRowRatio >= 0.6
  ) {
    return true
  }

  if (
    box.width >= MIN_SKELETON_WIDTH &&
    box.height >= MIN_SKELETON_HEIGHT &&
    stats.stripeRuns >= MIN_SKELETON_RUNS &&
    stats.stripeCoverageRatio <= 0.7 &&
    stats.alphaDensity <= 0.7 &&
    stats.denseRowRatio >= MIN_SKELETON_DENSE_ROWS
  ) {
    return true
  }

  if (
    box.width >= MIN_PANEL_WIDTH &&
    box.height >= MIN_PANEL_HEIGHT &&
    stats.frameCoverage >= 0.55 &&
    stats.alphaDensity <= 0.38
  ) {
    return true
  }

  return false
}

function isVisuallyComplex(stats: BoxStats): boolean {
  return stats.colorComplexity >= 14
}

function measureBox(frame: PixelFrame, box: ComponentBox): BoxStats {
  const { data, width } = frame
  const rowCounts = new Uint16Array(box.height)
  const columnCounts = new Uint16Array(box.width)
  const rowColorSets: Array<Set<number> | undefined> = new Array(box.height)
  const colors = new Set<number>()
  let alphaPixels = 0
  let sampled = 0
  let firstColor = -1
  const sampleEvery = Math.max(1, Math.floor((box.width * box.height) / 3_000))
  const rowSampleEvery = Math.max(1, Math.floor(box.width / 48))

  for (let y = 0; y < box.height; y += 1) {
    const py = box.y + y
    for (let x = 0; x < box.width; x += 1) {
      const px = box.x + x
      const offset = (py * width + px) * 4
      if (data[offset + 3] === 0) continue

      alphaPixels += 1
      rowCounts[y] += 1
      columnCounts[x] += 1
      const color = quantizedColor(data[offset], data[offset + 1], data[offset + 2])
      if (firstColor < 0) {
        firstColor = color
      }
      if (x % rowSampleEvery === 0) {
        const rowColors = rowColorSets[y] ?? new Set<number>()
        if (rowColors.size <= MAX_LOW_DETAIL_ROW_COLORS) rowColors.add(color)
        rowColorSets[y] = rowColors
      }

      if (alphaPixels % sampleEvery === 0) {
        colors.add(color)
        sampled += 1
      }
    }
  }

  if (alphaPixels > 0 && sampled === 0) {
    colors.add(firstColor)
  }

  let denseRows = 0
  let lowDetailRows = 0
  let stripeRuns = 0
  let stripePixels = 0
  let inStripe = false
  for (let y = 0; y < rowCounts.length; y += 1) {
    const coverage = rowCounts[y] / box.width
    if (coverage >= 0.85) denseRows += 1
    if (
      coverage >= 0.85 &&
      (rowColorSets[y]?.size ?? 0) <= MAX_LOW_DETAIL_ROW_COLORS
    ) {
      lowDetailRows += 1
    }
    if (coverage >= 0.25) {
      stripePixels += rowCounts[y]
      if (!inStripe) {
        stripeRuns += 1
        inStripe = true
      }
    } else {
      inStripe = false
    }
  }

  let denseColumns = 0
  for (let x = 0; x < columnCounts.length; x += 1) {
    if (columnCounts[x] / box.height >= 0.85) denseColumns += 1
  }

  return {
    alphaDensity: alphaPixels / (box.width * box.height),
    colorComplexity: colors.size,
    lowDetailRowRatio: lowDetailRows / box.height,
    denseRowRatio: denseRows / box.height,
    denseColumnRatio: denseColumns / box.width,
    stripeRuns,
    stripeCoverageRatio: alphaPixels === 0 ? 0 : stripePixels / alphaPixels,
    frameCoverage: measureFrameCoverage(rowCounts, columnCounts, box.width, box.height),
  }
}

function quantizedColor(r: number, g: number, b: number): number {
  return ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
}

function measureFrameCoverage(
  rowCounts: Uint16Array,
  columnCounts: Uint16Array,
  width: number,
  height: number,
): number {
  const bandY = Math.max(1, Math.floor(height * 0.08))
  const bandX = Math.max(1, Math.floor(width * 0.08))
  let top = 0
  let bottom = 0
  let left = 0
  let right = 0

  for (let y = 0; y < bandY; y += 1) {
    top += rowCounts[y] / width
    bottom += rowCounts[height - 1 - y] / width
  }
  for (let x = 0; x < bandX; x += 1) {
    left += columnCounts[x] / height
    right += columnCounts[width - 1 - x] / height
  }

  return (top / bandY + bottom / bandY + left / bandX + right / bandX) / 4
}

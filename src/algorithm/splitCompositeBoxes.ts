import type { ComponentBox, PixelFrame } from './types'
import { unionBox } from './boxGeometry'

const MIN_EMPTY_RUN = 8
const MIN_COMPOSITE_SIDE = 96
const MIN_COMPOSITE_AREA = 48_000
const MAX_DEPTH = 2
const MIN_ISLAND_SPLIT_AREA = 10_000
const MIN_ISLAND_SPLIT_SIDE = 64
const MAX_COMPACT_SYMBOL_SIDE = 140
const MAX_COMPACT_SYMBOL_AREA = 18_000
const MAX_COMPACT_SYMBOL_GAP = 18

type Axis = 'x' | 'y'
type Island = ComponentBox

/**
 * Split oversized merged boxes when they contain multiple independent assets.
 *
 * The normal merge step is still useful for multi-part assets such as icons,
 * labels, and button chrome. The failure mode on AI-generated boards is
 * different: the image model often places several independent assets close
 * enough that `mergeGap` fuses them into one huge slice. After the background is
 * cut, those bad composites either have disconnected foreground islands or
 * full-height/full-width empty bands between subjects. This pass handles both
 * cases and leaves compact multi-part assets alone.
 */
export function splitCompositeBoxes(
  frame: PixelFrame,
  boxes: readonly ComponentBox[],
  minArea: number,
): ComponentBox[] {
  return boxes.flatMap((box) => splitBox(frame, box, minArea, 0))
}

function splitBox(
  frame: PixelFrame,
  box: ComponentBox,
  minArea: number,
  depth: number,
): ComponentBox[] {
  if (depth >= MAX_DEPTH || !looksComposite(box)) return [{ ...box }]

  const islands = splitDisconnectedIslands(frame, box, minArea)
  if (islands.length > 1) {
    return islands.flatMap((part) => splitBox(frame, part, minArea, depth + 1))
  }

  const vertical = splitAlongAxis(frame, box, minArea, 'x')
  if (vertical.length > 1) {
    return vertical.flatMap((part) => splitBox(frame, part, minArea, depth + 1))
  }

  const horizontal = splitAlongAxis(frame, box, minArea, 'y')
  if (horizontal.length > 1) {
    return horizontal.flatMap((part) => splitBox(frame, part, minArea, depth + 1))
  }

  return [{ ...box }]
}

function looksComposite(box: ComponentBox): boolean {
  const area = box.width * box.height
  const aspect =
    box.height === 0 ? Infinity : Math.max(box.width / box.height, box.height / box.width)
  return (
    (Math.max(box.width, box.height) >= MIN_COMPOSITE_SIDE && aspect >= 1.8) ||
    area >= MIN_COMPOSITE_AREA
  )
}

function splitDisconnectedIslands(
  frame: PixelFrame,
  box: ComponentBox,
  minArea: number,
): ComponentBox[] {
  if (!largeEnoughForIslandSplit(box)) return [box]

  const islands = findForegroundIslands(frame, box, Math.max(minArea, 24))
  if (!shouldSplitIslands(box, islands, minArea)) return [box]

  return sortIslands(islands)
}

function largeEnoughForIslandSplit(box: ComponentBox): boolean {
  return (
    box.width * box.height >= MIN_ISLAND_SPLIT_AREA ||
    Math.max(box.width, box.height) >= MIN_ISLAND_SPLIT_SIDE * 3
  )
}

function findForegroundIslands(
  frame: PixelFrame,
  box: ComponentBox,
  minPixels: number,
): Island[] {
  const visited = new Uint8Array(box.width * box.height)
  const islands: Island[] = []

  for (let localY = 0; localY < box.height; localY += 1) {
    for (let localX = 0; localX < box.width; localX += 1) {
      const localIndex = localY * box.width + localX
      if (visited[localIndex] !== 0) continue

      const x = box.x + localX
      const y = box.y + localY
      if (alphaAt(frame, x, y) === 0) {
        visited[localIndex] = 1
        continue
      }

      const island = floodIsland(frame, box, localX, localY, visited)
      if (island.pixels >= minPixels) islands.push(island)
    }
  }

  return islands
}

function floodIsland(
  frame: PixelFrame,
  box: ComponentBox,
  startLocalX: number,
  startLocalY: number,
  visited: Uint8Array,
): Island {
  const queueX = new Int32Array(box.width * box.height)
  const queueY = new Int32Array(box.width * box.height)
  let head = 0
  let tail = 0

  queueX[tail] = startLocalX
  queueY[tail] = startLocalY
  tail += 1
  visited[startLocalY * box.width + startLocalX] = 1

  let minX = box.x + startLocalX
  let minY = box.y + startLocalY
  let maxX = minX
  let maxY = minY
  let pixels = 0

  while (head < tail) {
    const localX = queueX[head]
    const localY = queueY[head]
    head += 1

    const x = box.x + localX
    const y = box.y + localY
    pixels += 1
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y

    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue
        const nextLocalX = localX + dx
        const nextLocalY = localY + dy
        if (
          nextLocalX < 0 ||
          nextLocalY < 0 ||
          nextLocalX >= box.width ||
          nextLocalY >= box.height
        ) {
          continue
        }

        const nextIndex = nextLocalY * box.width + nextLocalX
        if (visited[nextIndex] !== 0) continue
        visited[nextIndex] = 1
        if (alphaAt(frame, box.x + nextLocalX, box.y + nextLocalY) === 0) continue

        queueX[tail] = nextLocalX
        queueY[tail] = nextLocalY
        tail += 1
      }
    }
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    pixels,
  }
}

function shouldSplitIslands(
  box: ComponentBox,
  islands: readonly Island[],
  minArea: number,
): boolean {
  if (islands.length <= 1) return false

  const strong = islands.filter((island) => island.pixels >= minArea * 1.5)
  if (looksLikeCompactSymbol(box, strong)) return false
  if (strong.length >= 3) return true
  if (strong.length < 2) return false

  const boxArea = box.width * box.height
  const foregroundPixels = islands.reduce((sum, island) => sum + island.pixels, 0)
  const emptyRatio = 1 - foregroundPixels / Math.max(1, boxArea)
  const wellSeparated = strong.every((island) =>
    strong.every((other) => island === other || distanceBetween(island, other) >= 4),
  )

  return wellSeparated && emptyRatio >= 0.28
}

function looksLikeCompactSymbol(
  box: ComponentBox,
  islands: readonly Island[],
): boolean {
  if (islands.length < 2 || islands.length > 6) return false
  if (
    Math.max(box.width, box.height) > MAX_COMPACT_SYMBOL_SIDE ||
    box.width * box.height > MAX_COMPACT_SYMBOL_AREA
  ) {
    return false
  }

  const maxGap = maxPairDistance(islands)
  return maxGap <= MAX_COMPACT_SYMBOL_GAP
}

function maxPairDistance(islands: readonly Island[]): number {
  let max = 0
  for (let i = 0; i < islands.length; i += 1) {
    for (let j = i + 1; j < islands.length; j += 1) {
      max = Math.max(max, distanceBetween(islands[i], islands[j]))
    }
  }
  return max
}

function distanceBetween(a: ComponentBox, b: ComponentBox): number {
  const left = Math.max(0, Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width)))
  const top = Math.max(0, Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height)))
  return Math.max(left, top)
}

function sortIslands(islands: readonly Island[]): ComponentBox[] {
  return [...islands].sort((a, b) => {
    const rowSlop = Math.max(8, Math.min(a.height, b.height) * 0.35)
    if (Math.abs(a.y - b.y) > rowSlop) return a.y - b.y
    return a.x - b.x
  })
}

function alphaAt(frame: PixelFrame, x: number, y: number): number {
  return frame.data[(y * frame.width + x) * 4 + 3]
}

function splitAlongAxis(
  frame: PixelFrame,
  box: ComponentBox,
  minArea: number,
  axis: Axis,
): ComponentBox[] {
  const length = axis === 'x' ? box.width : box.height
  const bands: Array<{ start: number; end: number }> = []
  let runStart = -1

  for (let i = 0; i < length; i += 1) {
    const empty = axisLineIsEmpty(frame, box, axis, i)
    if (empty && runStart < 0) {
      runStart = i
    } else if (!empty && runStart >= 0) {
      if (i - runStart >= MIN_EMPTY_RUN) bands.push({ start: runStart, end: i })
      runStart = -1
    }
  }
  if (runStart >= 0 && length - runStart >= MIN_EMPTY_RUN) {
    bands.push({ start: runStart, end: length })
  }
  if (bands.length === 0) return [box]

  const segments: Array<{ start: number; end: number }> = []
  let start = 0
  for (const band of bands) {
    if (band.start > start) segments.push({ start, end: band.start })
    start = band.end
  }
  if (start < length) segments.push({ start, end: length })

  const parts = segments
    .map((segment) => foregroundBoxForSegment(frame, box, axis, segment))
    .filter((part): part is ComponentBox => part !== null && part.pixels >= minArea)

  if (parts.length <= 1) return [box]

  const totalPixels = parts.reduce((sum, part) => sum + part.pixels, 0)
  if (totalPixels < box.pixels * 0.7) return [box]

  return mergeTinyFragments(parts, minArea)
}

function axisLineIsEmpty(
  frame: PixelFrame,
  box: ComponentBox,
  axis: Axis,
  offset: number,
): boolean {
  const { data, width } = frame
  if (axis === 'x') {
    const x = box.x + offset
    for (let y = box.y; y < box.y + box.height; y += 1) {
      if (data[(y * width + x) * 4 + 3] !== 0) return false
    }
    return true
  }

  const y = box.y + offset
  for (let x = box.x; x < box.x + box.width; x += 1) {
    if (data[(y * width + x) * 4 + 3] !== 0) return false
  }
  return true
}

function foregroundBoxForSegment(
  frame: PixelFrame,
  box: ComponentBox,
  axis: Axis,
  segment: { start: number; end: number },
): ComponentBox | null {
  const { data, width } = frame
  const x0 = axis === 'x' ? box.x + segment.start : box.x
  const x1 = axis === 'x' ? box.x + segment.end : box.x + box.width
  const y0 = axis === 'y' ? box.y + segment.start : box.y
  const y1 = axis === 'y' ? box.y + segment.end : box.y + box.height

  let minX = Infinity
  let minY = Infinity
  let maxX = -1
  let maxY = -1
  let pixels = 0

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      if (data[(y * width + x) * 4 + 3] === 0) continue
      pixels += 1
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }

  if (pixels === 0) return null
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    pixels,
  }
}

function mergeTinyFragments(
  parts: readonly ComponentBox[],
  minArea: number,
): ComponentBox[] {
  const strong: ComponentBox[] = []
  let pending: ComponentBox | null = null

  for (const part of parts) {
    if (part.pixels >= minArea * 1.5) {
      if (pending) {
        strong.push(pending)
        pending = null
      }
      strong.push(part)
      continue
    }
    pending = pending ? unionBox(pending, part) : part
  }

  if (pending) strong.push(pending)
  return strong.length > 1 ? strong : [...parts]
}

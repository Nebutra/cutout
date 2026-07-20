import type { BackgroundMask, PixelFrame } from './types'
import {
  MATTE_ALPHA_FLOOR,
  MATTE_HAZE_MAX_CHROMA,
  MATTE_HAZE_MIN_CHANNEL,
} from './constants'

/**
 * Recover broad neutral shadows and haze that were already composited over the
 * board's white background.
 *
 * A candidate region must be connected to the known background AND touch a
 * non-haze foreground anchor. The anchor guard protects standalone pale-gray
 * assets, while a bottle's exterior cast shadow remains eligible because it
 * touches the saturated bottle. Closed dark contours protect light interiors.
 *
 * Matting assumes white compositing and selects the smallest alpha that keeps
 * every recovered RGB channel non-negative. Re-compositing the result over
 * white therefore reproduces the source pixel (within integer rounding).
 * Alpha never reaches zero, preserving component geometry for later stages.
 */
export function matteExteriorHaze(frame: PixelFrame, background: BackgroundMask): void {
  const { data, width, height } = frame
  const size = width * height
  if (size === 0) return

  const seen = new Uint8Array(size)
  const queue = new Int32Array(size)

  for (let seed = 0; seed < size; seed += 1) {
    if (
      background[seed]
      || seen[seed]
      || !isNeutralHaze(data, seed)
      || !touchesBackground(background, seed, width, height)
    ) {
      continue
    }

    let head = 0
    let tail = 0
    let touchesForegroundAnchor = false
    seen[seed] = 1
    queue[tail++] = seed

    while (head < tail) {
      const index = queue[head++]!
      const x = index % width
      const y = (index / width) | 0

      if (x > 0) visit(index - 1)
      if (x < width - 1) visit(index + 1)
      if (y > 0) visit(index - width)
      if (y < height - 1) visit(index + width)
    }

    if (!touchesForegroundAnchor) continue
    for (let cursor = 0; cursor < tail; cursor += 1) {
      mattePixel(data, queue[cursor]!)
    }

    function visit(index: number): void {
      if (background[index]) return
      if (!isNeutralHaze(data, index)) {
        if (data[index * 4 + 3]! >= 250) touchesForegroundAnchor = true
        return
      }
      if (seen[index]) return
      seen[index] = 1
      queue[tail++] = index
    }
  }
}

function isNeutralHaze(data: Uint8ClampedArray, index: number): boolean {
  const offset = index * 4
  const red = data[offset]!
  const green = data[offset + 1]!
  const blue = data[offset + 2]!
  const alpha = data[offset + 3]!
  const minimum = Math.min(red, green, blue)
  const maximum = Math.max(red, green, blue)
  return alpha >= 250
    && minimum >= MATTE_HAZE_MIN_CHANNEL
    && maximum - minimum <= MATTE_HAZE_MAX_CHROMA
}

function touchesBackground(
  background: BackgroundMask,
  index: number,
  width: number,
  height: number,
): boolean {
  const x = index % width
  const y = (index / width) | 0
  return (x > 0 && Boolean(background[index - 1]))
    || (x < width - 1 && Boolean(background[index + 1]))
    || (y > 0 && Boolean(background[index - width]))
    || (y < height - 1 && Boolean(background[index + width]))
}

function mattePixel(data: Uint8ClampedArray, index: number): void {
  const offset = index * 4
  const alpha = Math.min(
    data[offset + 3]!,
    Math.max(
      MATTE_ALPHA_FLOOR,
      255 - Math.min(data[offset]!, data[offset + 1]!, data[offset + 2]!),
    ),
  )
  data[offset + 3] = alpha
  if (alpha >= 250) return
  data[offset] = unpremultiplyAgainstWhite(data[offset]!, alpha)
  data[offset + 1] = unpremultiplyAgainstWhite(data[offset + 1]!, alpha)
  data[offset + 2] = unpremultiplyAgainstWhite(data[offset + 2]!, alpha)
}

function unpremultiplyAgainstWhite(channel: number, alpha: number): number {
  const recovered = (channel * 255 - 255 * (255 - alpha)) / alpha
  return Math.min(255, Math.max(0, Math.round(recovered)))
}

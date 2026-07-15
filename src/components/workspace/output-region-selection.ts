import type { StructuredPromotion } from '@/structured-authoring'

export interface ImageGeometry {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
  readonly naturalWidth: number
  readonly naturalHeight: number
}

export interface Point {
  readonly x: number
  readonly y: number
}

export type RegionBounds = StructuredPromotion['selection']['bounds']

/** Maps a deliberate viewport drag into clamped source-image pixels. */
export function normalizeRegionBounds(
  start: Point,
  end: Point,
  image: ImageGeometry,
  minimumViewportPixels = 8,
): RegionBounds | null {
  if (image.width <= 0 || image.height <= 0 || image.naturalWidth <= 0 || image.naturalHeight <= 0) return null
  const startX = clamp(start.x - image.left, 0, image.width)
  const startY = clamp(start.y - image.top, 0, image.height)
  const endX = clamp(end.x - image.left, 0, image.width)
  const endY = clamp(end.y - image.top, 0, image.height)
  const width = Math.abs(endX - startX)
  const height = Math.abs(endY - startY)
  if (width < minimumViewportPixels || height < minimumViewportPixels) return null
  const scaleX = image.naturalWidth / image.width
  const scaleY = image.naturalHeight / image.height
  return {
    x: Math.min(startX, endX) * scaleX,
    y: Math.min(startY, endY) * scaleY,
    width: width * scaleX,
    height: height * scaleY,
  }
}

export function fullImageBounds(naturalWidth: number, naturalHeight: number): RegionBounds | null {
  if (naturalWidth <= 0 || naturalHeight <= 0) return null
  return { x: 0, y: 0, width: naturalWidth, height: naturalHeight }
}

export function regionOverlayStyle(bounds: RegionBounds, naturalWidth: number, naturalHeight: number) {
  if (naturalWidth <= 0 || naturalHeight <= 0) return undefined
  return {
    left: `${bounds.x / naturalWidth * 100}%`,
    top: `${bounds.y / naturalHeight * 100}%`,
    width: `${bounds.width / naturalWidth * 100}%`,
    height: `${bounds.height / naturalHeight * 100}%`,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

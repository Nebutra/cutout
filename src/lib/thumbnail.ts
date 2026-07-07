/**
 * Image describer (spec §5) — measures a blob and produces a small preview.
 *
 * The asset library stores a downscaled `thumb` next to each full blob so the
 * gallery grid renders straight from `list()` without loading every original
 * PNG into memory. DOM-facing (OffscreenCanvas) — so the repository injects it
 * and unit tests pass a stub instead of touching a canvas.
 */
import { decodeImage } from './image'

/** Longest edge of a generated thumbnail, in pixels. */
const THUMB_MAX = 256

export interface ImageDescription {
  readonly width: number
  readonly height: number
  readonly thumb: Blob
}

export type ImageDescriber = (blob: Blob) => Promise<ImageDescription>

/** Decode a blob, read its intrinsic size, and encode a ~256px PNG thumbnail. */
export const describeImage: ImageDescriber = async (blob) => {
  const bitmap = await decodeImage(blob)
  try {
    const { width, height } = bitmap
    const scale = Math.min(1, THUMB_MAX / Math.max(width, height))
    const tw = Math.max(1, Math.round(width * scale))
    const th = Math.max(1, Math.round(height * scale))

    const canvas = new OffscreenCanvas(tw, th)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable')
    ctx.drawImage(bitmap, 0, 0, tw, th)
    const thumb = await canvas.convertToBlob({ type: 'image/png' })

    return { width, height, thumb }
  } finally {
    bitmap.close()
  }
}

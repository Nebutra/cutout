/**
 * Image helpers (spec §3 lib/image.ts).
 *
 * Small wrappers around `createImageBitmap` and blob⇄bytes conversion used by
 * the drop flow and the export path. DOM-facing (main thread) — the worker has
 * its own render helpers in `workers/render.worker-side.ts`.
 */
import { t } from '@lingui/core/macro'
import { ACCEPTED_IMAGE_TYPES } from './constants'

/** True if a file looks like an importable raster image. */
export function isSupportedImage(file: File): boolean {
  if (file.type) return ACCEPTED_IMAGE_TYPES.includes(file.type)
  // Some drops omit a MIME type; fall back to extension.
  return /\.(png|jpe?g|webp|bmp|gif)$/i.test(file.name)
}

/** Resolve a supported image's media type when a drag source omitted MIME metadata. */
export function supportedImageMediaType(file: Pick<File, 'name' | 'type'>): string {
  if (ACCEPTED_IMAGE_TYPES.includes(file.type)) return file.type
  const extension = file.name.split('.').pop()?.toLowerCase()
  const inferred = extension && ({
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    bmp: 'image/bmp',
    gif: 'image/gif',
  } as const)[extension as 'png' | 'jpg' | 'jpeg' | 'webp' | 'bmp' | 'gif']
  if (!inferred) throw new Error(`Unsupported image media type: ${file.type || file.name}`)
  return inferred
}

/** Strip the directory + extension from a filename → a slice-name base. */
export function baseName(fileName: string): string {
  const noDir = fileName.split(/[\\/]/).pop() ?? fileName
  const dot = noDir.lastIndexOf('.')
  return dot > 0 ? noDir.slice(0, dot) : noDir
}

/**
 * Decode a File/Blob into an `ImageBitmap` (the store's transfer unit).
 * Throws a user-friendly error if the bytes are not a decodable image.
 */
export async function decodeImage(source: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(source)
  } catch {
    throw new Error(
      t({
        id: 'image.error_decode_failed',
        message: 'That file could not be decoded as an image.',
      }),
    )
  }
}

/** Raw PNG bytes from a blob (the export payload unit). */
export async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

/**
 * Encode an `ImageBitmap` to PNG bytes on the main thread (via OffscreenCanvas).
 * Used to hand the `board` source image (stored only as a bitmap) to reverse
 * compose / vision naming, which need transferable bytes. Throws if the 2D
 * context is unavailable.
 */
export async function bitmapToBytes(bitmap: ImageBitmap): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable')
  ctx.drawImage(bitmap, 0, 0)
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  return blobToBytes(blob)
}

/** Wrap raw bytes back into a typed blob (test/util symmetry with the worker). */
export function bytesToBlob(bytes: Uint8Array, type = 'image/png'): Blob {
  // Copy into a guaranteed `ArrayBuffer` view: a `Uint8Array` may be backed by a
  // `SharedArrayBuffer`, which is not a valid `BlobPart` under lib.dom typings.
  const copy = new Uint8Array(bytes.length)
  copy.set(bytes)
  return new Blob([copy.buffer], { type })
}

/**
 * Decode a base64 string into raw bytes. Used by the 垫图 image-edit path: the
 * Rust `ai_image_edit` command returns the model's PNG as base64 (`b64_json`),
 * which the service turns into a `GeneratedAsset`. `atob` is available in the
 * Tauri webview; each char code is one byte of the decoded binary string.
 */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/** Human-readable byte size, e.g. `3.2 MB`. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`
}

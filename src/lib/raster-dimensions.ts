export interface RasterDimensions {
  readonly width: number
  readonly height: number
}

/** Read common raster dimensions without decoding pixels or depending on the DOM. */
export function readRasterDimensions(bytes: Uint8Array): RasterDimensions | null {
  return readPng(bytes)
    ?? readJpeg(bytes)
    ?? readWebp(bytes)
    ?? readGif(bytes)
    ?? readBmp(bytes)
}

function readPng(bytes: Uint8Array): RasterDimensions | null {
  if (
    bytes.length < 24
    || bytes[0] !== 0x89
    || bytes[1] !== 0x50
    || bytes[2] !== 0x4e
    || bytes[3] !== 0x47
  ) return null
  return dimensions(readU32Be(bytes, 16), readU32Be(bytes, 20))
}

function readJpeg(bytes: Uint8Array): RasterDimensions | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  let offset = 2
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = bytes[offset + 1]
    offset += 2
    if (marker === 0xd8 || marker === 0xd9) continue
    const length = readU16Be(bytes, offset)
    if (length < 2 || offset + length > bytes.length) return null
    if (isStartOfFrame(marker)) {
      return dimensions(
        readU16Be(bytes, offset + 5),
        readU16Be(bytes, offset + 3),
      )
    }
    offset += length
  }
  return null
}

function readWebp(bytes: Uint8Array): RasterDimensions | null {
  if (
    bytes.length < 30
    || ascii(bytes, 0, 4) !== 'RIFF'
    || ascii(bytes, 8, 4) !== 'WEBP'
  ) return null
  const kind = ascii(bytes, 12, 4)
  if (kind === 'VP8X') {
    return dimensions(readU24Le(bytes, 24) + 1, readU24Le(bytes, 27) + 1)
  }
  if (kind === 'VP8 ' && bytes.length >= 30) {
    return dimensions(readU16Le(bytes, 26) & 0x3fff, readU16Le(bytes, 28) & 0x3fff)
  }
  if (kind === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
    const b0 = bytes[21] ?? 0
    const b1 = bytes[22] ?? 0
    const b2 = bytes[23] ?? 0
    const b3 = bytes[24] ?? 0
    return dimensions(
      1 + b0 + ((b1 & 0x3f) << 8),
      1 + (b1 >> 6) + (b2 << 2) + ((b3 & 0x0f) << 10),
    )
  }
  return null
}

function readGif(bytes: Uint8Array): RasterDimensions | null {
  if (bytes.length < 10 || !['GIF87a', 'GIF89a'].includes(ascii(bytes, 0, 6))) {
    return null
  }
  return dimensions(readU16Le(bytes, 6), readU16Le(bytes, 8))
}

function readBmp(bytes: Uint8Array): RasterDimensions | null {
  if (bytes.length < 26 || ascii(bytes, 0, 2) !== 'BM') return null
  return dimensions(readU32Le(bytes, 18), Math.abs(readI32Le(bytes, 22)))
}

function dimensions(width: number, height: number): RasterDimensions | null {
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0
    ? { width, height }
    : null
}

function isStartOfFrame(marker: number | undefined): boolean {
  return marker !== undefined
    && marker >= 0xc0
    && marker <= 0xcf
    && ![0xc4, 0xc8, 0xcc].includes(marker)
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length))
}

function readU16Be(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0)
}

function readU16Le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8)
}

function readU24Le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0)
    | ((bytes[offset + 1] ?? 0) << 8)
    | ((bytes[offset + 2] ?? 0) << 16)
}

function readU32Be(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, false)
}

function readU32Le(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true)
}

function readI32Le(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getInt32(0, true)
}

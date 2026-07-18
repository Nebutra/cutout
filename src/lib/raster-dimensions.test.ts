import { describe, expect, it } from 'vitest'
import { readRasterDimensions } from './raster-dimensions'

describe('readRasterDimensions', () => {
  it('reads PNG dimensions from IHDR bytes', () => {
    const png = new Uint8Array(24)
    png.set([0x89, 0x50, 0x4e, 0x47], 0)
    new DataView(png.buffer).setUint32(16, 1024, false)
    new DataView(png.buffer).setUint32(20, 768, false)
    expect(readRasterDimensions(png)).toEqual({ width: 1024, height: 768 })
  })

  it('returns null for unknown or truncated bytes', () => {
    expect(readRasterDimensions(new Uint8Array([1, 2, 3]))).toBeNull()
  })
})

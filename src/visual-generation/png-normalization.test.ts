import { describe, expect, it } from 'vitest'
import { assertNormalizedPng, hasPngMagic, pngDimensions } from './png-normalization'

function header(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10])
  const view = new DataView(bytes.buffer); view.setUint32(16, width); view.setUint32(20, height)
  return bytes
}

describe('PNG reference normalization checks', () => {
  it('reads IHDR dimensions and validates the normalized contract', () => {
    expect(hasPngMagic(header(1024, 1024))).toBe(true)
    expect(pngDimensions(header(1254, 1254))).toEqual({ width: 1254, height: 1254 })
    expect(() => assertNormalizedPng(header(1024, 1024))).not.toThrow()
    expect(() => assertNormalizedPng(header(1254, 1254))).toThrow('Expected normalized 1024x1024 PNG')
  })

  it('rejects non-PNG and invalid dimensions', () => {
    expect(() => pngDimensions(new Uint8Array(24))).toThrow('valid PNG')
    expect(() => pngDimensions(header(0, 1024))).toThrow('positive')
  })
})

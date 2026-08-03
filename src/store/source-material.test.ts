import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveSourceMaterial } from './source-material'
import type { SourceState } from './types'

function source(overrides: Partial<SourceState>): SourceState {
  return {
    bitmap: null,
    encodedImage: null,
    name: 'source',
    width: 2,
    height: 2,
    imageId: 'source-1',
    autoAnalyze: false,
    ...overrides,
  }
}

describe('resolveSourceMaterial', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns exact encoded source bytes and media type', async () => {
    const bytes = Uint8Array.of(82, 73, 70, 70, 1, 2, 3)
    const result = await resolveSourceMaterial(source({
      encodedImage: new Blob([bytes], { type: 'image/webp' }),
    }))

    expect(result).toMatchObject({ mediaType: 'image/webp', encoding: 'original' })
    expect(result.bytes).toEqual(bytes)
  })

  it('explicitly normalizes bitmap-only legacy sources to PNG', async () => {
    const convertToBlob = vi.fn(async () => new Blob([Uint8Array.of(9, 8, 7)], {
      type: 'image/png',
    }))
    vi.stubGlobal('OffscreenCanvas', class {
      readonly width: number
      readonly height: number
      constructor(width: number, height: number) {
        this.width = width
        this.height = height
      }
      getContext() { return { drawImage: vi.fn() } }
      convertToBlob = convertToBlob
    })

    const result = await resolveSourceMaterial(source({
      bitmap: { width: 2, height: 2, close() {} } as ImageBitmap,
    }))

    expect(result).toMatchObject({ mediaType: 'image/png', encoding: 'normalized-png' })
    expect(result.bytes).toEqual(Uint8Array.of(9, 8, 7))
    expect(convertToBlob).toHaveBeenCalledWith({ type: 'image/png' })
  })
})

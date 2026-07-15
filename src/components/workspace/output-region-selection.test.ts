import { describe, expect, it } from 'vitest'
import { fullImageBounds, normalizeRegionBounds, regionOverlayStyle } from './output-region-selection'

const image = { left: 100, top: 50, width: 400, height: 200, naturalWidth: 1600, naturalHeight: 800 }

describe('output region selection', () => {
  it('normalizes viewport coordinates into source-image pixels in either drag direction', () => {
    expect(normalizeRegionBounds({ x: 150, y: 75 }, { x: 350, y: 175 }, image)).toEqual({ x: 200, y: 100, width: 800, height: 400 })
    expect(normalizeRegionBounds({ x: 350, y: 175 }, { x: 150, y: 75 }, image)).toEqual({ x: 200, y: 100, width: 800, height: 400 })
  })

  it('clamps drags to the visible image and rejects accidental taps', () => {
    expect(normalizeRegionBounds({ x: 0, y: 0 }, { x: 600, y: 300 }, image)).toEqual({ x: 0, y: 0, width: 1600, height: 800 })
    expect(normalizeRegionBounds({ x: 150, y: 75 }, { x: 155, y: 80 }, image)).toBeNull()
  })

  it('supports explicit full-image selection and stable percentage overlays', () => {
    expect(fullImageBounds(1600, 800)).toEqual({ x: 0, y: 0, width: 1600, height: 800 })
    expect(fullImageBounds(0, 800)).toBeNull()
    expect(regionOverlayStyle({ x: 200, y: 100, width: 800, height: 400 }, 1600, 800)).toEqual({ left: '12.5%', top: '12.5%', width: '50%', height: '50%' })
  })
})

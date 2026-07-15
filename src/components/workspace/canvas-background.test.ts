import { describe, expect, it } from 'vitest'
import { hexToHsv, hsvToHex, normalizeHex } from './canvas-background'

describe('normalizeHex', () => {
  it('accepts 6-digit hex with or without hash and lowercases', () => {
    expect(normalizeHex('#F5F5F5')).toBe('#f5f5f5')
    expect(normalizeHex('22C55E')).toBe('#22c55e')
  })

  it('expands 3-digit hex and rejects invalid input', () => {
    expect(normalizeHex('#fff')).toBe('#ffffff')
    expect(normalizeHex('red')).toBeNull()
    expect(normalizeHex('#12345')).toBeNull()
  })
})

describe('hsv round trip', () => {
  it.each(['#ff0000', '#22c55e', '#a855f7', '#0a0a0a', '#ffffff', '#f5f5f5'])(
    'round-trips %s through hsv',
    (hex) => {
      expect(hsvToHex(hexToHsv(hex))).toBe(hex)
    },
  )

  it('maps pure hues to expected angles', () => {
    expect(hexToHsv('#ff0000').h).toBe(0)
    expect(Math.round(hexToHsv('#00ff00').h)).toBe(120)
    expect(Math.round(hexToHsv('#0000ff').h)).toBe(240)
  })
})

import { canvasForeground } from './canvas-background'

describe('canvasForeground', () => {
  it('returns dark text on light backgrounds and light text on dark ones', () => {
    expect(canvasForeground('#f5f5f5')).toBe('rgb(0 0 0 / 0.45)')
    expect(canvasForeground('#ffffff')).toBe('rgb(0 0 0 / 0.45)')
    expect(canvasForeground('#0a0a0a')).toBe('rgb(255 255 255 / 0.65)')
    expect(canvasForeground('#a855f7')).toBe('rgb(255 255 255 / 0.65)')
  })

  it('returns null for the default background', () => {
    expect(canvasForeground(null)).toBeNull()
  })
})

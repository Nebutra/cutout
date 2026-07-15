/**
 * Color math + persistence for the canvas background picker.
 * Hex is the storage format; HSV only exists while dragging in the picker.
 */
export interface Hsv {
  readonly h: number
  readonly s: number
  readonly v: number
}

export const CANVAS_BACKGROUND_KEY = 'cutout.canvas-background'

export const CANVAS_BACKGROUND_PRESETS = [
  '#f5f5f5',
  '#0a0a0a',
  '#ffffff',
  '#22c55e',
  '#a855f7',
  '#e9d5ff',
] as const

export function normalizeHex(value: string): string | null {
  const raw = value.trim().replace(/^#/, '').toLocaleLowerCase()
  if (/^[0-9a-f]{6}$/.test(raw)) return `#${raw}`
  if (/^[0-9a-f]{3}$/.test(raw)) {
    return `#${raw.split('').map((ch) => ch + ch).join('')}`
  }
  return null
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  const [r, g, b] =
    h < 60 ? [c, x, 0]
    : h < 120 ? [x, c, 0]
    : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c]
    : h < 300 ? [x, 0, c]
    : [c, 0, x]
  const channel = (value: number) =>
    Math.round((value + m) * 255).toString(16).padStart(2, '0')
  return `#${channel(r)}${channel(g)}${channel(b)}`
}

export function hexToHsv(hex: string): Hsv {
  const normalized = normalizeHex(hex) ?? '#000000'
  const r = parseInt(normalized.slice(1, 3), 16) / 255
  const g = parseInt(normalized.slice(3, 5), 16) / 255
  const b = parseInt(normalized.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d > 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6)
    else if (max === g) h = 60 * ((b - r) / d + 2)
    else h = 60 * ((r - g) / d + 4)
  }
  if (h < 0) h += 360
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

export function readCanvasBackground(): string | null {
  try {
    const stored = localStorage.getItem(CANVAS_BACKGROUND_KEY)
    return stored ? normalizeHex(stored) : null
  } catch {
    return null
  }
}

export function writeCanvasBackground(hex: string | null): void {
  try {
    if (hex) localStorage.setItem(CANVAS_BACKGROUND_KEY, hex)
    else localStorage.removeItem(CANVAS_BACKGROUND_KEY)
  } catch {
    // best-effort persistence only
  }
}

/** Readable text color for content sitting on the canvas background. */
export function canvasForeground(hex: string | null): string | null {
  if (!hex) return null
  const normalized = normalizeHex(hex)
  if (!normalized) return null
  const channel = (slice: string) => {
    const value = parseInt(slice, 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  const luminance =
    0.2126 * channel(normalized.slice(1, 3))
    + 0.7152 * channel(normalized.slice(3, 5))
    + 0.0722 * channel(normalized.slice(5, 7))
  return luminance > 0.4 ? 'rgb(0 0 0 / 0.45)' : 'rgb(255 255 255 / 0.65)'
}

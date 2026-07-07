/**
 * Filename helpers (spec §5 / §6, risk #6).
 *
 * These MIRROR the Rust `sanitize_filename` so a name that survives client-side
 * rename produces the same on-disk file: replace every run of characters
 * outside `[A-Za-z0-9._-]` with a single `_` (the JS original used `/[^\w.-]+/g`
 * with the `+` collapsing runs), guard empties, and ensure export extensions.
 */

const UNSAFE_RUN = /[^A-Za-z0-9._-]+/g

/** Default slice filename: `${base}-01.png` (1-based, 2-padded). */
export function defaultSliceName(base: string, index: number): string {
  const padded = String(index + 1).padStart(2, '0')
  return sanitizeFilename(`${base}-${padded}.png`)
}

/** Collapse unsafe character runs to `_`; never returns an empty stem. */
export function sanitizeFilename(name: string): string {
  const cleaned = name.trim().replace(UNSAFE_RUN, '_')
  const withoutLeadingDots = cleaned.replace(/^\.+/, '')
  const stem = withoutLeadingDots.length > 0 ? withoutLeadingDots : 'asset'
  return stem
}

/** Sanitize and guarantee a single `.png` extension (case-insensitive). */
export function ensurePngName(name: string): string {
  const safe = sanitizeFilename(name)
  if (/\.png$/i.test(safe)) return safe
  const withoutTrailingDot = safe.replace(/\.+$/, '')
  const base = withoutTrailingDot.length > 0 ? withoutTrailingDot : 'asset'
  return `${base}.png`
}

/** Sanitize, remove the current extension, and guarantee a `.svg` extension. */
export function ensureSvgName(name: string): string {
  const safe = sanitizeFilename(name)
  const withoutExtension = safe.replace(/\.[^.]+$/, '').replace(/\.+$/, '')
  const base = withoutExtension.length > 0 ? withoutExtension : 'asset'
  return `${base}.svg`
}

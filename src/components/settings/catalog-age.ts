/**
 * How stale a connection's model catalog is, in the coarsest honest unit.
 *
 * Lives outside `ProviderRow` so the component file exports only components
 * (fast refresh) and so the formatting is testable without a DOM.
 */

/** `undefined` when the catalog was never probed or the stamp is unreadable. */
export function catalogAge(
  fetchedAt: string | undefined,
  locale: string,
  now: number,
): string | undefined {
  if (!fetchedAt) return undefined
  const at = Date.parse(fetchedAt)
  if (Number.isNaN(at)) return undefined
  const seconds = Math.round((at - now) / 1000)
  // `Intl.RelativeTimeFormat` follows the active locale, so the row reads
  // naturally in every catalog without a per-locale string.
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const units: readonly [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86_400], ['hour', 3_600], ['minute', 60],
  ]
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit)
  }
  return format.format(0, 'minute')
}

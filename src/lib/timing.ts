export function markTime(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}

export function logTiming(
  label: string,
  startedAt: number,
  data?: Record<string, unknown>,
): void {
  if (!import.meta.env.DEV) return
  const elapsed = Math.round(markTime() - startedAt)
  if (data) console.info(`[Cutout timing] ${label}: ${elapsed}ms`, data)
  else console.info(`[Cutout timing] ${label}: ${elapsed}ms`)
}

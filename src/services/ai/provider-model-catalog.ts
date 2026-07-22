export function parseProviderModelIds(parsed: unknown): string[] | undefined {
  if (!parsed || typeof parsed !== 'object') return undefined
  const value = parsed as { data?: unknown; models?: unknown }
  const rows = Array.isArray(value.data)
    ? value.data
    : Array.isArray(value.models)
      ? value.models
      : undefined
  if (!rows) return undefined

  const ids = rows.flatMap((row) => {
    if (!row || typeof row !== 'object') return []
    const item = row as { id?: unknown; name?: unknown }
    const raw = typeof item.id === 'string'
      ? item.id
      : typeof item.name === 'string'
        ? item.name
        : undefined
    if (!raw) return []
    const normalized = raw.replace(/^models\//, '').trim()
    return normalized ? [normalized] : []
  })
  const unique = Array.from(new Set(ids))
  return unique.length > 0 ? unique : undefined
}

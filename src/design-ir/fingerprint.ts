/** JSON canonicalization used for durable Design IR revisions and agent diffs. */
export function canonicalJson(value: unknown): string {
  return canonicalize(value, new Set<object>())
}

/** SHA-256 of canonical JSON, portable across modern browser, Tauri, and Node. */
export async function fingerprint(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function canonicalize(value: unknown, ancestors: Set<object>): string {
  if (value === null) return 'null'
  switch (typeof value) {
    case 'string': return JSON.stringify(value)
    case 'boolean': return value ? 'true' : 'false'
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError('Canonical JSON cannot contain non-finite numbers.')
      return JSON.stringify(value)
    case 'undefined':
    case 'function':
    case 'symbol':
    case 'bigint':
      throw new TypeError(`Canonical JSON cannot contain ${typeof value}.`)
    case 'object': {
      if (ancestors.has(value)) throw new TypeError('Canonical JSON cannot contain cycles.')
      ancestors.add(value)
      try {
        if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item, ancestors)).join(',')}]`
        const prototype = Object.getPrototypeOf(value)
        if (prototype !== Object.prototype && prototype !== null) {
          throw new TypeError('Canonical JSON only accepts plain objects and arrays.')
        }
        const object = value as Record<string, unknown>
        const keys = Object.keys(object).sort()
        return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(object[key], ancestors)}`).join(',')}}`
      } finally {
        ancestors.delete(value)
      }
    }
    default:
      throw new TypeError('Canonical JSON received an unsupported value.')
  }
}

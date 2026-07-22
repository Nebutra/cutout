import {
  defaultProviderWireProtocol,
  type ProviderKind,
  type ProviderWireProtocol,
} from './provider-types'

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '')
}

/**
 * SDKs expect `baseURL` to be the protocol API prefix. Many gateway consoles
 * share the API host, so pathless custom URLs get the protocol's standard path.
 * Explicit non-root paths are preserved for relays mounted below a prefix.
 */
export function apiBaseUrl(
  kind: ProviderKind,
  baseUrl: string | undefined,
  wireProtocol?: ProviderWireProtocol,
): string | undefined {
  if (!baseUrl) return undefined
  const trimmed = trimTrailingSlashes(baseUrl.trim())
  const protocol = wireProtocol ?? defaultProviderWireProtocol(kind)
  const defaultPath = protocol === 'google-generate-content'
    ? '/v1beta'
    : protocol === 'responses' ||
        protocol === 'chat-completions' ||
        protocol === 'anthropic-messages'
      ? '/v1'
      : undefined
  if (!defaultPath) return trimmed

  try {
    const parsed = new URL(trimmed)
    const path = trimTrailingSlashes(parsed.pathname)
    if (path === '') {
      parsed.pathname = defaultPath
      parsed.search = ''
      parsed.hash = ''
      return trimTrailingSlashes(parsed.toString())
    }
  } catch {
    return trimmed
  }

  return trimmed
}

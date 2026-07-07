/**
 * Endpoint model discovery (design spec §5b).
 *
 * Lists an endpoint's models through the existing Rust proxy (`ai_proxy_request`)
 * so the key never enters the webview. Runs **only** for configs with an explicit
 * `baseUrl` (openai-compatible / relays, or a baseUrl override); vendor endpoints
 * with no base URL return `[]` and the caller falls back to `SUGGESTED_MODELS`.
 * Tolerant: any non-2xx / non-JSON / unexpected shape degrades to `[]`.
 */
import { invoke } from '@tauri-apps/api/core'
import type { ProviderConfig } from './provider-types'
import { apiBaseUrl } from './base-url'

/** Buffered proxy response, mirroring the Rust `ProxyResponse` (camelCase). */
interface ProxyResponse {
  readonly status: number
  readonly headers: Record<string, string>
  readonly body: string
}

/** Pull the `id` strings out of an OpenAI-compatible `{ data: [{ id }] }` body. */
function extractModelIds(parsed: unknown): string[] {
  if (!parsed || typeof parsed !== 'object') return []
  const data = (parsed as { data?: unknown }).data
  if (!Array.isArray(data)) return []
  const ids = data
    .map((m) =>
      m && typeof m === 'object' ? (m as { id?: unknown }).id : undefined,
    )
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
  return Array.from(new Set(ids))
}

/**
 * List the models an endpoint advertises via `GET {baseUrl}/models`
 * (`baseUrl` already ends in `/v1`). Returns `[]` when there is no base URL or
 * the endpoint doesn't answer with a usable list.
 */
export async function listEndpointModels(cfg: ProviderConfig): Promise<string[]> {
  const baseUrl = apiBaseUrl(cfg.kind, cfg.baseUrl)
  if (!baseUrl) return []
  const url = `${baseUrl}/models`
  try {
    const res = await invoke<ProxyResponse>('ai_proxy_request', {
      providerId: cfg.id,
      kind: cfg.kind,
      url,
      method: 'GET',
      headers: {},
      body: null,
    })
    if (res.status < 200 || res.status >= 300) return []
    return extractModelIds(JSON.parse(res.body))
  } catch {
    return []
  }
}

/**
 * Endpoint model discovery (design spec §5b).
 *
 * Lists an endpoint's models through the Rust proxy (`ai_proxy_request`)
 * so the key never enters the webview. Runs **only** for configs with an explicit
 * `baseUrl` (openai-compatible / relays, or a baseUrl override); vendor endpoints
 * with no base URL return `[]` and the caller falls back to `SUGGESTED_MODELS`.
 * Both OpenAI/Anthropic `data[].id` and Google `models[].name` catalogs are
 * accepted. This is a credential/catalog check, not a generation-capability
 * claim. Any non-2xx / non-JSON / unexpected shape degrades to `[]`.
 */
import { invoke } from '@tauri-apps/api/core'
import { effectiveProviderWireProtocol, type ProviderConfig } from './provider-types'
import { apiBaseUrl } from './base-url'
import { parseProviderModelIds } from './provider-model-catalog'

/** Buffered proxy response, mirroring the Rust `ProxyResponse` (camelCase). */
interface ProxyResponse {
  readonly status: number
  readonly headers: Record<string, string>
  readonly body: string
}

/**
 * List the models an endpoint advertises via `GET {baseUrl}/models`
 * (`baseUrl` is the normalized protocol prefix). Returns `[]` when there is no base URL or
 * the endpoint doesn't answer with a usable list.
 */
export async function listEndpointModels(cfg: ProviderConfig): Promise<string[]> {
  const wireProtocol = effectiveProviderWireProtocol(cfg)
  const baseUrl = apiBaseUrl(cfg.kind, cfg.baseUrl, wireProtocol)
  if (!baseUrl) return []
  const url = `${baseUrl}/models`
  try {
    const res = await invoke<ProxyResponse>('ai_proxy_request', {
      providerId: cfg.id,
      kind: cfg.kind,
      wireProtocol,
      url,
      method: 'GET',
      headers: {},
      body: null,
    })
    if (res.status < 200 || res.status >= 300) return []
    return parseProviderModelIds(JSON.parse(res.body)) ?? []
  } catch {
    return []
  }
}

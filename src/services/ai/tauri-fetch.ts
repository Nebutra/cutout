/**
 * The custom-fetch auth proxy (spec §1/§3) — the only key-adjacent JS.
 *
 * `tauriFetch(providerId, kind)` returns a `fetch`-compatible function that the
 * AI SDK provider factories are given. It receives the SDK-built `Request`,
 * extracts url/method/headers/body (stripping any auth header — the SDK sends a
 * dummy key), and forwards to a Rust command. **Rust reads the real key from the
 * keychain and injects the auth header**; the key never enters JS.
 *
 * Two Rust paths, chosen by whether the caller wants a live stream:
 *  - streaming → `ai_proxy_stream` + a `Channel`; frames are bridged into a
 *    `ReadableStream` so `streamText` can parse the SSE incrementally.
 *  - buffered  → `ai_proxy_request`; a plain `Response` is built from the result.
 *
 * Detection is best-effort but non-fatal: if we pick buffered for a stream the
 * SDK still gets correct text (delivered at once); if we pick streaming for a
 * buffered call `response.json()` drains the stream and parses normally.
 */
import { Channel, invoke } from '@tauri-apps/api/core'
import type { ProviderKind } from './provider-types'

/** Buffered proxy result — mirrors the Rust `ProxyResponse` (camelCase). */
interface ProxyResponse {
  readonly status: number
  readonly headers: Record<string, string>
  readonly body: string
}

/** Non-body frames on the stream channel (Rust sends these as JSON objects). */
type StreamFrame =
  | { readonly type: 'head'; readonly status: number; readonly headers: Record<string, string> }
  | { readonly type: 'end' }
  | { readonly type: 'error'; readonly message: string }

/**
 * A channel message is EITHER a raw body chunk (`InvokeResponseBody::Raw` →
 * `ArrayBuffer` in JS) OR a control frame (`InvokeResponseBody::Json` → parsed
 * object). We tolerate a stringified frame defensively.
 */
type ChannelMessage = ArrayBuffer | StreamFrame | string

/** Header names we must never forward: the SDK's dummy auth + hop-by-hop. */
const STRIP_REQUEST_HEADERS = new Set([
  'authorization',
  'x-api-key',
  'x-goog-api-key',
  'host',
  'content-length',
  'connection',
])

/**
 * Response headers that would corrupt a manually-built `Response`: the body is
 * already decoded/re-framed here, so length/encoding/framing must be dropped.
 */
const STRIP_RESPONSE_HEADERS = new Set([
  'content-length',
  'content-encoding',
  'transfer-encoding',
  'connection',
])

/** Copy request headers into a plain record, dropping auth + hop-by-hop. */
function toHeaderRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  headers.forEach((value, key) => {
    if (!STRIP_REQUEST_HEADERS.has(key.toLowerCase())) out[key] = value
  })
  return out
}

/** Build a `Headers` for the returned `Response`, dropping framing headers. */
function toResponseHeaders(headers: Record<string, string>): Headers {
  const out = new Headers()
  for (const [key, value] of Object.entries(headers)) {
    if (!STRIP_RESPONSE_HEADERS.has(key.toLowerCase())) out.append(key, value)
  }
  return out
}

/** Heuristic: does this request expect an incrementally-read (SSE) response? */
function wantsStream(url: string, accept: string, body: string): boolean {
  return (
    accept.includes('text/event-stream') ||
    /"stream"\s*:\s*true/.test(body) ||
    url.includes('alt=sse') ||
    url.includes('streamGenerateContent')
  )
}

/** Buffered path: one `invoke`, one `Response`. */
async function bufferedResponse(
  providerId: string,
  kind: ProviderKind,
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
): Promise<Response> {
  const res = await invoke<ProxyResponse>('ai_proxy_request', {
    providerId,
    kind,
    url,
    method,
    headers,
    body,
  })
  return new Response(res.body, {
    status: res.status,
    headers: toResponseHeaders(res.headers),
  })
}

/**
 * Streaming path: bridge the Rust `Channel` into a `ReadableStream`.
 *
 * The `invoke` promise resolves only after Rust finishes streaming, so we do
 * NOT await it before returning — we await the `head` frame (or a pre-head
 * rejection) and return the `Response` immediately, letting bytes flow after.
 */
async function streamingResponse(
  providerId: string,
  kind: ProviderKind,
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
  signal: AbortSignal | null,
): Promise<Response> {
  let controller: ReadableStreamDefaultController<Uint8Array>
  const stream = new ReadableStream<Uint8Array>({
    start: (c) => {
      controller = c
    },
  })

  let headSeen = false
  let onHead: (frame: Extract<StreamFrame, { type: 'head' }>) => void
  let onHeadError: (error: Error) => void
  const headReady = new Promise<Extract<StreamFrame, { type: 'head' }>>(
    (resolve, reject) => {
      onHead = resolve
      onHeadError = reject
    },
  )

  const channel = new Channel<ChannelMessage>()
  channel.onmessage = (message) => {
    if (message instanceof ArrayBuffer) {
      if (message.byteLength > 0) controller.enqueue(new Uint8Array(message))
      return
    }
    const frame: StreamFrame =
      typeof message === 'string' ? (JSON.parse(message) as StreamFrame) : message
    switch (frame.type) {
      case 'head':
        headSeen = true
        onHead(frame)
        break
      case 'end':
        controller.close()
        break
      case 'error': {
        const error = new Error(frame.message)
        if (headSeen) controller.error(error)
        else onHeadError(error)
        break
      }
    }
  }

  if (signal) {
    const abort = () => {
      const error = new DOMException('The operation was aborted.', 'AbortError')
      if (headSeen) controller.error(error)
      else onHeadError(error)
    }
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
  }

  // Kick off the Rust command. Do not await — resolves after streaming ends.
  // A pre-head failure rejects here with a ProxyError string (no frames sent).
  void invoke<void>('ai_proxy_stream', {
    providerId,
    kind,
    url,
    method,
    headers,
    body,
    onChunk: channel,
  }).catch((error: unknown) => {
    const wrapped =
      error instanceof Error ? error : new Error(String(error))
    if (headSeen) controller.error(wrapped)
    else onHeadError(wrapped)
  })

  const head = await headReady
  return new Response(stream, {
    status: head.status,
    headers: toResponseHeaders(head.headers),
  })
}

/**
 * Build the custom fetch bound to one provider. The returned function is
 * `typeof globalThis.fetch` (the AI SDK's `FetchFunction`), so it drops straight
 * into `createAnthropic({ fetch })` and friends.
 */
export function tauriFetch(
  providerId: string,
  kind: ProviderKind,
): typeof globalThis.fetch {
  return async (input, init) => {
    // Normalize both call forms — fetch(url, init) and fetch(Request) — via a
    // Request, then read a stable url/method/headers/body from it.
    const request = new Request(input as RequestInfo, init)
    const url = request.url
    const method = request.method || 'POST'
    const headers = toHeaderRecord(request.headers)
    const bodyText = await request.text()
    const body = bodyText.length > 0 ? bodyText : undefined
    const accept = request.headers.get('accept') ?? ''

    if (wantsStream(url, accept, bodyText)) {
      return streamingResponse(
        providerId,
        kind,
        url,
        method,
        headers,
        body,
        request.signal ?? init?.signal ?? null,
      )
    }
    return bufferedResponse(providerId, kind, url, method, headers, body)
  }
}

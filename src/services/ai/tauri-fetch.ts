/**
 * The custom-fetch auth proxy (spec §1/§3) — the only key-adjacent JS.
 *
 * `tauriFetch(providerId, kind, wireProtocol)` returns a `fetch`-compatible function that the
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
import type { ProviderKind, ProviderWireProtocol } from './provider-types'

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

type CancellableProxyCommand =
  | 'ai_proxy_request'
  | 'ai_proxy_stream'
  | 'ai_image_edit'

/**
 * Tauri's invoke promise has no AbortSignal channel. Bind every cancellable AI
 * command to an opaque native request id, return promptly on owner abort, and
 * tell Rust to drop the underlying reqwest future so a timed-out paid request
 * does not continue in the background.
 */
export async function invokeCancellableProxy<T>(
  command: CancellableProxyCommand,
  args: Record<string, unknown>,
  signal?: AbortSignal | null,
): Promise<T> {
  if (!signal) return invoke<T>(command, args)
  signal.throwIfAborted()
  const requestId = crypto.randomUUID()
  const nativeRequest = invoke<T>(command, { ...args, requestId })
  let abort: (() => void) | undefined
  const aborted = new Promise<never>((_, reject) => {
    abort = () => {
      void invoke<boolean>('ai_proxy_cancel', { requestId }).catch(() => undefined)
      reject(new DOMException('The operation was aborted.', 'AbortError'))
    }
    signal.addEventListener('abort', abort, { once: true })
  })
  if (signal.aborted) abort?.()
  try {
    return await Promise.race([nativeRequest, aborted])
  } finally {
    if (abort) signal.removeEventListener('abort', abort)
    // The race may resolve from cancellation before Tauri reports the native
    // command rejection. Always observe that promise to avoid an unhandled
    // rejection while Rust closes the request.
    void nativeRequest.catch(() => undefined)
  }
}

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

const API_RESPONSE_HINT =
  'Check that the provider base URL points to the API endpoint, not the web console.'

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

function responseHeader(
  headers: Record<string, string>,
  name: string,
): string {
  const target = name.toLowerCase()
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) return value
  }
  return ''
}

function isJsonContentType(contentType: string): boolean {
  const lower = contentType.toLowerCase()
  return (
    lower.includes('application/json') ||
    lower.includes('+json') ||
    lower.includes('application/x-ndjson')
  )
}

function isEventStreamContentType(contentType: string): boolean {
  return contentType.toLowerCase().includes('text/event-stream')
}

function isJsonLikeBody(body: string): boolean {
  const trimmed = body.trimStart()
  return trimmed.startsWith('{') || trimmed.startsWith('[')
}

function isHtmlLikeResponse(
  headers: Record<string, string>,
  body?: string,
): boolean {
  const contentType = responseHeader(headers, 'content-type').toLowerCase()
  if (contentType.includes('text/html')) return true
  if (body === undefined) return false
  const trimmed = body.trimStart().slice(0, 128).toLowerCase()
  return trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html')
}

function bodySnippet(body: string): string {
  return body.replace(/\s+/g, ' ').trim().slice(0, 160)
}

function providerErrorResponse(status: number, message: string): Response {
  const safeStatus = status >= 400 && status <= 599 ? status : 502
  return new Response(
    JSON.stringify({
      error: {
        message,
        type: 'provider_endpoint_misconfigured',
        code: 'non_api_response',
      },
    }),
    {
      status: safeStatus,
      headers: new Headers({ 'content-type': 'application/json' }),
    },
  )
}

function bufferedProxyGuard(
  res: ProxyResponse,
  url: string,
): Response | null {
  const contentType = responseHeader(res.headers, 'content-type')
  const html = isHtmlLikeResponse(res.headers, res.body)
  const apiContent =
    !html &&
    (isJsonContentType(contentType) ||
      isEventStreamContentType(contentType) ||
      isJsonLikeBody(res.body))
  if (apiContent) return null

  const bodyKind = html
    ? 'an HTML page'
    : contentType
      ? `a ${contentType} response`
      : 'a non-API response'
  const snippet = bodySnippet(res.body)

  if (res.status >= 200 && res.status < 300) {
    return providerErrorResponse(
      502,
      `Provider returned ${bodyKind} instead of an API response for ${url}. ${API_RESPONSE_HINT}`,
    )
  }

  return providerErrorResponse(
    res.status,
    `Provider returned HTTP ${res.status} with ${bodyKind} for ${url}. ${API_RESPONSE_HINT}${snippet ? ` Body: ${snippet}` : ''}`,
  )
}

function streamingProxyGuard(
  status: number,
  headers: Record<string, string>,
  url: string,
): Response | null {
  const contentType = responseHeader(headers, 'content-type')
  if (isJsonContentType(contentType) || isEventStreamContentType(contentType)) {
    return null
  }

  if (status >= 200 && status < 300) {
    const bodyKind = isHtmlLikeResponse(headers)
      ? 'an HTML page'
      : contentType
        ? `a ${contentType} response`
        : 'a non-API response'
    return providerErrorResponse(
      502,
      `Provider returned ${bodyKind} instead of a streaming API response for ${url}. ${API_RESPONSE_HINT}`,
    )
  }
  return null
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
  wireProtocol: ProviderWireProtocol | undefined,
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
  signal: AbortSignal | null,
): Promise<Response> {
  const res = await invokeCancellableProxy<ProxyResponse>('ai_proxy_request', {
    providerId,
    kind,
    wireProtocol,
    url,
    method,
    headers,
    body,
  }, signal)
  const guarded = bufferedProxyGuard(res, url)
  if (guarded) return guarded
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
  wireProtocol: ProviderWireProtocol | undefined,
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

  let streamSettled = false
  let removeAbortListener = () => {}
  const finishStream = () => {
    if (streamSettled) return
    streamSettled = true
    removeAbortListener()
    if (headSeen) {
      controller.close()
      return
    }
    onHeadError(new Error('Provider stream ended before response headers.'))
  }
  const failStream = (error: Error) => {
    if (streamSettled) return
    streamSettled = true
    removeAbortListener()
    if (headSeen) controller.error(error)
    else onHeadError(error)
  }

  const channel = new Channel<ChannelMessage>()
  channel.onmessage = (message) => {
    if (streamSettled) return
    if (message instanceof ArrayBuffer) {
      if (message.byteLength > 0) controller.enqueue(new Uint8Array(message))
      return
    }
    const frame: StreamFrame =
      typeof message === 'string' ? (JSON.parse(message) as StreamFrame) : message
    switch (frame.type) {
      case 'head':
        if (headSeen) return
        headSeen = true
        onHead(frame)
        break
      case 'end':
        finishStream()
        break
      case 'error': {
        failStream(new Error(frame.message))
        break
      }
    }
  }

  if (signal) {
    const abort = () => {
      failStream(new DOMException('The operation was aborted.', 'AbortError'))
    }
    if (signal.aborted) abort()
    else {
      signal.addEventListener('abort', abort, { once: true })
      removeAbortListener = () => signal.removeEventListener('abort', abort)
    }
  }

  // Kick off the Rust command. Do not await — resolves after streaming ends.
  // Native completion is also a terminal authority. This closes the JS stream
  // if a hidden WebView misses the final channel frame after Rust has already
  // released the response socket.
  const nativeRequest = invokeCancellableProxy<void>('ai_proxy_stream', {
    providerId,
    kind,
    wireProtocol,
    url,
    method,
    headers,
    body,
    onChunk: channel,
  }, signal)
  void nativeRequest.then(
    finishStream,
    (error: unknown) => failStream(
      error instanceof Error ? error : new Error(String(error)),
    ),
  )

  const head = await headReady
  const guarded = streamingProxyGuard(head.status, head.headers, url)
  if (guarded) return guarded
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
  wireProtocol?: ProviderWireProtocol,
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
        wireProtocol,
        url,
        method,
        headers,
        body,
        request.signal ?? init?.signal ?? null,
      )
    }
    return bufferedResponse(
      providerId,
      kind,
      wireProtocol,
      url,
      method,
      headers,
      body,
      request.signal ?? init?.signal ?? null,
    )
  }
}

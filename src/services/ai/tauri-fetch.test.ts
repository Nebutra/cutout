import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tauriFetch } from './tauri-fetch'

const { invokeMock, channels } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  channels: [] as Array<{ onmessage?: (message: unknown) => void }>,
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
  Channel: class {
    onmessage?: (message: unknown) => void
    constructor() {
      channels.push(this)
    }
  },
}))

beforeEach(() => {
  invokeMock.mockReset()
  channels.length = 0
})

describe('tauriFetch', () => {
  it('turns a successful HTML response into a provider endpoint error', async () => {
    invokeMock.mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: '<!doctype html><html><title>Mox Ai Gateway</title></html>',
    })

    const res = await tauriFetch('p1', 'openai-compatible')(
      'https://aigw.example.com/chat/completions',
      { method: 'POST', body: '{}' },
    )

    expect(res.status).toBe(502)
    expect(res.headers.get('content-type')).toContain('application/json')
    const body = (await res.json()) as { error: { message: string } }
    expect(body.error.message).toContain('Provider returned an HTML page')
    expect(body.error.message).toContain('provider base URL')
  })

  it('passes through API-shaped JSON responses', async () => {
    invokeMock.mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: '{"id":"chatcmpl_1"}',
    })

    const res = await tauriFetch('p1', 'openai-compatible', 'anthropic-messages')(
      'https://relay.example.com/chat/completions',
      { method: 'POST', body: '{}' },
    )

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('{"id":"chatcmpl_1"}')
    expect(invokeMock).toHaveBeenCalledWith(
      'ai_proxy_request',
      expect.objectContaining({ wireProtocol: 'anthropic-messages' }),
    )
  })

  it('passes the protocol through the streaming proxy path', async () => {
    invokeMock.mockImplementation((command: string, args: { onChunk?: { onmessage?: (message: unknown) => void } }) => {
      if (command === 'ai_proxy_stream') {
        queueMicrotask(() => {
          args.onChunk?.onmessage?.({
            type: 'head',
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          })
          args.onChunk?.onmessage?.({ type: 'end' })
        })
      }
      return Promise.resolve(undefined)
    })

    const response = await tauriFetch(
      'p1',
      'openai-compatible',
      'google-generate-content',
    )('https://relay.example/v1beta/models/gemini:streamGenerateContent?alt=sse', {
      method: 'POST',
      body: JSON.stringify({ stream: true }),
    })

    expect(response.status).toBe(200)
    expect(invokeMock).toHaveBeenCalledWith(
      'ai_proxy_stream',
      expect.objectContaining({ wireProtocol: 'google-generate-content' }),
    )
  })

  it('closes the response body when native streaming settles without an end frame', async () => {
    let finishNative!: () => void
    invokeMock.mockImplementation((command: string, args: { onChunk?: { onmessage?: (message: unknown) => void } }) => {
      if (command !== 'ai_proxy_stream') return Promise.resolve(undefined)
      queueMicrotask(() => {
        args.onChunk?.onmessage?.({
          type: 'head',
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        })
      })
      return new Promise<void>((resolve) => { finishNative = resolve })
    })

    const response = await tauriFetch('p1', 'openai-compatible', 'responses')(
      'https://relay.example/v1/responses',
      { method: 'POST', body: JSON.stringify({ stream: true }) },
    )
    const body = response.text()
    finishNative()

    await expect(body).resolves.toBe('')
  })

  it('rejects when native streaming settles before response headers', async () => {
    invokeMock.mockResolvedValue(undefined)

    await expect(tauriFetch('p1', 'openai-compatible', 'responses')(
      'https://relay.example/v1/responses',
      { method: 'POST', body: JSON.stringify({ stream: true }) },
    )).rejects.toThrow('Provider stream ended before response headers')
  })

  it('cancels the native buffered request when the owning signal aborts', async () => {
    let resolveRequest!: (value: unknown) => void
    invokeMock.mockImplementation((command: string) => {
      if (command === 'ai_proxy_cancel') return Promise.resolve(true)
      return new Promise((resolve) => { resolveRequest = resolve })
    })
    const controller = new AbortController()
    const pending = tauriFetch('p1', 'openai-compatible')(
      'https://relay.example/v1/images/generations',
      { method: 'POST', body: '{}', signal: controller.signal },
    )
    await vi.waitFor(() => expect(invokeMock).toHaveBeenCalledOnce())
    const requestId = invokeMock.mock.calls[0]?.[1]?.requestId
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/)

    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(invokeMock).toHaveBeenCalledWith('ai_proxy_cancel', { requestId })
    resolveRequest({ status: 200, headers: {}, body: '{}' })
  })
})

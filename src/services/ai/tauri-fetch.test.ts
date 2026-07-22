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
})

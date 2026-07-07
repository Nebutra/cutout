import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tauriFetch } from './tauri-fetch'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
  Channel: class {
    onmessage?: (message: unknown) => void
  },
}))

beforeEach(() => invokeMock.mockReset())

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

    const res = await tauriFetch('p1', 'openai-compatible')(
      'https://relay.example.com/chat/completions',
      { method: 'POST', body: '{}' },
    )

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('{"id":"chatcmpl_1"}')
  })
})

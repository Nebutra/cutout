import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalProviderService } from './provider-service.local'
import type { ProviderConfig } from './provider-types'
import { ok } from '@/services/types'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
  Channel: class {
    onmessage?: (message: unknown) => void
  },
}))

const cfg = (over: Partial<ProviderConfig> = {}): ProviderConfig => ({
  id: 'p1',
  kind: 'openai-compatible',
  label: 'Relay',
  defaultModel: 'chat-model',
  enabled: true,
  baseUrl: 'https://relay.example.com',
  ...over,
})

function mockProviderTest(response: { status: number; body: string }) {
  invokeMock.mockImplementation((command: string) => {
    if (command === 'load_providers') return Promise.resolve([cfg()])
    if (command === 'ai_proxy_request') return Promise.resolve(response)
    return Promise.resolve(undefined)
  })
}

beforeEach(() => {
  invokeMock.mockReset()
  Object.defineProperty(window, '__TAURI_INTERNALS__', { value: { invoke: vi.fn() }, configurable: true })
})

describe('LocalProviderService host boundary', () => {
  it('returns an empty catalog in a browser host without invoking Tauri', async () => {
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__')

    await expect(createLocalProviderService().list()).resolves.toEqual([])
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('rejects browser writes with a controlled host error', async () => {
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__')

    await expect(createLocalProviderService().upsert(cfg())).rejects.toThrow('requires the desktop host')
    expect(invokeMock).not.toHaveBeenCalled()
  })
})

describe('LocalProviderService.test', () => {
  it('accepts an OpenAI-compatible /models response', async () => {
    mockProviderTest({
      status: 200,
      body: JSON.stringify({ data: [{ id: 'chat-model' }] }),
    })

    const result = await createLocalProviderService().test('p1')

    expect(result).toEqual(ok({ model: 'chat-model' }))
  })

  it('rejects a 200 HTML web console response', async () => {
    mockProviderTest({
      status: 200,
      body: '<!doctype html><html><title>Mox Ai Gateway</title></html>',
    })

    const result = await createLocalProviderService().test('p1')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('/models returned a web page')
      expect(result.error).toContain('web console')
    }
  })

  it('rejects JSON that is not an OpenAI-compatible models list', async () => {
    mockProviderTest({ status: 200, body: JSON.stringify({ ok: true }) })

    const result = await createLocalProviderService().test('p1')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('{ data: [...] }')
  })

  it('normalizes a pathless OpenAI-compatible base URL before probing /models', async () => {
    mockProviderTest({
      status: 200,
      body: JSON.stringify({ data: [{ id: 'chat-model' }] }),
    })

    await createLocalProviderService().test('p1')

    expect(invokeMock).toHaveBeenCalledWith(
      'ai_proxy_request',
      expect.objectContaining({ url: 'https://relay.example.com/v1/models' }),
    )
  })
})

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

function mockProviderTest(response: { status: number; body: string }, provider = cfg()) {
  invokeMock.mockImplementation((command: string) => {
    if (command === 'load_providers') return Promise.resolve([provider])
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
    expect(invokeMock).toHaveBeenCalledWith(
      'ai_proxy_request',
      expect.objectContaining({ wireProtocol: 'chat-completions' }),
    )
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

  it('rejects JSON that is not a supported models list', async () => {
    mockProviderTest({ status: 200, body: JSON.stringify({ ok: true }) })

    const result = await createLocalProviderService().test('p1')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('data/models catalog')
  })

  it('accepts a Google models catalog and forwards the selected protocol', async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === 'load_providers') {
        return Promise.resolve([cfg({ wireProtocol: 'google-generate-content' })])
      }
      if (command === 'ai_proxy_request') {
        return Promise.resolve({
          status: 200,
          body: JSON.stringify({ models: [{ name: 'models/gemini-2.5-pro' }] }),
        })
      }
      return Promise.resolve(undefined)
    })

    await expect(createLocalProviderService().test('p1')).resolves.toEqual(ok({ model: 'chat-model' }))
    expect(invokeMock).toHaveBeenCalledWith(
      'ai_proxy_request',
      expect.objectContaining({ wireProtocol: 'google-generate-content' }),
    )
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

  it('uses the first-party catalog URL without issuing a generation request', async () => {
    mockProviderTest(
      { status: 200, body: JSON.stringify({ data: [{ id: 'gpt-5.4' }] }) },
      cfg({ kind: 'openai', baseUrl: undefined, wireProtocol: undefined, defaultModel: 'gpt-5.4' }),
    )

    await expect(createLocalProviderService().test('p1')).resolves.toEqual(ok({ model: 'gpt-5.4' }))
    expect(invokeMock).toHaveBeenCalledWith(
      'ai_proxy_request',
      expect.objectContaining({
        method: 'GET',
        url: 'https://api.openai.com/v1/models',
        wireProtocol: 'responses',
      }),
    )
  })
})

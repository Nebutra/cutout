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
  catalog: { models: ['chat-model'], fetchedAt: '2026-08-20T00:00:00.000Z' },
  enabled: true,
  baseUrl: 'https://relay.example.com',
  wireProtocol: 'chat-completions',
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

  it('rejects persisted non-Gateway records without an explicit protocol', async () => {
    invokeMock.mockResolvedValueOnce([{
      id: 'old', kind: 'openai', label: 'Incomplete', catalog: { models: ['gpt-5'], fetchedAt: '2026-08-20T00:00:00.000Z' }, enabled: true,
    }])

    await expect(createLocalProviderService().list()).rejects.toThrow('wire protocol is required')
  })

  it('materializes the current draft default before persistence', async () => {
    invokeMock.mockResolvedValueOnce([]).mockResolvedValueOnce(undefined)

    const provider = await createLocalProviderService().upsert({
      kind: 'openai', label: 'OpenAI', catalog: { models: ['gpt-5'], fetchedAt: '2026-08-20T00:00:00.000Z' }, enabled: true,
    })

    expect(provider).toMatchObject({ kind: 'openai', wireProtocol: 'responses' })
    expect(invokeMock).toHaveBeenLastCalledWith('save_providers', {
      providers: [expect.objectContaining({ kind: 'openai', wireProtocol: 'responses' })],
    })
  })

  it('carries the probed catalog through an unrelated edit', async () => {
    // Renaming a connection must not erase its model list: the catalog is the
    // only evidence the task pickers have, and losing it silently un-routes
    // every binding that points at this provider.
    const catalog = { models: ['gpt-5', 'gpt-image-2'], fetchedAt: '2026-08-20T00:00:00.000Z' }
    invokeMock.mockResolvedValueOnce([
      { id: 'p1', kind: 'openai', label: 'Old name', wireProtocol: 'responses', catalog, enabled: true },
    ]).mockResolvedValueOnce(undefined)

    const provider = await createLocalProviderService().upsert({
      id: 'p1', kind: 'openai', label: 'New name', wireProtocol: 'responses', catalog, enabled: true,
    })

    expect(provider.catalog).toEqual(catalog)
    expect(invokeMock).toHaveBeenLastCalledWith('save_providers', {
      providers: [expect.objectContaining({ label: 'New name', catalog })],
    })
  })

  it('does not persist a model choice onto a connection', async () => {
    invokeMock.mockResolvedValueOnce([]).mockResolvedValueOnce(undefined)

    await createLocalProviderService().upsert({
      kind: 'openai', label: 'OpenAI', wireProtocol: 'responses', enabled: true,
    })

    const [, payload] = invokeMock.mock.lastCall as [string, { providers: unknown[] }]
    expect(payload.providers[0]).not.toHaveProperty('defaultModel')
  })
})

describe('LocalProviderService.test', () => {
  it('accepts an OpenAI-compatible /models response', async () => {
    mockProviderTest({
      status: 200,
      body: JSON.stringify({ data: [{ id: 'chat-model' }] }),
    })

    const result = await createLocalProviderService().test('p1')

    expect(result).toEqual(ok({ models: ['chat-model'] }))
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

    await expect(createLocalProviderService().test('p1')).resolves.toEqual(ok({
      models: ['gemini-2.5-pro'],
    }))
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
      cfg({ kind: 'openai', baseUrl: undefined, wireProtocol: 'responses', catalog: { models: ['gpt-5.4'], fetchedAt: '2026-08-20T00:00:00.000Z' } }),
    )

    await expect(createLocalProviderService().test('p1')).resolves.toEqual(ok({
      models: ['gpt-5.4'],
    }))
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

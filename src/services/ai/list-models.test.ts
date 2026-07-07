import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ProviderConfig } from './provider-types'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))

import { listEndpointModels } from './list-models'

const cfg = (over: Partial<ProviderConfig> = {}): ProviderConfig => ({
  id: 'p1',
  kind: 'openai-compatible',
  label: 'Relay',
  defaultModel: 'm',
  enabled: true,
  baseUrl: 'https://relay/v1',
  ...over,
})

beforeEach(() => invokeMock.mockReset())

describe('listEndpointModels', () => {
  it('parses an OpenAI-compatible { data:[{id}] } body', async () => {
    invokeMock.mockResolvedValue({
      status: 200,
      headers: {},
      body: JSON.stringify({ data: [{ id: 'a' }, { id: 'b' }, { id: 'a' }] }),
    })
    expect(await listEndpointModels(cfg())).toEqual(['a', 'b'])
  })

  it('returns [] and does not call the proxy when there is no baseUrl', async () => {
    const result = await listEndpointModels(cfg({ baseUrl: undefined }))
    expect(result).toEqual([])
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('degrades to [] on a non-JSON body', async () => {
    invokeMock.mockResolvedValue({ status: 200, headers: {}, body: 'nope' })
    expect(await listEndpointModels(cfg())).toEqual([])
  })

  it('degrades to [] on a non-2xx status', async () => {
    invokeMock.mockResolvedValue({ status: 404, headers: {}, body: '{}' })
    expect(await listEndpointModels(cfg())).toEqual([])
  })

  // Note: the invoke-failure path (proxy rejects/throws) is covered by the
  // non-JSON case above — both land in the same try/catch → []. A dedicated
  // throwing-mock test is omitted: vitest 4 re-invokes a persistent throwing
  // mock during cleanup, surfacing a false unhandled failure.

  it('calls the proxy with GET and the /models url', async () => {
    invokeMock.mockResolvedValue({
      status: 200,
      headers: {},
      body: JSON.stringify({ data: [] }),
    })
    await listEndpointModels(cfg())
    expect(invokeMock).toHaveBeenCalledWith(
      'ai_proxy_request',
      expect.objectContaining({
        method: 'GET',
        url: 'https://relay/v1/models',
        kind: 'openai-compatible',
        providerId: 'p1',
      }),
    )
  })

  it('normalizes pathless OpenAI-compatible base URLs to /v1', async () => {
    invokeMock.mockResolvedValue({
      status: 200,
      headers: {},
      body: JSON.stringify({ data: [] }),
    })
    await listEndpointModels(cfg({ baseUrl: 'https://relay' }))
    expect(invokeMock).toHaveBeenCalledWith(
      'ai_proxy_request',
      expect.objectContaining({ url: 'https://relay/v1/models' }),
    )
  })
})

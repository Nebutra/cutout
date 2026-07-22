import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { ProviderConfig } from './provider-types'
import { createLocalGenerationService } from './generation-service.local'
import { ok } from '@/services/types'
import { GenerationAdapterRegistry } from './provider-adapter-registry'

const { generateTextMock, generateImageMock, streamTextMock, invokeMock } =
  vi.hoisted(() => ({
    generateTextMock: vi.fn(),
    generateImageMock: vi.fn(),
    streamTextMock: vi.fn(),
    invokeMock: vi.fn(),
  }))

vi.mock('ai', () => ({
  generateText: generateTextMock,
  generateImage: generateImageMock,
  streamText: streamTextMock,
  Output: {
    object: vi.fn((config: unknown) => ({ kind: 'object-output', config })),
  },
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))

const cfg = (over: Partial<ProviderConfig> = {}): ProviderConfig => ({
  id: 'p1',
  kind: 'openai-compatible',
  label: 'Relay',
  defaultModel: 'chat-model',
  enabled: true,
  baseUrl: 'https://relay.example/v1',
  ...over,
})

function providersWith(list: ProviderConfig[]) {
  return { list: () => Promise.resolve(list) }
}

const prompts = {
  render: vi.fn(async () => ({ system: 'Return the requested object.' })),
}

beforeEach(() => {
  generateTextMock.mockReset()
  generateImageMock.mockReset()
  streamTextMock.mockReset()
  invokeMock.mockReset()
  prompts.render.mockClear()
})

describe('GenerationService adapter injection',()=>{it('uses the injected registry instead of a provider-kind switch',async()=>{const model={id:'injected'},createModel=vi.fn(async()=>model),registry=new GenerationAdapterRegistry([{kind:'openai-compatible',policy:()=>({auth:'rust-keychain-proxy',headerStrategy:'openai-compatible',baseURL:'https://relay.example/v1'}),createModel}]);generateTextMock.mockResolvedValueOnce({text:'ok'});const generation=createLocalGenerationService(providersWith([cfg()]),prompts,registry);await expect(generation.generateText({providerId:'p1',prompt:'hello'})).resolves.toEqual(ok('ok'));expect(createModel).toHaveBeenCalledWith(expect.objectContaining({id:'p1'}),'chat-model');expect(generateTextMock).toHaveBeenCalledWith(expect.objectContaining({model}))})})

describe('GenerationService.generateObject', () => {
  it('falls back to plain text JSON when structured output is not supported', async () => {
    generateTextMock
      .mockRejectedValueOnce(new Error('Invalid JSON response'))
      .mockResolvedValueOnce({ text: '```json\n{"name":"dashboard"}\n```' })

    const generation = createLocalGenerationService(
      providersWith([cfg()]),
      prompts,
    )
    const schema = z.object({ name: z.string() })

    const result = await generation.generateObject(
      {
        providerId: 'p1',
        model: 'chat-model',
        promptRef: { id: 'test-json' },
        input: [{ type: 'text', text: 'brief' }],
      },
      schema,
    )

    expect(result).toEqual(ok({ name: 'dashboard' }))
    expect(generateTextMock).toHaveBeenCalledTimes(2)
    expect(generateTextMock.mock.calls[0][0].experimental_output).toBeDefined()
    expect(generateTextMock.mock.calls[1][0].experimental_output).toBeUndefined()
    expect(generateTextMock.mock.calls[1][0].system).toContain(
      'Return only one valid JSON value',
    )
  })

  it('repairs fallback JSON when it parses but fails the schema', async () => {
    generateTextMock
      .mockRejectedValueOnce(new Error('Invalid JSON response'))
      .mockResolvedValueOnce({ text: '{"items":[]}' })
      .mockResolvedValueOnce({ text: '{"items":["hero"]}' })

    const generation = createLocalGenerationService(
      providersWith([cfg()]),
      prompts,
    )
    const schema = z.object({ items: z.array(z.string()).min(1) })

    const result = await generation.generateObject(
      {
        providerId: 'p1',
        model: 'chat-model',
        promptRef: { id: 'test-json' },
        input: [{ type: 'text', text: 'brief' }],
      },
      schema,
    )

    expect(result).toEqual(ok({ items: ['hero'] }))
    expect(generateTextMock).toHaveBeenCalledTimes(3)
    expect(generateTextMock.mock.calls[2][0].system).toContain(
      'Repair the previous JSON',
    )
    expect(generateTextMock.mock.calls[2][0].system).toContain('too_small')
    expect(generateTextMock.mock.calls[2][0].system).toContain('{"items":[]}')
  })

  it('does not retry non-structured API failures', async () => {
    generateTextMock.mockRejectedValueOnce(new Error('HTTP 401 unauthorized'))

    const generation = createLocalGenerationService(
      providersWith([cfg()]),
      prompts,
    )

    const result = await generation.generateObject(
      {
        providerId: 'p1',
        promptRef: { id: 'test-json' },
        input: [{ type: 'text', text: 'brief' }],
      },
      z.object({ name: z.string() }),
    )

    expect(result).toEqual({ ok: false, error: 'HTTP 401 unauthorized' })
    expect(generateTextMock).toHaveBeenCalledTimes(1)
  })

  it('reports provider HTML responses instead of retrying JSON fallback', async () => {
    generateTextMock.mockRejectedValueOnce(
      Object.assign(new Error('Invalid JSON response'), {
        statusCode: 200,
        url: 'https://aigw.example.com/chat/completions',
        responseHeaders: { 'content-type': 'text/html; charset=utf-8' },
        responseBody: '<!doctype html><html><title>Mox Ai Gateway</title></html>',
      }),
    )

    const generation = createLocalGenerationService(
      providersWith([cfg()]),
      prompts,
    )

    const result = await generation.generateObject(
      {
        providerId: 'p1',
        promptRef: { id: 'test-json' },
        input: [{ type: 'text', text: 'brief' }],
      },
      z.object({ name: z.string() }),
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Provider returned an HTML page')
      expect(result.error).toContain('provider base URL')
    }
    expect(generateTextMock).toHaveBeenCalledTimes(1)
  })

  it('rewrites transport-level failures with the gateway host and a BYOK hint', async () => {
    generateTextMock.mockRejectedValueOnce(
      new Error(
        'request failed: error sending request for url (https://aigw.mox.ktvsky.com/v1/images/generations)',
      ),
    )

    const generation = createLocalGenerationService(
      providersWith([cfg()]),
      prompts,
    )

    const result = await generation.generateObject(
      {
        providerId: 'p1',
        promptRef: { id: 'test-json' },
        input: [{ type: 'text', text: 'brief' }],
      },
      z.object({ name: z.string() }),
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Could not reach https://aigw.mox.ktvsky.com')
      expect(result.error).toContain('Check your BYOK provider base URL and network connectivity')
      expect(result.error.length).toBeLessThanOrEqual(500)
    }
    expect(generateTextMock).toHaveBeenCalledTimes(1)
  })
})

describe('GenerationService.generateImages', () => {
  it('does not invoke the paid image endpoint when already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const generation = createLocalGenerationService(providersWith([cfg()]), prompts)

    const result = await generation.generateImages({
      providerId: 'p1',
      model: 'gpt-image-1',
      prompt: 'make an icon',
      signal: controller.signal,
    })

    expect(result).toEqual({ ok: false, error: 'Operation aborted' })
    expect(invokeMock).not.toHaveBeenCalled()
  })
  it('uses the proxied OpenAI-compatible images endpoint and parses b64_json', async () => {
    invokeMock.mockResolvedValueOnce({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: [{ b64_json: 'QUJD' }] }),
    })

    const generation = createLocalGenerationService(
      providersWith([cfg({ baseUrl: 'https://relay.example' })]),
      prompts,
    )

    const result = await generation.generateImages({
      providerId: 'p1',
      model: 'gpt-image-2',
      promptRef: { id: 'ui-mockup-generation' },
      input: [{ type: 'text', text: '政府官网' }],
    })

    expect(result).toEqual({
      ok: true,
      data: [{ mediaType: 'image/png', bytes: new Uint8Array([65, 66, 67]) }],
    })
    expect(invokeMock).toHaveBeenCalledWith(
      'ai_proxy_request',
      expect.objectContaining({
        providerId: 'p1',
        kind: 'openai-compatible',
        wireProtocol: 'chat-completions',
        url: 'https://relay.example/v1/images/generations',
        method: 'POST',
      }),
    )
    const body = JSON.parse(invokeMock.mock.calls[0][1].body)
    expect(body.model).toBe('gpt-image-2')
    expect(body.prompt).toContain('Return the requested object.')
    expect(body.prompt).toContain('政府官网')
  })

  it('does not route a custom Google protocol through OpenAI image generation', async () => {
    const model = { id: 'google-model' }
    const createModel = vi.fn(async () => model)
    const registry = new GenerationAdapterRegistry([{
      kind: 'openai-compatible',
      policy: () => ({ auth: 'rust-keychain-proxy', headerStrategy: 'openai-compatible', baseURL: 'https://relay.example/v1beta' }),
      createModel,
    }])
    generateTextMock.mockResolvedValueOnce({
      files: [{ mediaType: 'image/png', uint8Array: new Uint8Array([1, 2, 3]) }],
    })
    const generation = createLocalGenerationService(
      providersWith([cfg({ wireProtocol: 'google-generate-content' })]),
      prompts,
      registry,
    )

    const result = await generation.generateImages({ providerId: 'p1', prompt: 'make an icon' })

    expect(result).toEqual(ok([{ mediaType: 'image/png', bytes: new Uint8Array([1, 2, 3]) }]))
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('surfaces image endpoint HTTP failures', async () => {
    invokeMock.mockResolvedValueOnce({
      status: 400,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: { message: 'model not supported' } }),
    })

    const generation = createLocalGenerationService(
      providersWith([cfg()]),
      prompts,
    )

    const result = await generation.generateImages({
      providerId: 'p1',
      model: 'gpt-image-2',
      promptRef: { id: 'ui-mockup-generation' },
      input: [{ type: 'text', text: 'brief' }],
    })

    expect(result).toEqual({
      ok: false,
      error: 'images/generations failed: HTTP 400 · model not supported',
    })
  })
})

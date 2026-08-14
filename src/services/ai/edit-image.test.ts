import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ProviderConfig } from './provider-types'
import { createLocalGenerationService } from './generation-service.local'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))

const cfg = (over: Partial<ProviderConfig> = {}): ProviderConfig => ({
  id: 'p1',
  kind: 'openai-compatible',
  label: 'Relay',
  defaultModel: 'gpt-image-1',
  enabled: true,
  baseUrl: 'https://relay.example/v1',
  wireProtocol: 'chat-completions',
  ...over,
})

/** A `ProviderService['list']` stub returning the given configs. */
function providersWith(list: ProviderConfig[]) {
  return { list: () => Promise.resolve(list) }
}

// "ABC" base64-encoded is "QUJD" — used to assert the b64→bytes decode.
const ABC_B64 = 'QUJD'
const ABC_BYTES = new Uint8Array([65, 66, 67])
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])

beforeEach(() => invokeMock.mockReset())

describe('GenerationService.editImage', () => {
  it('preserves every reference through the native DashScope edit command', async () => {
    invokeMock.mockResolvedValueOnce({
      images: [{ mediaType: 'image/png', data: ABC_B64 }],
    })
    const gen = createLocalGenerationService(providersWith([cfg({
      kind: 'dashscope',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      wireProtocol: 'chat-completions',
      defaultModel: 'qwen-image-edit-2511',
    })]))
    const result = await gen.editImage({
      providerId: 'p1',
      prompt: 'Keep both references.',
      images: [new Uint8Array([1, 2]), new Uint8Array([3, 4])],
    })

    expect(result).toEqual({ ok: true, data: [{ mediaType: 'image/png', bytes: ABC_BYTES }] })
    expect(invokeMock).toHaveBeenCalledWith('ai_dashscope_image', expect.objectContaining({
      operation: 'edit',
      model: 'qwen-image-edit-2511',
      images: [[1, 2], [3, 4]],
      prompt: 'Keep both references.',
    }))
  })

  it('uses xAI JSON multi-reference editing with inline data and output', async () => {
    invokeMock.mockResolvedValueOnce({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: [{ b64_json: ABC_B64, mime_type: 'image/webp' }] }),
    })
    const gen = createLocalGenerationService(providersWith([cfg({
      kind: 'xai',
      baseUrl: 'https://api.x.ai/v1',
      wireProtocol: 'chat-completions',
      defaultModel: 'grok-imagine-image-quality',
    })]))

    const result = await gen.editImage({
      providerId: 'p1',
      model: 'grok-imagine-image-quality',
      prompt: 'Keep both subjects and rebuild the layout.',
      images: [PNG_BYTES, JPEG_BYTES],
      size: '1536x1024',
    })

    expect(result).toEqual({
      ok: true,
      data: [{ mediaType: 'image/webp', bytes: ABC_BYTES }],
    })
    expect(invokeMock).toHaveBeenCalledWith('ai_proxy_request', expect.objectContaining({
      providerId: 'p1',
      kind: 'xai',
      wireProtocol: 'chat-completions',
      url: 'https://api.x.ai/v1/images/edits',
      method: 'POST',
    }))
    const body = JSON.parse(invokeMock.mock.calls[0][1].body)
    expect(body).toMatchObject({
      model: 'grok-imagine-image-quality',
      prompt: 'Keep both subjects and rebuild the layout.',
      n: 1,
      response_format: 'b64_json',
      resolution: '2k',
      aspect_ratio: '3:2',
    })
    expect(body).not.toHaveProperty('image')
    expect(body.images).toEqual([
      { type: 'image_url', url: expect.stringMatching(/^data:image\/png;base64,/) },
      { type: 'image_url', url: expect.stringMatching(/^data:image\/jpeg;base64,/) },
    ])
  })

  it('uses xAI single-image shape and rejects unsupported reference input before spend', async () => {
    invokeMock.mockResolvedValueOnce({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: [{ b64_json: ABC_B64 }] }),
    })
    const gen = createLocalGenerationService(providersWith([cfg({
      kind: 'xai',
      baseUrl: 'https://api.x.ai/v1',
      wireProtocol: 'chat-completions',
      defaultModel: 'grok-imagine-image',
    })]))

    await expect(gen.editImage({
      providerId: 'p1', prompt: 'Edit it.', images: [PNG_BYTES], size: '1024x1024',
    })).resolves.toMatchObject({ ok: true })
    const body = JSON.parse(invokeMock.mock.calls[0][1].body)
    expect(body.image).toEqual({
      type: 'image_url',
      url: expect.stringMatching(/^data:image\/png;base64,/),
    })
    expect(body).not.toHaveProperty('images')
    expect(body).not.toHaveProperty('aspect_ratio')

    invokeMock.mockClear()
    await expect(gen.editImage({
      providerId: 'p1',
      prompt: 'Too many.',
      images: [PNG_BYTES, PNG_BYTES, PNG_BYTES, PNG_BYTES],
    })).resolves.toEqual({
      ok: false,
      error: 'xAI image edit accepts up to three bounded reference images.',
    })
    await expect(gen.editImage({
      providerId: 'p1', prompt: 'Unknown.', images: [new Uint8Array([1, 2, 3])],
    })).resolves.toEqual({
      ok: false,
      error: 'xAI reference images must be PNG, JPEG, or WebP.',
    })
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('rejects non-API xAI edit labels before invoking the native proxy', async () => {
    const gen = createLocalGenerationService(providersWith([cfg({
      kind: 'xai',
      baseUrl: 'https://api.x.ai/v1',
      wireProtocol: 'chat-completions',
      defaultModel: 'grok-imagine-image-quality-20260519',
    })]))

    await expect(gen.editImage({
      providerId: 'p1',
      prompt: 'Edit it.',
      images: [PNG_BYTES],
    })).resolves.toEqual({
      ok: false,
      error: 'xAI image edit requires an exact documented Imagine API model id.',
    })
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('invokes ai_image_edit with the resolved config + high fidelity default', async () => {
    invokeMock.mockResolvedValue({ images: [ABC_B64] })
    const gen = createLocalGenerationService(providersWith([cfg()]))

    const result = await gen.editImage({
      providerId: 'p1',
      prompt: 'redraw as assets',
      images: [new Uint8Array([1, 2, 3])],
    })

    expect(result).toEqual({ ok: true, data: [{ mediaType: 'image/png', bytes: ABC_BYTES }] })
    expect(invokeMock).toHaveBeenCalledWith(
      'ai_image_edit',
      expect.objectContaining({
        providerId: 'p1',
        kind: 'openai-compatible',
        wireProtocol: 'chat-completions',
        baseUrl: 'https://relay.example/v1',
        model: 'gpt-image-1',
        prompt: 'redraw as assets',
        images: [[1, 2, 3]],
        size: null,
        inputFidelity: 'high',
      }),
    )
  })

  it('passes an explicit model, size and fidelity through', async () => {
    invokeMock.mockResolvedValue({ images: [ABC_B64] })
    const gen = createLocalGenerationService(providersWith([cfg()]))

    await gen.editImage({
      providerId: 'p1',
      model: 'gpt-image-2',
      prompt: 'p',
      images: [new Uint8Array([9])],
      size: '1024x1024',
      inputFidelity: 'low',
    })

    expect(invokeMock).toHaveBeenCalledWith(
      'ai_image_edit',
      expect.objectContaining({
        model: 'gpt-image-2',
        size: '1024x1024',
        inputFidelity: 'low',
      }),
    )
  })

  it('normalizes a pathless OpenAI-compatible base URL before invoking Rust', async () => {
    invokeMock.mockResolvedValue({ images: [ABC_B64] })
    const gen = createLocalGenerationService(
      providersWith([cfg({ baseUrl: 'https://relay.example' })]),
    )

    await gen.editImage({
      providerId: 'p1',
      prompt: 'p',
      images: [new Uint8Array([1])],
    })

    expect(invokeMock).toHaveBeenCalledWith(
      'ai_image_edit',
      expect.objectContaining({ baseUrl: 'https://relay.example/v1' }),
    )
  })

  it('decodes every returned base64 image to PNG bytes', async () => {
    invokeMock.mockResolvedValue({ images: [ABC_B64, ABC_B64] })
    const gen = createLocalGenerationService(providersWith([cfg()]))

    const result = await gen.editImage({
      providerId: 'p1',
      prompt: 'p',
      images: [new Uint8Array([1])],
    })

    expect(result.ok && result.data).toEqual([
      { mediaType: 'image/png', bytes: ABC_BYTES },
      { mediaType: 'image/png', bytes: ABC_BYTES },
    ])
  })

  it('errors (without invoking) for an unknown provider', async () => {
    const gen = createLocalGenerationService(providersWith([]))
    const result = await gen.editImage({
      providerId: 'nope',
      prompt: 'p',
      images: [new Uint8Array([1])],
    })
    expect(result.ok).toBe(false)
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('errors (without invoking) for a non-OpenAI-shaped provider', async () => {
    const gen = createLocalGenerationService(
      providersWith([cfg({ kind: 'anthropic', baseUrl: undefined, wireProtocol: 'anthropic-messages' })]),
    )
    const result = await gen.editImage({
      providerId: 'p1',
      prompt: 'p',
      images: [new Uint8Array([1])],
    })
    expect(result.ok).toBe(false)
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('errors (without invoking) for a custom endpoint using a non-OpenAI protocol', async () => {
    const gen = createLocalGenerationService(
      providersWith([cfg({ wireProtocol: 'anthropic-messages' })]),
    )
    const result = await gen.editImage({
      providerId: 'p1',
      prompt: 'p',
      images: [new Uint8Array([1])],
    })
    expect(result.ok).toBe(false)
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('errors (without invoking) when there are no reference images', async () => {
    const gen = createLocalGenerationService(providersWith([cfg()]))
    const result = await gen.editImage({ providerId: 'p1', prompt: 'p', images: [] })
    expect(result.ok).toBe(false)
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('maps a rejected invoke (surfaced HTTP status) to an err Result', async () => {
    // `…Once` (not a persistent reject): vitest 4 re-invokes a persistent
    // throwing mock during cleanup, surfacing a false unhandled failure.
    invokeMock.mockRejectedValueOnce(new Error('images/edits failed: HTTP 401'))
    const gen = createLocalGenerationService(providersWith([cfg()]))
    const result = await gen.editImage({
      providerId: 'p1',
      prompt: 'p',
      images: [new Uint8Array([1])],
    })
    expect(result).toEqual({ ok: false, error: 'images/edits failed: HTTP 401' })
    expect(invokeMock).toHaveBeenCalledOnce()
  })

  it('retries one HTTP 400 without the optional high-fidelity field', async () => {
    invokeMock
      .mockRejectedValueOnce(new Error('images/edits failed: HTTP 400'))
      .mockResolvedValueOnce({ images: [ABC_B64] })
    const gen = createLocalGenerationService(providersWith([cfg()]))

    const result = await gen.editImage({
      providerId: 'p1',
      prompt: 'preserve the reference',
      images: [new Uint8Array([1])],
    })

    expect(result).toEqual({ ok: true, data: [{ mediaType: 'image/png', bytes: ABC_BYTES }] })
    expect(invokeMock).toHaveBeenCalledTimes(2)
    expect(invokeMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ inputFidelity: 'high' }))
    expect(invokeMock.mock.calls[1]?.[1]).toEqual(expect.objectContaining({ inputFidelity: null }))
  })

  it('does not downgrade an explicit low-fidelity request after HTTP 400', async () => {
    invokeMock.mockRejectedValueOnce(new Error('images/edits failed: HTTP 400'))
    const gen = createLocalGenerationService(providersWith([cfg()]))

    const result = await gen.editImage({
      providerId: 'p1',
      prompt: 'edit',
      images: [new Uint8Array([1])],
      inputFidelity: 'low',
    })

    expect(result).toEqual({ ok: false, error: 'images/edits failed: HTTP 400' })
    expect(invokeMock).toHaveBeenCalledOnce()
  })

  it('does not start a paid native edit when already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const gen = createLocalGenerationService(providersWith([cfg()]))

    const result = await gen.editImage({
      providerId: 'p1',
      prompt: 'p',
      images: [new Uint8Array([1])],
      signal: controller.signal,
    })

    expect(result).toEqual({ ok: false, error: 'Operation aborted' })
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('discards a native response that arrives after cooperative cancellation', async () => {
    let resolveInvoke!: (value: { images: string[] }) => void
    invokeMock.mockReturnValue(new Promise((resolve) => { resolveInvoke = resolve }))
    const controller = new AbortController()
    const gen = createLocalGenerationService(providersWith([cfg()]))

    const pending = gen.editImage({
      providerId: 'p1',
      prompt: 'p',
      images: [new Uint8Array([1])],
      signal: controller.signal,
    })
    await vi.waitFor(() => expect(invokeMock).toHaveBeenCalledOnce())
    controller.abort()
    resolveInvoke({ images: [ABC_B64] })

    await expect(pending).resolves.toEqual({ ok: false, error: 'Operation aborted' })
  })
})

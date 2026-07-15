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
  ...over,
})

/** A `ProviderService['list']` stub returning the given configs. */
function providersWith(list: ProviderConfig[]) {
  return { list: () => Promise.resolve(list) }
}

// "ABC" base64-encoded is "QUJD" — used to assert the b64→bytes decode.
const ABC_B64 = 'QUJD'
const ABC_BYTES = new Uint8Array([65, 66, 67])

beforeEach(() => invokeMock.mockReset())

describe('GenerationService.editImage', () => {
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
      providersWith([cfg({ kind: 'anthropic', baseUrl: undefined })]),
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

import { describe, expect, it, vi } from 'vitest'
import type { NativeBridge } from '@/platform/native'
import { isErr, isOk } from '@/services/types'
import { createLocalVectorizeService } from './vectorize-service.local'

function makeBridge(): NativeBridge {
  return {
    saveAssets: vi.fn(async () => ({
      canceled: false,
      outputDir: null,
      count: 0,
      failed: [],
    })),
    saveBundle: vi.fn(async () => ({
      canceled: true,
      outputDir: null,
      bundleDir: null,
      fileCount: 0,
      totalBytes: 0,
      files: [],
    })),
    setVectorizerApiKey: vi.fn(async () => undefined),
    vectorizerKeyStatus: vi.fn(async () => false),
    deleteVectorizerApiKey: vi.fn(async () => undefined),
    vectorizeLocalVTracer: vi.fn(async () => ({ svg: '<svg />' })),
    vectorizeVectorizerAi: vi.fn(async () => ({ svg: '<svg id="api" />' })),
  }
}

function pngAsset(name = 'generated-sheet-01.png') {
  return {
    name,
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
    kind: 'slice' as const,
  }
}

describe('createLocalVectorizeService', () => {
  it('vectorizes through the local VTracer route', async () => {
    const bridge = makeBridge()
    const service = createLocalVectorizeService(bridge)

    const result = await service.vectorize({
      route: 'local',
      asset: pngAsset('hero button.png'),
    })

    expect(isOk(result)).toBe(true)
    if (!isOk(result)) return
    expect(result.data.name).toBe('hero_button.svg')
    expect(result.data.kind).toBe('slice')
    expect(await result.data.blob.text()).toBe('<svg />')
    expect(bridge.vectorizeLocalVTracer).toHaveBeenCalledTimes(1)
    expect(bridge.vectorizeVectorizerAi).not.toHaveBeenCalled()
  })

  it('vectorizes through the Vectorizer.AI route with saved prefs', async () => {
    const bridge = makeBridge()
    const service = createLocalVectorizeService(bridge)

    const result = await service.vectorize({
      route: 'api',
      asset: pngAsset(),
      apiId: 'api-id',
      apiMode: 'test',
    })

    expect(isOk(result)).toBe(true)
    expect(bridge.vectorizeVectorizerAi).toHaveBeenCalledWith({
      apiId: 'api-id',
      bytes: expect.any(Uint8Array),
      mode: 'test',
    })
  })

  it('returns Result errors instead of throwing across the seam', async () => {
    const bridge = makeBridge()
    vi.mocked(bridge.vectorizeLocalVTracer).mockRejectedValueOnce(
      new Error('bad image'),
    )
    const service = createLocalVectorizeService(bridge)

    const result = await service.vectorize({
      route: 'local',
      asset: pngAsset(),
    })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error).toBe('bad image')
  })
})

import { describe, expect, it, vi } from 'vitest'
import type { NativeBridge } from '@/platform/native'
import { createLocalForegroundSegmentationService } from './foreground-segmentation.local'

function bridge(overrides: Partial<NativeBridge> = {}): NativeBridge {
  return {
    saveAssets: vi.fn(),
    saveBundle: vi.fn(),
    setVectorizerApiKey: vi.fn(),
    vectorizerKeyStatus: vi.fn(),
    deleteVectorizerApiKey: vi.fn(),
    vectorizeLocalVTracer: vi.fn(),
    vectorizeVectorizerAi: vi.fn(),
    ...overrides,
  }
}

describe('local foreground segmentation service', () => {
  it('reports an honest capability gap without a native host', async () => {
    const service = createLocalForegroundSegmentationService(bridge())
    await expect(service.capabilities()).resolves.toMatchObject({
      ok: true,
      data: { available: false, backend: 'unavailable' },
    })
    await expect(service.segment({ bytes: new Uint8Array([1]) })).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('capability-required'),
    })
  })

  it('converts the native PNG payload into a typed blob', async () => {
    const service = createLocalForegroundSegmentationService(bridge({
      foregroundSegmentationCapabilities: vi.fn(async () => ({
        available: true,
        platform: 'macos',
        backend: 'apple-vision' as const,
        reason: null,
      })),
      foregroundSegment: vi.fn(async () => ({
        pngBytes: new Uint8Array([137, 80, 78, 71]),
        width: 12,
        height: 8,
        instanceCount: 2,
        backend: 'apple-vision' as const,
      })),
    }))
    const result = await service.segment({ bytes: new Uint8Array([1, 2, 3]) })
    expect(result).toMatchObject({
      ok: true,
      data: { width: 12, height: 8, instanceCount: 2, backend: 'apple-vision' },
    })
    if (result.ok) expect(result.data.png.type).toBe('image/png')
  })

  it('does not publish a native result after cancellation', async () => {
    const controller = new AbortController()
    const service = createLocalForegroundSegmentationService(bridge({
      foregroundSegment: vi.fn(async () => {
        controller.abort()
        return {
          pngBytes: new Uint8Array([1]),
          width: 1,
          height: 1,
          instanceCount: 1,
          backend: 'apple-vision' as const,
        }
      }),
    }))
    await expect(service.segment({ bytes: new Uint8Array([1]), signal: controller.signal }))
      .resolves.toMatchObject({ ok: false, error: expect.stringContaining('cancelled') })
  })
})

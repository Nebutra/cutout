import { describe, it, expect } from 'vitest'
import { createLocalAssetRepository } from './asset-repository.local'
import type { NativeBridge, SaveAssetsResult } from '@/platform/native'

const vectorizeBridgeStubs = {
  setVectorizerApiKey: async () => undefined,
  vectorizerKeyStatus: async () => false,
  deleteVectorizerApiKey: async () => undefined,
  vectorizeLocalVTracer: async () => ({ svg: '<svg />' }),
  vectorizeVectorizerAi: async () => ({ svg: '<svg />' }),
} satisfies Omit<NativeBridge, 'saveAssets'>

function fakeBridge(result: SaveAssetsResult) {
  const calls: { count: number; destDir?: string }[] = []
  const bridge: NativeBridge = {
    ...vectorizeBridgeStubs,
    saveAssets: async (assets, destDir) => {
      calls.push({ count: assets.length, destDir })
      return result
    },
  }
  return { bridge, calls }
}

const pngBlob = () =>
  new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })

describe('asset-repository.local saveMany', () => {
  it('forwards destDir to the bridge and maps the outcome', async () => {
    const { bridge, calls } = fakeBridge({
      canceled: false,
      outputDir: '/out',
      count: 1,
      failed: [],
    })
    const repo = createLocalAssetRepository(bridge)

    const res = await repo.saveMany([{ name: 'a.png', blob: pngBlob() }], {
      destDir: '/out',
    })

    expect(calls[0]).toEqual({ count: 1, destDir: '/out' })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.outputDir).toBe('/out')
      expect(res.data.saved).toHaveLength(1)
      expect(res.data.saved[0].path).toBe('/out/a.png')
    }
  })

  it('passes undefined destDir when no option is given (picker path)', async () => {
    const { bridge, calls } = fakeBridge({
      canceled: true,
      outputDir: null,
      count: 0,
      failed: [],
    })
    const repo = createLocalAssetRepository(bridge)

    await repo.saveMany([{ name: 'a.png', blob: pngBlob() }])
    expect(calls[0].destDir).toBeUndefined()
  })

  it('errors on empty input without touching the bridge', async () => {
    const { bridge, calls } = fakeBridge({
      canceled: false,
      outputDir: null,
      count: 0,
      failed: [],
    })
    const repo = createLocalAssetRepository(bridge)

    const res = await repo.saveMany([])
    expect(res.ok).toBe(false)
    expect(calls).toHaveLength(0)
  })
})

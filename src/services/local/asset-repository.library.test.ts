import { describe, it, expect } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { createLocalAssetRepository } from './asset-repository.local'
import type { NativeBridge } from '@/platform/native'
import type { ImageDescriber } from '@/lib/thumbnail'

/** The library methods never touch the bridge; a no-op satisfies the type. */
const noopBridge: NativeBridge = {
  saveAssets: async () => ({
    canceled: false,
    outputDir: null,
    count: 0,
    failed: [],
  }),
  saveBundle: async () => ({ canceled: true, outputDir: null, bundleDir: null, fileCount: 0, totalBytes: 0, files: [] }),
  setVectorizerApiKey: async () => undefined,
  vectorizerKeyStatus: async () => false,
  deleteVectorizerApiKey: async () => undefined,
  vectorizeLocalVTracer: async () => ({ svg: '<svg />' }),
  vectorizeVectorizerAi: async () => ({ svg: '<svg />' }),
}

const pngBlob = (byte = 1) =>
  new Blob([new Uint8Array([byte])], { type: 'image/png' })

/** Deterministic describer — jsdom has no canvas, so we stub sizing + thumb. */
const stubDescribe: ImageDescriber = async (blob) => ({
  width: 10,
  height: 20,
  thumb: new Blob([await blob.arrayBuffer()], { type: 'image/png' }),
})

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** A fresh in-memory IndexedDB per repo keeps tests isolated. */
function makeRepo() {
  return createLocalAssetRepository(noopBridge, {
    idb: new IDBFactory(),
    describe: stubDescribe,
  })
}

describe('asset-repository.local library (IndexedDB)', () => {
  it('adds, lists newest-first with thumbs, loads, and removes', async () => {
    const repo = makeRepo()

    const a = await repo.add({ name: 'a.png', blob: pngBlob(1), kind: 'slice' })
    await sleep(5) // distinct createdAt so ordering is deterministic
    const b = await repo.add({ name: 'b.png', blob: pngBlob(2), kind: 'import' })
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return

    const listed = await repo.list()
    expect(listed.ok).toBe(true)
    if (!listed.ok) return
    expect(listed.data).toHaveLength(2)
    expect(listed.data[0].id).toBe(b.data.id) // newest first
    expect(listed.data[0].name).toBe('b.png')
    expect(listed.data[0].kind).toBe('import')
    expect(listed.data[0].width).toBe(10)
    expect(listed.data[0].height).toBe(20)
    // A thumb is stored + returned. (Its Blob identity is not asserted: Node's
    // structuredClone degrades a jsdom Blob to `{}` on store — a test-env quirk;
    // real browser IndexedDB round-trips Blobs intact.)
    expect(listed.data[0].thumb).toBeDefined()

    const loaded = await repo.load(a.data.id)
    expect(loaded.ok).toBe(true)

    const removed = await repo.remove(a.data.id)
    expect(removed.ok).toBe(true)

    const after = await repo.list()
    expect(after.ok).toBe(true)
    if (after.ok) expect(after.data).toHaveLength(1)
  })

  it('filters the list by a case-insensitive name query', async () => {
    const repo = makeRepo()
    await repo.add({ name: 'Header.png', blob: pngBlob(), kind: 'slice' })
    await repo.add({ name: 'footer.png', blob: pngBlob(), kind: 'slice' })

    const res = await repo.list({ query: 'head' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data).toHaveLength(1)
    expect(res.data[0].name).toBe('Header.png')
  })

  it('errors when loading a missing asset', async () => {
    const repo = makeRepo()
    const res = await repo.load('does-not-exist')
    expect(res.ok).toBe(false)
  })
})

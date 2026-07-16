import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { ContentAddressedDesktopArtifactStore, parseArtifactId } from './content-addressed-desktop-artifacts'

describe('content-addressed desktop artifacts', () => {
  it('resolves receipt ids after the producing store instance is discarded', async () => {
    const factory = new IDBFactory(), first = new ContentAddressedDesktopArtifactStore(factory)
    const id = await first.write({ mediaType: 'image/png', bytes: new Uint8Array([1, 2, 3]), source: 'generate-image', runId: 'run:1' })
    expect(id).toMatch(/^artifact:sha256:[a-f0-9]{64}$/)
    const restarted = new ContentAddressedDesktopArtifactStore(factory)
    await expect(restarted.read(id)).resolves.toMatchObject({ id, mediaType: 'image/png', bytes: new Uint8Array([1, 2, 3]) })
  })

  it('deduplicates bytes and rejects opaque or malformed ids', async () => {
    const store = new ContentAddressedDesktopArtifactStore(new IDBFactory()), bytes = new Uint8Array([9])
    const first = await store.write({ mediaType: 'image/png', bytes, source: 'generate-image', runId: 'run:1' })
    const second = await store.write({ mediaType: 'image/png', bytes, source: 'edit-image', runId: 'run:2' })
    expect(second).toBe(first)
    expect(parseArtifactId('desktop-artifact:1')).toBeNull()
    await expect(store.read('artifact:sha256:bad')).resolves.toBeNull()
  })

  it('returns durable ids for an output batch in input order', async () => {
    const store = new ContentAddressedDesktopArtifactStore(new IDBFactory())
    const ids = await store.writeBatch!([
      { mediaType: 'image/png', bytes: new Uint8Array([1]), source: 'cutout', runId: 'run' },
      { mediaType: 'image/png', bytes: new Uint8Array([2]), source: 'cutout', runId: 'run' },
    ])
    expect(ids).toHaveLength(2); expect(ids[0]).not.toBe(ids[1])
    await expect(store.read(ids[1]!)).resolves.toMatchObject({ bytes: new Uint8Array([2]) })
  })
})

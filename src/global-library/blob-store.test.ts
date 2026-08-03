import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { IndexedDbLibraryBlobStore, validateMediaBlob } from './blob-store'

describe('content-addressed Global Library blobs', () => {
  it('accepts supported BMP source artifacts', async () => {
    const store=new IndexedDbLibraryBlobStore(new IDBFactory(),100)
    await expect(store.put(new Uint8Array([66,77]),'image/bmp'))
      .resolves.toMatchObject({mediaType:'image/bmp',size:2})
  })
  it('deduplicates bytes and reports quota usage', async () => {
    const store=new IndexedDbLibraryBlobStore(new IDBFactory(),100)
    const first=await store.put(new Uint8Array([1,2,3]),'application/json')
    const second=await store.put(new Uint8Array([1,2,3]),'application/json')
    expect(second.sha256).toBe(first.sha256)
    expect(await store.quota()).toMatchObject({usedBytes:3,availableBytes:97})
  })
  it('deduplicates concurrent writes of the same content hash', async () => {
    const store=new IndexedDbLibraryBlobStore(new IDBFactory(),100)
    const records=await Promise.all(Array.from({length:3},()=>store.put(new Uint8Array([1,2,3]),'image/png')))
    expect(new Set(records.map((record)=>record.sha256)).size).toBe(1)
    expect(await store.quota()).toMatchObject({usedBytes:3,availableBytes:97})
  })
  it('rejects unsafe media and quota overflow without partial writes', async () => {
    const store=new IndexedDbLibraryBlobStore(new IDBFactory(),2)
    await expect(store.put(new Uint8Array([1]),'text/html')).rejects.toThrow('Unsupported')
    await expect(store.put(new Uint8Array([1,2,3]),'image/png')).rejects.toThrow('quota')
    expect((await store.quota()).usedBytes).toBe(0)
  })
  it('garbage-collects only unreferenced hashes and validates integrity', async () => {
    const store=new IndexedDbLibraryBlobStore(new IDBFactory())
    const keep=await store.put(new Uint8Array([1]),'application/json'), remove=await store.put(new Uint8Array([2,3]),'text/plain')
    expect(await store.collectGarbage(new Set([keep.sha256]))).toEqual({deleted:1,freedBytes:2})
    expect(await store.get(remove.sha256)).toBeNull()
    await expect(validateMediaBlob({...keep,bytes:new Uint8Array([9])})).rejects.toThrow('hash')
  })
})

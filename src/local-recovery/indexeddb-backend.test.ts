import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'
import { createIndexedDbRecoveryBackend } from './indexeddb-backend'
import { createRecoverySnapshot } from './service'

describe('IndexedDbRecoveryBackend', () => {
  it('persists snapshot bytes across backend instances and reports remaining quota', async () => {
    const idb = new IDBFactory()
    const options = {
      idb,
      dbName: 'recovery-persistence',
      projectionExists: vi.fn(async () => false),
      rebuildProjection: vi.fn(async () => {}),
      estimateStorage: vi.fn(async () => ({ quota: 1_000, usage: 240 })),
    }
    const snapshot = await createRecoverySnapshot({ projectId: 'p1', revision: 1, value: { ok: true }, createdAt: '2026-07-15T00:00:00.000Z' })
    await createIndexedDbRecoveryBackend(options).putSnapshot(snapshot)

    const restarted = createIndexedDbRecoveryBackend(options)
    await expect(restarted.listSnapshots('p1')).resolves.toEqual([snapshot])
    await expect(restarted.availableBytes()).resolves.toBe(760)
  })

  it('isolates projects and delegates projection rebuilding without inventing storage paths', async () => {
    const idb = new IDBFactory()
    const rebuildProjection = vi.fn(async () => {})
    const backend = createIndexedDbRecoveryBackend({
      idb,
      dbName: 'recovery-isolation',
      projectionExists: async (id) => id === 'exists',
      rebuildProjection,
      estimateStorage: async () => ({ quota: 100 }),
    })
    const one = await createRecoverySnapshot({ projectId: 'one', revision: 1, value: 1, createdAt: '2026-07-15T00:00:00.000Z' })
    const two = await createRecoverySnapshot({ projectId: 'two', revision: 1, value: 2, createdAt: '2026-07-15T00:00:00.000Z' })
    await backend.putSnapshot(one); await backend.putSnapshot(two)
    expect(await backend.listSnapshots('one')).toEqual([one])
    expect(await backend.projectionExists('exists')).toBe(true)
    await backend.rebuildProjection('one', one.bytes)
    expect(rebuildProjection).toHaveBeenCalledWith('one', one.bytes)
  })
})

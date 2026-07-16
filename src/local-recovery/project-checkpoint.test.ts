import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import type { LocalProjectRecord, LocalProjectRepository } from '@/services/local/project-repository.local'
import { createIndexedDbRecoveryBackend } from './indexeddb-backend'
import { checkpointProjectForRecovery, createProjectProjectionAdapter } from './project-checkpoint'
import { LocalRecoveryService } from './service'

function record(): LocalProjectRecord {
  const now = 1_752_537_600_000
  return {
    id: 'project-1', name: 'Project', brief: 'Outcome', assetCount: 1,
    hasDesignMarkdown: false, status: 'Draft', createdAt: now, updatedAt: now,
    params: {} as LocalProjectRecord['params'], designMarkdown: null, workspace: null, slices: [],
    source: { name: 'source.png', blob: new Blob([Uint8Array.of(1, 2, 3)], { type: 'image/png' }), width: 1, height: 1 },
    designDocument: { protocol: 'design-ir.v1', projectId: 'project-1', revision: 1, createdAt: now, updatedAt: now, tokens: [], components: [], pages: [], assets: [{ id: 'asset-1', name: 'bytes', mediaType: 'application/octet-stream', width: 1, height: 1, content: { kind: 'inline', bytes: Uint8Array.of(4, 5) } }] } as unknown as LocalProjectRecord['designDocument'],
  }
}

describe('project recovery checkpoint', () => {
  it('round-trips complete project blobs and verifies persisted bytes before succeeding', async () => {
    const idb = new IDBFactory()
    let restored: LocalProjectRecord | undefined
    const repository = {
      load: async () => restored ? { ok: true as const, data: restored } : { ok: false as const, error: 'missing' },
      save: async (record: LocalProjectRecord) => { restored = record; return { ok: true as const, data: undefined } },
    } as unknown as LocalProjectRepository
    const projection = createProjectProjectionAdapter(repository)
    const backend = createIndexedDbRecoveryBackend({
      idb, dbName: 'project-checkpoint',
      projectionExists: projection.exists, rebuildProjection: projection.rebuild,
      estimateStorage: async () => ({ quota: 10_000_000, usage: 0 }),
    })
    const service = new LocalRecoveryService(backend)
    const snapshot = await checkpointProjectForRecovery({ record: record(), service, backend, createdAt: '2026-07-15T00:00:00.000Z' })
    expect((await backend.listSnapshots('project-1'))[0]?.id).toBe(snapshot.id)

    await service.restore('project-1', snapshot.id)
    expect(restored?.source?.blob.type).toBe('image/png')
    expect([...new Uint8Array(await restored!.source!.blob.arrayBuffer())]).toEqual([1, 2, 3])
    const content = (restored!.designDocument! as unknown as {
      assets: Array<{ content: { bytes: Uint8Array } }>
    }).assets[0]!.content
    expect(content.bytes).toBeInstanceOf(Uint8Array)
    expect([...content.bytes]).toEqual([4, 5])
  })
})

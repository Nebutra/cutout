import { openDb, promisify, txDone } from '@/services/local/idb'
import type { RecoveryBackend, RecoveryBlob, RecoverySnapshot } from './contracts'

const DEFAULT_DB_NAME = 'cutout-recovery'
const DB_VERSION = 1
const SNAPSHOTS = 'snapshots'
const BLOBS = 'blobs'

export interface IndexedDbRecoveryBackendOptions {
  readonly idb?: IDBFactory
  readonly dbName?: string
  readonly projectionExists: (projectId: string) => Promise<boolean>
  readonly rebuildProjection: (projectId: string, bytes: Uint8Array) => Promise<void>
  readonly estimateStorage?: () => Promise<{ quota?: number; usage?: number }>
}

export function createIndexedDbRecoveryBackend(
  options: IndexedDbRecoveryBackendOptions,
): RecoveryBackend {
  const idb = options.idb ?? globalThis.indexedDB
  const dbName = options.dbName ?? DEFAULT_DB_NAME
  const open = () => {
    if (!idb) throw new Error('Recovery storage is unavailable.')
    return openDb(idb, dbName, DB_VERSION, (db) => {
      if (!db.objectStoreNames.contains(SNAPSHOTS)) {
        const store = db.createObjectStore(SNAPSHOTS, { keyPath: 'id' })
        store.createIndex('projectId', 'projectId')
      }
      if (!db.objectStoreNames.contains(BLOBS)) db.createObjectStore(BLOBS, { keyPath: 'id' })
    })
  }
  const withStore = async <T>(name: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => Promise<T>) => {
    const db = await open()
    try {
      const tx = db.transaction(name, mode)
      const value = await run(tx.objectStore(name))
      await txDone(tx)
      return value
    } finally {
      db.close()
    }
  }

  return {
    listSnapshots: (projectId) => withStore(SNAPSHOTS, 'readonly', async (store) =>
      promisify(store.index('projectId').getAll(projectId) as IDBRequest<RecoverySnapshot[]>)),
    putSnapshot: (snapshot) => withStore(SNAPSHOTS, 'readwrite', async (store) => {
      await promisify(store.put(snapshot))
    }),
    removeSnapshot: (id) => withStore(SNAPSHOTS, 'readwrite', async (store) => {
      await promisify(store.delete(id))
    }),
    listBlobs: () => withStore(BLOBS, 'readonly', async (store) =>
      promisify(store.getAll() as IDBRequest<RecoveryBlob[]>)),
    removeBlob: (id) => withStore(BLOBS, 'readwrite', async (store) => {
      await promisify(store.delete(id))
    }),
    projectionExists: options.projectionExists,
    rebuildProjection: options.rebuildProjection,
    async availableBytes() {
      const estimate = options.estimateStorage ?? (async () => navigator.storage.estimate())
      const { quota = 0, usage = 0 } = await estimate()
      return Math.max(0, quota - usage)
    },
  }
}

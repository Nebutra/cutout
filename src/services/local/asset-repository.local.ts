/**
 * Local asset repository (spec §5 / §6).
 *
 * Two concerns behind one seam:
 *   - **Export** (`saveOne`/`saveMany`) — write PNGs to a user-chosen folder via
 *     the Tauri {@link NativeBridge} (tests pass a fake — no Tauri runtime).
 *   - **Library** (`add`/`list`/`load`/`remove`) — a managed, browsable, persistent
 *     collection in IndexedDB. `list()` returns newest-first refs carrying a small
 *     `thumb`, so the gallery renders without loading every original blob.
 *
 * `indexedDB` and the image describer are injected (defaults use the browser),
 * so unit tests supply `fake-indexeddb` + a stub describer. A future cloud
 * library is a `remote/` swap behind this same interface.
 */
import type { NativeBridge, SaveAssetInput } from '@/platform/native'
import type {
  AssetKind,
  AssetListFilter,
  AssetRef,
  AssetRepository,
  AssetToSave,
  Result,
  SaveManyOutcome,
  SaveOptions,
} from '@/services/types'
import { err, isErr, ok } from '@/services/types'
import { describeImage, type ImageDescriber } from '@/lib/thumbnail'
import { openDb, promisify, txDone } from './idb'

const DB_NAME = 'cutout'
const DB_VERSION = 1
const STORE = 'assets'

/** The full record persisted per library asset (blob + thumbnail + metadata). */
interface StoredAsset {
  readonly id: string
  readonly name: string
  readonly kind: AssetKind
  readonly width: number
  readonly height: number
  readonly createdAt: number
  readonly blob: Blob
  readonly thumb: Blob
}

/** Options for the local repository — injected in tests. */
export interface LocalAssetRepositoryOptions {
  readonly idb?: IDBFactory
  readonly describe?: ImageDescriber
}

/** Decode one blob into a bridge-ready `{ name, bytes }` input (export path). */
async function toSaveInput(asset: AssetToSave): Promise<SaveAssetInput> {
  const bytes = new Uint8Array(await asset.blob.arrayBuffer())
  return { name: asset.name, bytes }
}

/** Project a stored record to a gallery ref (metadata + thumb, no full blob). */
function toRef(a: StoredAsset): AssetRef {
  return {
    id: a.id,
    name: a.name,
    kind: a.kind,
    width: a.width,
    height: a.height,
    createdAt: a.createdAt,
    thumb: a.thumb,
  }
}

function openLibraryDb(factory: IDBFactory): Promise<IDBDatabase> {
  return openDb(factory, DB_NAME, DB_VERSION, (db) => {
    if (!db.objectStoreNames.contains(STORE)) {
      const store = db.createObjectStore(STORE, { keyPath: 'id' })
      store.createIndex('createdAt', 'createdAt')
      store.createIndex('kind', 'kind')
    }
  })
}

export function createLocalAssetRepository(
  bridge: NativeBridge,
  options: LocalAssetRepositoryOptions = {},
): AssetRepository {
  const idb = options.idb ?? globalThis.indexedDB
  const describe = options.describe ?? describeImage

  /* --- Export (Tauri fs) --- */

  async function saveMany(
    assets: readonly AssetToSave[],
    _opts?: SaveOptions,
  ): Promise<Result<SaveManyOutcome>> {
    if (assets.length === 0) return err<SaveManyOutcome>('Nothing to export')
    try {
      const inputs = await Promise.all(assets.map(toSaveInput))
      const res = await bridge.saveAssets(inputs)

      const failedNames = new Set(res.failed.map((f) => f.name))
      const saved: AssetRef[] = res.canceled
        ? []
        : inputs
            .filter((input) => !failedNames.has(input.name))
            .map((input) => ({
              id: input.name,
              name: input.name,
              path: res.outputDir
                ? `${res.outputDir}/${input.name}`
                : undefined,
            }))

      return ok<SaveManyOutcome>({
        saved,
        failed: res.failed,
        outputDir: res.outputDir,
        canceled: res.canceled,
      })
    } catch (error) {
      return err<SaveManyOutcome>(
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  /* --- Library (IndexedDB) --- */

  async function add(asset: AssetToSave): Promise<Result<AssetRef>> {
    if (!idb) return err<AssetRef>('The asset library is unavailable here.')
    try {
      const { width, height, thumb } = await describe(asset.blob)
      const record: StoredAsset = {
        id: crypto.randomUUID(),
        name: asset.name,
        kind: asset.kind ?? 'import',
        width,
        height,
        thumb,
        blob: asset.blob,
        createdAt: Date.now(),
      }
      const db = await openLibraryDb(idb)
      try {
        const tx = db.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).put(record)
        await txDone(tx)
      } finally {
        db.close()
      }
      return ok<AssetRef>(toRef(record))
    } catch (error) {
      return err<AssetRef>(error instanceof Error ? error.message : String(error))
    }
  }

  async function list(
    filter?: AssetListFilter,
  ): Promise<Result<AssetRef[]>> {
    if (!idb) return ok<AssetRef[]>([])
    try {
      const db = await openLibraryDb(idb)
      let all: StoredAsset[]
      try {
        const tx = db.transaction(STORE, 'readonly')
        all = await promisify(
          tx.objectStore(STORE).getAll() as IDBRequest<StoredAsset[]>,
        )
      } finally {
        db.close()
      }
      const q = filter?.query?.trim().toLowerCase()
      const rows = q
        ? all.filter((a) => a.name.toLowerCase().includes(q))
        : all
      rows.sort((a, b) => b.createdAt - a.createdAt)
      return ok<AssetRef[]>(rows.map(toRef))
    } catch (error) {
      return err<AssetRef[]>(
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  async function load(id: string): Promise<Result<Blob>> {
    if (!idb) return err<Blob>(`Library has no asset "${id}"`)
    try {
      const db = await openLibraryDb(idb)
      let record: StoredAsset | undefined
      try {
        const tx = db.transaction(STORE, 'readonly')
        record = await promisify(
          tx.objectStore(STORE).get(id) as IDBRequest<StoredAsset | undefined>,
        )
      } finally {
        db.close()
      }
      if (!record) return err<Blob>(`Library has no asset "${id}"`)
      return ok<Blob>(record.blob)
    } catch (error) {
      return err<Blob>(error instanceof Error ? error.message : String(error))
    }
  }

  async function remove(id: string): Promise<Result<void>> {
    if (!idb) return err<void>('The asset library is unavailable here.')
    try {
      const db = await openLibraryDb(idb)
      try {
        const tx = db.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).delete(id)
        await txDone(tx)
      } finally {
        db.close()
      }
      return ok<void>(undefined)
    } catch (error) {
      return err<void>(error instanceof Error ? error.message : String(error))
    }
  }

  return {
    list,
    load,
    add,
    remove,
    saveMany,

    saveOne: async (asset, opts) => {
      const result = await saveMany([asset], opts)
      if (isErr(result)) return err<AssetRef>(result.error)
      const { saved, failed, canceled } = result.data
      if (canceled) return err<AssetRef>('Export canceled')
      if (saved.length === 0) {
        return err<AssetRef>(failed[0]?.error ?? 'Failed to save asset')
      }
      return ok<AssetRef>(saved[0])
    },
  }
}

/**
 * Minimal IndexedDB promise plumbing (spec §5).
 *
 * A ~40-line wrapper so the local asset library can persist blobs without a new
 * runtime dependency. Kept generic (open / request / transaction) — the concrete
 * `assets` store shape lives in `asset-repository.local.ts`. The `IDBFactory` is
 * passed in, so tests can hand over `fake-indexeddb` for isolation.
 */

/** Resolve an `IDBRequest` to its result (or reject with its error). */
export function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

/** Resolve once a read/write transaction has fully committed. */
export function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
  })
}

/** Open (and upgrade, on first use) a database via the given factory. */
export function openDb(
  factory: IDBFactory,
  name: string,
  version: number,
  upgrade: (db: IDBDatabase) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(name, version)
    req.onupgradeneeded = () => upgrade(req.result)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'))
  })
}

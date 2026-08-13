import type { Page } from '@playwright/test'

const PROJECT_DATABASE = 'cutout-projects'
const PROJECT_STORE = 'projects'

export interface ProjectStorageRow {
  readonly id: string
  readonly name: string
  readonly archivedAt?: number
}

/** Read the app-owned project store without creating its database as a side effect. */
export function projectCount(page: Page): Promise<number> {
  return page.evaluate(async ({ databaseName, storeName }) => {
    const exists = (await indexedDB.databases()).some(
      (database) => database.name === databaseName,
    )
    if (!exists) return 0

    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName)
      request.onupgradeneeded = () => request.transaction?.abort()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      if (!db.objectStoreNames.contains(storeName)) {
        throw new Error(`Project database is missing the ${storeName} store.`)
      }
      return await new Promise<number>((resolve, reject) => {
        const request = db.transaction(storeName, 'readonly').objectStore(storeName).count()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    } finally {
      db.close()
    }
  }, { databaseName: PROJECT_DATABASE, storeName: PROJECT_STORE })
}

/** Inspect lifecycle metadata without mutating or upgrading the app-owned store. */
export function projectStorageRows(page: Page): Promise<readonly ProjectStorageRow[]> {
  return page.evaluate(async ({ databaseName, storeName }) => {
    const exists = (await indexedDB.databases()).some(
      (database) => database.name === databaseName,
    )
    if (!exists) return []

    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName)
      request.onupgradeneeded = () => request.transaction?.abort()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      if (!db.objectStoreNames.contains(storeName)) {
        throw new Error(`Project database is missing the ${storeName} store.`)
      }
      const records = await new Promise<readonly ProjectStorageRow[]>((resolve, reject) => {
        const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll()
        request.onsuccess = () => resolve(
          (request.result as readonly ProjectStorageRow[]).map(({ id, name, archivedAt }) => ({
            id,
            name,
            ...(archivedAt === undefined ? {} : { archivedAt }),
          })),
        )
        request.onerror = () => reject(request.error)
      })
      return records
    } finally {
      db.close()
    }
  }, { databaseName: PROJECT_DATABASE, storeName: PROJECT_STORE })
}

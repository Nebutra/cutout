import { test as base, expect } from '@playwright/test'

/** Deterministic origin-local state for specs that exercise Home and Library persistence. */
export const test = base.extend<{ cleanLocalState: void }>({
  cleanLocalState: [async ({ page }, use) => {
    await page.goto('/')
    await page.evaluate(async () => {
      localStorage.clear()
      sessionStorage.clear()
      const databases = await indexedDB.databases()
      await Promise.all(databases.flatMap((database) => database.name ? [new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase(database.name!)
        request.onsuccess = request.onerror = request.onblocked = () => resolve()
      })] : []))
    })
    await page.reload()
    await use()
  }, { auto: true }],
})

export { expect }

import { expect, test } from '@playwright/test'
import { projectCount } from './project-storage'

test('project count inspection does not create the app-owned database', async ({ page }) => {
  await page.goto('/favicon.svg')

  expect(await projectCount(page)).toBe(0)
  expect(await page.evaluate(async () => (
    await indexedDB.databases()
  ).some((database) => database.name === 'cutout-projects'))).toBe(false)
})

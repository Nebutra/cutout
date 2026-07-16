import { expect, test, type Page } from '@playwright/test'

async function openUpdatesAndSupport(page: Page) {
  const viewport = page.viewportSize()
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.getByRole('button', { name: /Workspace menu|工作区菜单/ }).click()
  await page.getByRole('menuitem', { name: /Settings|设置/ }).click()
  if (viewport) await page.setViewportSize(viewport)
  await page.getByText('Updates & Support', { exact: true }).click()
}

test('Local recovery is truthful, redacted, and never deletes project data', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('cutout.project.sentinel', JSON.stringify({ id: 'project:keep' }))
    localStorage.setItem('cutout.workspace-navigation.v2', JSON.stringify({ advanced: true }))
    localStorage.setItem('cutout.canvas-grid', 'hidden')
    ;(globalThis as typeof globalThis & { __SECRET_SENTINEL__?: string }).__SECRET_SENTINEL__ = 'MOX_API_KEY=must-not-appear'
  })
  await openUpdatesAndSupport(page)
  const recovery = page.getByText('Local recovery', { exact: true }).locator('..')
  await expect(recovery).toContainText('Project data is not deleted.')
  await expect(recovery.getByRole('status')).toContainText('Authorize a workspace before using host recovery.')
  await expect(page.getByRole('button', { name: 'Check host' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Recover host' })).toBeDisabled()

  await page.getByRole('button', { name: 'Preview diagnostics' }).click()
  const preview = page.getByLabel('Diagnostic bundle preview')
  await expect(preview).toBeVisible()
  await expect(preview).toContainText('cutout.diagnostics.v1')
  expect(await preview.textContent()).not.toMatch(/MOX_API_KEY|must-not-appear/)

  await page.getByRole('button', { name: 'Reset UI state' }).click()
  const state = await page.evaluate(() => ({
    project: localStorage.getItem('cutout.project.sentinel'),
    navigation: localStorage.getItem('cutout.workspace-navigation.v2'),
    grid: localStorage.getItem('cutout.canvas-grid'),
  }))
  expect(state.project).toContain('project:keep')
  expect(state.navigation).toBeNull()
  expect(state.grid).toBeNull()
  await expect(page.getByRole('dialog')).toHaveScreenshot('local-recovery-settings.png')
})

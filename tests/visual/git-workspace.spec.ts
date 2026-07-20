import { expect, test } from '@playwright/test'

const oid = 'a'.repeat(40)

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 })
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Describe what you want to design...' }).fill('Git workspace fixture')
  await page.getByRole('button', { name: 'Create from brief' }).click()
  await page.evaluate(({ commitOid }) => {
    const status = { repositoryId: 'repo.fixture', snapshotToken: 'snapshot.fixture', branch: 'main', upstream: 'origin/main', ahead: 1, behind: 0, detached: false, files: [{ path: 'src/app.tsx', originalPath: null, indexStatus: ' ', worktreeStatus: 'M', conflicted: false }] }
    ;(window as unknown as { __TAURI_INTERNALS__: { invoke: (command: string, args: Record<string, unknown>) => Promise<unknown> } }).__TAURI_INTERNALS__ = {
      invoke: async (command) => {
        if (command === 'registry_authorize_workspace') return { canceled: false, handle: 'workspace:fixture', label: 'Fixture repository' }
        if (command === 'git_capability') return { available: true, repository: true, gitVersion: 'git version fixture', repositoryId: 'repo.fixture', message: null }
        if (command === 'git_status') return status
        if (command === 'git_log') return [{ oid: commitOid, shortOid: 'aaaaaaa', parents: [], author: 'Ada', authoredAt: '2026-07-20T10:00:00+08:00', decorations: ['HEAD -> main'], subject: 'Add Git workspace' }]
        if (command === 'git_branches') return [{ name: 'main', oid: commitOid, upstream: 'origin/main', ahead: 1, behind: 0, lastCommitSubject: 'Add Git workspace', lastCommittedAt: '2026-07-20T10:00:00+08:00', current: true, remote: false }]
        if (command === 'git_diff') return { path: 'src/app.tsx', target: 'worktree', kind: 'text', patch: 'diff --git a/src/app.tsx b/src/app.tsx\n+export const ready = true\n', truncated: false }
        if (command === 'git_commit_files') return [{ path: 'src/app.tsx', originalPath: null, status: 'M' }]
        return status
      },
    }
  }, { commitOid: oid })
  await page.locator('[data-workspace-rail] button[title="Git"]').click()
  await page.getByRole('button', { name: 'Choose repository' }).click()
  await expect(page.getByRole('region', { name: 'Git' })).toBeVisible()
  await page.getByRole('button', { name: /src\/app\.tsx/ }).first().click()
  await expect(page.getByRole('region', { name: 'Git diff review' })).toBeVisible()
})

test.skip('Git dock and main review stay usable across desktop and narrow layouts', async ({ page }) => {
  for (const dark of [false, true]) {
    await page.evaluate((enabled) => document.documentElement.classList.toggle('dark', enabled), dark)
    for (const viewport of [{ width: 1200, height: 800 }, { width: 520, height: 760 }]) {
      await page.setViewportSize(viewport)
      const dock = page.getByRole('region', { name: 'Git' })
      const review = page.getByRole('region', { name: 'Git diff review' })
      await expect(dock).toBeVisible()
      await expect(review).toBeVisible()
      const dockBox = await dock.boundingBox()
      const reviewBox = await review.boundingBox()
      expect(dockBox).not.toBeNull()
      expect(reviewBox).not.toBeNull()
      expect(dockBox!.width).toBeLessThanOrEqual(viewport.width)
      expect(reviewBox!.width).toBeLessThanOrEqual(viewport.width)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
      await expect(page.locator('[data-workspace-root]')).toHaveScreenshot(`git-workspace-${viewport.width}-${dark ? 'dark' : 'light'}.png`)
    }
  }
})

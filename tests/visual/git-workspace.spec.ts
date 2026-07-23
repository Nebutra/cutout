import { expect, test } from '@playwright/test'

const oid = 'a'.repeat(40)

function boxesOverlap(
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number },
) {
  return first.x < second.x + second.width
    && first.x + first.width > second.x
    && first.y < second.y + second.height
    && first.y + first.height > second.y
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ commitOid }) => {
    const status = { repositoryId: 'repo.fixture', snapshotToken: 'snapshot.fixture', branch: 'main', upstream: 'origin/main', ahead: 1, behind: 0, detached: false, files: [{ path: 'src/app.tsx', originalPath: null, indexStatus: ' ', worktreeStatus: 'M', conflicted: false }] }
    let runEventStore: unknown = { version: 'agent-run-events.v1', activeRunId: null, events: [], activeRun: null }
    let runEventSha256: string | null = null
    ;(window as unknown as { __TAURI_INTERNALS__: { invoke: (command: string, input?: unknown) => Promise<unknown> } }).__TAURI_INTERNALS__ = {
      invoke: async (command, input) => {
        if (command === 'load_providers' || command === 'list_key_status') return []
        if (command === 'key_status') return false
        if (command.startsWith('agent_host_')) return { status: 'running', events: [], runs: {} }
        if (command === 'registry_authorize_workspace') return { canceled: false, handle: 'workspace:fixture', label: 'Fixture repository' }
        if (command === 'workspace_run_events_read') return { store: runEventStore, sha256: runEventSha256, exists: runEventSha256 !== null }
        if (command === 'workspace_run_events_write') {
          runEventStore = (input as { store: unknown }).store
          runEventSha256 = 'b'.repeat(64)
          return { store: runEventStore, sha256: runEventSha256, exists: true }
        }
        if (command === 'git_capability') return { available: true, repository: true, gitVersion: 'git version fixture', repositoryId: 'repo.fixture', message: null }
        if (command === 'git_status') return status
        if (command === 'git_log') return [{ oid: commitOid, shortOid: 'aaaaaaa', parents: [], author: 'Ada', authoredAt: '2026-07-20T10:00:00+08:00', decorations: ['HEAD -> main'], subject: 'Add Git workspace' }]
        if (command === 'git_branches') return [{ name: 'main', oid: commitOid, upstream: 'origin/main', ahead: 1, behind: 0, lastCommitSubject: 'Add Git workspace', lastCommittedAt: '2026-07-20T10:00:00+08:00', current: true, remote: false }]
        if (command === 'git_diff') return { path: 'src/app.tsx', target: 'worktree', kind: 'text', patch: 'diff --git a/src/app.tsx b/src/app.tsx\n+export const ready = true\n', truncated: false }
        if (command === 'git_commit_files') return [{ path: 'src/app.tsx', originalPath: null, status: 'M' }]
        return null
      },
    }
  }, { commitOid: oid })
  await page.setViewportSize({ width: 1200, height: 800 })
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Describe what you want to design...' }).fill('Git workspace fixture')
  await page.getByRole('button', { name: 'Create from brief' }).click()
  const workspaceRail = page.getByRole('navigation', { name: 'Workspace panels' })
  await expect(workspaceRail).toBeVisible()
  await workspaceRail.getByRole('button', { name: 'Git', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Choose repository' })).toBeVisible()
  await page.getByRole('button', { name: 'Choose repository' }).click()
  await expect(page.getByRole('region', { name: 'Git', exact: true })).toBeVisible()
  const changedFile = page.getByRole('button', { name: /src\/app\.tsx/ }).first()
  await expect(changedFile).toBeVisible()
  await changedFile.click()
  const review = page.getByRole('region', { name: 'Git diff review' })
  await expect(review).toBeVisible()
  await expect(review.getByText('src/app.tsx', { exact: true })).toBeVisible()
  await expect(review.getByText(/\+export const ready = true/)).toBeVisible()
})

test('Git dock and main review stay usable across desktop and narrow layouts', async ({ page }) => {
  const hideGit = page.getByRole('button', { name: 'Hide Git' })
  const gitGlyph = hideGit.locator('[data-git-dock-icon="git"]')
  const collapseGlyph = hideGit.locator('[data-git-dock-icon="collapse"]')
  await expect(hideGit).toHaveCount(1)
  await expect(gitGlyph).toHaveCSS('opacity', '1')
  await expect(collapseGlyph).toHaveCSS('opacity', '0')
  const defaultBox = await hideGit.boundingBox()
  expect(defaultBox).not.toBeNull()
  await page.keyboard.press('Tab')
  await hideGit.focus()
  await expect(gitGlyph).toHaveCSS('opacity', '0')
  await expect(collapseGlyph).toHaveCSS('opacity', '1')
  expect(await hideGit.boundingBox()).toEqual(defaultBox)
  await hideGit.evaluate((element) => (element as HTMLElement).blur())

  for (const dark of [false, true]) {
    await page.evaluate((enabled) => document.documentElement.classList.toggle('dark', enabled), dark)
    for (const viewport of [
      { width: 1200, height: 800, snapshot: true },
      { width: 1536, height: 900, snapshot: false },
      { width: 520, height: 760, snapshot: true },
    ]) {
      await page.setViewportSize(viewport)
      const dock = page.getByRole('region', { name: 'Git', exact: true })
      const drawer = page.locator('[data-workspace-panel="git-drawer"]')
      const review = page.getByRole('region', { name: 'Git diff review' })
      const reviewTitle = review.getByText('src/app.tsx', { exact: true })
      const reviewPatch = review.getByText(/\+export const ready = true/)
      await expect(dock).toBeVisible()
      await expect(review).toBeVisible()
      await expect(reviewTitle).toBeVisible()
      await expect(reviewPatch).toBeVisible()
      if (viewport.width >= 1024) {
        const expectedDrawerWidth = viewport.width >= 1536 ? 27 * 16 : 24 * 16
        await expect.poll(async () => {
          const [currentDrawerBox, currentReviewBox] = await Promise.all([
            drawer.boundingBox(),
            review.boundingBox(),
          ])
          if (!currentDrawerBox || !currentReviewBox) return null
          return {
            drawerWidth: Math.round(currentDrawerBox.width),
            reviewGap: Math.round(currentReviewBox.x - currentDrawerBox.x - currentDrawerBox.width),
          }
        }).toEqual({ drawerWidth: expectedDrawerWidth, reviewGap: 0 })
      }
      const dockBox = await dock.boundingBox()
      const drawerBox = await drawer.boundingBox()
      const reviewBox = await review.boundingBox()
      const reviewTitleBox = await reviewTitle.evaluate((element) => {
        const range = document.createRange()
        range.selectNodeContents(element)
        const { x, y, width, height } = range.getBoundingClientRect()
        return { x, y, width, height }
      })
      const reviewPatchBox = await reviewPatch.evaluate((element) => {
        const range = document.createRange()
        range.selectNodeContents(element)
        const { x, y, width, height } = range.getBoundingClientRect()
        return { x, y, width, height }
      })
      expect(dockBox).not.toBeNull()
      expect(drawerBox).not.toBeNull()
      expect(reviewBox).not.toBeNull()
      expect(boxesOverlap(drawerBox!, reviewTitleBox)).toBe(false)
      expect(boxesOverlap(drawerBox!, reviewPatchBox)).toBe(false)
      expect(dockBox!.width).toBeLessThanOrEqual(viewport.width)
      expect(drawerBox!.width).toBeLessThanOrEqual(viewport.width)
      expect(reviewBox!.width).toBeLessThanOrEqual(viewport.width)
      expect(dockBox!.x).toBeGreaterThanOrEqual(0)
      expect(drawerBox!.x).toBeGreaterThanOrEqual(0)
      expect(reviewBox!.x).toBeGreaterThanOrEqual(0)
      expect(dockBox!.x + dockBox!.width).toBeLessThanOrEqual(viewport.width)
      expect(drawerBox!.x + drawerBox!.width).toBeLessThanOrEqual(viewport.width)
      expect(reviewBox!.x + reviewBox!.width).toBeLessThanOrEqual(viewport.width)
      expect(reviewTitleBox.x).toBeGreaterThanOrEqual(reviewBox!.x)
      expect(reviewTitleBox.x + reviewTitleBox.width).toBeLessThanOrEqual(reviewBox!.x + reviewBox!.width)
      expect(reviewPatchBox.x).toBeGreaterThanOrEqual(reviewBox!.x)
      expect(reviewPatchBox.x + reviewPatchBox.width).toBeLessThanOrEqual(reviewBox!.x + reviewBox!.width)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
      if (viewport.snapshot) {
        await expect(page.locator('[data-workspace-root]')).toHaveScreenshot(`git-workspace-${viewport.width}-${dark ? 'dark' : 'light'}.png`)
      }
      await expect(reviewTitle).toBeVisible()
      await expect(reviewPatch).toBeVisible()
    }
  }
})

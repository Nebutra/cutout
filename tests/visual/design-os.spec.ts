import type { Page, TestInfo } from '@playwright/test'
import { expect, test } from './local-state.fixture'
import { openDeliverWorkspace } from './workspace-helpers'
import { projectStorageRows } from './project-storage'

async function stabilize(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('theme', 'dark')
  })
  await page.goto('/')
  await page.locator('body').evaluate((body) => {
    const style = document.createElement('style')
    style.dataset.visualRegression = 'true'
    style.textContent = `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        caret-color: transparent !important;
        transition-duration: 0s !important;
      }
    `
    body.append(style)
  })
  await documentFontsReady(page)
}

async function documentFontsReady(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready
  })
}

async function createEmptyProject(page: Page) {
  const viewport = page.viewportSize()
  if (viewport && viewport.width < 768) await page.setViewportSize({ width: 1024, height: viewport.height })
  await page.getByRole('textbox', { name: 'Describe what you want to design...' }).fill('Components UX regression')
  await page.getByRole('button', { name: 'Create from brief' }).click()
  if (viewport && viewport.width < 768) await page.setViewportSize(viewport)
  await expect(page.getByRole('complementary', { name: 'Agent workspace' })).toBeVisible()
  await expect(page.getByPlaceholder(/Describe a result, correction, or next step/)).toBeVisible()
  await expect(page.locator('[data-slot="user-message"]')).toContainText('Components UX regression')
  await documentFontsReady(page)
}

async function openHomeProjects(page: Page) {
  await page.getByRole('button', { name: 'Home' }).click()
  await page.getByRole('button', { name: /^(All projects|Projects)\b/ }).click()
  await expect(page.getByRole('heading', { name: 'Your projects' })).toBeVisible()
}

async function renameProject(page: Page, currentName: string, nextName: string) {
  const directory = page.getByRole('main')
  await directoryProjectCard(directory, currentName).getByRole('button', { name: `More actions for ${currentName}` }).click()
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  const input = page.getByRole('textbox', { name: 'Project name' })
  await input.fill(nextName)
  await page.getByRole('button', { name: 'Rename', exact: true }).click()
  await expect(directoryProjectButton(directory, nextName)).toBeVisible()
}

async function createNamedProject(page: Page, name: string) {
  await page.getByRole('button', { name: 'Home' }).click()
  if (!await page.getByPlaceholder('Describe what you want to design...').isVisible()) {
    await page.getByRole('button', { name: 'New project' }).last().click()
    if (!await page.getByPlaceholder('Describe what you want to design...').isVisible()) {
      await page.getByRole('button', { name: 'Home' }).click()
    }
  }
  const composer = page.getByPlaceholder('Describe what you want to design...')
  await composer.fill(name)
  await page.getByRole('button', { name: 'Create from brief' }).click()
  await expect(page.getByRole('complementary', { name: 'Agent workspace' })).toBeVisible()
  await openHomeProjects(page)
  await expect(directoryProjectButton(
    page.getByRole('main'),
    name,
  )).toBeVisible()
}

function boxesOverlap(
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number },
) {
  return !(
    first.x + first.width <= second.x
    || second.x + second.width <= first.x
    || first.y + first.height <= second.y
    || second.y + second.height <= first.y
  )
}

function directoryProjectButton(directory: ReturnType<Page['locator']>, name: string) {
  return directory.getByRole('button', { name: `Open ${name}` }).last()
}

function directoryProjectCard(directory: ReturnType<Page['locator']>, name: string) {
  return directoryProjectButton(directory, name).locator('..')
}

test.beforeEach(async ({ page }) => {
  await stabilize(page)
})

test('home workspace', async ({ page }) => {
  await expect(page.getByRole('button', { name: /^All projects\b/ })).toBeVisible()
  const composerActions = page.getByTestId('home-composer-actions')
  await expect(composerActions.getByRole('button', { name: 'Add source' })).toBeVisible()
  await expect(composerActions.getByRole('button', { name: 'Create from brief' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Open a blank project' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Open design inspector' })).toHaveCount(0)

  const attachBox = await composerActions.getByRole('button', { name: 'Add source' }).boundingBox()
  const submitBox = await composerActions.getByRole('button', { name: 'Create from brief' }).boundingBox()
  expect(attachBox).not.toBeNull()
  expect(submitBox).not.toBeNull()
  expect(boxesOverlap(attachBox!, submitBox!)).toBe(false)
  const composer=page.getByRole('textbox',{name:'Describe what you want to design...'})
  await composer.fill('Discard this draft')
  await page.getByLabel('Add local files').setInputFiles({name:'draft.png',mimeType:'image/png',buffer:Buffer.from([1,2,3])})
  await expect(page.getByLabel('Composer attachments')).toContainText('draft.png')
  await expect(page).toHaveScreenshot('home.png', { fullPage: true })
})

test('empty project agent workspace', async ({ page }) => {
  await createEmptyProject(page)
  await expect(page).toHaveScreenshot('empty-project.png', { fullPage: true })
})

test('Unified Delivery Center exposes only real host capabilities', async ({ page }, testInfo) => {
  const invalidSvgWarnings: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('Received NaN for the')) {
      invalidSvgWarnings.push(message.text())
    }
  })
  await createEmptyProject(page)
  const viewport = page.viewportSize()!
  if (viewport.width < 768) await page.setViewportSize({ width: 1024, height: viewport.height })
  await openDeliverWorkspace(page)
  if (viewport.width < 768) await page.setViewportSize(viewport)
  const workbench = page.getByRole('region', { name: 'Deliver' })
  await expect(workbench.getByText('Deliver results', { exact: true })).toBeVisible()
  await expect(workbench.getByText('Choose a result', { exact: true })).toBeVisible()
  await expect(workbench.getByText('Choose a destination', { exact: true })).toBeVisible()
  await expect(workbench.getByRole('button', { name: /Preview delivery|Ask Agent to prepare deliverables/ })).toBeVisible()
  if (testInfo.project.name === 'mobile-chrome') {
    const center = workbench.locator('[data-slot="delivery-center"]')
    await expect(center).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  }
  expect(invalidSvgWarnings).toEqual([])
})

test('project actions are keyboard reachable and rename persists', async ({ page }) => {
  await createNamedProject(page, 'Initial brief')
  await renameProject(page, 'Initial brief', 'Brand launch')

  const directory = page.getByRole('main')
  const projectCard = directoryProjectCard(directory, 'Brand launch')
  const openProject = directoryProjectButton(directory, 'Brand launch')
  await openProject.focus()
  await expect(openProject).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(projectCard.getByRole('button', { name: 'Pin Brand launch' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(projectCard.getByRole('button', { name: 'More actions for Brand launch' })).toBeFocused()

  await page.reload()
  await page.getByRole('button', { name: /^All projects\b/ }).click()
  const reloadedDirectory = page.getByRole('main')
  await expect(directoryProjectButton(reloadedDirectory, 'Brand launch')).toBeVisible()
  await expect(directoryProjectButton(reloadedDirectory, 'Untitled project')).toHaveCount(0)
})

test('pinning promotes a project without losing the unpinned project', async ({ page }) => {
  await createNamedProject(page, 'First project')
  await createNamedProject(page, 'Second project')

  const directory = page.getByRole('main')
  const firstProject = directoryProjectButton(directory, 'First project')
  const secondProject = directoryProjectButton(directory, 'Second project')
  await expect(firstProject).toBeVisible()
  await expect(secondProject).toBeVisible()
  const firstProjectCard = directoryProjectCard(directory, 'First project')
  await firstProjectCard.getByRole('button', { name: 'Pin First project' }).click()
  await expect(firstProjectCard.getByRole('button', { name: 'Unpin First project' })).toHaveAttribute('aria-pressed', 'true')
  expect((await firstProject.boundingBox())!.y).toBeLessThanOrEqual((await secondProject.boundingBox())!.y)

  await page.reload()
  await page.getByRole('button', { name: /^All projects\b/ }).click()
  const reloadedDirectory = page.getByRole('main')
  const reloadedFirst = directoryProjectButton(reloadedDirectory, 'First project')
  const reloadedSecond = directoryProjectButton(reloadedDirectory, 'Second project')
  await expect(reloadedFirst).toBeVisible()
  await expect(reloadedSecond).toBeVisible()
  expect((await reloadedFirst.boundingBox())!.y).toBeLessThanOrEqual((await reloadedSecond.boundingBox())!.y)
})

test('archive leaves Recent and restore returns the project', async ({ page }) => {
  await createNamedProject(page, 'Archive candidate')
  const directory = page.getByRole('main')
  await directoryProjectCard(directory, 'Archive candidate').getByRole('button', { name: 'More actions for Archive candidate' }).click()
  await page.getByRole('menuitem', { name: 'Archive' }).click()
  const archiveDialog = page.getByRole('alertdialog')
  await expect(archiveDialog).toBeVisible()
  await page.getByRole('button', { name: 'Archive', exact: true }).click()
  await expect(archiveDialog).toHaveCount(0)
  await expect(directoryProjectButton(directory, 'Archive candidate')).toHaveCount(0)

  await page.reload()
  const reloadedRows = (await projectStorageRows(page)).filter(
    (project) => project.name === 'Archive candidate',
  )
  expect(reloadedRows).toHaveLength(1)
  expect(reloadedRows[0]?.archivedAt).toEqual(expect.any(Number))
  await page.getByRole('button', { name: /^All projects\b/ }).click()
  await expect(directoryProjectButton(page.getByRole('main'), 'Archive candidate')).toHaveCount(0)

  const workspaceMenu = page.getByRole('button', { name: /Workspace menu|工作区菜单/ })
  if (await workspaceMenu.isVisible()) {
    await workspaceMenu.click()
    await page.getByRole('menuitem', { name: /Settings|设置/ }).click()
  } else {
    await page.keyboard.press('Control+,')
  }
  await page.getByText(/^Archived$/, { exact: true }).click()
  const settings = page.getByRole('dialog')
  await expect(settings.getByText('Archive candidate', { exact: true })).toBeVisible()
  await settings.getByRole('button', { name: 'Restore', exact: true }).click()
  await expect(settings.getByText('Nothing archived', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.reload()
  await page.getByRole('button', { name: /^All projects\b/ }).click()
  await expect(directoryProjectButton(
    page.getByRole('main'),
    'Archive candidate',
  )).toBeVisible()
})

test('project actions remain directly operable on mobile without hover', async ({ page }, testInfo: TestInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chrome', 'Mobile interaction contract')
  await createNamedProject(page, 'Mobile project')

  const directory = page.getByRole('main')
  const openButton = directoryProjectButton(directory, 'Mobile project')
  const moreButton = directoryProjectCard(directory, 'Mobile project').getByRole('button', { name: 'More actions for Mobile project' })
  await expect(moreButton).toBeVisible()
  await moreButton.click()
  await expect(page.getByRole('menuitem', { name: 'Rename' })).toBeVisible()
  await page.keyboard.press('Escape')

  const openBox = await openButton.boundingBox()
  const moreBox = await moreButton.boundingBox()
  expect(openBox).not.toBeNull()
  expect(moreBox).not.toBeNull()
  expect(boxesOverlap(openBox!, moreBox!)).toBe(false)
  await page.screenshot({ path: testInfo.outputPath('mobile-project-actions.png'), fullPage: true })
})

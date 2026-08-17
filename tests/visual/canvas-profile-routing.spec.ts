import { expect, test, type Page, type TestInfo } from '@playwright/test'

async function openProfileProject(page: Page, brief: string) {
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Describe what you want to design...' }).fill(brief)
  await page.getByRole('button', { name: 'Create from brief' }).click()
}

test('Home and in-project Profile intent stay on Canvas beside the Agent', async ({ page }, testInfo: TestInfo) => {
  await openProfileProject(page, 'Create a 4 frame run sprite sheet facing right')

  const gameStage = page.locator('[data-canvas-profile-stage="game-assets"]')
  await expect(gameStage).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Agent workspace' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Project workbench' })).toHaveCount(0)
  await expect(gameStage.getByRole('button', { name: 'Back to artifact board' })).toBeVisible()

  const stageBox = await gameStage.boundingBox()
  const agentBox = await page.getByRole('complementary', { name: 'Agent workspace' }).boundingBox()
  const backBox = await gameStage.getByRole('button', { name: 'Back to artifact board' }).boundingBox()
  expect(stageBox).not.toBeNull()
  expect(agentBox).not.toBeNull()
  expect(backBox).not.toBeNull()
  expect(backBox!.x).toBeGreaterThanOrEqual(stageBox!.x)
  expect(backBox!.y).toBeGreaterThanOrEqual(stageBox!.y)
  const viewport = page.viewportSize()!
  if (viewport.width < 768) {
    expect(stageBox!.y + stageBox!.height).toBeLessThanOrEqual(agentBox!.y + 1)
  } else {
    expect(agentBox!.x + agentBox!.width).toBeLessThanOrEqual(stageBox!.x + 1)
  }
  await gameStage.getByRole('button', { name: 'Back to artifact board' }).click()
  await expect(gameStage).toHaveCount(0)
  await expect(page.locator('[data-workspace-panel="canvas-main"]')).toBeVisible()

  const composer = page.getByRole('textbox', { name: 'Message the Agent' })
  await composer.fill('为这个商品生成跨境电商本地化素材')
  await page.locator('[data-slot="agent-composer"]').getByRole('button', { name: 'Send' }).click()

  const commerceStage = page.locator('[data-canvas-profile-stage="commerce"]')
  await expect(commerceStage).toBeVisible()
  await expect(
    commerceStage.getByRole('region', { name: 'Commerce Project setup' }),
  ).toBeVisible()
  await expect(page.getByRole('region', { name: 'Project workbench' })).toHaveCount(0)
  await expect(page.getByRole('complementary', { name: 'Agent workspace' })).toBeVisible()
  expect(await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  )).toBe(true)

  await page.screenshot({
    path: testInfo.outputPath('canvas-profile-primary.png'),
    fullPage: true,
  })
})

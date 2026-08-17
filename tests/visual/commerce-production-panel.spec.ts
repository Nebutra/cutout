import { expect, test } from '@playwright/test'
import { openProjectTool } from './workspace-helpers'

test('Commerce Project and Benchmark modes remain isolated at desktop and mobile widths', async ({ page }) => {
  await page.goto('/')
  await page
    .getByRole('textbox', { name: 'Describe what you want to design...' })
    .fill('为这个商品生成跨境电商本地化素材')
  await page.getByRole('button', { name: 'Create from brief' }).click()

  const stage = page.locator('[data-canvas-profile-stage="commerce"]')
  const commerce = stage.locator('[data-slot="commerce-production"]')
  await expect(stage).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Agent workspace' })).toBeVisible()
  await expect(commerce).toBeVisible()
  await expect(commerce.getByText('Run inputs', { exact: true })).toBeVisible()
  await expect(commerce.getByRole('tab', { name: 'Benchmark' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Project workbench' })).toHaveCount(0)

  const geometry = await commerce.evaluate((element) => {
    const panel = element.getBoundingClientRect()
    const canvasStage = element.closest<HTMLElement>('[data-canvas-profile-stage="commerce"]')!
      .getBoundingClientRect()
    const controls = Array.from(
      element.querySelectorAll<HTMLElement>('button, label, [role="combobox"]'),
      (control) => {
        const box = control.getBoundingClientRect()
        return {
          left: box.left,
          right: box.right,
          textFits: control.scrollWidth <= control.clientWidth,
        }
      },
    )
    return {
      panelLeft: panel.left,
      panelRight: panel.right,
      stageLeft: canvasStage.left,
      stageRight: canvasStage.right,
      documentFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      controls,
    }
  })

  expect(geometry.panelLeft).toBeGreaterThanOrEqual(geometry.stageLeft)
  expect(geometry.panelRight).toBeLessThanOrEqual(geometry.stageRight)
  expect(geometry.documentFits).toBe(true)
  for (const control of geometry.controls) {
    expect(control.left).toBeGreaterThanOrEqual(geometry.stageLeft)
    expect(control.right).toBeLessThanOrEqual(geometry.stageRight)
    expect(control.textFits).toBe(true)
  }

  await stage.getByRole('button', { name: 'Back to artifact board' }).click()
  await openProjectTool(page, 'Inspect project')

  const inspector = page.getByRole('dialog', { name: 'Project workbench' })
  const close = inspector.getByRole('button', { name: 'Close' })
  const revision = inspector.locator('[data-slot="badge"]').filter({ hasText: /^Revision / }).first()
  await expect.poll(async () => {
    const [closeBox, revisionBox] = await Promise.all([close.boundingBox(), revision.boundingBox()])
    if (!closeBox || !revisionBox) return true
    return closeBox.x < revisionBox.x + revisionBox.width
      && closeBox.x + closeBox.width > revisionBox.x
      && closeBox.y < revisionBox.y + revisionBox.height
      && closeBox.y + closeBox.height > revisionBox.y
  }).toBe(false)
  const lifecycle = inspector.getByRole('tablist', { name: 'Project lifecycle' })
  await lifecycle.getByRole('tab', { name: 'Inspect' }).click()
  const inspectionViews = inspector.getByRole('tablist', { name: 'Inspection views' })
  await inspectionViews.getByRole('tab', { name: 'Labs' }).click()
  const benchmark = inspector.locator('[data-slot="commerce-production"]')
  await expect(benchmark.getByText('Held-out evaluator run', { exact: true })).toBeVisible()
  await expect(benchmark.getByText('5/14', { exact: true })).toBeVisible()
  await expect(benchmark.getByText('14/14', { exact: true })).toHaveCount(0)
  const lens = inspector.getByRole('radiogroup', { name: 'Workbench lens' })
  await lens.getByRole('radio', { name: 'Builder' }).click()
  await expect(inspector.getByRole('region', { name: 'Builder context' })).toBeVisible()
  await expect(lifecycle.getByRole('tab', { name: 'Inspect' })).toHaveAttribute('aria-selected', 'true')
  await expect(benchmark.getByText('Held-out evaluator run', { exact: true })).toBeVisible()
  await lens.getByRole('radio', { name: 'Designer' }).click()
  await expect(inspector.getByRole('region', { name: 'Builder context' })).toHaveCount(0)
  await expect(inspector).toHaveScreenshot('design-os-commerce-labs.png')
})

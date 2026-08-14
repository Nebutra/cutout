import { expect, test } from '@playwright/test'

test('Commerce held-out production remains operable at desktop and mobile widths', async ({ page }, testInfo) => {
  const viewport = page.viewportSize()!
  if (viewport.width < 1024) await page.setViewportSize({ width: 1024, height: viewport.height })

  await page.goto('/')
  await page
    .getByRole('textbox', { name: 'Describe what you want to design...' })
    .fill('Commerce held-out production visual verification')
  await page.getByRole('button', { name: 'Create from brief' }).click()

  const rail = page.getByRole('navigation', { name: 'Workspace panels' })
  await rail.getByRole('button', { name: 'Create', exact: true }).click()
  const create = page.getByRole('complementary', { name: 'Design system' })
  await create.getByRole('button', { name: 'Open system inspector' }).click()

  if (testInfo.project.name === 'mobile-chrome') await page.setViewportSize(viewport)

  const inspector = page.getByRole('dialog', { name: 'System inspector' })
  await inspector.getByRole('tab', { name: 'Commerce' }).click()
  const commerce = inspector.locator('[data-slot="commerce-production"]')
  await expect(commerce).toBeVisible()
  await expect(commerce.getByText('5/14', { exact: true })).toBeVisible()
  await expect(commerce.getByText('14/14', { exact: true })).toHaveCount(0)

  const geometry = await commerce.evaluate((element) => {
    const panel = element.getBoundingClientRect()
    const dialog = element.closest('[role="dialog"]')!.getBoundingClientRect()
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
      dialogLeft: dialog.left,
      dialogRight: dialog.right,
      documentFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      controls,
    }
  })

  expect(geometry.panelLeft).toBeGreaterThanOrEqual(geometry.dialogLeft)
  expect(geometry.panelRight).toBeLessThanOrEqual(geometry.dialogRight)
  expect(geometry.documentFits).toBe(true)
  for (const control of geometry.controls) {
    expect(control.left).toBeGreaterThanOrEqual(geometry.dialogLeft)
    expect(control.right).toBeLessThanOrEqual(geometry.dialogRight)
    expect(control.textFits).toBe(true)
  }
})

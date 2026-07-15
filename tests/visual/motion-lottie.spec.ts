import { expect, test } from '@playwright/test'

test('Motion IR web fixture renders bounded frames and reduced motion without external services', async ({ page }) => {
  await page.setContent(`<!doctype html><html><style>body{margin:0;background:#111}svg{display:block}</style><svg width="320" height="180" viewBox="0 0 320 180" aria-label="Motion preview"><circle id="dot" cx="40" cy="90" r="16" fill="#7b61ff"/></svg><script>window.renderFrame=(progress,reduced)=>{const p=reduced?0:Math.max(0,Math.min(1,progress));document.querySelector('#dot').setAttribute('cx',String(40+(240*p)))}</script></html>`)
  const dot = page.locator('#dot')
  await expect(dot).toHaveAttribute('cx', '40')
  await page.evaluate(() => (window as any).renderFrame(0.5, false))
  await expect(dot).toHaveAttribute('cx', '160')
  const bounds = await dot.boundingBox()
  expect(bounds).not.toBeNull()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320)
  await page.evaluate(() => (window as any).renderFrame(1, true))
  await expect(dot).toHaveAttribute('cx', '40')
  const pixels = await page.screenshot()
  expect(pixels.byteLength).toBeGreaterThan(100)
})

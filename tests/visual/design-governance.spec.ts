import { expect, test } from '@playwright/test'

for (const viewport of [{name:'desktop',width:1280,height:800},{name:'mobile',width:390,height:844}]) {
  test(`governance summary remains readable on ${viewport.name}`, async ({page}) => {
    await page.setViewportSize(viewport)
    await page.setContent(`<meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;font:14px system-ui;color:#18181b;background:#fff}.summary{box-sizing:border-box;width:min(720px,calc(100vw - 24px));margin:12px;padding:12px;border:1px solid #d4d4d8;border-radius:6px}.head{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px}.badges{display:flex;gap:4px}.badge{border:1px solid #d4d4d8;border-radius:4px;padding:2px 6px}.block{background:#dc2626;color:white}button{min-height:32px}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><section class="summary" aria-label="Design governance"><div class="head"><strong>Design governance</strong><div class="badges"><span class="badge block">1 blockers</span><span class="badge">1 advisories</span></div></div><p>Focus indicator is not sufficiently visible. <span>dark · focus</span></p><button>Request repair</button><details><summary>Details and evidence</summary><pre>{"ratio":2.1,"required":3,"standard":"WCAG 2.2"}</pre></details></section>`)
    const summary=page.getByRole('region',{name:'Design governance'})
    await expect(summary).toBeVisible()
    await expect(page.getByRole('button',{name:'Request repair'})).toBeVisible()
    const box=await summary.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x+box!.width).toBeLessThanOrEqual(viewport.width)
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  })
}

test('Design inspector exposes governance evidence without claiming an unavailable browser host',async({page})=>{
  await page.setViewportSize({width:1280,height:800})
  await page.goto('/')
  await page.getByRole('textbox',{name:'Describe what you want to design...'}).fill('Governed workspace')
  await page.getByRole('button',{name:'Create from brief'}).click()
  await expect(page.getByRole('complementary',{name:'Agent workspace'})).toBeVisible()
  await page.getByRole('button',{name:'Design',exact:true}).click()
  const inspector=page.getByRole('complementary',{name:'Design system'});await expect(inspector).toBeVisible()
  await expect(inspector).toContainText('DESIGN.md')
  await expect(inspector.getByRole('button',{name:'Inspect accessibility'})).toHaveCount(0)
  expect(await page.evaluate(()=>Object.keys(localStorage).filter((key)=>key.startsWith('cutout.governance-inspection.')))).toEqual([])
})

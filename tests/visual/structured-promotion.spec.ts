import { expect, test } from '@playwright/test'

test('Pixels to structured promotion stays explicit on desktop and mobile', async ({ page }, testInfo) => {
  await page.setContent(`<!doctype html><html><style>body{font:14px system-ui;background:#111;color:#eee;margin:24px}.toolbar{display:flex;flex-wrap:wrap;gap:8px}.image{position:relative;width:min(640px,100%);aspect-ratio:2/1;margin-top:12px;touch-action:none;background:linear-gradient(135deg,#282828,#555)}#marquee{position:absolute;border:2px solid #7aa2ff;background:#7aa2ff33;display:none}button{padding:8px}#promote,#contract{display:none}dl{border:1px solid #555;padding:12px}</style><div class="toolbar"><button id="select">Select region</button><button id="full">Use full image</button></div><div class="image" aria-label="Material preview"><div id="marquee" aria-label="Selected image region"></div></div><section id="promote" aria-label="Promote selected region"><p id="evidence"></p><button>Frame</button><button>Text</button><button>Image</button><button id="component">Component</button></section><details id="contract"><summary>Component contract</summary><dl><dt>Evidence</dt><dd>material:prototype-page:home · material:prototype-page:home:revision:abc · home</dd><dt>Constraints</dt><dd>fill × hug</dd><dt>API</dt><dd>1 prop · 1 variant · 1 slot</dd><dt>Stories</dt><dd>1 state · 2 stories</dd></dl></details><script>let selecting=false,start=null;const clear=()=>{marquee.style.display='none';promote.style.display='none'};const commit=(x,y,w,h)=>{Object.assign(marquee.style,{display:'block',left:x+'px',top:y+'px',width:w+'px',height:h+'px'});evidence.textContent='User selected · '+Math.round(w*2)+' × '+Math.round(h*2)+' · material:prototype-page:home';promote.style.display='block'};select.onclick=()=>{selecting=!selecting;clear()};full.onclick=()=>commit(0,0,640,320);document.querySelector('.image').onpointerdown=e=>{if(selecting)start={x:e.offsetX,y:e.offsetY}};document.querySelector('.image').onpointerup=e=>{if(!start)return;commit(Math.min(start.x,e.offsetX),Math.min(start.y,e.offsetY),Math.abs(e.offsetX-start.x),Math.abs(e.offsetY-start.y));start=null};document.onkeydown=e=>{if(e.key==='Escape'){selecting=false;clear()}};component.onclick=()=>contract.style.display='block'</script></html>`)
  await expect(page.getByRole('region', { name: 'Promote selected region' })).toBeHidden()
  await expect(page.getByText('Component contract')).toBeHidden()
  if (testInfo.project.name === 'mobile-chrome') {
    await page.getByRole('button', { name: 'Use full image' }).click()
  } else {
    await page.getByRole('button', { name: 'Select region' }).click()
    const preview = page.getByLabel('Material preview')
    const box = await preview.boundingBox()
    if (!box) throw new Error('Material preview is not measurable.')
    await page.mouse.move(box.x + 80, box.y + 40)
    await page.mouse.down()
    await page.mouse.move(box.x + 320, box.y + 160)
    await page.mouse.up()
    await expect(page.getByLabel('Selected image region')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('region', { name: 'Promote selected region' })).toBeHidden()
    await page.getByRole('button', { name: 'Use full image' }).click()
  }
  await expect(page.getByRole('region', { name: 'Promote selected region' })).toBeVisible()
  await expect(page.getByText('Component contract')).toBeHidden()
  await page.getByRole('button', { name: 'Component' }).click()
  await expect(page.getByText('Component contract')).toBeVisible()
  await page.getByText('Component contract').click()
  await expect(page.getByText('material:prototype-page:home:revision:abc')).toBeVisible()
})

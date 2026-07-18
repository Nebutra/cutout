import { act, createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { RichText } from './RichText'

function render(markdown: string, variant: 'message' | 'artifact' = 'message') {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  flushSync(() => root.render(createElement(RichText, { markdown, variant })))
  return { host, root }
}

describe('RichText', () => {
  it('renders GFM tables and artifact typography from arbitrary Markdown', () => {
    const { host, root } = render('# Decision\n\n| Option | Status |\n| --- | --- |\n| Flexible | **Use** |', 'artifact')
    expect(host.querySelector('[data-rich-text="artifact"]')).not.toBeNull()
    expect(host.querySelector('h1')?.textContent).toBe('Decision')
    expect(host.querySelectorAll('table tbody tr')).toHaveLength(1)
    expect(host.querySelector('strong')?.textContent).toBe('Use')
    act(() => root.unmount())
    host.remove()
  })

  it('does not execute raw HTML, images, or unsafe links', () => {
    const { host, root } = render('<img src=x onerror=alert(1)>\n\n[unsafe](javascript:alert(1)) [safe](https://cutout.local/docs)')
    expect(host.querySelector('img')).toBeNull()
    expect(host.querySelectorAll('a')).toHaveLength(1)
    expect(host.querySelector('a')?.getAttribute('href')).toBe('https://cutout.local/docs')
    expect(host.textContent).toContain('unsafe')
    act(() => root.unmount())
    host.remove()
  })
})

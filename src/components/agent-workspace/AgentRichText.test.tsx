import { act, createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { AgentRichText } from './AgentRichText'

function render(markdown: string) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  flushSync(() => root.render(createElement(AgentRichText, { markdown })))
  return { host, root }
}

describe('AgentRichText', () => {
  it('renders the allowlisted Markdown subset without interpreting HTML', () => {
    const { host, root } = render('## Heading\n\n- **Strong** and `code`\n\n> Quote\n\n```ts\nconst value = 1\n```\n\n<img src=x onerror=alert(1)>')
    expect(host.querySelector('h2')?.textContent).toBe('Heading')
    expect(host.querySelector('strong')?.textContent).toBe('Strong')
    expect(host.querySelector('code')?.textContent).toContain('code')
    expect(host.querySelector('img')).toBeNull()
    act(() => root.unmount())
    host.remove()
  })

  it('keeps non-web links inert', () => {
    const { host, root } = render('[unsafe](javascript:alert(1)) [safe](https://cutout.local/docs)')
    const links = host.querySelectorAll('a')
    expect(links).toHaveLength(1)
    expect(links[0]?.getAttribute('href')).toBe('https://cutout.local/docs')
    expect(host.textContent).toContain('unsafe')
    act(() => root.unmount())
    host.remove()
  })
})

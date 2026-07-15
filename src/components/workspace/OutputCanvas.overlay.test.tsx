// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { OutputCanvas } from './OutputCanvas'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
class TestResizeObserver { observe() {} disconnect() {} unobserve() {} }
globalThis.ResizeObserver = TestResizeObserver as unknown as typeof ResizeObserver

let root: ReturnType<typeof createRoot> | undefined
let host: HTMLDivElement | undefined
afterEach(() => { if (root) act(() => root?.unmount()); host?.remove(); root = undefined; host = undefined })

describe('OutputCanvas overlays', () => {
  it('renders the empty hint from a computed safe-area pixel anchor', () => {
    host = document.createElement('div')
    Object.defineProperty(host, 'getBoundingClientRect', { value: () => ({ x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON() {} }) })
    document.body.append(host)
    root = createRoot(host)
    act(() => root?.render(<OutputCanvas designSystem={null} pages={[]} assets={[]} emptyHint="Describe a result" />))
    const hint = host.querySelector<HTMLElement>('[data-slot="canvas-empty-hint"]')
    expect(hint?.textContent).toBe('Describe a result')
    expect(hint?.style.left).toMatch(/px$/)
    expect(hint?.style.left).not.toBe('50%')
    expect(hint?.className).toContain('text-center')
  })
})

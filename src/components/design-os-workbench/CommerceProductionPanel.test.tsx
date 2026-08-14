import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CommerceProductionPanel } from './CommerceProductionPanel'

describe('Commerce production desktop operator (not benchmark evidence)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('starts fail-closed without a desktop Provider or evaluator package', async () => {
    await act(async () => {
      root.render(<CommerceProductionPanel />)
    })
    expect(container.textContent).toContain('Commerce production')
    expect(container.textContent).toContain('Held-out evaluator run')
    expect(container.textContent).toContain('5/14')
    expect(container.textContent).toContain('Import evaluator package')
    expect(container.textContent).toContain('No eligible DashScope Provider')
    expect(container.textContent).not.toContain('14/14')
    const start = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Start run'))
    expect(start?.disabled).toBe(true)
  })
})

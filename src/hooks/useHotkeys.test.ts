import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useHotkeys, type HotkeyHandlers } from './useHotkeys'

const roots: Array<{ root: ReturnType<typeof createRoot>; container: HTMLDivElement }> = []

function Harness({ handlers }: { readonly handlers: HotkeyHandlers }) {
  useHotkeys(handlers)
  return createElement('input', { 'aria-label': 'Editor' })
}

afterEach(() => {
  for (const { root, container } of roots.splice(0)) {
    act(() => root.unmount())
    container.remove()
  }
})

describe('useHotkeys Settings shortcut', () => {
  it('opens Settings with Command-comma even while editing', () => {
    const onOpenSettings = vi.fn()
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    roots.push({ root, container })

    act(() => root.render(createElement(Harness, { handlers: { onOpenSettings } })))
    const input = container.querySelector('input')!
    input.focus()

    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', {
        key: ',',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }))
    })

    expect(onOpenSettings).toHaveBeenCalledOnce()
  })
})

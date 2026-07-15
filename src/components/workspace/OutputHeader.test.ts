import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { OutputHeader } from './IntentWorkspace'

function renderHeader(loaded: boolean) {
  const host = document.createElement('div')
  const root = createRoot(host)
  act(() =>
    root.render(
      createElement(OutputHeader, {
        sliceCount: loaded ? 2 : 0,
        prototypePageCount: loaded ? 1 : 0,
        hasDesignSystem: loaded,
        namingStatus: 'done',
        inspectorOpen: false,
        onToggleInspector: vi.fn(),
        approved: false,
        onApprove: vi.fn(),
        onRequestChanges: vi.fn(),
      }),
    ),
  )
  return { host, root }
}

describe('OutputHeader', () => {
  it.each([false, true])('renders the deliverable count without a redundant Design OS entry (loaded=%s)', (loaded) => {
    const { host, root } = renderHeader(loaded)
    expect(host.querySelector('[aria-label="Open design inspector"]')).toBeNull()
    expect(host.textContent).toContain(loaded ? '4 deliverables' : 'Output')
    act(() => root.unmount())
  })
})

import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getStoreState } from '@/store'
import { useAutoRun } from './useAutoRun'

describe('useAutoRun', () => {
  const hosts: HTMLDivElement[] = []

  afterEach(() => {
    getStoreState().resetProject()
    for (const host of hosts.splice(0)) host.remove()
  })

  it('mounts against an empty projected slice set without an unstable snapshot loop', () => {
    const analyze = vi.fn()
    const host = document.createElement('div')
    hosts.push(host)
    document.body.append(host)
    const root = createRoot(host)

    function Harness() {
      useAutoRun(analyze)
      return null
    }

    expect(() => {
      act(() => root.render(createElement(Harness)))
    }).not.toThrow()
    expect(analyze).not.toHaveBeenCalled()
    act(() => root.unmount())
  })
})

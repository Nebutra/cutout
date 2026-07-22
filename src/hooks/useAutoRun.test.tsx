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

  it('analyzes each auto-analyze source once', () => {
    const analyze = vi.fn()
    const host = document.createElement('div')
    hosts.push(host)
    document.body.append(host)
    const root = createRoot(host)
    const bitmap = (): ImageBitmap => ({
      width: 100,
      height: 100,
      close: vi.fn(),
    }) as unknown as ImageBitmap

    function Harness() {
      useAutoRun(analyze)
      return null
    }

    act(() => root.render(createElement(Harness)))
    act(() => getStoreState().loadImage({ bitmap: bitmap(), name: 'first' }))
    expect(analyze).toHaveBeenCalledTimes(1)
    expect(analyze).toHaveBeenLastCalledWith(true)

    act(() => root.render(createElement(Harness)))
    expect(analyze).toHaveBeenCalledTimes(1)

    act(() => getStoreState().loadImage({ bitmap: bitmap(), name: 'second' }))
    expect(analyze).toHaveBeenCalledTimes(2)
    act(() => root.unmount())
  })

  it('does not duplicate Agent-managed cutout runs', () => {
    const analyze = vi.fn()
    const host = document.createElement('div')
    hosts.push(host)
    document.body.append(host)
    const root = createRoot(host)
    const bitmap = {
      width: 100,
      height: 100,
      close: vi.fn(),
    } as unknown as ImageBitmap

    function Harness() {
      useAutoRun(analyze)
      return null
    }

    act(() => root.render(createElement(Harness)))
    act(() => getStoreState().loadImage({
      bitmap,
      name: 'agent-board',
      autoAnalyze: false,
    }))
    expect(analyze).not.toHaveBeenCalled()
    act(() => root.unmount())
  })
})

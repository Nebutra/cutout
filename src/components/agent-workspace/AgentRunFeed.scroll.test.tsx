// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentRunFeed } from './AgentWorkspaceDock'
import type { AgentFeedItem } from './agent-view-model'

describe('AgentRunFeed streaming scroll', () => {
  const frames: FrameRequestCallback[] = []
  const scrollIntoView = vi.fn()

  beforeEach(() => {
    frames.length = 0
    scrollIntoView.mockClear()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => (frames.push(callback), frames.length))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    Element.prototype.scrollIntoView = scrollIntoView
  })

  afterEach(() => vi.unstubAllGlobals())

  it('follows detail updates only while the reader remains near the bottom', async () => {
    const host = document.createElement('div')
    host.dataset.slot = 'agent-conversation'
    document.body.append(host)
    const root = createRoot(host)
    const item = (detail: string): AgentFeedItem => ({
      id: 'stream-1', type: 'message', role: 'agent', status: 'pending',
      title: 'Agent', detail, provenance: 'runtime',
    })
    const render = (detail: string) => root.render(
      <AgentRunFeed items={[item(detail)]} heading="Conversation" emptyLabel="Empty" detailsLabel="Details" />,
    )

    await act(async () => render('first'))
    Object.defineProperties(host, {
      scrollHeight: { configurable: true, value: 800 },
      clientHeight: { configurable: true, value: 100 },
      scrollTop: { configurable: true, writable: true, value: 700 },
    })
    host.dispatchEvent(new Event('scroll'))
    frames.splice(0).forEach((frame) => frame(0))
    scrollIntoView.mockClear()

    await act(async () => render('first plus streamed detail'))
    frames.splice(0).forEach((frame) => frame(0))
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'auto' })

    scrollIntoView.mockClear()
    host.scrollTop = 200
    host.dispatchEvent(new Event('scroll'))
    await act(async () => render('more detail while reading above'))
    frames.splice(0).forEach((frame) => frame(0))
    expect(scrollIntoView).not.toHaveBeenCalled()

    await act(async () => root.unmount())
    host.remove()
  })

  it('does not throw when the environment has no scrollIntoView API', async () => {
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: undefined,
    })
    const host = document.createElement('div')
    host.dataset.slot = 'agent-conversation'
    document.body.append(host)
    const root = createRoot(host)
    const item: AgentFeedItem = {
      id: 'stream-1', type: 'message', role: 'agent', status: 'pending',
      title: 'Agent', detail: 'streaming', provenance: 'runtime',
    }

    await act(async () => root.render(
      <AgentRunFeed items={[item]} heading="Conversation" emptyLabel="Empty" detailsLabel="Details" />,
    ))
    expect(() => frames.splice(0).forEach((frame) => frame(0))).not.toThrow()

    await act(async () => root.unmount())
    host.remove()
  })
})

// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AgentWorkspaceDock } from './AgentWorkspaceDock'
import type { AgentWorkspaceViewModel } from './agent-view-model'

const viewModel: AgentWorkspaceViewModel = {
  summary: { status: 'draft', title: 'Draft', detail: '', intent: null, elapsedLabel: null },
  feed: [{ id: 'user-1', type: 'message', role: 'user', status: 'complete', title: 'You', detail: 'Make it blue', provenance: 'runtime' }],
  checklist: [],
}
let container: HTMLDivElement | null = null

afterEach(() => { container?.remove(); container = null })

async function renderDock(onEditMessage: (eventId: string, message: string) => void | Promise<void> = vi.fn()) {
  container = document.createElement('div')
  document.body.append(container)
  const composerChange = vi.fn()
  await act(async () => createRoot(container!).render(createElement(AgentWorkspaceDock, {
    viewModel,
    composer: { value: '', onChange: composerChange, onSubmit: vi.fn() },
    onEditMessage,
  })))
  return { onEditMessage, composerChange }
}

const click = (element: Element) => element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
const key = (element: Element, value: string, shiftKey = false) => element.dispatchEvent(new KeyboardEvent('keydown', { key: value, shiftKey, bubbles: true }))

describe('inline message editing', () => {
  it('keeps editing in the bubble and cancel does not refill the composer', async () => {
    const { composerChange } = await renderDock()
    await act(async () => click(container!.querySelector('[aria-label="Edit message"]')!))
    const textarea = container!.querySelector<HTMLTextAreaElement>('[aria-label="Edit message text"]')!
    expect(textarea.value).toBe('Make it blue')
    expect(container!.querySelector('[data-slot="user-message"] textarea')).toBe(textarea)
    await act(async () => click([...container!.querySelectorAll('button')].find((button) => button.textContent === 'Cancel')!))
    expect(container!.querySelector('[aria-label="Edit message text"]')).toBeNull()
    expect(composerChange).not.toHaveBeenCalled()
  })

  it('submits with Enter, preserves Shift+Enter, and cancels with Escape', async () => {
    const onEditMessage = vi.fn(async () => {})
    await renderDock(onEditMessage)
    await act(async () => click(container!.querySelector('[aria-label="Edit message"]')!))
    let textarea = container!.querySelector<HTMLTextAreaElement>('[aria-label="Edit message text"]')!
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(textarea, 'Make it green')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
      key(textarea, 'Enter', true)
    })
    expect(onEditMessage).not.toHaveBeenCalled()
    await act(async () => { key(textarea, 'Enter'); await Promise.resolve() })
    expect(onEditMessage).toHaveBeenCalledWith('user-1', 'Make it green')
    expect(container!.querySelector('[aria-label="Edit message text"]')).toBeNull()
    await act(async () => click(container!.querySelector('[aria-label="Edit message"]')!))
    textarea = container!.querySelector<HTMLTextAreaElement>('[aria-label="Edit message text"]')!
    await act(async () => key(textarea, 'Escape'))
    expect(container!.querySelector('[aria-label="Edit message text"]')).toBeNull()
  })

  it('keeps the inline editor open and reports a synchronous submit failure', async () => {
    await renderDock(() => { throw new Error('This request is no longer active.') })
    await act(async () => click(container!.querySelector('[aria-label="Edit message"]')!))
    const textarea = container!.querySelector<HTMLTextAreaElement>('[aria-label="Edit message text"]')!
    await act(async () => key(textarea, 'Enter'))
    expect(container!.querySelector('[aria-label="Edit message text"]')).toBe(textarea)
    expect(container!.querySelector('[role="alert"]')?.textContent).toBe('This request is no longer active.')
  })
})

describe('stopped-run retry', () => {
  it('renders one Retry action below the latest error and invokes its callback', async () => {
    const onRetry = vi.fn()
    container = document.createElement('div')
    document.body.append(container)
    await act(async () => createRoot(container!).render(createElement(AgentWorkspaceDock, {
      viewModel: {
        summary: { status: 'stopped', title: 'Run stopped', detail: 'Service temporarily unavailable', intent: 'Create a checkout flow', elapsedLabel: '0:04' },
        feed: [
          { id: 'error-1', type: 'error', status: 'stopped', title: 'Run stopped', detail: 'Older failure', provenance: 'runtime' },
          { id: 'error-2', type: 'error', status: 'stopped', title: 'Run stopped', detail: 'Latest transport interruption', provenance: 'runtime' },
          { id: 'agent-1', type: 'message', role: 'agent', status: 'complete', title: 'Agent', detail: 'Completed work remains available.', provenance: 'runtime' },
        ],
        checklist: [],
      },
      composer: { value: '', onChange: vi.fn(), onSubmit: vi.fn() },
      labels: { retry: 'Retry' },
      onRetry,
    })))

    const retryButtons = [...container.querySelectorAll('button')]
      .filter((button) => button.textContent?.trim() === 'Retry')
    expect(retryButtons).toHaveLength(1)
    expect(retryButtons[0].closest('article')?.textContent).toContain('Latest transport interruption')
    expect(retryButtons[0].getAttribute('type')).toBe('button')
    await act(async () => click(retryButtons[0]))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

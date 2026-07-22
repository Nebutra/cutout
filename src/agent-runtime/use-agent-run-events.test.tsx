// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const transport = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@/platform/native', () => ({
  tauriBridge: {
    readRunEventStore: transport.read,
    writeRunEventStore: transport.write,
  },
}))

import { setAuthorizedWorkspace } from '@/platform/authorized-workspace'
import { createRunEvent, replayRunEvents, type AgentRunEventStore } from './run-events'
import {
  REPOSITORY_AGENT_HISTORY_NOTICE,
  useAgentRunEvents,
  type AgentRunEventWriter,
} from './use-agent-run-events'

const digest = 'a'.repeat(64)
let root: Root | undefined
let host: HTMLDivElement | undefined
let writer: AgentRunEventWriter | undefined

function Harness({ initial }: { readonly initial: AgentRunEventStore }) {
  writer = useAgentRunEvents(initial)
  return createElement('div', {
    'data-event-count': writer.store.events.length,
    'data-notice': writer.repositoryNotice ?? '',
  })
}

beforeEach(() => {
  transport.read.mockReset()
  transport.write.mockReset()
  setAuthorizedWorkspace(undefined)
  writer = undefined
})

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = undefined
  host = undefined
  setAuthorizedWorkspace(undefined)
})

async function render(initial: AgentRunEventStore) {
  host = document.createElement('div')
  document.body.append(host)
  await act(async () => {
    root = createRoot(host!)
    root.render(createElement(Harness, { initial }))
  })
}

describe('useAgentRunEvents repository integration', () => {
  it('rehydrates the live hook store when authorization is granted after mount', async () => {
    const local = replayRunEvents([
      createRunEvent('run.1', { type: 'run-started', mode: 'create' }, { eventId: 'start.1', at: 1 }),
      createRunEvent('run.1', { type: 'intent-recorded', intent: 'Hello' }, { eventId: 'user.1', at: 2 }),
      createRunEvent('run.1', { type: 'agent-message', message: 'First' }, { eventId: 'agent.1', at: 3 }),
      createRunEvent('run.1', { type: 'outcome-evaluated', status: 'satisfied', missing: [] }, { eventId: 'outcome.1', at: 4 }),
    ])
    const repository = replayRunEvents([
      ...local.events,
      createRunEvent('run.2', { type: 'run-started', mode: 'create' }, { eventId: 'start.2', at: 5 }),
      createRunEvent('run.2', { type: 'agent-message', message: 'Second', responseToEventId: 'user.1' }, { eventId: 'agent.2', at: 6 }),
      createRunEvent('run.2', { type: 'branch-selected', sourceEventId: 'user.1', responseEventId: 'agent.1' }, { eventId: 'selected', at: 7 }),
    ])
    transport.read.mockResolvedValue({ store: repository, sha256: digest, exists: true })
    transport.write.mockImplementation(async (_handle, _expected, store) => ({
      store,
      sha256: 'b'.repeat(64),
      exists: true,
    }))
    await render(local)

    expect(host?.firstElementChild?.getAttribute('data-event-count')).toBe('4')
    act(() => setAuthorizedWorkspace({ handle: 'workspace.opaque' }))

    await vi.waitFor(() => expect(host?.firstElementChild?.getAttribute('data-event-count')).toBe('7'))
    expect(writer?.store.events.at(-1)).toMatchObject({
      type: 'branch-selected',
      responseEventId: 'agent.1',
    })
    expect(transport.read).toHaveBeenCalledWith('workspace.opaque')
  })

  it('shows sanitized Git failure copy while preserving the live local store', async () => {
    const local = replayRunEvents([
      createRunEvent('run.1', { type: 'run-started', mode: 'create' }, { eventId: 'start.1', at: 1 }),
      createRunEvent('run.1', { type: 'outcome-evaluated', status: 'satisfied', missing: [] }, { eventId: 'outcome.1', at: 2 }),
    ])
    transport.read.mockResolvedValue({ store: local, sha256: digest, exists: true })
    transport.write.mockRejectedValue(new Error('credential sk-secret-value was rejected'))
    await render(local)
    act(() => setAuthorizedWorkspace({ handle: 'workspace.opaque' }))
    await vi.waitFor(() => expect(transport.read).toHaveBeenCalledOnce())

    act(() => { writer?.startRun('create', { runId: 'run.2', eventId: 'start.2', at: 3 }) })

    await vi.waitFor(() => expect(host?.firstElementChild?.getAttribute('data-notice')).toBe(REPOSITORY_AGENT_HISTORY_NOTICE))
    expect(host?.firstElementChild?.getAttribute('data-notice')).not.toContain('sk-secret-value')
    expect(writer?.store.events.map((event) => event.eventId)).toEqual(['start.1', 'outcome.1', 'start.2'])
  })
})

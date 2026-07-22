import { describe, expect, it, vi } from 'vitest'
import type { NativeBridge } from '@/platform/native'
import { createRunEvent, replayRunEvents } from './run-events'
import {
  bindRepositoryRunEventStoreLifecycle,
  createRepositoryRunEventStoreBridge,
  reconcileAgentRunEventStores,
  type RepositoryWorkspaceBinding,
} from './repository-run-event-store'

const digest = 'a'.repeat(64)
const store = replayRunEvents([
  createRunEvent(
    'run.1',
    { type: 'run-started', mode: 'create' },
    { eventId: 'event.1', at: 1 },
  ),
])

describe('repository Agent run-event store bridge', () => {
  it('reads a schema-validated store through an opaque workspace handle', async () => {
    const readRunEventStore = vi.fn(async () => ({
      store,
      sha256: digest,
      exists: true,
    }))
    const bridge = createRepositoryRunEventStoreBridge({ readRunEventStore })

    await expect(bridge.read('workspace.opaque')).resolves.toEqual({
      store,
      sha256: digest,
      exists: true,
    })
    expect(readRunEventStore).toHaveBeenCalledWith('workspace.opaque')
  })

  it('rejects malformed native payloads before they enter application state', async () => {
    const bridge = createRepositoryRunEventStoreBridge({
      readRunEventStore: vi.fn(async () => ({
        store: { version: 'agent-run-events.v1', events: 'not-an-array' },
        sha256: digest,
        exists: true,
      })),
    })

    await expect(bridge.read('workspace.opaque')).rejects.toThrow()
  })

  it('validates writes and passes no caller-controlled path to native code', async () => {
    const writeRunEventStore = vi.fn(async () => ({
      store,
      sha256: digest,
      exists: true,
    }))
    const bridge = createRepositoryRunEventStoreBridge({ writeRunEventStore })

    await expect(bridge.write('workspace.opaque', null, store)).resolves.toMatchObject({
      sha256: digest,
      exists: true,
    })
    expect(writeRunEventStore).toHaveBeenCalledWith('workspace.opaque', null, store)
  })

  it('rejects invalid expected digests and propagates native conflicts', async () => {
    const writeRunEventStore = vi.fn(async () => {
      throw new Error('Agent run-event store changed since it was read; reload before writing.')
    })
    const bridge = createRepositoryRunEventStoreBridge({ writeRunEventStore })

    await expect(bridge.write('workspace.opaque', 'bad', store)).rejects.toThrow()
    expect(writeRunEventStore).not.toHaveBeenCalled()
    await expect(bridge.write('workspace.opaque', digest, store)).rejects.toThrow('changed')
  })

  it('fails closed when the desktop transport is unavailable', async () => {
    const bridge = createRepositoryRunEventStoreBridge({} as Pick<
      NativeBridge,
      'readRunEventStore' | 'writeRunEventStore'
    >)

    await expect(bridge.read('workspace.opaque')).rejects.toThrow('unavailable')
    await expect(bridge.write('workspace.opaque', null, store)).rejects.toThrow('unavailable')
  })
})

describe('repository Agent run-event reconciliation', () => {
  const conversationStores = () => {
    const shared = [
      createRunEvent('run.1', { type: 'run-started', mode: 'create' }, { eventId: 'start.1', at: 1 }),
      createRunEvent('run.1', { type: 'intent-recorded', intent: 'Hello' }, { eventId: 'user.1', at: 2 }),
      createRunEvent('run.1', { type: 'agent-message', message: 'First', responseToEventId: 'user.1' }, { eventId: 'agent.1', at: 3 }),
    ]
    const repository = replayRunEvents([
      ...shared,
      createRunEvent('run.2', { type: 'run-started', mode: 'create' }, { eventId: 'start.2', at: 4 }),
      createRunEvent('run.2', { type: 'agent-message', message: 'Second', responseToEventId: 'user.1' }, { eventId: 'agent.2', at: 5 }),
      createRunEvent('run.2', { type: 'branch-selected', sourceEventId: 'user.1', responseEventId: 'agent.1' }, { eventId: 'selected.1', at: 6 }),
    ])
    const local = replayRunEvents([
      ...shared,
      createRunEvent('run.3', { type: 'run-started', mode: 'create' }, { eventId: 'start.3', at: 7 }),
      createRunEvent('run.3', { type: 'intent-recorded', intent: 'Continue', parentEventId: 'agent.1' }, { eventId: 'user.2', at: 8 }),
    ])
    return { local, repository }
  }

  it('unions repository and local history without duplicates and preserves source order', () => {
    const { local, repository } = conversationStores()
    const merged = reconcileAgentRunEventStores(local, repository)

    expect(merged.events.map((event) => event.eventId)).toEqual([
      'start.1', 'user.1', 'agent.1', 'start.2', 'agent.2', 'selected.1', 'start.3', 'user.2',
    ])
    expect(new Set(merged.events.map((event) => event.eventId)).size).toBe(merged.events.length)
    expect(merged.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'branch-selected', responseEventId: 'agent.1' }),
      expect.objectContaining({ type: 'intent-recorded', parentEventId: 'agent.1' }),
    ]))
  })

  it('deduplicates an identical legacy linear transcript', () => {
    const legacy = replayRunEvents([
      createRunEvent('legacy', { type: 'run-started', mode: 'create' }, { eventId: 'start', at: 1 }),
      createRunEvent('legacy', { type: 'intent-recorded', intent: 'Hello' }, { eventId: 'user', at: 2 }),
      createRunEvent('legacy', { type: 'agent-message', message: 'Hi' }, { eventId: 'agent', at: 3 }),
    ])

    expect(reconcileAgentRunEventStores(legacy, legacy).events).toEqual(legacy.events)
  })

  it('treats omitted optional fields and JSON-dropped undefined fields as identical', () => {
    const local = replayRunEvents([
      createRunEvent('run', { type: 'run-started', mode: 'create' }, { eventId: 'start', at: 1 }),
      createRunEvent('run', {
        type: 'intent-recorded', intent: 'Hello', parentEventId: undefined,
      }, { eventId: 'user', at: 2 }),
    ])
    const repository = replayRunEvents(JSON.parse(JSON.stringify(local.events)))

    expect(reconcileAgentRunEventStores(local, repository).events).toHaveLength(2)
  })

  it('fails closed on divergent payloads or incompatible event order', () => {
    const first = replayRunEvents([
      createRunEvent('run', { type: 'run-started', mode: 'create' }, { eventId: 'start', at: 1 }),
      createRunEvent('run', { type: 'intent-recorded', intent: 'First' }, { eventId: 'same', at: 2 }),
    ])
    const divergent = replayRunEvents([
      createRunEvent('run', { type: 'run-started', mode: 'create' }, { eventId: 'start', at: 1 }),
      createRunEvent('run', { type: 'intent-recorded', intent: 'Different' }, { eventId: 'same', at: 2 }),
    ])

    expect(() => reconcileAgentRunEventStores(first, divergent)).toThrow('divergent durable payloads')
  })
})

describe('repository Agent run-event lifecycle', () => {
  it('loads after authorization, restores branch selection, and writes the union through CAS', async () => {
    const { local, repository } = (() => {
      const shared = [
        createRunEvent('run.1', { type: 'run-started', mode: 'create' }, { eventId: 'start.1', at: 1 }),
        createRunEvent('run.1', { type: 'intent-recorded', intent: 'Hello' }, { eventId: 'user.1', at: 2 }),
        createRunEvent('run.1', { type: 'agent-message', message: 'First', responseToEventId: 'user.1' }, { eventId: 'agent.1', at: 3 }),
      ]
      return {
        local: replayRunEvents(shared),
        repository: replayRunEvents([
          ...shared,
          createRunEvent('run.2', { type: 'run-started', mode: 'create' }, { eventId: 'start.2', at: 4 }),
          createRunEvent('run.2', { type: 'agent-message', message: 'Second', responseToEventId: 'user.1' }, { eventId: 'agent.2', at: 5 }),
          createRunEvent('run.2', { type: 'branch-selected', sourceEventId: 'user.1', responseEventId: 'agent.1' }, { eventId: 'selected', at: 6 }),
        ]),
      }
    })()
    let currentWorkspace: RepositoryWorkspaceBinding | undefined
    let workspaceListener: ((workspace: RepositoryWorkspaceBinding | undefined) => void) | undefined
    let currentLocal = local
    const replaceLocalStore = vi.fn((next) => { currentLocal = next })
    const write = vi.fn(async (_handle, _expected, next) => ({ store: next, sha256: 'b'.repeat(64), exists: true }))
    const bridge = {
      read: vi.fn(async () => ({ store: repository, sha256: digest, exists: true })),
      write,
    }
    const lifecycle = bindRepositoryRunEventStoreLifecycle({
      bridge,
      getWorkspace: () => currentWorkspace,
      subscribe: (listener) => { workspaceListener = listener; return () => { workspaceListener = undefined } },
      getLocalStore: () => currentLocal,
      replaceLocalStore,
    })

    expect(bridge.read).not.toHaveBeenCalled()
    currentWorkspace = { handle: 'workspace.opaque' }
    workspaceListener?.(currentWorkspace)

    await vi.waitFor(() => expect(replaceLocalStore).toHaveBeenCalledOnce())
    expect(currentLocal.events).toEqual(repository.events)
    expect(currentLocal.events.at(-1)).toMatchObject({ type: 'branch-selected', responseEventId: 'agent.1' })
    expect(write).not.toHaveBeenCalled()

    const localUpdate = replayRunEvents([
      ...currentLocal.events,
      createRunEvent('run.3', { type: 'run-started', mode: 'create' }, { eventId: 'start.3', at: 7 }),
      createRunEvent('run.3', { type: 'intent-recorded', intent: 'Continue', parentEventId: 'agent.1' }, { eventId: 'user.2', at: 8 }),
    ])
    currentLocal = localUpdate
    lifecycle.persist(localUpdate)
    await vi.waitFor(() => expect(write).toHaveBeenCalledOnce())
    expect(write).toHaveBeenCalledWith('workspace.opaque', digest, localUpdate)
    lifecycle.dispose()
  })

  it.each([
    'Agent run-event store changed since it was read; reload before writing.',
    'Agent run-event store contains credential-shaped content.',
  ])('preserves local state when repository write rejects: %s', async (message) => {
    const initial = store
    let currentLocal = initial
    let workspaceListener: ((workspace: RepositoryWorkspaceBinding | undefined) => void) | undefined
    const onError = vi.fn()
    const bridge = {
      read: vi.fn(async () => ({ store: initial, sha256: digest, exists: true })),
      write: vi.fn(async () => { throw new Error(message) }),
    }
    const lifecycle = bindRepositoryRunEventStoreLifecycle({
      bridge,
      getWorkspace: () => undefined,
      subscribe: (listener) => { workspaceListener = listener; return () => { workspaceListener = undefined } },
      getLocalStore: () => currentLocal,
      replaceLocalStore: (next) => { currentLocal = next },
      onError,
    })
    workspaceListener?.({ handle: 'workspace.opaque' })
    await vi.waitFor(() => expect(bridge.read).toHaveBeenCalledOnce())
    const localUpdate = replayRunEvents([
      ...initial.events,
      createRunEvent('run.2', { type: 'run-started', mode: 'create' }, { eventId: 'local-only', at: 2 }),
    ])
    currentLocal = localUpdate
    lifecycle.persist(localUpdate)

    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce())
    expect(currentLocal).toEqual(localUpdate)
    expect(bridge.write).toHaveBeenCalledOnce()
    lifecycle.dispose()
  })
})

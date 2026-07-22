import { useCallback, useEffect, useRef, useState } from 'react'
import { publishAgentNotification } from '@/services/local/local-notifications'
import {
  getAuthorizedWorkspace,
  subscribeAuthorizedWorkspace,
} from '@/platform/authorized-workspace'
import { tauriBridge } from '@/platform/native'
import {
  bindRepositoryRunEventStoreLifecycle,
  createRepositoryRunEventStoreBridge,
  type RepositoryRunEventStoreLifecycle,
} from './repository-run-event-store'
import {
  appendRunEvent,
  createRunEvent,
  createRunEventStore,
  recoverInterruptedRunEvents,
  type AgentRunEventPayload,
  type AgentRunEventStore,
} from './run-events'

export interface AgentRunEventWriter {
  readonly store: AgentRunEventStore
  readonly repositoryNotice: string | null
  readonly startRun: (
    mode: 'create' | 'repair',
    options?: { readonly runId?: string; readonly at?: number; readonly eventId?: string },
  ) => string
  readonly record: (
    runId: string,
    event: Exclude<AgentRunEventPayload, { readonly type: 'run-started' }>,
    options?: { readonly at?: number; readonly eventId?: string },
  ) => void
  readonly recordMany: (events: readonly import('./run-events').AgentRunEvent[]) => void
}

export const REPOSITORY_AGENT_HISTORY_NOTICE =
  'Agent history could not be saved to Git; local history is preserved.'

/** React adapter over the pure event reducer. Callers retain the runId so late
 * async completions are rejected after a newer run becomes active. */
export function useAgentRunEvents(
  initial: AgentRunEventStore | null | undefined,
): AgentRunEventWriter {
  const [store, setStore] = useState<AgentRunEventStore>(() =>
    initial ? recoverInterruptedRunEvents(initial) : createRunEventStore(),
  )
  const [repositoryNotice, setRepositoryNotice] = useState<string | null>(null)
  const storeRef = useRef(store)
  storeRef.current = store
  const repositoryLifecycleRef = useRef<RepositoryRunEventStoreLifecycle | null>(null)

  useEffect(() => {
    const lifecycle = bindRepositoryRunEventStoreLifecycle({
      bridge: createRepositoryRunEventStoreBridge(tauriBridge),
      getWorkspace: getAuthorizedWorkspace,
      subscribe: subscribeAuthorizedWorkspace,
      getLocalStore: () => storeRef.current,
      replaceLocalStore: (next) => setStore(next),
      onError: () => {
        setRepositoryNotice(REPOSITORY_AGENT_HISTORY_NOTICE)
      },
      onSynchronized: () => setRepositoryNotice(null),
    })
    repositoryLifecycleRef.current = lifecycle
    return () => {
      repositoryLifecycleRef.current = null
      lifecycle.dispose()
    }
  }, [])

  useEffect(() => {
    repositoryLifecycleRef.current?.persist(store)
  }, [store])

  const startRun = useCallback<AgentRunEventWriter['startRun']>((mode, options) => {
    const runId = options?.runId ?? crypto.randomUUID()
    const event = createRunEvent(runId, { type: 'run-started', mode }, options)
    setStore((current) => appendRunEvent(current, event))
    return runId
  }, [])

  const record = useCallback<AgentRunEventWriter['record']>((runId, event, options) => {
    const recorded = createRunEvent(runId, event, options)
    setStore((current) => appendRunEvent(current, recorded))
    publishAgentNotification(recorded)
  }, [])

  const recordMany = useCallback<AgentRunEventWriter['recordMany']>((events) => {
    setStore((current) => events.reduce(appendRunEvent, current))
    events.forEach(publishAgentNotification)
  }, [])

  return { store, repositoryNotice, startRun, record, recordMany }
}

import { useCallback, useState } from 'react'
import {
  appendRunEvent,
  createRunEvent,
  createRunEventStore,
  replayRunEvents,
  type AgentRunEventPayload,
  type AgentRunEventStore,
} from './run-events'

export interface AgentRunEventWriter {
  readonly store: AgentRunEventStore
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

/** React adapter over the pure event reducer. Callers retain the runId so late
 * async completions are rejected after a newer run becomes active. */
export function useAgentRunEvents(
  initial: AgentRunEventStore | null | undefined,
): AgentRunEventWriter {
  const [store, setStore] = useState<AgentRunEventStore>(() =>
    initial ? replayRunEvents(initial.events) : createRunEventStore(),
  )

  const startRun = useCallback<AgentRunEventWriter['startRun']>((mode, options) => {
    const runId = options?.runId ?? crypto.randomUUID()
    const event = createRunEvent(runId, { type: 'run-started', mode }, options)
    setStore((current) => appendRunEvent(current, event))
    return runId
  }, [])

  const record = useCallback<AgentRunEventWriter['record']>((runId, event, options) => {
    const recorded = createRunEvent(runId, event, options)
    setStore((current) => appendRunEvent(current, recorded))
  }, [])

  const recordMany = useCallback<AgentRunEventWriter['recordMany']>((events) => {
    setStore((current) => events.reduce(appendRunEvent, current))
  }, [])

  return { store, startRun, record, recordMany }
}

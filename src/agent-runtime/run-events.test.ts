import { describe, expect, it } from 'vitest'
import {
  appendRunEvent,
  createRunEvent,
  createToolRetryEvent,
  createRunEventStore,
  recoverInterruptedRunEvents,
  replayRunEvents,
  type AgentRunEvent,
} from './run-events'

describe('agent run events', () => {
  it('records an append-only message revision without changing the run intent', () => {
    const store = replayRunEvents([
      createRunEvent('run', { type: 'run-started', mode: 'create' }, { eventId: 'start', at: 1 }),
      createRunEvent('run', { type: 'intent-recorded', intent: 'Make it blue' }, { eventId: 'intent', at: 2 }),
      createRunEvent('run', { type: 'message-revised', targetEventId: 'intent', message: 'Make it green' }, { eventId: 'revision', at: 3 }),
    ])
    expect(store.activeRun?.intent).toBe('Make it blue')
    expect(store.events.at(-1)).toMatchObject({ type: 'message-revised', targetEventId: 'intent', message: 'Make it green' })
  })
  it('projects the latest evidence when a material is regenerated in one run', () => {
    const store = replayRunEvents([
      createRunEvent('run', { type: 'run-started', mode: 'create' }, { eventId: 'start', at: 1 }),
      createRunEvent('run', {
        type: 'material-recorded',
        material: { id: 'page:home', kind: 'prototype-page', label: 'Home', source: 'agent', evidenceKey: 'page:home', revision: 'v1' },
      }, { eventId: 'material-v1', at: 2 }),
      createRunEvent('run', {
        type: 'material-recorded',
        material: { id: 'page:home', kind: 'prototype-page', label: 'Home', source: 'agent', evidenceKey: 'page:home', revision: 'v2' },
      }, { eventId: 'material-v2', at: 3 }),
    ])

    expect(store.activeRun?.materials).toEqual([
      expect.objectContaining({ id: 'page:home', evidenceKey: 'page:home', revision: 'v2' }),
    ])
  })
  it('records steer history without replacing the run intent', () => {
    const store = replayRunEvents([
      createRunEvent('run', { type: 'run-started', mode: 'create' }, { eventId: 'start', at: 1 }),
      createRunEvent('run', { type: 'intent-recorded', intent: 'Create a fitness app' }, { eventId: 'intent', at: 2 }),
      createRunEvent('run', { type: 'steer-recorded', instruction: 'Use a quieter green' }, { eventId: 'steer', at: 3 }),
    ])

    expect(store.activeRun?.intent).toBe('Create a fitness app')
    expect(store.events.at(-1)).toMatchObject({ type: 'steer-recorded', instruction: 'Use a quieter green' })
  })
  it('requires retries to use a new request id and preserves the predecessor link', () => {
    expect(createToolRetryEvent('run', 'tool', 'request-1', { requestId: 'request-2' })).toMatchObject({ previousRequestId: 'request-1', requestId: 'request-2' })
    expect(() => createToolRetryEvent('run', 'tool', 'request-1', { requestId: 'request-1' })).toThrow('new request id')
  })
  it('replays approval, retry linkage, and charged receipt on the existing tool projection', () => {
    const events = [
      createRunEvent('run-paid', { type: 'run-started', mode: 'create' }, { eventId: 'start', at: 1 }),
      createRunEvent('run-paid', {
        type: 'tool-approval-requested', toolCallId: 'tool-1', requestId: 'request-1', tool: 'image.generate', label: 'Generate hero',
        model: { providerId: 'openai', model: 'gpt-image-1' }, estimatedCost: { currency: 'USD', amount: 0.08, credits: 8 },
        budgetCeiling: { currency: 'USD', amount: 0.2, credits: 20 }, approvalPolicy: 'explicit', reason: 'Explicit approval is required.',
      }, { eventId: 'approval', at: 2 }),
      createRunEvent('run-paid', { type: 'tool-approved', toolCallId: 'tool-1', requestId: 'request-1', reason: 'Approved by user.' }, { eventId: 'approved', at: 3 }),
      createRunEvent('run-paid', { type: 'tool-retry-linked', toolCallId: 'tool-1', previousRequestId: 'request-1', requestId: 'request-2' }, { eventId: 'retry', at: 4 }),
      createRunEvent('run-paid', {
        type: 'tool-receipt-recorded', toolCallId: 'tool-1', receipt: {
          receiptId: 'receipt-1', requestId: 'request-2', capability: 'generate-image', providerId: 'openai', model: 'gpt-image-1', status: 'succeeded',
          charged: { currency: 'USD', amount: 0.07, credits: 7 }, outputArtifactIds: ['hero.png'], startedAt: 4, completedAt: 5,
        },
      }, { eventId: 'receipt', at: 5 }),
    ]
    const projection = replayRunEvents(events).activeRun?.tools['tool-1']
    expect(projection).toMatchObject({ requestId: 'request-2', previousRequestId: 'request-1', approvalStatus: 'required' })
    expect(projection?.receipt).toMatchObject({ receiptId: 'receipt-1', charged: { amount: 0.07 } })
  })
  it('replays observable run state without executing side effects', () => {
    const events: AgentRunEvent[] = [
      started('run-1', 'e-1', 1),
      { eventId: 'e-2', runId: 'run-1', at: 2, type: 'intent-recorded', intent: 'Create checkout assets' },
      {
        eventId: 'e-3',
        runId: 'run-1',
        at: 3,
        type: 'tool-started',
        toolCallId: 'tool-1',
        tool: 'image.generate',
        label: 'Generate checkout page',
        model: { providerId: 'openai', model: 'gpt-image-1' },
      },
      {
        eventId: 'e-4',
        runId: 'run-1',
        at: 4,
        type: 'tool-succeeded',
        toolCallId: 'tool-1',
        tool: 'image.generate',
        label: 'Generated checkout page',
        outputRefs: ['page:checkout'],
      },
      {
        eventId: 'e-5',
        runId: 'run-1',
        at: 5,
        type: 'material-recorded',
        material: {
          id: 'page:checkout',
          kind: 'prototype-page',
          label: 'Checkout',
          source: 'agent',
          evidenceKey: 'page:checkout',
        },
      },
      {
        eventId: 'e-6',
        runId: 'run-1',
        at: 6,
        type: 'outcome-evaluated',
        status: 'satisfied',
        missing: [],
      },
    ]

    const store = replayRunEvents(events)

    expect(store.activeRunId).toBe('run-1')
    expect(store.activeRun?.intent).toBe('Create checkout assets')
    expect(store.activeRun?.status).toBe('ready')
    expect(store.activeRun?.tools['tool-1']?.status).toBe('succeeded')
    expect(store.activeRun?.materials).toHaveLength(1)
    expect(store.events).toEqual(events)
  })

  it('is idempotent by event id', () => {
    let store = createRunEventStore()
    const event = started('run-1', 'same-id', 1)
    store = appendRunEvent(store, event)
    store = appendRunEvent(store, event)

    expect(store.events).toHaveLength(1)
  })

  it('isolates late events from a superseded run', () => {
    let store = replayRunEvents([
      started('run-1', 'start-1', 1),
      started('run-2', 'start-2', 2),
    ])
    store = appendRunEvent(store, {
      eventId: 'late',
      runId: 'run-1',
      at: 3,
      type: 'tool-succeeded',
      toolCallId: 'old-tool',
      tool: 'image.generate',
      label: 'Late output',
      outputRefs: ['page:late'],
    })

    expect(store.events.map((event) => event.eventId)).toEqual(['start-1', 'start-2'])
    expect(store.activeRunId).toBe('run-2')
  })

  it('treats cancellation as terminal for the active run', () => {
    let store = replayRunEvents([
      started('run-1', 'start', 1),
      { eventId: 'cancel', runId: 'run-1', at: 2, type: 'run-cancelled', reason: 'User stopped the run' },
    ])
    store = appendRunEvent(store, {
      eventId: 'late-material',
      runId: 'run-1',
      at: 3,
      type: 'material-recorded',
      material: { id: 'late', kind: 'prototype-page', label: 'Late', source: 'agent' },
    })

    expect(store.activeRun?.status).toBe('cancelled')
    expect(store.activeRun?.materials).toHaveLength(0)
    expect(store.events.map((event) => event.eventId)).toEqual(['start', 'cancel'])
  })

  it('closes a persisted running lifecycle after an app restart', () => {
    const recovered = recoverInterruptedRunEvents(
      replayRunEvents([
        started('run-1', 'start', 1),
        {
          eventId: 'tool',
          runId: 'run-1',
          at: 2,
          type: 'tool-started',
          toolCallId: 'tool-1',
          tool: 'edit-image',
          label: 'Refine selected visual',
        },
      ]),
      10,
    )

    expect(recovered.activeRun).toMatchObject({
      status: 'cancelled',
      cancelledReason: 'Interrupted when the app closed.',
    })
    expect(recovered.events.at(-1)).toMatchObject({
      type: 'run-cancelled',
      at: 10,
    })
  })

  it('rejects tool completion without a matching started event', () => {
    const store = replayRunEvents([
      started('run-1', 'start', 1),
      {
        eventId: 'orphan',
        runId: 'run-1',
        at: 2,
        type: 'tool-succeeded',
        toolCallId: 'missing',
        tool: 'image.generate',
        label: 'Generated image',
        outputRefs: ['image:1'],
      },
    ])

    expect(store.events.map((event) => event.eventId)).toEqual(['start'])
    expect(store.activeRun?.tools).toEqual({})
  })

  it('restores a persisted plain-object store through replay', () => {
    const saved = JSON.parse(JSON.stringify(replayRunEvents([
      started('run-1', 'start', 1),
      {
        eventId: 'fallback',
        runId: 'run-1',
        at: 2,
        type: 'capability-fallback',
        capability: 'web-search',
        detail: 'Provider does not support web search.',
      },
    ])))

    const restored = replayRunEvents(saved.events)

    expect(restored).toEqual(saved)
  })
})

function started(runId: string, eventId: string, at: number): AgentRunEvent {
  return { eventId, runId, at, type: 'run-started', mode: 'create' }
}

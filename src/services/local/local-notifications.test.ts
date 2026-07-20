import { describe, expect, it } from 'vitest'
import type { AgentRunEvent } from '@/agent-runtime/run-events'
import type { CompositeDeliveryReceipt } from '@/delivery-center/contracts'
import { appendLocalNotification, clearLocalNotifications, loadLocalNotifications, markLocalNotificationsRead, notificationFromAgentEvent, notificationFromDeliveryReceipt } from './local-notifications'

function memory() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
  }
}

type AgentRunEventInput = AgentRunEvent extends infer Event
  ? Event extends AgentRunEvent
    ? Omit<Event, 'eventId' | 'runId' | 'at'>
    : never
  : never

function event(value: AgentRunEventInput): AgentRunEvent {
  return { ...value, eventId: `event:${value.type}`, runId: 'run.one', at: 42 } as AgentRunEvent
}

describe('local notification projection', () => {
  it('projects only high-value Agent facts and never routine progress', () => {
    expect(notificationFromAgentEvent(event({ type: 'step-started', stepId: 's', label: 'Working' }))).toBeNull()
    expect(notificationFromAgentEvent(event({ type: 'tool-succeeded', toolCallId: 't', tool: 'image', label: 'Generated image', outputRefs: [] }))).toBeNull()
    expect(notificationFromAgentEvent(event({ type: 'outcome-evaluated', status: 'satisfied', missing: [] }))).toMatchObject({ kind: 'success', title: 'Result ready' })
    expect(notificationFromAgentEvent(event({ type: 'human-loop-asked', askId: 'ask', question: 'Choose a direction', choices: [{ id: 'a', label: 'A', description: 'First direction', impact: 'Uses the first direction' }, { id: 'b', label: 'B', description: 'Second direction', impact: 'Uses the second direction' }], defaultChoiceId: 'a' }))).toMatchObject({ kind: 'attention', title: 'Agent needs a decision' })
    expect(notificationFromAgentEvent(event({ type: 'tool-failed', toolCallId: 't', tool: 'image', label: 'Generate image', detail: 'Provider unavailable' }))).toMatchObject({ kind: 'failure', detail: 'Provider unavailable' })
  })

  it('replaces outcome status within one run instead of accumulating stale repair alerts', () => {
    const storage = memory()
    const repair = event({ type: 'outcome-evaluated', status: 'needs-repair', missing: [{ kind: 'prototype-page', count: 1, label: 'Planned prototype pages' }] })
    const ready = { ...event({ type: 'outcome-evaluated', status: 'satisfied', missing: [] }), eventId: 'event:outcome-ready', at: 43 }

    const repairNotification = notificationFromAgentEvent(repair)!
    const readyNotification = notificationFromAgentEvent(ready)!
    expect(repairNotification.id).toBe('agent:run.one:outcome')
    expect(readyNotification.id).toBe(repairNotification.id)

    appendLocalNotification(repairNotification, storage)
    appendLocalNotification(readyNotification, storage)
    expect(loadLocalNotifications(storage)).toEqual([
      expect.objectContaining({ id: 'agent:run.one:outcome', kind: 'success', title: 'Result ready' }),
    ])
  })

  it('collapses legacy per-event outcome notifications already stored for the same run', () => {
    const storage = memory()
    storage.setItem('cutout.notifications.v1', JSON.stringify([
      { id: 'agent:run.one:outcome:needs-repair:design-system:1', source: 'agent', kind: 'attention', title: 'Result needs repair', detail: 'Shared design system (1)', createdAt: 41, read: false },
      { id: 'agent:run.one:outcome:needs-repair:prototype-page:1', source: 'agent', kind: 'attention', title: 'Result needs repair', detail: 'Planned prototype pages (1)', createdAt: 42, read: false },
      { id: 'agent:run.two:outcome:satisfied:', source: 'agent', kind: 'success', title: 'Result ready', detail: 'Complete', createdAt: 40, read: false },
      { id: 'agent:event:tool-failed', source: 'agent', kind: 'failure', title: 'Generate failed', detail: 'Provider unavailable', createdAt: 39, read: false },
    ]))

    expect(loadLocalNotifications(storage).map((item) => item.id)).toEqual([
      'agent:run.one:outcome:needs-repair:prototype-page:1',
      'agent:run.two:outcome:satisfied:',
      'agent:event:tool-failed',
    ])
  })

  it('stays silent for auto-approved tool calls and never surfaces billing amounts', () => {
    const approval = {
      type: 'tool-approval-requested' as const,
      toolCallId: 't',
      requestId: 'r',
      tool: 'image',
      label: 'Generate design system',
      estimatedCost: { currency: 'USD' as const, amount: 0 },
      budgetCeiling: { currency: 'USD' as const, amount: 1 },
      approvalPolicy: 'auto-within-budget' as const,
      reason: 'Eligible for automatic approval within budget.',
    }
    expect(notificationFromAgentEvent(event(approval))).toBeNull()
    expect(notificationFromAgentEvent(event({ ...approval, pendingApproval: false }))).toBeNull()

    const pending = notificationFromAgentEvent(event({ ...approval, approvalPolicy: 'explicit', reason: 'Explicit approval is required.', pendingApproval: true }))
    expect(pending).toMatchObject({ kind: 'attention', title: 'Approval needed' })
    expect(pending?.detail).toContain('Generate design system')
    expect(`${pending?.title} ${pending?.detail}`).not.toMatch(/USD|estimates|\d+(\.\d+)?\s*(USD|\$|¥)|[$¥]\s*\d/)
  })

  it('deduplicates, bounds, marks read, and clears local history', () => {
    const storage = memory()
    for (let index = 0; index < 60; index += 1) appendLocalNotification({ id: `n:${index}`, source: 'agent', kind: 'success', title: 'Done', detail: 'Complete', createdAt: index, read: false }, storage)
    appendLocalNotification({ id: 'n:59', source: 'agent', kind: 'failure', title: 'Updated', detail: 'Changed', createdAt: 100, read: false }, storage)
    expect(loadLocalNotifications(storage)).toHaveLength(50)
    expect(loadLocalNotifications(storage)[0]).toMatchObject({ id: 'n:59', title: 'Updated' })
    expect(markLocalNotificationsRead(storage).every((item) => item.read)).toBe(true)
    clearLocalNotifications(storage)
    expect(loadLocalNotifications(storage)).toEqual([])
  })

  it('projects delivery truth without claiming partial delivery succeeded', () => {
    const receipt = {
      id: 'receipt.one', status: 'completed-with-failures', completedAt: '2026-07-12T00:00:00.000Z',
      targets: [{ status: 'succeeded' }, { status: 'failed' }],
    } as CompositeDeliveryReceipt
    expect(notificationFromDeliveryReceipt(receipt)).toEqual(expect.objectContaining({ id: 'delivery:receipt.one', kind: 'failure', title: 'Delivery needs attention', detail: '1 of 2 destinations delivered.' }))
  })

  it('rejects malformed or oversized persisted payloads', () => {
    const storage = memory()
    storage.setItem('cutout.notifications.v1', JSON.stringify([{ id: 'x', source: 'agent', kind: 'success', title: 'x', detail: 'x', createdAt: -1, read: false }]))
    expect(loadLocalNotifications(storage)).toEqual([])
  })
})

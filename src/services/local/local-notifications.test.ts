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

  it('replaces repair summaries across runs instead of accumulating stale alerts', () => {
    const storage = memory()
    const firstRepair = event({
      type: 'outcome-evaluated',
      status: 'needs-repair',
      missing: [
        { kind: 'design-system', count: 1, label: 'Shared design system' },
        { kind: 'cutout-slice', count: 4, label: 'Reusable materials' },
      ],
    })
    const latestRepair = {
      ...event({
        type: 'outcome-evaluated',
        status: 'needs-repair',
        missing: [
          { kind: 'design-system', count: 1, label: 'Shared design system' },
          { kind: 'design-markdown', count: 1, label: 'Portable DESIGN.md' },
          { kind: 'cutout-slice', count: 4, label: 'Reusable materials' },
        ],
      }),
      eventId: 'event:outcome-latest',
      runId: 'run.two',
      at: 43,
    }

    const firstNotification = notificationFromAgentEvent(firstRepair)!
    const latestNotification = notificationFromAgentEvent(latestRepair)!
    expect(firstNotification.id).toBe('agent:outcome')
    expect(latestNotification.id).toBe(firstNotification.id)

    appendLocalNotification(firstNotification, storage)
    expect(loadLocalNotifications(storage)).toEqual([
      expect.objectContaining({ id: 'agent:outcome', detail: 'Shared design system (1), Reusable materials (4)' }),
    ])
    appendLocalNotification(latestNotification, storage)
    expect(loadLocalNotifications(storage)).toEqual([
      expect.objectContaining({
        id: 'agent:outcome',
        kind: 'attention',
        title: 'Result needs repair',
        detail: 'Shared design system (1), Portable DESIGN.md (1), Reusable materials (4)',
      }),
    ])
  })

  it('rejects retired outcome IDs instead of migrating them', () => {
    const storage = memory()
    storage.setItem('cutout.notifications.v1', JSON.stringify([
      { id: 'agent:run.one:outcome:needs-repair:design-system:1', source: 'agent', kind: 'attention', title: 'Result needs repair', detail: 'Shared design system (1)', createdAt: 41, read: false },
      { id: 'agent:event:approval', source: 'agent', kind: 'attention', title: 'Approval needed', detail: 'Approve export.', createdAt: 40, read: false },
    ]))

    expect(loadLocalNotifications(storage)).toEqual([])
  })

  it('preserves unrelated ordering and read state while normalizing loaded history', () => {
    const storage = memory()
    storage.setItem('cutout.notifications.v1', JSON.stringify([
      { id: 'agent:outcome', source: 'agent', kind: 'success', title: 'Result ready', detail: 'Complete', createdAt: 40, read: false },
      { id: 'agent:event:approval', source: 'agent', kind: 'attention', title: 'Approval needed', detail: 'Newest approval state.', createdAt: 44, read: true },
      { id: 'agent:outcome', source: 'agent', kind: 'attention', title: 'Result needs repair', detail: 'Shared design system (1)', createdAt: 45, read: true },
      { id: 'delivery:receipt.one', source: 'delivery', kind: 'failure', title: 'Delivery needs attention', detail: '0 of 1 destinations delivered.', createdAt: 43, read: false },
      { id: 'agent:event:approval', source: 'agent', kind: 'attention', title: 'Approval needed', detail: 'Stale duplicate.', createdAt: 39, read: false },
    ]))

    expect(loadLocalNotifications(storage).map((item) => ({
      id: item.id,
      detail: item.detail,
      read: item.read,
    }))).toEqual([
      { id: 'agent:outcome', detail: 'Shared design system (1)', read: true },
      { id: 'agent:event:approval', detail: 'Newest approval state.', read: true },
      { id: 'delivery:receipt.one', detail: '0 of 1 destinations delivered.', read: false },
    ])
  })

  it('loads current records without action metadata and accepts actionable update records', () => {
    const storage = memory()
    storage.setItem('cutout.notifications.v1', JSON.stringify([
      { id: 'agent:event:done', source: 'agent', kind: 'success', title: 'Done', detail: 'Complete', createdAt: 41, read: true },
      { id: 'update:stable:1.2.0', source: 'update', kind: 'attention', title: 'Update available', detail: 'Cutout 1.2.0 is available.', createdAt: 42, read: false, action: { type: 'open-settings', section: 'updates-support', anchor: 'updates' } },
    ]))

    const loaded = loadLocalNotifications(storage)
    expect(loaded).toEqual([
      expect.objectContaining({ id: 'update:stable:1.2.0', action: { type: 'open-settings', section: 'updates-support', anchor: 'updates' } }),
      expect.objectContaining({ id: 'agent:event:done' }),
    ])
    expect(loaded[1]).not.toHaveProperty('action')
  })

  it('stays silent for auto-approved tool calls and never surfaces billing amounts', () => {
    const approval = {
      type: 'tool-approval-requested' as const,
      toolCallId: 't',
      requestId: 'r',
      tool: 'image',
      label: 'Generate design system',
      approvalPolicy: 'auto' as const,
      reason: 'Eligible for automatic approval by host policy.',
      pendingApproval: false,
    }
    expect(notificationFromAgentEvent(event(approval))).toBeNull()

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

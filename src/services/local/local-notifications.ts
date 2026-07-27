import { z } from 'zod'
import type { AgentRunEvent } from '@/agent-runtime/run-events'
import type { CompositeDeliveryReceipt } from '@/delivery-center/contracts'

const STORAGE_KEY = 'cutout.notifications.v1'
const CHANGE_EVENT = 'cutout:notifications-changed'
const MAX_ITEMS = 50

const notificationActionSchema = z.object({
  type: z.literal('open-settings'),
  section: z.literal('updates-support'),
  anchor: z.literal('updates'),
}).strict()

const notificationSchema = z.object({
  id: z.string().min(1).max(200),
  source: z.enum(['agent', 'delivery', 'update']),
  kind: z.enum(['success', 'attention', 'failure']),
  title: z.string().min(1).max(160),
  detail: z.string().min(1).max(500),
  createdAt: z.number().int().nonnegative(),
  read: z.boolean(),
  action: notificationActionSchema.optional(),
  deferredUntil: z.number().int().nonnegative().optional(),
}).strict()

const notificationListSchema = z.array(notificationSchema).max(MAX_ITEMS)
export type LocalNotification = z.infer<typeof notificationSchema>
type NotificationStorage = Pick<Storage, 'getItem' | 'setItem'>

function host(storage?: NotificationStorage): NotificationStorage | undefined {
  if (storage) return storage
  try { return globalThis.localStorage } catch { return undefined }
}

function safe(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.slice(0, limit) || 'No additional detail.'
}

function outcomeNotificationRunId(id: string): string | null {
  if (!id.startsWith('agent:')) return null
  const marker = id.lastIndexOf(':outcome')
  if (marker < 'agent:'.length) return null
  const suffix = id.slice(marker + ':outcome'.length)
  if (suffix !== '' && !suffix.startsWith(':')) return null
  return id.slice('agent:'.length, marker)
}

function collapseOutcomeHistory(items: readonly LocalNotification[]): readonly LocalNotification[] {
  const seenRuns = new Set<string>()
  return [...items]
    .sort((a, b) => b.createdAt - a.createdAt)
    .filter((item) => {
      const runId = outcomeNotificationRunId(item.id)
      if (!runId) return true
      if (seenRuns.has(runId)) return false
      seenRuns.add(runId)
      return true
    })
}

function loadStoredLocalNotifications(storage?: Pick<Storage, 'getItem'>): readonly LocalNotification[] {
  try {
    return notificationListSchema.parse(JSON.parse((storage ?? host())?.getItem(STORAGE_KEY) ?? '[]'))
  } catch {
    return []
  }
}

function visibleNotifications(items: readonly LocalNotification[], now: number): readonly LocalNotification[] {
  return collapseOutcomeHistory(items.filter((item) => !item.deferredUntil || item.deferredUntil <= now))
}

function notifyChanged(storage?: NotificationStorage): void {
  if (!storage && typeof globalThis.dispatchEvent === 'function') globalThis.dispatchEvent(new Event(CHANGE_EVENT))
}

export function loadLocalNotifications(
  storage?: Pick<Storage, 'getItem'>,
  now = Date.now(),
): readonly LocalNotification[] {
  return visibleNotifications(loadStoredLocalNotifications(storage), now)
}

export function appendLocalNotification(notification: LocalNotification, storage?: NotificationStorage): readonly LocalNotification[] {
  const target = host(storage)
  if (!target) return []
  const parsed = notificationSchema.parse(notification)
  const current = loadStoredLocalNotifications(target)
  const next = [parsed, ...current.filter((item) => item.id !== parsed.id)]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_ITEMS)
  target.setItem(STORAGE_KEY, JSON.stringify(next))
  notifyChanged(storage)
  return visibleNotifications(next, Date.now())
}

export function replaceLocalNotificationSource(
  notification: LocalNotification,
  storage?: NotificationStorage,
  options?: { readonly force?: boolean },
): { readonly notifications: readonly LocalNotification[]; readonly inserted: boolean } {
  const target = host(storage)
  if (!target) return { notifications: [], inserted: false }
  const parsed = notificationSchema.parse(notification)
  const current = loadStoredLocalNotifications(target)
  if (!options?.force && current.some((item) => item.id === parsed.id)) {
    return { notifications: visibleNotifications(current, Date.now()), inserted: false }
  }
  const next = [parsed, ...current.filter((item) => item.source !== parsed.source)]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_ITEMS)
  target.setItem(STORAGE_KEY, JSON.stringify(next))
  notifyChanged(storage)
  return { notifications: visibleNotifications(next, Date.now()), inserted: true }
}

export function deferLocalNotification(
  id: string,
  deferredUntil: number,
  storage?: NotificationStorage,
): readonly LocalNotification[] {
  const target = host(storage)
  if (!target) return []
  const next = loadStoredLocalNotifications(target).map((item) =>
    item.id === id && item.source === 'update'
      ? { ...item, read: false, deferredUntil: Math.max(0, Math.trunc(deferredUntil)) }
      : item,
  )
  target.setItem(STORAGE_KEY, JSON.stringify(next))
  notifyChanged(storage)
  return visibleNotifications(next, Date.now())
}

export function markLocalNotificationsRead(storage?: NotificationStorage): readonly LocalNotification[] {
  const target = host(storage)
  if (!target) return []
  const next = loadStoredLocalNotifications(target).map((item) => item.read ? item : { ...item, read: true })
  target.setItem(STORAGE_KEY, JSON.stringify(next))
  notifyChanged(storage)
  return visibleNotifications(next, Date.now())
}

export function clearLocalNotifications(storage?: NotificationStorage): void {
  const target = host(storage)
  if (!target) return
  target.setItem(STORAGE_KEY, '[]')
  notifyChanged(storage)
}

export function subscribeLocalNotifications(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => { if (event.key === STORAGE_KEY) listener() }
  globalThis.addEventListener?.(CHANGE_EVENT, listener)
  globalThis.addEventListener?.('storage', onStorage)
  return () => {
    globalThis.removeEventListener?.(CHANGE_EVENT, listener)
    globalThis.removeEventListener?.('storage', onStorage)
  }
}

export function notificationFromAgentEvent(event: AgentRunEvent): LocalNotification | null {
  const base = { id: `agent:${event.eventId}`, source: 'agent' as const, createdAt: event.at, read: false }
  switch (event.type) {
    case 'tool-approval-requested':
      if (event.pendingApproval !== true) return null
      return { ...base, kind: 'attention', title: 'Approval needed', detail: safe(`${event.label} requires your approval before it can run.`, 500) }
    case 'human-loop-asked':
      return { ...base, kind: 'attention', title: 'Agent needs a decision', detail: safe(event.question, 500) }
    case 'tool-failed':
    case 'step-failed':
      return { ...base, kind: 'failure', title: event.type === 'tool-failed' ? `${safe(event.label, 120)} failed` : `${safe(event.label, 120)} needs attention`, detail: safe(event.detail, 500) }
    case 'outcome-evaluated':
      // Outcome evaluation is current state, not an append-only activity item.
      // Keep one notification per run so repair -> ready replaces stale status.
      return event.status === 'satisfied'
        ? { ...base, id: `agent:${event.runId}:outcome`, kind: 'success', title: 'Result ready', detail: 'The requested outcome is complete.' }
        : { ...base, id: `agent:${event.runId}:outcome`, kind: 'attention', title: 'Result needs repair', detail: safe(event.missing.map((item) => `${item.label} (${item.count})`).join(', '), 500) }
    default:
      return null
  }
}

export function notificationFromDeliveryReceipt(receipt: CompositeDeliveryReceipt): LocalNotification {
  const succeeded = receipt.targets.filter((target) => target.status === 'succeeded').length
  return {
    id: `delivery:${receipt.id}`,
    source: 'delivery',
    kind: receipt.status === 'succeeded' ? 'success' : receipt.status === 'cancelled' ? 'attention' : 'failure',
    title: receipt.status === 'succeeded' ? 'Delivery complete' : receipt.status === 'cancelled' ? 'Delivery cancelled' : 'Delivery needs attention',
    detail: `${succeeded} of ${receipt.targets.length} destinations delivered.`,
    createdAt: Date.parse(receipt.completedAt),
    read: false,
  }
}

export function publishAgentNotification(event: AgentRunEvent): void {
  const notification = notificationFromAgentEvent(event)
  if (notification) appendLocalNotification(notification)
}

export function publishDeliveryNotification(receipt: CompositeDeliveryReceipt): void {
  appendLocalNotification(notificationFromDeliveryReceipt(receipt))
}

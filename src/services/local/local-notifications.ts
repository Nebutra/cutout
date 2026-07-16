import { z } from 'zod'
import type { AgentRunEvent } from '@/agent-runtime/run-events'
import type { CompositeDeliveryReceipt } from '@/delivery-center/contracts'

const STORAGE_KEY = 'cutout.notifications.v1'
const CHANGE_EVENT = 'cutout:notifications-changed'
const MAX_ITEMS = 50

const notificationSchema = z.object({
  id: z.string().min(1).max(200),
  source: z.enum(['agent', 'delivery']),
  kind: z.enum(['success', 'attention', 'failure']),
  title: z.string().min(1).max(160),
  detail: z.string().min(1).max(500),
  createdAt: z.number().int().nonnegative(),
  read: z.boolean(),
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

export function loadLocalNotifications(storage?: Pick<Storage, 'getItem'>): readonly LocalNotification[] {
  try {
    return notificationListSchema.parse(JSON.parse((storage ?? host())?.getItem(STORAGE_KEY) ?? '[]'))
  } catch {
    return []
  }
}

export function appendLocalNotification(notification: LocalNotification, storage?: NotificationStorage): readonly LocalNotification[] {
  const target = host(storage)
  if (!target) return []
  const parsed = notificationSchema.parse(notification)
  const current = loadLocalNotifications(target)
  const next = [parsed, ...current.filter((item) => item.id !== parsed.id)]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_ITEMS)
  target.setItem(STORAGE_KEY, JSON.stringify(next))
  if (!storage && typeof globalThis.dispatchEvent === 'function') globalThis.dispatchEvent(new Event(CHANGE_EVENT))
  return next
}

export function markLocalNotificationsRead(storage?: NotificationStorage): readonly LocalNotification[] {
  const target = host(storage)
  if (!target) return []
  const next = loadLocalNotifications(target).map((item) => item.read ? item : { ...item, read: true })
  target.setItem(STORAGE_KEY, JSON.stringify(next))
  if (!storage && typeof globalThis.dispatchEvent === 'function') globalThis.dispatchEvent(new Event(CHANGE_EVENT))
  return next
}

export function clearLocalNotifications(storage?: NotificationStorage): void {
  const target = host(storage)
  if (!target) return
  target.setItem(STORAGE_KEY, '[]')
  if (!storage && typeof globalThis.dispatchEvent === 'function') globalThis.dispatchEvent(new Event(CHANGE_EVENT))
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
      return { ...base, kind: 'attention', title: 'Approval needed', detail: safe(`${event.label} estimates ${event.estimatedCost.amount} ${event.estimatedCost.currency}.`, 500) }
    case 'human-loop-asked':
      return { ...base, kind: 'attention', title: 'Agent needs a decision', detail: safe(event.question, 500) }
    case 'tool-failed':
    case 'step-failed':
      return { ...base, kind: 'failure', title: event.type === 'tool-failed' ? `${safe(event.label, 120)} failed` : `${safe(event.label, 120)} needs attention`, detail: safe(event.detail, 500) }
    case 'outcome-evaluated':
      return event.status === 'satisfied'
        ? { ...base, kind: 'success', title: 'Result ready', detail: 'The requested outcome is complete.' }
        : { ...base, kind: 'attention', title: 'Result needs repair', detail: safe(event.missing.map((item) => `${item.label} (${item.count})`).join(', '), 500) }
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

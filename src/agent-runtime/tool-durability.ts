import { z } from 'zod'
import type { AgentRunEvent } from './run-events'
import type { PaidToolReceipt } from '@/control-protocol/paid-tool-contract'

export const durableToolStatusSchema = z.enum(['planned', 'in-flight', 'reconciling', 'succeeded', 'failed', 'cancelled'])
const safeText = z.string().max(1000).refine((value) => !/(?:\bBearer\s+|\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b)/i.test(value))
export const durableAttemptSchema = z.object({ attemptId: z.string().min(1).max(160), startedAt: z.number().nonnegative(), completedAt: z.number().nonnegative().optional(), status: z.enum(['in-flight', 'succeeded', 'failed', 'cancelled', 'reconciling']), receipt: z.unknown().optional(), error: safeText.optional() }).strict()
export const durableToolRequestSchema = z.object({ requestId: z.string().min(1).max(160), runId: z.string().min(1).max(160), toolCallId: z.string().min(1).max(160), capability: z.string().min(1).max(160), status: durableToolStatusSchema, createdAt: z.number().nonnegative(), updatedAt: z.number().nonnegative(), attempts: z.array(durableAttemptSchema) }).strict()
export const durableToolLedgerSchema = z.object({ version: z.literal('cutout.tool-ledger.v1'), revision: z.number().int().nonnegative(), requests: z.array(durableToolRequestSchema) }).strict()
export const durableEventOutboxSchema = z.object({ version: z.literal('cutout.tool-outbox.v1'), events: z.array(z.object({ id: z.string().min(1), requestId: z.string().min(1), event: z.unknown() }).strict()) }).strict()
export type DurableToolRequest = z.infer<typeof durableToolRequestSchema>

export interface ToolDurabilityStore {
  recover(): Promise<void>
  get(requestId: string): Promise<DurableToolRequest | null>
  plan(input: { requestId: string; runId: string; toolCallId: string; capability: string; at: number }): Promise<{ duplicate: boolean; request: DurableToolRequest }>
  begin(requestId: string, attemptId: string, at: number): Promise<DurableToolRequest>
  settle(requestId: string, attemptId: string, outcome: { status: 'succeeded' | 'failed' | 'cancelled'; receipt?: PaidToolReceipt; error?: string; at: number }, events: readonly AgentRunEvent[]): Promise<DurableToolRequest>
  drainEvents(deliver: (events: readonly AgentRunEvent[]) => void): Promise<number>
}

export function createMemoryToolDurabilityStore(): ToolDurabilityStore {
  let ledger: z.infer<typeof durableToolLedgerSchema> = { version: 'cutout.tool-ledger.v1', revision: 0, requests: [] }
  let outbox: z.infer<typeof durableEventOutboxSchema> = { version: 'cutout.tool-outbox.v1', events: [] }
  const mutate = (id: string, fn: (request: DurableToolRequest) => DurableToolRequest) => { let result: DurableToolRequest | undefined; ledger = { ...ledger, revision: ledger.revision + 1, requests: ledger.requests.map((request) => request.requestId === id ? (result = durableToolRequestSchema.parse(fn(request))) : request) }; if (!result) throw new Error(`Unknown durable tool request: ${id}`); return result }
  return {
    async recover() { ledger = recoverLedger(ledger) },
    async get(id) { return ledger.requests.find(({ requestId }) => requestId === id) ?? null },
    async plan(input) { const existing = ledger.requests.find(({ requestId }) => requestId === input.requestId); if (existing) return { duplicate: true, request: existing }; const { at, ...identity } = input; const request = durableToolRequestSchema.parse({ ...identity, status: 'planned', createdAt: at, updatedAt: at, attempts: [] }); ledger = { ...ledger, revision: ledger.revision + 1, requests: [...ledger.requests, request] }; return { duplicate: false, request } },
    async begin(id, attemptId, at) { return mutate(id, (request) => ({ ...request, status: 'in-flight', updatedAt: at, attempts: [...request.attempts, { attemptId, startedAt: at, status: 'in-flight' }] })) },
    async settle(id, attemptId, outcome, events) { const request = mutate(id, (current) => ({ ...current, status: outcome.status, updatedAt: outcome.at, attempts: current.attempts.map((attempt) => attempt.attemptId === attemptId ? { ...attempt, status: outcome.status, completedAt: outcome.at, ...(outcome.receipt ? { receipt: outcome.receipt } : {}), ...(outcome.error ? { error: sanitize(outcome.error) } : {}) } : attempt) })); outbox = { ...outbox, events: [...outbox.events, ...events.map((event) => ({ id: event.eventId, requestId: id, event: sanitizeValue(event) }))] }; return request },
    async drainEvents(deliver) { const events = outbox.events.map(({ event }) => event as AgentRunEvent); if (!events.length) return 0; deliver(events); outbox = { ...outbox, events: [] }; return events.length },
  }
}
export function recoverLedger(input: z.infer<typeof durableToolLedgerSchema>) { return { ...input, revision: input.revision + 1, requests: input.requests.map((request) => request.status === 'in-flight' ? { ...request, status: 'reconciling' as const, updatedAt: Date.now(), attempts: request.attempts.map((attempt) => attempt.status === 'in-flight' ? { ...attempt, status: 'reconciling' as const } : attempt) } : request) } }
export function sanitize(value: string) { return value.replace(/(?:\bBearer\s+\S+|\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b)/gi, '<redacted>').replace(/(?:\/Users\/|\/home\/|[A-Z]:\\)[^\s)]+/g, '<local-path>').slice(0, 1000) }
export function sanitizeValue(value: unknown): unknown { if (typeof value === 'string') return sanitize(value); if (Array.isArray(value)) return value.map(sanitizeValue); if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /(?:secret|credential|api[-_]?key|authorization)/i.test(key) ? '<redacted>' : sanitizeValue(item)])); return value }

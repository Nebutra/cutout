import { z } from 'zod'
import type { MoneyEstimate, PaidToolPolicy, PaidToolRequest } from '@/control-protocol/paid-tool-contract'

const STORAGE_KEY = 'cutout.paid-tool-preferences.v1'

const schema = z.object({
  version: z.literal('paid-tool-preferences.v1'),
  approvalPolicy: z.enum(['explicit', 'auto-within-budget']),
  budgetCeiling: z.object({
    currency: z.string().regex(/^[A-Z]{3}$/),
    amount: z.number().nonnegative().finite(),
    credits: z.number().nonnegative().finite().optional(),
  }).strict(),
}).strict()

export type PaidToolPreferences = z.infer<typeof schema>

export const defaultPaidToolPreferences: PaidToolPreferences = {
  version: 'paid-tool-preferences.v1',
  approvalPolicy: 'auto-within-budget',
  budgetCeiling: { currency: 'USD', amount: 0.25 },
}

export function loadPaidToolPreferences(storage?: Pick<Storage, 'getItem'>): PaidToolPreferences {
  try {
    const value = (storage ?? globalThis.document?.defaultView?.localStorage)?.getItem(STORAGE_KEY)
    return value ? schema.parse(JSON.parse(value)) : defaultPaidToolPreferences
  } catch {
    return defaultPaidToolPreferences
  }
}

export function savePaidToolPreferences(value: PaidToolPreferences, storage?: Pick<Storage, 'setItem'>): void {
  const host=storage??globalThis.document?.defaultView?.localStorage;if(!host)throw new Error('Paid tool preference storage host is unavailable.')
  host.setItem(STORAGE_KEY, JSON.stringify(schema.parse(value)))
}

export function paidToolPolicy(preferences: PaidToolPreferences): PaidToolPolicy {
  return { allowPaid: true, maxCost: preferences.budgetCeiling }
}

export function applyPaidToolPreferences(request: Omit<PaidToolRequest, 'budgetCeiling' | 'approvalPolicy'>, preferences: PaidToolPreferences): PaidToolRequest {
  return { ...request, budgetCeiling: preferences.budgetCeiling as MoneyEstimate, approvalPolicy: preferences.approvalPolicy }
}

import { describe, expect, it } from 'vitest'
import { applyPaidToolPreferences, defaultPaidToolPreferences, loadPaidToolPreferences, paidToolPolicy, savePaidToolPreferences } from './paid-tool-preferences'

describe('paid tool preferences', () => {
  it('persists only policy and non-secret budget data', () => {
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
    const preferences = { ...defaultPaidToolPreferences, approvalPolicy: 'explicit' as const, budgetCeiling: { currency: 'USD', amount: 1 } }
    savePaidToolPreferences(preferences, storage)
    expect(loadPaidToolPreferences(storage)).toEqual(preferences)
    expect([...values.values()].join('')).not.toMatch(/key|token|secret|Bearer/i)
  })

  it('falls back safely and applies one shared request/policy ceiling', () => {
    expect(loadPaidToolPreferences({ getItem: () => '{bad' })).toEqual(defaultPaidToolPreferences)
    const request = applyPaidToolPreferences({ capability: 'generate-image', intent: 'hero', inputArtifactIds: [] }, defaultPaidToolPreferences)
    expect(request).toMatchObject({ approvalPolicy: 'auto-within-budget', budgetCeiling: { amount: 0.25 } })
    expect(paidToolPolicy(defaultPaidToolPreferences)).toEqual({ allowPaid: true, maxCost: defaultPaidToolPreferences.budgetCeiling })
  })
})

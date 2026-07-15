import { describe, expect, it } from 'vitest'
import { planBrandViOperation } from './operations'

describe('Brand VI planning operation', () => {
  it('returns a reviewable custom DAG without executing paid actions', () => {
    const result = planBrandViOperation({ profile: 'custom', itemIds: ['b13.mascot.3d-render'] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.nodes.at(-1)?.itemId).toBe('b13.mascot.3d-render')
    expect(result.data.estimatedPaidActions).toBeGreaterThan(0)
    expect(result.data.requiresApproval).toBe(true)
    expect(result.data.nodes.every((node) => node.status === 'planned')).toBe(true)
  })

  it('returns a typed error for an invalid selection', () => {
    const result = planBrandViOperation({ profile: 'custom', itemIds: ['unknown'] })
    expect(result).toEqual({ ok: false, error: 'Unknown Brand VI item "unknown".' })
  })
})

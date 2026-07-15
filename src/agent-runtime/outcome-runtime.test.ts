import { describe, expect, it } from 'vitest'
import {
  applyOutcomeEvent,
  createOutcomeRuntime,
  evaluateOutcome,
  type OutcomeContract,
} from './outcome-runtime'

const contract: OutcomeContract = {
  id: 'checkout-flow',
  intent: 'Create a mobile checkout flow with reusable visual materials.',
  requirements: [
    { kind: 'design-system', minCount: 1, label: 'Shared design system' },
    { kind: 'prototype-page', minCount: 2, label: 'Checkout flow pages' },
    { kind: 'cutout-slice', minCount: 3, label: 'Reusable materials' },
  ],
}

describe('Outcome Runtime', () => {
  it('only completes when every material requirement is evidenced', () => {
    let state = createOutcomeRuntime(contract, 'run-1')
    state = applyOutcomeEvent(state, material('design-system', 'system', 'run-1'))
    state = applyOutcomeEvent(state, material('prototype-page', 'cart', 'run-1'))
    state = applyOutcomeEvent(state, material('prototype-page', 'checkout', 'run-1'))

    expect(state.evaluation.status).toBe('needs-repair')
    expect(state.evaluation.missing).toEqual([
      { kind: 'cutout-slice', count: 3, label: 'Reusable materials' },
    ])

    state = applyOutcomeEvent(state, material('cutout-slice', 'bag', 'run-1'))
    state = applyOutcomeEvent(state, material('cutout-slice', 'coupon', 'run-1'))
    state = applyOutcomeEvent(state, material('cutout-slice', 'success', 'run-1'))

    expect(state.evaluation.status).toBe('satisfied')
    expect(state.status).toBe('ready-to-deliver')
  })

  it('treats material events as idempotent evidence', () => {
    let state = createOutcomeRuntime(contract, 'run-1')
    const event = material('design-system', 'system', 'run-1')
    state = applyOutcomeEvent(state, event)
    state = applyOutcomeEvent(state, event)

    expect(state.materials).toHaveLength(1)
    expect(state.events).toHaveLength(1)
  })

  it('ignores late events from superseded runs', () => {
    let state = createOutcomeRuntime(contract, 'run-1')
    state = applyOutcomeEvent(state, { id: 'start-2', type: 'run-started', runId: 'run-2', at: 2 })
    state = applyOutcomeEvent(state, material('design-system', 'late', 'run-1'))

    expect(state.runId).toBe('run-2')
    expect(state.materials).toHaveLength(0)
    expect(state.events.map((event) => event.id)).toEqual(['start-2'])
  })

  it('keeps a failed or cancelled run repairable instead of delivering partial work', () => {
    let state = createOutcomeRuntime(contract, 'run-1')
    state = applyOutcomeEvent(state, {
      id: 'cancel',
      type: 'run-cancelled',
      runId: 'run-1',
      at: 3,
      reason: 'User revised the visual direction.',
    })

    expect(state.status).toBe('cancelled')
    expect(state.evaluation.status).toBe('needs-repair')
    expect(state.evaluation.missing).toHaveLength(3)
  })

  it('evaluates supplied material evidence without a session', () => {
    const evaluation = evaluateOutcome(contract, [
      { id: 'system', kind: 'design-system', label: 'System', source: 'agent' },
      { id: 'cart', kind: 'prototype-page', label: 'Cart', source: 'agent' },
      { id: 'checkout', kind: 'prototype-page', label: 'Checkout', source: 'agent' },
      { id: 'bag', kind: 'cutout-slice', label: 'Bag', source: 'algorithm' },
      { id: 'coupon', kind: 'cutout-slice', label: 'Coupon', source: 'algorithm' },
      { id: 'success', kind: 'cutout-slice', label: 'Success', source: 'algorithm' },
    ])

    expect(evaluation.status).toBe('satisfied')
    expect(evaluation.missing).toEqual([])
  })

  it('requires matching provenance for keyed requirements', () => {
    const keyedContract: OutcomeContract = {
      id: 'scoped-pages',
      intent: 'Deliver the scoped pages',
      requirements: [
        {
          kind: 'prototype-page',
          minCount: 1,
          label: 'Home page',
          expectedKeys: ['page:home'],
        },
      ],
    }

    expect(
      evaluateOutcome(keyedContract, [
        {
          id: 'page:settings',
          kind: 'prototype-page',
          label: 'Settings',
          source: 'agent',
          evidenceKey: 'page:settings',
        },
      ]).status,
    ).toBe('needs-repair')
    expect(
      evaluateOutcome(keyedContract, [
        {
          id: 'page:home',
          kind: 'prototype-page',
          label: 'Home',
          source: 'agent',
          evidenceKey: 'page:home',
        },
      ]).status,
    ).toBe('satisfied')
  })
})

function material(
  kind: 'design-system' | 'prototype-page' | 'cutout-slice',
  materialId: string,
  runId: string,
) {
  return {
    id: `material:${materialId}`,
    type: 'material-recorded' as const,
    runId,
    at: 1,
    material: {
      id: materialId,
      kind,
      label: materialId,
      source: kind === 'cutout-slice' ? ('algorithm' as const) : ('agent' as const),
    },
  }
}

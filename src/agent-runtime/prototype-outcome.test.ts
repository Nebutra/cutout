import { describe, expect, it } from 'vitest'
import type { PrototypePlan } from '@/prototype/prototype-plan'
import { projectPrototypeOutcome, prototypeOutcomeContract } from './prototype-outcome'

const plan = {
  version: 'prototype-plan.v0',
  product: {
    name: 'Checkout',
    summary: 'Checkout flow',
    audience: 'Shoppers',
    primaryGoal: 'Complete a purchase',
    platform: 'mobile',
  },
  designSystem: {
    styleSummary: 'Clear commerce UI',
    palette: ['white'],
    typography: 'Sans',
    spacing: '8px',
    componentPrinciples: ['Clear hierarchy'],
    assetDirection: 'Product imagery',
  },
  pages: [
    page('cart', 'Cart', 'board-cutout', ['product', 'coupon']),
    page('payment', 'Payment', 'ignore-code-ui', []),
  ],
  flows: [
    {
      id: 'checkout',
      name: 'Checkout',
      goal: 'Purchase',
      startPageId: 'cart',
      steps: [{ fromPageId: 'cart', interactionId: 'pay', toPageId: 'payment' }],
    },
  ],
  humanLoop: { mode: 'continue', rationale: 'Clear request' },
} satisfies PrototypePlan

describe('prototype outcome projection', () => {
  it('derives completion requirements from the selected plan scope', () => {
    const contract = prototypeOutcomeContract(plan, 'primary-flow')

    expect(contract.intent).toBe('Complete a purchase')
    expect(contract.requirements).toContainEqual({
      kind: 'prototype-page',
      minCount: 2,
      label: 'Planned prototype pages',
      expectedKeys: ['page:cart', 'page:payment'],
    })
    expect(contract.requirements).toContainEqual({
      kind: 'cutout-slice',
      minCount: 2,
      label: 'Reusable materials',
      expectedKeys: ['asset:cart-cart-main-1', 'asset:cart-cart-main-2'],
    })
  })

  it('only marks the workspace deliverable when all planned evidence exists', () => {
    const incomplete = projectPrototypeOutcome({
      plan,
      scope: 'primary-flow',
      hasDesignSystem: true,
      hasDesignMarkdown: true,
      pages: [{ page: { id: 'cart', name: 'Cart' } }],
      assets: [{ id: 'product', manifestItemId: 'cart-cart-main-1' }],
    })
    expect(incomplete?.status).toBe('running')
    expect(incomplete?.evaluation.missing).toEqual([
      { kind: 'prototype-page', count: 1, label: 'Planned prototype pages' },
      { kind: 'cutout-slice', count: 1, label: 'Reusable materials' },
    ])

    const complete = projectPrototypeOutcome({
      plan,
      scope: 'primary-flow',
      hasDesignSystem: true,
      hasDesignMarkdown: true,
      pages: [
        { page: { id: 'cart', name: 'Cart' } },
        { page: { id: 'payment', name: 'Payment' } },
      ],
      assets: [
        { id: 'product', manifestItemId: 'cart-cart-main-1' },
        { id: 'coupon', manifestItemId: 'cart-cart-main-2' },
      ],
    })
    expect(complete?.status).toBe('ready-to-deliver')
  })

  it('does not count duplicate artifact ids as separate evidence', () => {
    const outcome = projectPrototypeOutcome({
      plan,
      scope: 'primary-flow',
      hasDesignSystem: true,
      hasDesignMarkdown: true,
      pages: [
        { page: { id: 'cart', name: 'Cart' } },
        { page: { id: 'cart', name: 'Cart duplicate' } },
      ],
      assets: [
        { id: 'product', manifestItemId: 'cart-cart-main-1' },
        { id: 'product', manifestItemId: 'cart-cart-main-1' },
      ],
    })

    expect(outcome?.materials).toHaveLength(4)
    expect(outcome?.status).toBe('running')
    expect(outcome?.evaluation.missing).toEqual([
      { kind: 'prototype-page', count: 1, label: 'Planned prototype pages' },
      { kind: 'cutout-slice', count: 1, label: 'Reusable materials' },
    ])
  })

  it('does not accept stale slices before the current material pass settles', () => {
    const outcome = projectPrototypeOutcome({
      plan,
      scope: 'primary-flow',
      hasDesignSystem: true,
      hasDesignMarkdown: true,
      pages: [
        { page: { id: 'cart', name: 'Cart' } },
        { page: { id: 'payment', name: 'Payment' } },
      ],
      assets: [],
    })

    expect(outcome?.status).toBe('running')
    expect(outcome?.materials.some((material) => material.kind === 'cutout-slice')).toBe(false)
  })

  it('does not let out-of-scope pages or unproven slice names satisfy the plan', () => {
    const outcome = projectPrototypeOutcome({
      plan,
      scope: 'primary-flow',
      hasDesignSystem: true,
      hasDesignMarkdown: true,
      pages: [
        { page: { id: 'settings', name: 'Settings' } },
        { page: { id: 'profile', name: 'Profile' } },
      ],
      assets: [
        { id: 'one', manifestItemId: 'unrelated-one' },
        { id: 'two', manifestItemId: 'unrelated-two' },
      ],
    })

    expect(outcome?.evaluation.missing).toEqual([
      { kind: 'prototype-page', count: 2, label: 'Planned prototype pages' },
      { kind: 'cutout-slice', count: 2, label: 'Reusable materials' },
    ])
  })
})

function page(
  id: string,
  name: string,
  assetRoute: 'board-cutout' | 'ignore-code-ui',
  assetOpportunities: string[],
) {
  return {
    id,
    name,
    route: `/${id}`,
    purpose: name,
    viewport: { platform: 'mobile', width: 390, height: 844, scroll: 'single-screen' as const },
    regions: [
      {
        id: `${id}-main`,
        name: `${name} main`,
        role: 'main',
        summary: name,
        complexity: 'medium' as const,
        decompositionStrategy: 'direct' as const,
        assetRoute,
        assetOpportunities,
      },
    ],
    overlays: [],
    states: [],
    interactions: [],
  }
}

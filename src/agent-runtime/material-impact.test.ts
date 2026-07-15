import { describe, expect, it } from 'vitest'
import {
  assertImpactPlanCurrent,
  buildMaterialImpactPlan,
  reconcileMaterialSelection,
  type MaterialInventory,
  type MaterialRef,
} from './material-impact'

const inventory: MaterialInventory = {
  designSystemId: 'design-system',
  pageIds: ['home', 'checkout'],
  sliceIds: ['slice-1', 'slice-2'],
}

const page: MaterialRef = {
  id: 'checkout',
  kind: 'prototype-page',
  label: 'Checkout',
  version: 'page-v1',
  provenance: { source: 'prototype-generation' },
}

describe('material impact planning', () => {
  it('plans a selected page edit without regenerating unrelated materials', () => {
    expect(buildMaterialImpactPlan(page, inventory)).toEqual({
      target: page,
      effectiveTarget: page,
      scope: 'page',
      redo: ['page:checkout', 'all-slices'],
      preserve: ['design:design-system', 'page:home'],
      paidActionRequired: true,
      degradation: null,
      blockedReason: null,
    })
  })

  it('keeps project-level edits explicit when no material is selected', () => {
    const plan = buildMaterialImpactPlan(null, inventory)
    expect(plan.scope).toBe('project')
    expect(plan.redo).toEqual([
      'design:design-system',
      'page:home',
      'page:checkout',
      'all-slices',
    ])
    expect(plan.preserve).toEqual([])
  })

  it('degrades a slice edit to its source page because slices are not independently editable', () => {
    const slice: MaterialRef = {
      id: 'slice-1',
      kind: 'cutout-slice',
      label: 'Button',
      version: 'slice-v1',
      provenance: {
        source: 'page-deconstruction',
        sourcePageId: 'checkout',
        independentlyEditable: false,
      },
    }

    const plan = buildMaterialImpactPlan(slice, inventory)
    expect(plan.scope).toBe('page')
    expect(plan.effectiveTarget?.id).toBe('checkout')
    expect(plan.degradation).toContain('source page')
    expect(plan.blockedReason).toBeNull()
  })

  it('blocks a slice edit when its source page cannot be proven', () => {
    const slice: MaterialRef = {
      id: 'slice-1',
      kind: 'cutout-slice',
      label: 'Button',
      version: 'slice-v1',
      provenance: { source: 'page-deconstruction', independentlyEditable: false },
    }

    const plan = buildMaterialImpactPlan(slice, inventory)
    expect(plan.paidActionRequired).toBe(false)
    expect(plan.blockedReason).toContain('source page')
  })

  it('invalidates an old selection when the material disappears or changes version', () => {
    expect(reconcileMaterialSelection(page, [page])).toEqual(page)
    expect(reconcileMaterialSelection(page, [])).toBeNull()
    expect(reconcileMaterialSelection(page, [{ ...page, version: 'page-v2' }])).toBeNull()
  })

  it('rejects stale or blocked plans before a paid action can start', () => {
    const plan = buildMaterialImpactPlan(page, inventory)
    expect(() => assertImpactPlanCurrent(plan, page)).not.toThrow()
    expect(() => assertImpactPlanCurrent(plan, { ...page, version: 'page-v2' }))
      .toThrow('changed')

    const blocked = buildMaterialImpactPlan({
      id: 'slice-1',
      kind: 'cutout-slice',
      label: 'Button',
      version: 'slice-v1',
      provenance: { source: 'page-deconstruction', independentlyEditable: false },
    }, inventory)
    expect(() => assertImpactPlanCurrent(blocked, blocked.target)).toThrow('source page')
  })
})

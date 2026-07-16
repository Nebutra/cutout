import { describe, expect, it } from 'vitest'
import { createOutcomeRuntime, type OutcomeContract } from './outcome-runtime'
import { planPrototypeRepair, repairPlanLabel } from './prototype-repair'

const contract: OutcomeContract = {
  id: 'prototype',
  intent: 'Create a prototype',
  requirements: [
    { kind: 'design-system', minCount: 1, label: 'Design system' },
    { kind: 'design-markdown', minCount: 1, label: 'DESIGN.md' },
    { kind: 'prototype-page', minCount: 2, label: 'Pages' },
    { kind: 'cutout-slice', minCount: 3, label: 'Slices' },
  ],
}

describe('planPrototypeRepair', () => {
  it('maps missing outcomes to explicit minimal stages', () => {
    const outcome = createOutcomeRuntime(contract, 'run-1')

    expect(planPrototypeRepair(outcome, true)).toEqual({
      synthesizeDesignMarkdown: false,
      generateDesignSystem: true,
      generatePages: true,
      deconstructPages: true,
      targetRegionIds: [],
    })
  })

  it('repairs missing DESIGN.md without regenerating an existing design-system image', () => {
    const outcome = {
      ...createOutcomeRuntime(contract, 'run-1'),
      evaluation: {
        status: 'needs-repair' as const,
        missing: [{ kind: 'design-markdown' as const, count: 1, label: 'DESIGN.md' }],
      },
    }

    expect(planPrototypeRepair(outcome, true)).toEqual({
      synthesizeDesignMarkdown: true,
      generateDesignSystem: false,
      generatePages: false,
      deconstructPages: false,
      targetRegionIds: [],
    })
  })

  it('does not expose repair for satisfied or absent outcomes', () => {
    expect(planPrototypeRepair(null, false)).toBeNull()
    expect(planPrototypeRepair({
      ...createOutcomeRuntime(contract, 'run-1'),
      evaluation: { status: 'satisfied', missing: [] },
    }, true)).toBeNull()
  })

  it('describes only the material groups that will be repaired', () => {
    expect(repairPlanLabel({
      synthesizeDesignMarkdown: false,
      generateDesignSystem: false,
      generatePages: true,
      deconstructPages: true,
      targetRegionIds: [],
    })).toBe('Continue missing prototype pages, reusable materials')
  })

  it('carries failed region ids into the smallest retry plan', () => {
    const outcome = createOutcomeRuntime(contract, 'run-1')
    expect(planPrototypeRepair(outcome, true, ['hero', 'gallery'])?.targetRegionIds)
      .toEqual(['hero', 'gallery'])
  })
})

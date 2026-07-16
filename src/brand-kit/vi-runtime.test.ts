import { describe, expect, it } from 'vitest'
import { createBrandViGenerationPlan } from './vi-catalog'
import {
  approveBrandViItem,
  createBrandViRun,
  executableBrandViItems,
  recordBrandViItemReceipt,
} from './vi-runtime'

const at = '2026-07-15T00:00:00.000Z'

describe('Brand VI durable item runtime', () => {
  it('blocks dependent applications until approved masters have receipts', () => {
    const run = createBrandViRun(createBrandViGenerationPlan({ profile: 'custom', itemIds: ['b2.social-avatar'] }))
    expect(() => approveBrandViItem(run, 'b2.social-avatar', 'approval:avatar')).toThrow('unfinished dependencies')
  })

  it('binds each successful receipt to the approved action and unlocks dependents', () => {
    let run = createBrandViRun(createBrandViGenerationPlan({ profile: 'custom', itemIds: ['a1.logo.ink'] }))
    run = approveBrandViItem(run, 'a1.logo.standard', 'approval:logo')
    expect(executableBrandViItems(run).map((node) => node.itemId)).toEqual(['a1.logo.standard'])
    run = recordBrandViItemReceipt(run, {
      itemId: 'a1.logo.standard', approvalId: 'approval:logo', artifactIds: ['artifact:sha256:logo'], completedAt: at, status: 'succeeded',
    })
    run = approveBrandViItem(run, 'a1.logo.ink', 'approval:ink')
    expect(executableBrandViItems(run).map((node) => node.itemId)).toEqual(['a1.logo.ink'])
    expect(() => recordBrandViItemReceipt(run, {
      itemId: 'a1.logo.ink', approvalId: 'approval:other', artifactIds: ['artifact:sha256:ink'], completedAt: at, status: 'succeeded',
    })).toThrow('not bound')
  })

  it('never accepts a success without durable artifact ids', () => {
    let run = createBrandViRun(createBrandViGenerationPlan({ profile: 'minimum' }))
    run = approveBrandViItem(run, 'a1.logo.standard', 'approval:logo')
    expect(() => recordBrandViItemReceipt(run, {
      itemId: 'a1.logo.standard', approvalId: 'approval:logo', artifactIds: [], completedAt: at, status: 'succeeded',
    })).toThrow('without an artifact receipt')
  })
})

import { describe, expect, it } from 'vitest'
import {
  BRAND_VI_CATALOG,
  BRAND_VI_REQUIRED_ITEM_IDS,
  brandViCatalogSchema,
  createBrandViGenerationPlan,
  resolveBrandViExecutionRoute,
  validateBrandViCatalog,
} from './vi-catalog'

describe('Brand VI catalog v1', () => {
  it('covers every requested A1-A5 and B1-B13 deliverable as structured data', () => {
    expect(BRAND_VI_CATALOG.version).toBe('brand-vi-catalog.v1')
    expect(brandViCatalogSchema.parse(BRAND_VI_CATALOG)).toEqual(BRAND_VI_CATALOG)
    expect(new Set(BRAND_VI_CATALOG.items.map((item) => item.id))).toEqual(new Set(BRAND_VI_REQUIRED_ITEM_IDS))
    expect(BRAND_VI_CATALOG.items.every((item) =>
      item.requiredInputs.length > 0
      && item.formats.length > 0
      && item.variants.length > 0
      && item.qualityGates.length > 0
      && item.referenceLocks.length > 0
      && item.promptPolicy.forbidden.length > 0,
    )).toBe(true)
  })

  it('forms an acyclic foundation -> approved masters -> applications dependency graph', () => {
    const result = validateBrandViCatalog(BRAND_VI_CATALOG)
    expect(result.ok).toBe(true)

    const applications = BRAND_VI_CATALOG.items.filter((item) => item.stage === 'application')
    expect(applications.length).toBeGreaterThan(80)
    expect(applications.every((item) =>
      item.dependencies.includes('a1.logo.standard')
      && item.dependencies.includes('a3.color.standard')
      && item.approval.required,
    )).toBe(true)
  })

  it('uses selective profiles and never defaults to generating the full paid catalog', () => {
    const minimum = createBrandViGenerationPlan({ profile: 'minimum' })
    const core = createBrandViGenerationPlan({ profile: 'core' })
    const full = createBrandViGenerationPlan({ profile: 'full' })

    expect(minimum.requestedItemIds.length).toBeLessThan(core.requestedItemIds.length)
    expect(core.requestedItemIds.length).toBeLessThan(full.requestedItemIds.length)
    expect(minimum.nodes.some((node) => node.costClass === 'high')).toBe(false)
    expect(full.requestedItemIds).toHaveLength(BRAND_VI_CATALOG.items.length)
    expect(full.estimatedPaidActions).toBeGreaterThan(0)
    expect(full.requiresApproval).toBe(true)
  })

  it('expands dependencies, locks approved masters, and orders every dependency before its consumer', () => {
    const plan = createBrandViGenerationPlan({
      profile: 'custom',
      itemIds: ['b13.mascot.animated-motion', 'b2.app-icon'],
    })
    const order = new Map(plan.nodes.map((node, index) => [node.itemId, index]))

    expect(plan.requestedItemIds).toEqual(['b13.mascot.animated-motion', 'b2.app-icon'])
    expect(order.has('a1.logo.standard')).toBe(true)
    expect(order.has('b13.mascot.color-master')).toBe(true)
    for (const node of plan.nodes) {
      for (const dependency of node.dependencies) {
        expect(order.get(dependency)).toBeLessThan(order.get(node.itemId)!)
      }
    }
    expect(plan.nodes.find((node) => node.itemId === 'b2.app-icon')?.referenceLocks).toContain('approved:a1.logo.standard')
  })

  it('rejects unknown custom ids and cycles instead of silently degrading the plan', () => {
    expect(() => createBrandViGenerationPlan({ profile: 'custom', itemIds: ['not-real'] })).toThrow('Unknown Brand VI item')
    const broken = structuredClone(BRAND_VI_CATALOG)
    broken.items[0]!.dependencies = [broken.items[1]!.id]
    broken.items[1]!.dependencies = [broken.items[0]!.id]
    expect(validateBrandViCatalog(broken).ok).toBe(false)
  })

  it('routes every generation mode to an explicit runtime boundary with controlled extension points', () => {
    const modes = ['image-generate', 'image-edit', 'deterministic-compose', 'vector', 'manual-review'] as const
    expect(modes.map((mode) => resolveBrandViExecutionRoute(mode).target)).toEqual([
      'visual-generation', 'visual-generation', 'brand-kit-compose', 'vector-authoring', 'manual-review',
    ])
    const plan = createBrandViGenerationPlan({ profile: 'full' })
    expect(plan.nodes.every((node) => node.executionRoutes.length === node.generationModes.length)).toBe(true)
    expect(plan.nodes.flatMap((node) => node.executionRoutes).some((route) => route.extensionTargets.includes('figma-adapter'))).toBe(true)
    expect(plan.nodes.flatMap((node) => node.executionRoutes).some((route) => route.extensionTargets.includes('coding-agent'))).toBe(true)
  })
})

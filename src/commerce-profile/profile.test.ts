import { describe, expect, it } from 'vitest'
import { createKernelRegistry } from '@/design-os-kernel'
import { normalizeProductRecord } from './normalizer'
import {
  COMMERCE_CAPABILITY_IDS,
  COMMERCE_SEMANTIC_ROLES,
  createCommerceCapabilityCatalog,
  createCommerceEvidenceGraph,
  createCommerceOutcomeGraph,
  installCommerceProfileSchemas,
  commerceOutcomePayloadSchema,
} from './profile'
import { compileCommerceProduction } from './recipes'
import { fixtureProductRecord } from './commerce-profile.test-fixture'

describe('Commerce declarative Profile and Kernel compilation (P5)', () => {
  const facts = normalizeProductRecord({ file: 'product.json', contents: JSON.stringify(fixtureProductRecord) })

  it('installs removable schemas without changing the Kernel registry', () => {
    const kernelOnly = createKernelRegistry()
    const initial = kernelOnly.registrations().map((registration) => registration.reference.id)
    installCommerceProfileSchemas(kernelOnly)
    expect(kernelOnly.registrations().map((registration) => registration.reference.id))
      .toEqual(expect.arrayContaining(['commerce.localized-description', 'commerce.media-artifact']))
    expect(createKernelRegistry().registrations().map((registration) => registration.reference.id)).toEqual(initial)
  })

  it('composes the exact semantic role closure with shared facts, policy and identity locks', () => {
    const graph = createCommerceOutcomeGraph({ facts })
    const roles = graph.body.nodes.map((node) => commerceOutcomePayloadSchema.parse(node.payload).semanticRole)
    expect(roles.sort()).toEqual([...COMMERCE_SEMANTIC_ROLES].sort())
    expect(graph.body.nodes).toHaveLength(11)
    for (const node of graph.body.nodes) {
      expect(node.dependencies).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: 'lock', id: 'lock:commerce-product-identity' }),
        expect.objectContaining({ kind: 'lock', id: 'lock:commerce-creative-direction' }),
        expect.objectContaining({ kind: 'policy' }),
      ]))
      expect(node.dependencies.filter((dependency) => dependency.kind === 'evidence')).toHaveLength(facts.facts.length)
    }
  })

  it('compiles eleven bounded generic plan nodes with semantic capabilities and a strategy dependency closure', async () => {
    const evidenceGraph = createCommerceEvidenceGraph({ facts })
    const outcomeGraph = createCommerceOutcomeGraph({ facts })
    const { contract, plan } = await compileCommerceProduction({ evidenceGraph, outcomeGraph })
    const catalog = createCommerceCapabilityCatalog()
    expect(plan.body.nodes).toHaveLength(11)
    expect(contract.body.allowedCapabilityIds.sort()).toEqual(Object.values(COMMERCE_CAPABILITY_IDS).sort())
    expect(catalog.body.entries.map((entry) => entry.id).sort()).toEqual(Object.values(COMMERCE_CAPABILITY_IDS).sort())
    const mainPlanNode = plan.body.nodes.find((node) => node.outcomeNodeId === 'outcome:commerce:main-image')!
    const videoPlanNode = plan.body.nodes.find((node) => node.outcomeNodeId === 'outcome:commerce:product-video')!
    const strategyPlanNode = plan.body.nodes.find((node) => node.outcomeNodeId === 'outcome:commerce:strategy-document')!
    expect(videoPlanNode.dependencyNodeIds).toContain(mainPlanNode.id)
    expect(strategyPlanNode.dependencyNodeIds).toHaveLength(10)
    expect(plan.body.nodes.every((node) => node.maxAttempts === 2 && node.deadlineMs > 0)).toBe(true)
  })
})

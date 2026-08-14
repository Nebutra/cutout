import { describe, expect, it } from 'vitest'
import {
  COMMERCE_PROFILE_ID,
  COMMERCE_SEMANTIC_ROLES,
  buildAttributeIndex,
  buildCategoryIndex,
  createCommerceEvidenceGraph,
  createCommerceOutcomeGraph,
  evaluateCommerceProduction,
  normalizeProductRecord,
  compileCommerceProduction,
} from '@/commerce-profile'
import {
  fixtureAttributeCatalog,
  fixtureCategoryCatalog,
  fixtureProductRecord,
} from '@/commerce-profile/commerce-profile.test-fixture'
import { canonicalJson, fingerprint } from '@/design-ir/fingerprint'
import { artifactGraphSchema } from '@/design-os-kernel/contracts'
import { collectProfileProposals, universalBriefSchema } from './brief'
import { resolveProfileClosure } from './closure'
import { createProfileBindingRegistries } from './registries'
import {
  commerceProfileEvaluationInputSchema,
  compileCommerceThroughProfileAdapter,
  createCommerceProfileAdapterPackage,
  projectCommerceOutcomeScore,
} from './commerce-adapter'

async function installedCommerce() {
  const adapter = await createCommerceProfileAdapterPackage()
  const closure = await resolveProfileClosure({
    kernelVersion: '1.2.0',
    rootProfiles: [{
      profileId: adapter.manifest.id,
      version: adapter.manifest.version,
      contentHash: adapter.manifest.contentHash,
    }],
    availableManifests: [adapter.manifest],
    registrations: adapter.registrations,
    libraryLocks: [],
  })
  return { adapter, closure }
}

async function commerceBrief() {
  const facts = normalizeProductRecord({ file: 'product.json', contents: JSON.stringify(fixtureProductRecord) })
  const factEvidence = await Promise.all(facts.facts.map(async (fact) => ({
    id: fact.id,
    revision: `${fact.id}:revision:1`,
    schema: { id: 'commerce.product-fact', version: 1 },
    value: fact,
    provenance: [{
      sourceId: 'source:product-record',
      revision: 'source:product-record:revision:1',
      relation: 'normalized-from',
      contentHash: await fingerprint(fact),
    }],
  })))
  return {
    facts,
    brief: universalBriefSchema.parse({
      version: 'design-profile.universal-brief.v1',
      id: 'brief:commerce-production',
      revision: 'brief:commerce-production:revision:1',
      goal: {
        statement: 'Produce an evidence-bound Commerce material family.',
        successCriteria: ['Every declared Commerce role passes its domain gates.'],
      },
      audience: [{
        id: 'audience:commerce-buyer',
        description: 'A buyer evaluating an AliExpress product listing.',
        needs: ['Accurate product identity and localized information.'],
      }],
      desiredExperience: [],
      evidence: [{
        id: 'evidence:commerce-product-facts',
        revision: 'evidence:commerce-product-facts:revision:1',
        schema: { id: 'commerce.product-facts', version: 1 },
        value: facts,
        provenance: [{
          sourceId: 'source:product-record',
          revision: 'source:product-record:revision:1',
          relation: 'normalized-from',
          contentHash: await fingerprint(facts),
        }],
      }, ...factEvidence],
      unknowns: facts.requiredUnknownFactIds.map((id) => ({
        id,
        question: `Resolve required product fact ${id}.`,
        blocking: true,
      })),
      invariants: [],
      rights: { declarations: [], unresolved: [] },
      deliverables: COMMERCE_SEMANTIC_ROLES.map((roleId) => ({
        id: `deliverable:${roleId}`,
        description: `Produce the required ${roleId} Commerce material.`,
        required: true,
        schema: roleId.startsWith('localized-description')
          ? { id: 'commerce.localized-description', version: 1 }
          : roleId === 'strategy-document'
            ? { id: 'commerce.strategy-document', version: 1 }
            : { id: 'commerce.media-artifact', version: 1 },
      })),
      budgets: { attempts: 24, artifacts: 24, bytes: 260 * 1024 * 1024, timeMs: 1_500_000, spendUnits: 100 },
      risk: { tolerance: 'low', items: [] },
    }),
  }
}

function emptyEvaluationInput(facts: ReturnType<typeof normalizeProductRecord>) {
  const categoryIndex = buildCategoryIndex(fixtureCategoryCatalog)
  const attributeIndex = buildAttributeIndex(fixtureAttributeCatalog, categoryIndex)
  const outcomeGraph = createCommerceOutcomeGraph({ facts })
  return { categoryIndex, attributeIndex, outcomeGraph }
}

describe('Commerce Profile Platform adapter parity', () => {
  it('resolves only executable bindings through an exact declarative closure', async () => {
    const { adapter, closure } = await installedCommerce()
    const registries = createProfileBindingRegistries()
    adapter.registerTrustedBindings(registries)

    expect(closure.manifests[0]?.id).toBe(COMMERCE_PROFILE_ID)
    expect(adapter.manifest.requiredRoleClosures[0]?.roles.map(({ roleId }) => roleId).sort())
      .toEqual([...COMMERCE_SEMANTIC_ROLES].sort())
    expect(adapter.manifest.recipes).toEqual([])
    expect(adapter.manifest.policies).toEqual([])
    expect(adapter.registrations).toHaveLength(9)
    expect(registries.compilers.registrations()).toHaveLength(1)
    expect(registries.evaluators.registrations()).toHaveLength(1)
    expect(registries.renderers.registrations()).toHaveLength(1)
    expect(registries.inspectors.registrations()).toHaveLength(1)
    expect(registries.semanticActions.registrations()).toHaveLength(1)
    expect(registries.delivery.registrations()).toHaveLength(1)
    expect(registries.evidenceBenchmarkAdapters.registrations()).toHaveLength(1)
    expect(registries.outcomeScorecardAdapters.registrations()).toHaveLength(1)
  })

  it('compiles the real Commerce Outcome fragments from an exact Universal Brief evidence closure', async () => {
    const { adapter, closure } = await installedCommerce()
    const registries = createProfileBindingRegistries()
    adapter.registerTrustedBindings(registries)
    const { facts, brief } = await commerceBrief()
    const compiler = adapter.manifest.compilers[0]!
    const result = await collectProfileProposals({
      brief,
      profiles: [{
        profileId: adapter.manifest.id,
        profileVersion: adapter.manifest.version,
        manifestDigest: adapter.manifest.contentHash,
        compiler,
        source: {
          sourceId: adapter.manifest.id,
          revision: adapter.manifest.version,
          relation: 'profile-proposal',
          contentHash: adapter.manifest.contentHash,
        },
      }],
      compilers: registries.compilers,
      closure,
    })
    const expectedNodes = createCommerceOutcomeGraph({ facts }).body.nodes

    expect(result.proposals).toHaveLength(1)
    expect(result.proposals[0]?.fragments.flatMap(({ nodes }) => nodes).map(({ id }) => id).sort())
      .toEqual(expectedNodes.map(({ id }) => id).sort())
    expect(result.proposals[0]?.provenance).toContainEqual(expect.objectContaining({
      sourceId: 'evidence:commerce-product-facts',
      contentHash: await fingerprint(facts),
    }))

    const stale = structuredClone(brief)
    stale.evidence.find(({ id }) => id === facts.facts[0]!.id)!.provenance[0]!.contentHash = 'f'.repeat(64)
    await expect(collectProfileProposals({
      brief: stale,
      profiles: [{
        profileId: adapter.manifest.id,
        profileVersion: adapter.manifest.version,
        manifestDigest: adapter.manifest.contentHash,
        compiler,
        source: {
          sourceId: adapter.manifest.id,
          revision: adapter.manifest.version,
          relation: 'profile-proposal',
          contentHash: adapter.manifest.contentHash,
        },
      }],
      compilers: registries.compilers,
      closure,
    })).rejects.toThrow(/fact evidence is missing or stale/)
  })

  it('preserves canonical Commerce graph, Contract and Plan semantics', async () => {
    const facts = normalizeProductRecord({ file: 'product.json', contents: JSON.stringify(fixtureProductRecord) })
    const evidenceGraph = createCommerceEvidenceGraph({ facts })
    const outcomeGraph = createCommerceOutcomeGraph({ facts })
    const sourceImageArtifactIds = [`artifact:sha256:${'a'.repeat(64)}`]
    const direct = await compileCommerceProduction({ evidenceGraph, outcomeGraph, sourceImageArtifactIds })
    const adapted = await compileCommerceThroughProfileAdapter({ evidenceGraph, outcomeGraph, sourceImageArtifactIds })

    expect(canonicalJson(adapted)).toBe(canonicalJson(direct))
    expect(adapted.plan.body.nodes).toHaveLength(11)
  })

  it('preserves Commerce evaluation blockers through the registered evaluator', async () => {
    const facts = normalizeProductRecord({ file: 'product.json', contents: JSON.stringify(fixtureProductRecord) })
    const evidenceGraph = createCommerceEvidenceGraph({ facts })
    const { categoryIndex, attributeIndex, outcomeGraph } = emptyEvaluationInput(facts)
    const { plan } = await compileCommerceProduction({
      evidenceGraph,
      outcomeGraph,
      sourceImageArtifactIds: [`artifact:sha256:${'a'.repeat(64)}`],
    })
    const parameters = commerceProfileEvaluationInputSchema.parse({
      facts,
      categoryIndex,
      attributeIndex,
      outcomeGraph,
      plan,
      publications: [],
      receipts: [],
    })
    const direct = evaluateCommerceProduction(parameters)
    const outcome = outcomeGraph.body.nodes[0]!
    const expectedCodes = direct.findings.filter(({ outcomeNodeId }) => (
      outcomeNodeId === outcome.id || outcomeNodeId === 'outcome:commerce:profile'
    )).map(({ code }) => code)
    const adapter = await createCommerceProfileAdapterPackage()
    const registries = createProfileBindingRegistries()
    adapter.registerTrustedBindings(registries)
    const adapted = registries.evaluators.evaluate(adapter.manifest.evaluators[0]!, {
      parameters,
      outcome,
      evidenceGraph,
      artifactGraph: artifactGraphSchema.parse({
        protocol: 'design-os.protocol.v1',
        kind: 'artifact-graph',
        schema: { id: 'design-os.artifact-graph', version: 1 },
        identity: { id: 'artifacts:commerce-empty', revision: 'artifacts:commerce-empty:revision:1' },
        provenance: [],
        body: { nodes: [], dependencies: [] },
      }),
    })

    expect(adapted.status).toBe('blocked')
    expect(adapted.artifactIds).toEqual([])
    expect(adapted.reasons.map(({ code }) => code)).toEqual(expectedCodes)
    expect(adapted.reasons.every(({ nodeId }) => nodeId === outcome.id)).toBe(true)
  })

  it('recomputes Outcome quality from strict domain inputs and does not accept a caller-authored score summary', async () => {
    const facts = normalizeProductRecord({ file: 'product.json', contents: JSON.stringify(fixtureProductRecord) })
    const evidenceGraph = createCommerceEvidenceGraph({ facts })
    const { categoryIndex, attributeIndex, outcomeGraph } = emptyEvaluationInput(facts)
    const { plan } = await compileCommerceProduction({
      evidenceGraph,
      outcomeGraph,
      sourceImageArtifactIds: [`artifact:sha256:${'a'.repeat(64)}`],
    })
    const input = commerceProfileEvaluationInputSchema.parse({
      facts,
      categoryIndex,
      attributeIndex,
      outcomeGraph,
      plan,
      publications: [],
      receipts: [],
    })
    const score = projectCommerceOutcomeScore(input)
    const registries = createProfileBindingRegistries()
    const adapter = await createCommerceProfileAdapterPackage()
    adapter.registerTrustedBindings(registries)
    const registeredScore = registries.outcomeScorecardAdapters.project(
      adapter.manifest.outcomeScorecardAdapters[0]!,
      input,
    )

    expect(score).toEqual({
      profileId: COMMERCE_PROFILE_ID,
      rulerId: 'ruler:commerce-outcome:v1',
      score: 0,
      maximumScore: COMMERCE_SEMANTIC_ROLES.length,
      ready: false,
    })
    expect(registeredScore.criteria[0]).toEqual(expect.objectContaining({
      score: 0,
      maximumScore: COMMERCE_SEMANTIC_ROLES.length,
    }))
    expect(registeredScore).not.toHaveProperty('metrics')
    expect(() => registries.outcomeScorecardAdapters.project(
      adapter.manifest.outcomeScorecardAdapters[0]!,
      { ready: true, validArtifactIds: COMMERCE_SEMANTIC_ROLES },
    )).toThrow()
  })

  it('registers only an asynchronous retained-evidence verifier for maturity', async () => {
    const adapter = await createCommerceProfileAdapterPackage()
    const registries = createProfileBindingRegistries()
    adapter.registerTrustedBindings(registries)

    expect(adapter.manifest.evidenceBenchmarkAdapters).toHaveLength(1)
    expect(registries.evidenceBenchmarkAdapters.registrations()).toHaveLength(1)
    await expect(registries.evidenceBenchmarkAdapters.verifyAndProject(
      adapter.manifest.evidenceBenchmarkAdapters[0]!,
      { productionReady: true, metrics: [] },
    )).rejects.toThrow()
  })
})

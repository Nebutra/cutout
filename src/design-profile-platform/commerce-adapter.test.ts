import { describe, expect, it } from 'vitest'
import { canonicalJson } from '@/design-ir/fingerprint'
import currentCommerceBenchmark from '@/commerce-profile/benchmarks/current.json'
import {
  buildAttributeIndex,
  buildCategoryIndex,
  createCommerceEvidenceGraph,
  createCommerceOutcomeGraph,
  evaluateCommerceProduction,
  normalizeProductRecord,
  compileCommerceProduction,
  COMMERCE_PROFILE_ID,
  COMMERCE_SEMANTIC_ROLES,
} from '@/commerce-profile'
import {
  fixtureAttributeCatalog,
  fixtureCategoryCatalog,
  fixtureProductRecord,
  fixtureReceiptsAndPublications,
} from '@/commerce-profile/commerce-profile.test-fixture'
import { resolveProfileClosure } from './closure'
import { createProfileBindingRegistries } from './registries'
import {
  compileCommerceThroughProfileAdapter,
  createCommerceProfileAdapterPackage,
  projectCommerceOutcomeScore,
} from './commerce-adapter'

describe('Commerce Profile Platform adapter parity', () => {
  it('resolves the existing Commerce domain through an exact declarative closure', async () => {
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
    expect(closure.manifests[0]?.id).toBe(COMMERCE_PROFILE_ID)
    expect(adapter.manifest.requiredRoleClosures[0]?.roles.map(({ roleId }) => roleId).sort())
      .toEqual([...COMMERCE_SEMANTIC_ROLES].sort())
    expect(adapter.manifest.identityBindings.map(({ id }) => id).sort()).toEqual([
      'lock:commerce-creative-direction', 'lock:commerce-product-identity',
    ])
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

  it('preserves Commerce evaluation and keeps Outcome score separate from maturity', async () => {
    const facts = normalizeProductRecord({ file: 'product.json', contents: JSON.stringify(fixtureProductRecord) })
    const categoryIndex = buildCategoryIndex(fixtureCategoryCatalog)
    const attributeIndex = buildAttributeIndex(fixtureAttributeCatalog, categoryIndex)
    const evidenceGraph = createCommerceEvidenceGraph({ facts })
    const outcomeGraph = createCommerceOutcomeGraph({ facts })
    const { plan } = await compileCommerceThroughProfileAdapter({
      evidenceGraph, outcomeGraph, sourceImageArtifactIds: [`artifact:sha256:${'a'.repeat(64)}`],
    })
    const mocked = fixtureReceiptsAndPublications({ facts, categoryIndex, attributeIndex, outcomeGraph, plan })
    const evaluation = evaluateCommerceProduction({
      facts, categoryIndex, attributeIndex, outcomeGraph, plan, ...mocked,
    })
    const score = projectCommerceOutcomeScore(evaluation)
    const registries = createProfileBindingRegistries()
    const adapter = await createCommerceProfileAdapterPackage()
    adapter.registerTrustedBindings(registries)
    const registeredScore = registries.outcomeScorecardAdapters.project(
      adapter.manifest.outcomeScorecardAdapters[0]!, evaluation,
    )
    const maturity = registries.evidenceBenchmarkAdapters.project(
      adapter.manifest.evidenceBenchmarkAdapters[0]!, currentCommerceBenchmark,
    )

    expect(evaluation.ready).toBe(true)
    expect(score).toEqual({
      profileId: COMMERCE_PROFILE_ID,
      rulerId: 'ruler:commerce-outcome:v1',
      score: 11,
      maximumScore: 11,
      ready: true,
    })
    expect(score).not.toHaveProperty('productionReady')
    expect(registeredScore.criteria[0]).toEqual(expect.objectContaining({ score: 11, maximumScore: 11 }))
    expect(registeredScore).not.toHaveProperty('metrics')
    expect(maturity.metrics).toHaveLength(currentCommerceBenchmark.metrics.length)
    expect(maturity).not.toHaveProperty('criteria')
    expect(() => registries.outcomeScorecardAdapters.project(
      adapter.manifest.outcomeScorecardAdapters[0]!, { ...evaluation, ready: false },
    )).toThrow(/readiness must be derived/)
  })
})

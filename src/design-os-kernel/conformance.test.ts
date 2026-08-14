import { describe, expect, it } from 'vitest'
import { fingerprint } from '@/design-ir/fingerprint'
import {
  assertCrossHostConformance,
  benchmarkPromotionIdentity,
  benchmarkPromotionSchema,
  normalizeHostCompilation,
  validateCanonicalOwnership,
  type HostCompilation,
} from './conformance'
import { createFixtureCompilation } from './test-fixture'

describe('Design OS host conformance (K1, K3, K7)', () => {
  it('normalizes Desktop and Competition bindings to identical Kernel semantics', async () => {
    const desktopFixture = await createFixtureCompilation({
      capabilityId: 'desktop:structured',
      targetId: 'desktop:result',
    })
    const competitionFixture = await createFixtureCompilation({
      capabilityId: 'competition:structured',
      targetId: 'competition:result',
    })
    const desktop: HostCompilation = {
      ...desktopFixture,
      bindings: {
        hostId: 'host:desktop',
        authorizationId: 'authorization:desktop',
        capabilityRoutes: { 'capability:structured': 'desktop:structured' },
        targetBindings: { 'target:result': 'desktop:result' },
      },
    }
    const competition: HostCompilation = {
      ...competitionFixture,
      bindings: {
        hostId: 'host:competition',
        authorizationId: 'authorization:competition',
        capabilityRoutes: { 'capability:structured': 'competition:structured' },
        targetBindings: { 'target:result': 'competition:result' },
      },
    }

    expect(() => assertCrossHostConformance(desktop, competition)).not.toThrow()
    expect(normalizeHostCompilation(desktop)).toEqual(normalizeHostCompilation(competition))
    expect(() => normalizeHostCompilation({
      ...desktop,
      bindings: { ...desktop.bindings, capabilityRoutes: {} },
    })).toThrow(/must cover every and only/)
  })

  it('compiles a synthetic non-prototype Outcome without a Kernel branch', async () => {
    const fixture = await createFixtureCompilation()
    expect(fixture.outcomeGraph.body.nodes[0]).toMatchObject({
      schema: { id: 'fixture.structured-outcome', version: 1 },
      recipe: { id: 'fixture.structured-recipe', version: 1 },
    })
    expect(fixture.plan.body.nodes).toHaveLength(1)
    expect(fixture.evaluation.body.gates[0]).toMatchObject({
      evaluator: { id: 'fixture.structured-evaluator', version: 1 },
      status: 'passed',
    })
  })

  it('rejects host-local canonical owners and requires cross-profile Kernel promotion proof', async () => {
    expect(() => validateCanonicalOwnership([{
      kind: 'reducer',
      id: 'design-os.runtime',
      ownerLayer: 'host',
      source: 'hosts/desktop/runtime.ts',
    }])).toThrow(/Host-local canonical reducer/)
    expect(() => benchmarkPromotionSchema.parse({
      id: 'promotion:single-profile',
      finding: 'One profile observed a scheduling issue.',
      ownership: 'Kernel',
      profileEvidence: [{ profileId: 'profile:prototype', evidenceHash: 'a'.repeat(64) }],
    })).toThrow(/at least two profiles/)
    const promotion = benchmarkPromotionSchema.parse({
      id: 'promotion:cross-profile',
      finding: 'Prototype and structured outputs share a scheduling invariant.',
      ownership: 'Kernel',
      profileEvidence: [
        { profileId: 'profile:prototype', evidenceHash: 'a'.repeat(64) },
        { profileId: 'profile:structured', evidenceHash: 'b'.repeat(64) },
      ],
    })
    await expect(benchmarkPromotionIdentity(promotion)).resolves.toBe(await fingerprint(promotion))
  })
})

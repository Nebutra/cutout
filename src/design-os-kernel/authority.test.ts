import { describe, expect, it } from 'vitest'
import {
  assertNodeAuthority,
  freezeDocument,
  issueAuthorization,
  proposeSuccessor,
  validatePlanAuthority,
} from './authority'
import { createFixtureCompilation } from './test-fixture'

const hostLimits = {
  graphNodes: 100,
  artifacts: 100,
  bytes: 100_000,
  timeMs: 100_000,
  attempts: 100,
  spendUnits: 100,
}

describe('Design OS frozen authority (K5)', () => {
  it('authorizes only an exact frozen Contract and Plan node', async () => {
    const fixture = await createFixtureCompilation()
    const contract = await freezeDocument(fixture.contract)
    const plan = await freezeDocument(fixture.plan)
    const authorization = await issueAuthorization({
      id: 'authorization:1', contract, plan, catalog: fixture.catalog, hostLimits,
      issuerId: 'host:test', issuedAt: 1, expiresAt: 100,
    })

    await expect(assertNodeAuthority({
      node: fixture.plan.body.nodes[0]!, authorization, contract, plan, now: 2,
    })).resolves.toBeUndefined()
    await expect(assertNodeAuthority({
      node: { ...fixture.plan.body.nodes[0]!, targetId: 'target:arbitrary' },
      authorization, contract, plan, now: 2,
    })).rejects.toThrow(/differs from the frozen Plan/)
  })

  it('rejects scope, capability, constraint, target and budget expansion', async () => {
    const fixture = await createFixtureCompilation()
    const plan = fixture.plan
    const mutations = [
      { ...plan.body.nodes[0]!, outcomeNodeId: 'outcome:expanded' },
      { ...plan.body.nodes[0]!, capabilityId: 'capability:arbitrary' },
      { ...plan.body.nodes[0]!, constraints: ['constraint:weakened'] },
      { ...plan.body.nodes[0]!, targetId: 'target:arbitrary' },
      { ...plan.body.nodes[0]!, maxAttempts: 3 },
    ]
    const reasons = mutations.flatMap((node) => validatePlanAuthority({
      contract: fixture.contract,
      plan: { ...plan, body: { ...plan.body, nodes: [node] } },
      catalog: fixture.catalog,
      hostLimits,
    }).reasons)
    expect(reasons).toEqual(expect.arrayContaining([
      expect.stringContaining('out-of-scope'),
      expect.stringContaining('unapproved-capability'),
      expect.stringContaining('unapproved-constraint'),
      expect.stringContaining('unapproved-target'),
      expect.stringContaining('attempt-budget-mismatch'),
    ]))
  })

  it('rejects unsupported output and retry contracts', async () => {
    const fixture = await createFixtureCompilation()
    const node = fixture.plan.body.nodes[0]!
    const mutations = [
      { ...node, outputSchema: { id: 'fixture.unsupported-output', version: 1 } },
      { ...node, transientFailureCodes: [...node.transientFailureCodes, 'arbitrary-retry'] },
    ]
    const reasons = mutations.flatMap((candidate) => validatePlanAuthority({
      contract: fixture.contract,
      plan: { ...fixture.plan, body: { ...fixture.plan.body, nodes: [candidate] } },
      catalog: fixture.catalog,
      hostLimits,
    }).reasons)
    expect(reasons).toEqual(expect.arrayContaining([
      expect.stringContaining('unsupported-output-schema'),
      expect.stringContaining('unsupported-transient-failure'),
    ]))
  })

  it('represents authority expansion only as a non-executable successor proposal', async () => {
    const fixture = await createFixtureCompilation()
    const contract = await freezeDocument(fixture.contract)
    const plan = await freezeDocument(fixture.plan)
    const proposal = proposeSuccessor({
      contractHash: contract.contentHash,
      planHash: plan.contentHash,
      changes: [{ dimension: 'target', current: ['target:result'], proposed: ['target:other'] }],
    })
    expect(proposal).toMatchObject({ executable: false, predecessorContractHash: contract.contentHash })
  })
})

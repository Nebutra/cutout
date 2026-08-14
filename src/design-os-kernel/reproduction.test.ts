import { describe, expect, it } from 'vitest'
import { freezeDocument, issueAuthorization } from './authority'
import { createReproductionEnvelope, projectRunLedger } from './reproduction'
import { createRunRuntime, reduceRunRuntime, runEventSchema, type RunEvent } from './runtime'
import { createFixtureCompilation } from './test-fixture'

describe('Design OS terminal reproduction and observability (K8, K9)', () => {
  it('emits a complete provenance-replayable envelope without claiming deterministic model bytes', async () => {
    const fixture = await createFixtureCompilation()
    const contract = await freezeDocument(fixture.contract)
    const plan = await freezeDocument(fixture.plan)
    const authorization = await issueAuthorization({
      id: 'authorization:reproduction',
      contract,
      plan,
      catalog: fixture.catalog,
      hostLimits: { graphNodes: 10, artifacts: 10, bytes: 10_000, timeMs: 10_000, attempts: 10, spendUnits: 10 },
      issuerId: 'host:test',
      issuedAt: 1,
      expiresAt: 10_000,
    })
    const initialSnapshot = createRunRuntime({
      runId: 'run:reproduction', contractHash: contract.contentHash, planHash: plan.contentHash,
      authorization, plan: plan.document, at: 1,
    })
    let snapshot = initialSnapshot
    const cancel = runEventSchema.parse({
      type: 'run-cancelled',
      eventId: 'event:cancelled',
      runId: snapshot.runId,
      at: 2,
      reason: {
        code: 'host-cancelled',
        message: 'Host cancelled before execution.',
        dependencyPath: ['host:test'],
        evidence: [{ key: 'authorizationId', value: authorization.id }],
      },
    })
    snapshot = reduceRunRuntime(snapshot, cancel)
    const envelope = await createReproductionEnvelope({
      id: 'reproduction:1',
      revision: 'reproduction:revision:1',
      snapshot,
      initialSnapshot,
      plan: plan.document,
      events: [cancel] satisfies readonly RunEvent[],
      evidenceGraph: fixture.evidenceGraph,
      outcomeGraph: fixture.outcomeGraph,
      contract: contract.document,
    })
    const ledger = await projectRunLedger({
      snapshot,
      id: 'ledger:1',
      revision: 'ledger:revision:1',
      contractId: contract.document.identity.id,
      contractRevision: contract.document.identity.revision,
      planId: plan.document.identity.id,
      planRevision: plan.document.identity.revision,
    })

    expect(envelope.body).toMatchObject({
      terminalStatus: 'cancelled',
      replayClaim: 'provenance-replayable',
      contract: { contentHash: contract.contentHash },
      plan: { contentHash: plan.contentHash },
      dependencies: [{ kind: 'evidence', id: 'evidence:brief', revision: 'brief:1' }],
    })
    expect(JSON.stringify(envelope)).not.toContain('identical-output')
    expect(ledger.body).toMatchObject({
      phase: 'terminal',
      status: 'cancelled',
      eventCount: 1,
      reasons: [expect.objectContaining({ code: 'host-cancelled', dependencyPath: ['host:test'] })],
    })
  })

  it('requires terminal status and complete attempt settlement', async () => {
    const fixture = await createFixtureCompilation()
    const contract = await freezeDocument(fixture.contract)
    const plan = await freezeDocument(fixture.plan)
    const authorization = await issueAuthorization({
      id: 'authorization:active', contract, plan, catalog: fixture.catalog,
      hostLimits: { graphNodes: 10, artifacts: 10, bytes: 10_000, timeMs: 10_000, attempts: 10, spendUnits: 10 },
      issuerId: 'host:test', issuedAt: 1, expiresAt: 10_000,
    })
    const snapshot = createRunRuntime({
      runId: 'run:active', contractHash: contract.contentHash, planHash: plan.contentHash,
      authorization, plan: plan.document, at: 1,
    })
    await expect(createReproductionEnvelope({
      id: 'reproduction:active', revision: '1', snapshot, initialSnapshot: snapshot,
      plan: plan.document, events: [], evidenceGraph: fixture.evidenceGraph,
      outcomeGraph: fixture.outcomeGraph, contract: contract.document,
    })).rejects.toThrow(/terminal Run/)
  })

  it('rejects mutated Plans and event lists that do not exactly reproduce accepted history', async () => {
    const fixture = await createFixtureCompilation()
    const contract = await freezeDocument(fixture.contract)
    const plan = await freezeDocument(fixture.plan)
    const authorization = await issueAuthorization({
      id: 'authorization:exact-history', contract, plan, catalog: fixture.catalog,
      hostLimits: { graphNodes: 10, artifacts: 10, bytes: 10_000, timeMs: 10_000, attempts: 10, spendUnits: 10 },
      issuerId: 'host:test', issuedAt: 1, expiresAt: 10_000,
    })
    const initialSnapshot = createRunRuntime({
      runId: 'run:exact-history', contractHash: contract.contentHash, planHash: plan.contentHash,
      authorization, plan: plan.document, at: 1,
    })
    const cancel = runEventSchema.parse({
      type: 'run-cancelled', eventId: 'event:exact-history:cancelled', runId: initialSnapshot.runId, at: 2,
      reason: { code: 'cancelled', message: 'Cancelled.', dependencyPath: [], evidence: [] },
    })
    const snapshot = reduceRunRuntime(initialSnapshot, cancel)
    const base = {
      id: 'reproduction:exact-history', revision: '1', snapshot, initialSnapshot,
      plan: plan.document, events: [cancel],
      evidenceGraph: fixture.evidenceGraph,
      outcomeGraph: fixture.outcomeGraph,
      contract: contract.document,
    }
    await expect(createReproductionEnvelope({
      ...base,
      plan: { ...plan.document, body: { ...plan.document.body, budget: { ...plan.document.body.budget, bytes: 1 } } },
    })).rejects.toThrow(/authority/)
    await expect(createReproductionEnvelope({
      ...base,
      events: [...base.events, runEventSchema.parse({
        type: 'run-failed', eventId: 'event:ignored-late', runId: snapshot.runId, at: 3,
        reason: { code: 'late', message: 'Late.', dependencyPath: [], evidence: [] },
      })],
    })).rejects.toThrow(/exactly match/)
  })
})

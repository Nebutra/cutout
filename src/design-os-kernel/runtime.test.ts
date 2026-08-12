import { describe, expect, it } from 'vitest'
import { fingerprint } from '@/design-ir/fingerprint'
import { artifactNodeSchema, reasonPathSchema, type ExecutionPlan } from './contracts'
import { freezeDocument, issueAuthorization } from './authority'
import {
  createRunRuntime,
  expireAttemptEvents,
  recoverInterruptedAttempts,
  reduceRunRuntime,
  replayRunRuntime,
  runEventSchema,
  scheduleReadyNodes,
  startCommandEvent,
  type RunEvent,
  type RunRuntimeSnapshot,
} from './runtime'
import { createFixtureCompilation } from './test-fixture'

const hostLimits = {
  graphNodes: 100,
  artifacts: 100,
  bytes: 100_000,
  timeMs: 100_000,
  attempts: 100,
  spendUnits: 100,
}

async function authorizedRuntime(planTransform?: (plan: ExecutionPlan) => ExecutionPlan) {
  const fixture = await createFixtureCompilation()
  const planValue = planTransform?.(fixture.plan) ?? fixture.plan
  const contract = await freezeDocument(fixture.contract)
  const plan = await freezeDocument(planValue)
  const authorization = await issueAuthorization({
    id: 'authorization:runtime', contract, plan, catalog: fixture.catalog, hostLimits,
    issuerId: 'host:test', issuedAt: 1, expiresAt: 100_000,
  })
  let snapshot = createRunRuntime({
    runId: 'run:runtime',
    contractHash: contract.contentHash,
    planHash: plan.contentHash,
    authorization,
    plan: plan.document,
    at: 1,
  })
  const phaseEvents: RunEvent[] = ['contract', 'plan', 'authorize', 'execute'].map((phase, index) => runEventSchema.parse({
    type: 'phase-advanced',
    eventId: `event:phase:${phase}`,
    runId: snapshot.runId,
    phase,
    at: index + 2,
  }))
  for (const event of phaseEvents) snapshot = reduceRunRuntime(snapshot, event)
  return { fixture, contract, plan, authorization, snapshot, phaseEvents }
}

function failureEvent(snapshot: RunRuntimeSnapshot, nodeId: string, attemptId: string, code: string, at: number): RunEvent {
  return runEventSchema.parse({
    type: 'attempt-failed',
    eventId: `event:${attemptId}:failed`,
    runId: snapshot.runId,
    nodeId,
    attemptId,
    reason: reasonPathSchema.parse({
      code,
      message: code === 'provider-timeout' ? 'Provider timed out.' : 'Output was invalid.',
      nodeId,
      dependencyPath: [nodeId],
      evidence: [{ key: 'code', value: code }],
    }),
    usage: { artifacts: 0, bytes: 0, timeMs: 10, spendUnits: 0 },
    at,
  })
}

async function successEvent(snapshot: RunRuntimeSnapshot, nodeId: string, attemptId: string, at: number): Promise<RunEvent> {
  const bytes = new Uint8Array([1, 2, 3])
  const contentHash = await fingerprint([...bytes])
  return runEventSchema.parse({
    type: 'attempt-succeeded',
    eventId: `event:${attemptId}:succeeded`,
    runId: snapshot.runId,
    nodeId,
    attemptId,
    artifacts: [artifactNodeSchema.parse({
      id: `artifact:${attemptId}`,
      revision: 'artifact:1',
      schema: { id: 'fixture.structured-outcome', version: 1 },
      mediaType: 'application/json',
      byteLength: bytes.byteLength,
      contentHash,
      producerNodeId: nodeId,
      attemptId,
      accepted: true,
      provenance: [{ sourceId: 'source:fixture', revision: 'source:1', relation: 'produced-from' }],
    })],
    receipts: [{ id: `receipt:${attemptId}`, contentHash: 'a'.repeat(64) }],
    usage: { artifacts: 1, bytes: bytes.byteLength, timeMs: 20, spendUnits: 1 },
    at,
  })
}

describe('Design OS generic runtime and scheduler (K5, K6, K9)', () => {
  it('retries a transient attempt with fresh identity and settles the logical node once', async () => {
    const { plan, authorization, snapshot: initial } = await authorizedRuntime()
    const nodeId = plan.document.body.nodes[0]!.id
    const first = scheduleReadyNodes({ snapshot: initial, plan: plan.document, authorization, now: 10, maximumCommands: 1 })[0]!
    let snapshot = reduceRunRuntime(initial, startCommandEvent(first, 10))
    snapshot = reduceRunRuntime(snapshot, failureEvent(snapshot, nodeId, first.attemptId, 'provider-timeout', 20))
    const second = scheduleReadyNodes({ snapshot, plan: plan.document, authorization, now: 21, maximumCommands: 1 })[0]!
    expect(second.attemptId).not.toBe(first.attemptId)
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey)
    expect(second.usageLimit.timeMs).toBe(first.usageLimit.timeMs - 10)
    snapshot = reduceRunRuntime(snapshot, startCommandEvent(second, 21))
    snapshot = reduceRunRuntime(snapshot, await successEvent(snapshot, nodeId, second.attemptId, 30))
    const settled = snapshot

    snapshot = reduceRunRuntime(snapshot, await successEvent(snapshot, nodeId, first.attemptId, 31))
    snapshot = reduceRunRuntime(snapshot, await successEvent(snapshot, nodeId, second.attemptId, 30))
    expect(snapshot).toBe(settled)
    expect(snapshot.nodes[nodeId]).toMatchObject({ status: 'succeeded', attemptCount: 2 })
    expect(Object.keys(snapshot.artifacts)).toHaveLength(1)
    expect(snapshot.budget.used.attempts).toBe(2)
  })

  it('cancellation and timeout close ownership so late publication is ignored', async () => {
    const { plan, authorization, snapshot: initial } = await authorizedRuntime()
    const nodeId = plan.document.body.nodes[0]!.id
    const command = scheduleReadyNodes({ snapshot: initial, plan: plan.document, authorization, now: 10, maximumCommands: 1 })[0]!
    let snapshot = reduceRunRuntime(initial, startCommandEvent(command, 10))
    const timeout = expireAttemptEvents(snapshot, command.deadlineAt)[0]!
    snapshot = reduceRunRuntime(snapshot, timeout)
    expect(snapshot.nodes[nodeId]?.status).toBe('timed-out')
    const timedOut = snapshot
    snapshot = reduceRunRuntime(snapshot, await successEvent(snapshot, nodeId, command.attemptId, command.deadlineAt + 1))
    expect(snapshot).toBe(timedOut)

    const fresh = await authorizedRuntime()
    const freshCommand = scheduleReadyNodes({ snapshot: fresh.snapshot, plan: fresh.plan.document, authorization: fresh.authorization, now: 10, maximumCommands: 1 })[0]!
    let cancelled = reduceRunRuntime(fresh.snapshot, startCommandEvent(freshCommand, 10))
    cancelled = reduceRunRuntime(cancelled, runEventSchema.parse({
      type: 'run-cancelled', eventId: 'event:run:cancelled', runId: cancelled.runId, at: 11,
      reason: { code: 'user-cancelled', message: 'User cancelled.', dependencyPath: [], evidence: [] },
    }))
    const terminal = cancelled
    cancelled = reduceRunRuntime(cancelled, await successEvent(cancelled, nodeId, freshCommand.attemptId, 12))
    expect(cancelled).toBe(terminal)
    expect(cancelled.status).toBe('cancelled')
  })

  it('rejects forged starts and ignores results after deadline or authority expiry', async () => {
    const { plan, authorization, snapshot: initial } = await authorizedRuntime()
    const nodeId = plan.document.body.nodes[0]!.id
    expect(() => reduceRunRuntime(initial, runEventSchema.parse({
      type: 'attempt-started', eventId: 'event:forged:start', runId: initial.runId,
      nodeId, attemptId: 'forged-attempt', deadlineAt: 20, at: 10,
    }))).toThrow(/canonical/)

    const command = scheduleReadyNodes({ snapshot: initial, plan: plan.document, authorization, now: 10, maximumCommands: 1 })[0]!
    let snapshot = reduceRunRuntime(initial, startCommandEvent(command, 10))
    const beforeLate = snapshot
    snapshot = reduceRunRuntime(snapshot, await successEvent(snapshot, nodeId, command.attemptId, command.deadlineAt))
    expect(snapshot).toBe(beforeLate)

    const expiredAuthorization = { ...authorization, expiresAt: authorization.expiresAt + 1 }
    expect(scheduleReadyNodes({
      snapshot: initial, plan: plan.document, authorization: expiredAuthorization,
      now: 10, maximumCommands: 1,
    })).toEqual([])
  })

  it('recovery at the attempt deadline records timeout rather than transient interruption', async () => {
    const { plan, authorization, snapshot: initial } = await authorizedRuntime()
    const command = scheduleReadyNodes({ snapshot: initial, plan: plan.document, authorization, now: 10, maximumCommands: 1 })[0]!
    const running = reduceRunRuntime(initial, startCommandEvent(command, 10))
    const recovery = recoverInterruptedAttempts(running, command.deadlineAt)
    expect(recovery).toEqual([expect.objectContaining({
      type: 'attempt-timed-out',
      reason: expect.objectContaining({ code: 'deadline-exceeded' }),
    })])
  })

  it('rejects divergent duplicate event ids and supports explicit terminal failure', async () => {
    const { snapshot: initial } = await authorizedRuntime()
    const failure = runEventSchema.parse({
      type: 'run-failed', eventId: 'event:run:failed', runId: initial.runId, at: 10,
      reason: { code: 'terminal-failure', message: 'Run failed.', dependencyPath: [], evidence: [] },
    }) as Extract<RunEvent, { type: 'run-failed' }>
    const terminal = reduceRunRuntime(initial, failure)
    expect(terminal).toMatchObject({ phase: 'terminal', status: 'failed' })
    expect(() => reduceRunRuntime(terminal, {
      ...failure,
      reason: { ...failure.reason, message: 'Divergent payload.' },
    })).toThrow(/divergent content/)
  })

  it('recovers an interrupted attempt deterministically and resumes only failed frontiers', async () => {
    const { plan, authorization, snapshot: initial } = await authorizedRuntime((current) => ({
      ...current,
      body: {
        ...current.body,
        nodes: current.body.nodes.map((node) => ({
          ...node,
          maxAttempts: 3,
          budget: { ...node.budget, attempts: 3 },
        })),
      },
    }))
    const command = scheduleReadyNodes({ snapshot: initial, plan: plan.document, authorization, now: 10, maximumCommands: 1 })[0]!
    let snapshot = reduceRunRuntime(initial, startCommandEvent(command, 10))
    const recovery = recoverInterruptedAttempts(snapshot, 20)
    snapshot = replayRunRuntime(snapshot, recovery).snapshot
    expect(snapshot.nodes[command.node.id]?.status).toBe('retryable')

    const retryCommand = scheduleReadyNodes({ snapshot, plan: plan.document, authorization, now: 21, maximumCommands: 1 })[0]!
    snapshot = reduceRunRuntime(snapshot, startCommandEvent(retryCommand, 21))
    snapshot = reduceRunRuntime(snapshot, failureEvent(snapshot, command.node.id, retryCommand.attemptId, 'invalid-output', 30))
    snapshot = reduceRunRuntime(snapshot, runEventSchema.parse({
      type: 'phase-advanced', eventId: 'event:phase:evaluate', runId: snapshot.runId,
      phase: 'evaluate', at: 31,
    }))
    const repaired = reduceRunRuntime(snapshot, runEventSchema.parse({
      type: 'run-evaluated', eventId: 'event:evaluated:repair', runId: snapshot.runId,
      repairNodeIds: [command.node.id], at: 32,
    }))
    expect(repaired.nodes[command.node.id]).toMatchObject({ status: 'queued', attemptCount: 2 })
    const repairCommands = scheduleReadyNodes({ snapshot: repaired, plan: plan.document, authorization, now: 33, maximumCommands: 1 })
    expect(repairCommands).toHaveLength(1)
    expect(repairCommands[0]?.attemptId).toContain('attempt:3')
  })

  it('records structured budget blockers with exact evidence paths', async () => {
    const { plan, authorization, snapshot: initial } = await authorizedRuntime()
    const command = scheduleReadyNodes({ snapshot: initial, plan: plan.document, authorization, now: 10, maximumCommands: 1 })[0]!
    let snapshot = reduceRunRuntime(initial, startCommandEvent(command, 10))
    snapshot = reduceRunRuntime(snapshot, runEventSchema.parse({
      ...failureEvent(snapshot, command.node.id, command.attemptId, 'provider-timeout', 20),
      eventId: 'event:overspend',
      usage: { artifacts: 0, bytes: 0, timeMs: 3_000, spendUnits: 0 },
    }))
    expect(snapshot.status).toBe('blocked')
    expect(snapshot.reasons).toEqual([expect.objectContaining({
      code: 'failed-attempt-budget-exceeded',
      dependencyPath: [command.node.id],
      evidence: expect.arrayContaining([expect.objectContaining({ key: 'limit' })]),
    })])
  })

  it('indexes replay ids so a scale stream of duplicate events reduces once', async () => {
    const { snapshot: initial } = await authorizedRuntime()
    const event = runEventSchema.parse({
      type: 'run-cancelled',
      eventId: 'event:scale:cancelled',
      runId: initial.runId,
      at: 100,
      reason: { code: 'scale-stop', message: 'Scale fixture stopped.', dependencyPath: [], evidence: [] },
    })
    const replay = replayRunRuntime(initial, Array.from({ length: 5_000 }, () => event))
    expect(replay.processedEvents).toBe(1)
    expect(replay.snapshot.eventIds.filter((eventId) => eventId === event.eventId)).toHaveLength(1)
  })
})

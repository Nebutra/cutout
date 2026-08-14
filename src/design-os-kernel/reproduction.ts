import { fingerprint } from '@/design-ir/fingerprint'
import { canonicalJson } from '@/design-ir/fingerprint'
import {
  KERNEL_PROTOCOL,
  evidenceGraphSchema,
  outcomeContractSchema,
  outcomeGraphSchema,
  reproductionEnvelopeSchema,
  runLedgerSchema,
  type EvidenceGraph,
  type ExecutionPlan,
  type OutcomeContract,
  type OutcomeGraph,
  type ReproductionEnvelope,
  type RunLedger,
} from './contracts'
import { replayRunRuntime, type RunEvent, type RunRuntimeSnapshot } from './runtime'

export async function projectRunLedger(input: {
  readonly snapshot: RunRuntimeSnapshot
  readonly id: string
  readonly revision: string
  readonly contractId: string
  readonly contractRevision: string
  readonly planId: string
  readonly planRevision: string
}): Promise<RunLedger> {
  const reasons = [...input.snapshot.reasons]
  const reasonKeys = new Set(reasons.map((reason) => canonicalJson(reason)))
  for (const node of Object.values(input.snapshot.nodes)) {
    for (const reason of node.reasons) {
      const key = canonicalJson(reason)
      if (reasonKeys.has(key)) continue
      reasons.push(reason)
      reasonKeys.add(key)
    }
  }
  return runLedgerSchema.parse({
    protocol: KERNEL_PROTOCOL,
    kind: 'run-ledger',
    schema: { id: 'design-os.run-ledger', version: 1 },
    identity: { id: input.id, revision: input.revision },
    provenance: [],
    body: {
      contract: {
        id: input.contractId,
        revision: input.contractRevision,
        contentHash: input.snapshot.contractHash,
      },
      plan: {
        id: input.planId,
        revision: input.planRevision,
        contentHash: input.snapshot.planHash,
      },
      phase: input.snapshot.phase,
      status: input.snapshot.status,
      budget: input.snapshot.budget,
      eventCount: input.snapshot.eventIds.length,
      reasons,
    },
  })
}

export async function createReproductionEnvelope(input: {
  readonly id: string
  readonly revision: string
  readonly snapshot: RunRuntimeSnapshot
  readonly plan: ExecutionPlan
  readonly events: readonly RunEvent[]
  readonly evidenceGraph: EvidenceGraph
  readonly outcomeGraph: OutcomeGraph
  readonly contract: OutcomeContract
  readonly initialSnapshot: RunRuntimeSnapshot
  readonly provenance?: ReproductionEnvelope['provenance']
}): Promise<ReproductionEnvelope> {
  if (input.snapshot.status !== 'cancelled'
    && input.snapshot.status !== 'failed'
    && input.snapshot.status !== 'delivered') {
    throw new Error('A ReproductionEnvelope requires a terminal Run.')
  }
  const contract = outcomeContractSchema.parse(input.contract)
  const evidenceGraph = evidenceGraphSchema.parse(input.evidenceGraph)
  const outcomeGraph = outcomeGraphSchema.parse(input.outcomeGraph)
  if (input.snapshot.contractHash !== await fingerprint(contract)
    || input.snapshot.planHash !== await fingerprint(input.plan)
    || input.plan.body.contract.id !== contract.identity.id
    || input.plan.body.contract.revision !== contract.identity.revision
    || input.plan.body.contract.contentHash !== input.snapshot.contractHash
    || contract.body.evidenceGraph.id !== evidenceGraph.identity.id
    || contract.body.evidenceGraph.revision !== evidenceGraph.identity.revision
    || contract.body.evidenceGraph.contentHash !== await fingerprint(evidenceGraph)
    || contract.body.outcomeGraph.id !== outcomeGraph.identity.id
    || contract.body.outcomeGraph.revision !== outcomeGraph.identity.revision
    || contract.body.outcomeGraph.contentHash !== await fingerprint(outcomeGraph)) {
    throw new Error('Reproduction authority does not match the terminal Contract and Plan.')
  }
  if (input.initialSnapshot.phase !== 'understand'
    || input.initialSnapshot.status !== 'active'
    || input.initialSnapshot.revision !== 0
    || input.initialSnapshot.eventIds.length !== 0
    || Object.keys(input.initialSnapshot.eventHashes).length !== 0
    || input.initialSnapshot.runId !== input.snapshot.runId
    || input.initialSnapshot.contractHash !== input.snapshot.contractHash
    || input.initialSnapshot.planHash !== input.snapshot.planHash
    || input.initialSnapshot.authorizationId !== input.snapshot.authorizationId
    || input.initialSnapshot.authorizationIssuedAt !== input.snapshot.authorizationIssuedAt
    || input.initialSnapshot.authorizationExpiresAt !== input.snapshot.authorizationExpiresAt) {
    throw new Error('Reproduction requires the empty origin snapshot for the same Run authority.')
  }
  const eventById = new Map(input.events.map((event) => [event.eventId, event]))
  if (eventById.size !== input.events.length) {
    for (const event of input.events) {
      const duplicate = eventById.get(event.eventId)
      if (duplicate && canonicalJson(duplicate) !== canonicalJson(event)) {
        throw new Error(`Reproduction event id has divergent content: ${event.eventId}`)
      }
    }
    throw new Error('Reproduction event ids must be unique.')
  }
  const events = [...eventById.values()]
  const eventHashes = await Promise.all(events.map((event) => fingerprint(event)))
  if (events.length !== input.snapshot.eventIds.length
    || events.some((event, index) => event.eventId !== input.snapshot.eventIds[index]
      || input.snapshot.eventHashes[event.eventId] !== eventHashes[index])) {
    throw new Error('Reproduction events do not exactly match accepted Run history.')
  }
  const replayed = replayRunRuntime(input.initialSnapshot, events).snapshot
  if (canonicalJson(withoutUndefined(replayed)) !== canonicalJson(withoutUndefined(input.snapshot))) {
    throw new Error('Reproduction events do not reproduce the terminal Run snapshot.')
  }
  const terminalByAttempt = new Map<string, Extract<RunEvent, {
    type: 'attempt-succeeded' | 'attempt-failed' | 'attempt-cancelled' | 'attempt-timed-out'
  }>>()
  const runCancellation = [...events].reverse().find((event) => event.type === 'run-cancelled')
  for (const event of events) {
    if (event.type === 'attempt-succeeded'
      || event.type === 'attempt-failed'
      || event.type === 'attempt-cancelled'
      || event.type === 'attempt-timed-out') {
      terminalByAttempt.set(event.attemptId, event)
    }
  }
  const attempts = events.flatMap((event) => {
    if (event.type !== 'attempt-started') return []
    const terminal = terminalByAttempt.get(event.attemptId)
    if (!terminal && input.snapshot.status !== 'cancelled') {
      throw new Error(`Terminal reproduction is missing settlement for attempt: ${event.attemptId}`)
    }
    const status = !terminal
      ? 'cancelled'
      : terminal.type === 'attempt-succeeded'
      ? 'succeeded'
      : terminal.type === 'attempt-failed'
        ? 'failed'
        : terminal.type === 'attempt-cancelled'
          ? 'cancelled'
          : 'timed-out'
    return [{
      id: event.attemptId,
      nodeId: event.nodeId,
      status,
      receiptIds: terminal?.type === 'attempt-succeeded'
        ? terminal.receipts.map((receipt) => receipt.id)
        : [],
      reasons: terminal && terminal.type !== 'attempt-succeeded'
        ? [terminal.reason]
        : !terminal
          ? runCancellation && runCancellation.type === 'run-cancelled'
            ? [runCancellation.reason]
            : []
          : [],
    }]
  })
  if (new Set(attempts.map((attempt) => attempt.id)).size !== attempts.length) {
    throw new Error('Reproduction contains duplicate attempt starts.')
  }
  const routes = await Promise.all(input.plan.body.nodes.map(async (node) => ({
    nodeId: node.id,
    capabilityId: node.capabilityId,
    targetId: node.targetId,
    parametersHash: await fingerprint(node),
  })))
  const sources = await Promise.all(evidenceGraph.body.nodes.map(async (node) => ({
    id: node.id,
    revision: node.revision,
    contentHash: await fingerprint(node),
  })))
  const dependencyByIdentity = new Map(outcomeGraph.body.nodes.flatMap((node) => node.dependencies)
    .map((dependency) => [`${dependency.kind}:${dependency.id}@${dependency.revision}`, dependency]))
  return reproductionEnvelopeSchema.parse({
    protocol: KERNEL_PROTOCOL,
    kind: 'reproduction-envelope',
    schema: { id: 'design-os.reproduction-envelope', version: 1 },
    identity: { id: input.id, revision: input.revision },
    provenance: input.provenance ?? [],
    body: {
      runId: input.snapshot.runId,
      terminalStatus: input.snapshot.status,
      sources,
      dependencies: [...dependencyByIdentity.values()],
      contract: {
        id: contract.identity.id,
        revision: contract.identity.revision,
        contentHash: input.snapshot.contractHash,
      },
      plan: {
        id: input.plan.identity.id,
        revision: input.plan.identity.revision,
        contentHash: input.snapshot.planHash,
      },
      routes,
      attempts,
      receipts: Object.values(input.snapshot.receipts),
      outputHashes: Object.values(input.snapshot.artifacts).map((artifact) => artifact.contentHash).sort(),
      replayClaim: 'provenance-replayable',
    },
  })
}

function withoutUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutUndefined)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, withoutUndefined(item)]))
  }
  return value
}

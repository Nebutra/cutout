import { z } from 'zod'
import { sha256 } from 'js-sha256'
import { canonicalJson } from '@/design-ir/fingerprint'
import {
  artifactNodeSchema,
  budgetSchema,
  executionPlanSchema,
  reasonPathSchema,
  recordIdSchema,
  runPhaseSchema,
  schemaReferenceSchema,
  sha256Schema,
  timestampSchema,
  type Budget,
  type ExecutionPlan,
  type ExecutionPlanNode,
  type ReasonPath,
  type RunPhase,
} from './contracts'
import {
  addBudgets,
  authorizationReferenceSchema,
  budgetWithin,
  emptyBudget,
  type AuthorizationReference,
} from './authority'

export const runNodeStatusSchema = z.enum([
  'queued',
  'running',
  'retryable',
  'succeeded',
  'failed',
  'cancelled',
  'timed-out',
])
export type RunNodeStatus = z.infer<typeof runNodeStatusSchema>

export const runNodeStateSchema = z.object({
  nodeId: recordIdSchema,
  status: runNodeStatusSchema,
  attemptCount: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  budget: z.object({ limit: budgetSchema, used: budgetSchema }).strict(),
  outputSchema: schemaReferenceSchema,
  transientFailureCodes: z.array(z.string().min(1).max(120)).max(100),
  deadlineMs: z.number().int().positive(),
  dependencyNodeIds: z.array(recordIdSchema).max(10_000),
  activeAttemptId: recordIdSchema.optional(),
  deadlineAt: timestampSchema.optional(),
  artifactIds: z.array(recordIdSchema).max(10_000),
  receiptIds: z.array(recordIdSchema).max(10_000),
  reasons: z.array(reasonPathSchema).max(1_000),
  updatedAt: timestampSchema,
}).strict().superRefine((node, context) => {
  const ownsAttempt = node.status === 'running'
  if (ownsAttempt !== Boolean(node.activeAttemptId)
    || ownsAttempt !== (node.deadlineAt !== undefined)) {
    context.addIssue({ code: 'custom', message: 'Only a running node may own an active attempt and deadline.' })
  }
  if (node.attemptCount > node.maxAttempts) {
    context.addIssue({ code: 'custom', message: 'Run node exceeds its frozen attempt budget.' })
  }
})
export type RunNodeState = z.infer<typeof runNodeStateSchema>

const eventBaseSchema = z.object({
  eventId: recordIdSchema,
  runId: recordIdSchema,
  at: timestampSchema,
})

const nodeEventBaseSchema = eventBaseSchema.extend({ nodeId: recordIdSchema, attemptId: recordIdSchema })

const resultUsageSchema = budgetSchema.omit({ attempts: true })
export type ResultUsage = z.infer<typeof resultUsageSchema>

export const runEventSchema = z.discriminatedUnion('type', [
  eventBaseSchema.extend({ type: z.literal('phase-advanced'), phase: runPhaseSchema }).strict(),
  nodeEventBaseSchema.extend({ type: z.literal('attempt-started'), deadlineAt: timestampSchema }).strict(),
  nodeEventBaseSchema.extend({
    type: z.literal('attempt-succeeded'),
    artifacts: z.array(artifactNodeSchema).min(1).max(10_000),
    receipts: z.array(z.object({ id: recordIdSchema, contentHash: sha256Schema }).strict()).min(1).max(10_000),
    usage: resultUsageSchema,
  }).strict(),
  nodeEventBaseSchema.extend({
    type: z.literal('attempt-failed'),
    reason: reasonPathSchema,
    usage: resultUsageSchema,
  }).strict(),
  nodeEventBaseSchema.extend({ type: z.literal('attempt-cancelled'), reason: reasonPathSchema }).strict(),
  nodeEventBaseSchema.extend({ type: z.literal('attempt-timed-out'), reason: reasonPathSchema }).strict(),
  eventBaseSchema.extend({ type: z.literal('run-cancelled'), reason: reasonPathSchema }).strict(),
  eventBaseSchema.extend({ type: z.literal('run-failed'), reason: reasonPathSchema }).strict(),
  eventBaseSchema.extend({ type: z.literal('run-evaluated'), repairNodeIds: z.array(recordIdSchema).max(20_000) }).strict(),
  eventBaseSchema.extend({ type: z.literal('run-delivered') }).strict(),
])
export type RunEvent = z.infer<typeof runEventSchema>

export const runRuntimeSnapshotSchema = z.object({
  version: z.literal('design-os.runtime.v1'),
  runId: recordIdSchema,
  contractHash: sha256Schema,
  planHash: sha256Schema,
  authorizationId: recordIdSchema,
  authorizationIssuedAt: timestampSchema,
  authorizationExpiresAt: timestampSchema,
  lastEventAt: timestampSchema,
  phase: runPhaseSchema,
  status: z.enum(['active', 'blocked', 'cancelled', 'failed', 'delivered']),
  nodes: z.record(recordIdSchema, runNodeStateSchema),
  artifacts: z.record(recordIdSchema, artifactNodeSchema),
  receipts: z.record(recordIdSchema, z.object({ id: recordIdSchema, contentHash: sha256Schema }).strict()),
  budget: z.object({ limit: budgetSchema, used: budgetSchema }).strict(),
  eventIds: z.array(recordIdSchema).max(100_000),
  eventHashes: z.record(recordIdSchema, sha256Schema),
  reasons: z.array(reasonPathSchema).max(20_000),
  revision: z.number().int().nonnegative(),
}).strict().superRefine((snapshot, context) => {
  if (snapshot.authorizationExpiresAt <= snapshot.authorizationIssuedAt) {
    context.addIssue({ code: 'custom', message: 'Runtime authorization window is invalid.' })
  }
  const eventIds = new Set(snapshot.eventIds)
  if (eventIds.size !== snapshot.eventIds.length
    || eventIds.size !== Object.keys(snapshot.eventHashes).length
    || [...eventIds].some((id) => !snapshot.eventHashes[id])) {
    context.addIssue({ code: 'custom', message: 'Runtime event ids and hashes must match exactly.' })
  }
  for (const [id, node] of Object.entries(snapshot.nodes)) {
    if (node.nodeId !== id) context.addIssue({ code: 'custom', message: `Runtime node key mismatch: ${id}` })
    for (const artifactId of node.artifactIds) {
      const artifact = snapshot.artifacts[artifactId]
      if (!artifact || artifact.producerNodeId !== id) {
        context.addIssue({ code: 'custom', message: `Runtime node artifact reference is unresolved: ${artifactId}` })
      }
    }
    for (const receiptId of node.receiptIds) {
      if (!snapshot.receipts[receiptId]) {
        context.addIssue({ code: 'custom', message: `Runtime node receipt reference is unresolved: ${receiptId}` })
      }
    }
  }
  for (const [id, artifact] of Object.entries(snapshot.artifacts)) {
    if (artifact.id !== id) context.addIssue({ code: 'custom', message: `Runtime artifact key mismatch: ${id}` })
  }
  for (const [id, receipt] of Object.entries(snapshot.receipts)) {
    if (receipt.id !== id) context.addIssue({ code: 'custom', message: `Runtime receipt key mismatch: ${id}` })
  }
  const terminal = snapshot.phase === 'terminal'
  if (terminal !== (snapshot.status === 'cancelled' || snapshot.status === 'failed' || snapshot.status === 'delivered')) {
    context.addIssue({ code: 'custom', message: 'Runtime phase and terminal status disagree.' })
  }
})
export type RunRuntimeSnapshot = z.infer<typeof runRuntimeSnapshotSchema>

export interface CapabilityCommand {
  readonly version: 'design-os.capability-command.v1'
  readonly runId: string
  readonly node: ExecutionPlanNode
  readonly attemptId: string
  readonly idempotencyKey: string
  readonly authorization: AuthorizationReference
  readonly deadlineAt: number
  readonly usageLimit: ResultUsage
}

export function createRunRuntime(input: {
  readonly runId: string
  readonly contractHash: string
  readonly planHash: string
  readonly authorization: AuthorizationReference
  readonly plan: ExecutionPlan
  readonly at: number
}): RunRuntimeSnapshot {
  const plan = executionPlanSchema.parse(input.plan)
  const authorization = authorizationReferenceSchema.parse(input.authorization)
  if (authorization.contractHash !== input.contractHash || authorization.planHash !== input.planHash) {
    throw new Error('Runtime authority does not match the frozen Contract and Plan.')
  }
  if (plan.body.contract.contentHash !== input.contractHash
    || hashCanonical(plan) !== input.planHash) {
    throw new Error('Runtime Plan does not match the authorized frozen identities.')
  }
  const planNodeIds = plan.body.nodes.map((node) => node.id)
  if (!sameIds(authorization.approvedNodeIds, planNodeIds)) {
    throw new Error('Runtime Plan nodes do not match the authorized node set.')
  }
  if (input.at < authorization.issuedAt || input.at >= authorization.expiresAt) {
    throw new Error('Runtime must start inside the authorization window.')
  }
  const nodes = Object.fromEntries(plan.body.nodes.map((node) => [node.id, runNodeStateSchema.parse({
    nodeId: node.id,
    status: 'queued',
    attemptCount: 0,
    maxAttempts: node.maxAttempts,
    budget: { limit: node.budget, used: emptyBudget() },
    outputSchema: node.outputSchema,
    transientFailureCodes: node.transientFailureCodes,
    deadlineMs: node.deadlineMs,
    dependencyNodeIds: node.dependencyNodeIds,
    artifactIds: [],
    receiptIds: [],
    reasons: [],
    updatedAt: input.at,
  })]))
  return runRuntimeSnapshotSchema.parse({
    version: 'design-os.runtime.v1',
    runId: input.runId,
    contractHash: input.contractHash,
    planHash: input.planHash,
    authorizationId: authorization.id,
    authorizationIssuedAt: authorization.issuedAt,
    authorizationExpiresAt: authorization.expiresAt,
    lastEventAt: input.at,
    phase: 'understand',
    status: 'active',
    nodes,
    artifacts: {},
    receipts: {},
    budget: { limit: plan.body.budget, used: emptyBudget() },
    eventIds: [],
    eventHashes: {},
    reasons: [],
    revision: 0,
  })
}

export function reduceRunRuntime(snapshot: RunRuntimeSnapshot, input: RunEvent): RunRuntimeSnapshot {
  const event = runEventSchema.parse(input)
  if (event.runId !== snapshot.runId) throw new Error(`Run event belongs to another run: ${event.runId}`)
  const eventHash = hashCanonical(event)
  const existingEventHash = snapshot.eventHashes[event.eventId]
  if (existingEventHash) {
    if (existingEventHash !== eventHash) throw new Error(`Run event id has divergent content: ${event.eventId}`)
    return snapshot
  }
  if (isRunTerminal(snapshot)) return snapshot
  let next: RunRuntimeSnapshot
  switch (event.type) {
    case 'phase-advanced':
      assertPhaseTransition(snapshot.phase, event.phase)
      if (event.phase === 'evaluate'
        && Object.values(snapshot.nodes).some((node) => node.status === 'running')) {
        throw new Error('Evaluation cannot begin while an attempt still owns execution.')
      }
      next = { ...snapshot, phase: event.phase }
      break
    case 'attempt-started':
      next = reduceAttemptStarted(snapshot, event)
      break
    case 'attempt-succeeded':
      next = reduceAttemptSucceeded(snapshot, event)
      break
    case 'attempt-failed':
      next = reduceAttemptFailed(snapshot, event)
      break
    case 'attempt-cancelled':
      next = reduceAttemptClosed(snapshot, event, 'cancelled')
      break
    case 'attempt-timed-out':
      next = reduceAttemptClosed(snapshot, event, 'timed-out')
      break
    case 'run-cancelled':
      next = cancelRuntime(snapshot, event)
      break
    case 'run-failed':
      next = failRuntime(snapshot, event)
      break
    case 'run-evaluated':
      next = evaluateRuntime(snapshot, event)
      break
    case 'run-delivered':
      if (snapshot.phase !== 'deliver' || Object.values(snapshot.nodes).some((node) => node.status !== 'succeeded')) {
        throw new Error('A run can be delivered only after every node succeeds in the deliver phase.')
      }
      next = { ...snapshot, phase: 'terminal', status: 'delivered' }
      break
  }
  if (next === snapshot) return snapshot
  if (event.at < snapshot.lastEventAt) throw new Error(`Run event predates accepted history: ${event.eventId}`)
  return {
    ...next,
    eventIds: [...next.eventIds, event.eventId],
    eventHashes: { ...next.eventHashes, [event.eventId]: eventHash },
    lastEventAt: event.at,
    revision: next.revision + 1,
  }
}

export function replayRunRuntime(initial: RunRuntimeSnapshot, events: readonly RunEvent[]): {
  readonly snapshot: RunRuntimeSnapshot
  readonly processedEvents: number
} {
  let snapshot = runRuntimeSnapshotSchema.parse(initial)
  let processedEvents = 0
  for (const event of events) {
    const next = reduceRunRuntime(snapshot, event)
    if (next !== snapshot) processedEvents += 1
    snapshot = next
  }
  return { snapshot, processedEvents }
}

export function scheduleReadyNodes(input: {
  readonly snapshot: RunRuntimeSnapshot
  readonly plan: ExecutionPlan
  readonly authorization: AuthorizationReference
  readonly now: number
  readonly maximumCommands: number
}): readonly CapabilityCommand[] {
  if (!Number.isSafeInteger(input.maximumCommands)
    || input.maximumCommands < 1
    || input.snapshot.status !== 'active') return []
  if (input.snapshot.phase !== 'execute' && input.snapshot.phase !== 'repair') return []
  const plan = executionPlanSchema.parse(input.plan)
  const authorization = authorizationReferenceSchema.parse(input.authorization)
  if (authorization.issuedAt !== input.snapshot.authorizationIssuedAt
    || authorization.expiresAt !== input.snapshot.authorizationExpiresAt
    || input.now < authorization.issuedAt
    || input.now >= authorization.expiresAt
    || authorization.id !== input.snapshot.authorizationId
    || authorization.planHash !== input.snapshot.planHash
    || authorization.contractHash !== input.snapshot.contractHash
    || plan.body.contract.contentHash !== input.snapshot.contractHash
    || hashCanonical(plan) !== input.snapshot.planHash
    || !sameIds(authorization.approvedNodeIds, plan.body.nodes.map((node) => node.id))) return []
  const commands: CapabilityCommand[] = []
  let projectedBudget = input.snapshot.budget.used
  for (const node of plan.body.nodes) {
    if (commands.length >= input.maximumCommands) break
    const state = input.snapshot.nodes[node.id]
    if (!state || (state.status !== 'queued' && state.status !== 'retryable')) continue
    if (state.attemptCount >= state.maxAttempts) continue
    if (!node.dependencyNodeIds.every((id) => input.snapshot.nodes[id]?.status === 'succeeded')) continue
    const attemptBudget = { ...emptyBudget(), attempts: 1 }
    const projectedRunBudget = addBudgets(projectedBudget, attemptBudget)
    const projectedNodeBudget = addBudgets(state.budget.used, attemptBudget)
    if (!budgetWithin(projectedRunBudget, input.snapshot.budget.limit)) continue
    if (!budgetWithin(projectedNodeBudget, state.budget.limit)) continue
    const usageLimit = remainingUsageLimit(
      projectedRunBudget,
      input.snapshot.budget.limit,
      projectedNodeBudget,
      state.budget.limit,
    )
    const duration = Math.min(node.deadlineMs, usageLimit.timeMs, authorization.expiresAt - input.now)
    if (duration < 1 || usageLimit.artifacts < 1 || usageLimit.bytes < 1) continue
    const attempt = state.attemptCount + 1
    projectedBudget = addBudgets(projectedBudget, attemptBudget)
    commands.push({
      version: 'design-os.capability-command.v1',
      runId: input.snapshot.runId,
      node,
      attemptId: `${input.snapshot.runId}:${node.id}:attempt:${attempt}`,
      idempotencyKey: `${input.snapshot.planHash}:${node.id}:attempt:${attempt}`,
      authorization,
      deadlineAt: input.now + duration,
      usageLimit,
    })
  }
  return commands
}

export function startCommandEvent(command: CapabilityCommand, at: number): RunEvent {
  return runEventSchema.parse({
    type: 'attempt-started',
    eventId: `event:${command.attemptId}:started`,
    runId: command.runId,
    nodeId: command.node.id,
    attemptId: command.attemptId,
    deadlineAt: command.deadlineAt,
    at,
  })
}

export function expireAttemptEvents(snapshot: RunRuntimeSnapshot, now: number): readonly RunEvent[] {
  return Object.values(snapshot.nodes).flatMap((node) => {
    const expirationAt = Math.min(node.deadlineAt ?? Number.POSITIVE_INFINITY, snapshot.authorizationExpiresAt)
    return node.status === 'running'
    && node.activeAttemptId
    && node.deadlineAt !== undefined
    && now >= expirationAt
    ? [runEventSchema.parse({
        type: 'attempt-timed-out',
        eventId: `event:${node.activeAttemptId}:timed-out`,
        runId: snapshot.runId,
        nodeId: node.nodeId,
        attemptId: node.activeAttemptId,
        reason: reason(expirationAt === snapshot.authorizationExpiresAt
          ? 'authorization-expired'
          : 'deadline-exceeded', node.nodeId, [node.nodeId], { expirationAt, observedAt: now }),
        at: now,
      })]
    : []
  })
}

export function recoverInterruptedAttempts(snapshot: RunRuntimeSnapshot, at: number): readonly RunEvent[] {
  return Object.values(snapshot.nodes).flatMap((node) => {
    const expirationAt = Math.min(node.deadlineAt ?? Number.POSITIVE_INFINITY, snapshot.authorizationExpiresAt)
    const expired = at >= expirationAt
    return node.status === 'running' && node.activeAttemptId
      ? [runEventSchema.parse({
        type: expired ? 'attempt-timed-out' : 'attempt-failed',
        eventId: expired
          ? `event:${node.activeAttemptId}:timed-out`
          : `event:${node.activeAttemptId}:recovered-interruption`,
        runId: snapshot.runId,
        nodeId: node.nodeId,
        attemptId: node.activeAttemptId,
        reason: reason(expired
          ? expirationAt === snapshot.authorizationExpiresAt ? 'authorization-expired' : 'deadline-exceeded'
          : 'host-recovery-interrupted', node.nodeId, [node.nodeId], {}),
        ...(expired
          ? {}
          : { usage: { artifacts: 0, bytes: 0, timeMs: 0, spendUnits: 0 } }),
        at,
      })]
      : []
  })
}

function reduceAttemptStarted(snapshot: RunRuntimeSnapshot, event: Extract<RunEvent, { type: 'attempt-started' }>): RunRuntimeSnapshot {
  if (snapshot.phase !== 'execute' && snapshot.phase !== 'repair') throw new Error('Attempts require execute or repair phase.')
  if (event.at < snapshot.authorizationIssuedAt || event.at >= snapshot.authorizationExpiresAt) {
    throw new Error('Attempt cannot start outside the authorization window.')
  }
  const node = requireNode(snapshot, event.nodeId)
  if (node.status !== 'queued' && node.status !== 'retryable') throw new Error(`Node cannot start from ${node.status}.`)
  if (!node.dependencyNodeIds.every((id) => snapshot.nodes[id]?.status === 'succeeded')) {
    throw new Error(`Node dependencies are not ready: ${node.nodeId}`)
  }
  const expectedAttemptId = `${snapshot.runId}:${node.nodeId}:attempt:${node.attemptCount + 1}`
  if (event.attemptId !== expectedAttemptId) throw new Error(`Attempt identity is not canonical: ${event.attemptId}`)
  if (event.deadlineAt <= event.at || event.deadlineAt > event.at + node.deadlineMs) {
    throw new Error(`Attempt deadline is outside the frozen node contract: ${event.attemptId}`)
  }
  const used = addBudgets(snapshot.budget.used, { ...emptyBudget(), attempts: 1 })
  const nodeUsed = addBudgets(node.budget.used, { ...emptyBudget(), attempts: 1 })
  if (!budgetWithin(used, snapshot.budget.limit) || !budgetWithin(nodeUsed, node.budget.limit)) {
    const blockedReason = reason('attempt-budget-exceeded', node.nodeId, [node.nodeId], {
      used: used.attempts,
      limit: snapshot.budget.limit.attempts,
    })
    return replaceNode({
      ...snapshot,
      status: 'blocked',
      reasons: [...snapshot.reasons, blockedReason],
    }, {
      ...node,
      status: 'failed',
      reasons: [...node.reasons, blockedReason],
      updatedAt: event.at,
    })
  }
  return replaceNode({ ...snapshot, budget: { ...snapshot.budget, used } }, {
    ...node,
    status: 'running',
    attemptCount: node.attemptCount + 1,
    budget: { ...node.budget, used: nodeUsed },
    activeAttemptId: event.attemptId,
    deadlineAt: event.deadlineAt,
    updatedAt: event.at,
  })
}

function reduceAttemptSucceeded(snapshot: RunRuntimeSnapshot, event: Extract<RunEvent, { type: 'attempt-succeeded' }>): RunRuntimeSnapshot {
  const node = requireNode(snapshot, event.nodeId)
  if (!ownsAttempt(node, event.attemptId) || snapshot.status !== 'active') return snapshot
  if (event.at < node.updatedAt) throw new Error(`Attempt result predates its start: ${event.attemptId}`)
  if (event.at >= snapshot.authorizationExpiresAt) return snapshot
  if (node.deadlineAt !== undefined && event.at >= node.deadlineAt) return snapshot
  const usage = usageBudget(event.usage)
  const used = addBudgets(snapshot.budget.used, usage)
  const nodeUsed = addBudgets(node.budget.used, usage)
  const byteLength = event.artifacts.reduce((sum, artifact) => sum + artifact.byteLength, 0)
  if (byteLength !== event.usage.bytes || event.artifacts.length !== event.usage.artifacts) {
    throw new Error('Result usage must match the exact returned artifacts.')
  }
  if (!budgetWithin(used, snapshot.budget.limit) || !budgetWithin(nodeUsed, node.budget.limit)) {
    const blockedReason = reason('result-budget-exceeded', node.nodeId, [node.nodeId], {
      used,
      limit: snapshot.budget.limit,
    })
    return replaceNode({
      ...snapshot,
      status: 'blocked',
      budget: { ...snapshot.budget, used },
      reasons: [...snapshot.reasons, blockedReason],
    }, {
      ...node,
      status: 'failed',
      budget: { ...node.budget, used: nodeUsed },
      activeAttemptId: undefined,
      deadlineAt: undefined,
      reasons: [...node.reasons, blockedReason],
      updatedAt: event.at,
    })
  }
  const artifacts = { ...snapshot.artifacts }
  for (const artifact of event.artifacts) {
    if (artifact.producerNodeId !== node.nodeId || artifact.attemptId !== event.attemptId) {
      throw new Error('Artifact is not bound to the active logical node and attempt.')
    }
    if (artifact.schema.id !== node.outputSchema.id || artifact.schema.version !== node.outputSchema.version) {
      throw new Error(`Artifact output schema differs from the frozen node contract: ${artifact.id}`)
    }
    if (!artifact.accepted) throw new Error(`A successful attempt cannot publish an unaccepted artifact: ${artifact.id}`)
    const existing = artifacts[artifact.id]
    if (existing) throw new Error(`Artifact id was already published: ${artifact.id}`)
    artifacts[artifact.id] = artifact
  }
  const receipts = { ...snapshot.receipts }
  for (const receipt of event.receipts) {
    const existing = receipts[receipt.id]
    if (existing) throw new Error(`Receipt id was already published: ${receipt.id}`)
    receipts[receipt.id] = receipt
  }
  return replaceNode({ ...snapshot, artifacts, receipts, budget: { ...snapshot.budget, used } }, {
    ...node,
    status: 'succeeded',
    budget: { ...node.budget, used: nodeUsed },
    activeAttemptId: undefined,
    deadlineAt: undefined,
    artifactIds: event.artifacts.map((artifact) => artifact.id),
    receiptIds: event.receipts.map((receipt) => receipt.id),
    updatedAt: event.at,
  })
}

function reduceAttemptFailed(snapshot: RunRuntimeSnapshot, event: Extract<RunEvent, { type: 'attempt-failed' }>): RunRuntimeSnapshot {
  const node = requireNode(snapshot, event.nodeId)
  if (!ownsAttempt(node, event.attemptId) || snapshot.status !== 'active') return snapshot
  if (event.at < node.updatedAt) throw new Error(`Attempt result predates its start: ${event.attemptId}`)
  if (event.at >= snapshot.authorizationExpiresAt) return snapshot
  if (node.deadlineAt !== undefined && event.at >= node.deadlineAt) return snapshot
  const used = addBudgets(snapshot.budget.used, usageBudget(event.usage))
  const nodeUsed = addBudgets(node.budget.used, usageBudget(event.usage))
  if (!budgetWithin(used, snapshot.budget.limit) || !budgetWithin(nodeUsed, node.budget.limit)) {
    const blockedReason = reason('failed-attempt-budget-exceeded', node.nodeId, [node.nodeId], {
      used: nodeUsed,
      limit: node.budget.limit,
    })
    return replaceNode({
      ...snapshot,
      status: 'blocked',
      budget: { ...snapshot.budget, used },
      reasons: [...snapshot.reasons, blockedReason],
    }, {
      ...node,
      status: 'failed',
      budget: { ...node.budget, used: nodeUsed },
      activeAttemptId: undefined,
      deadlineAt: undefined,
      reasons: [...node.reasons, event.reason, blockedReason],
      updatedAt: event.at,
    })
  }
  const transient = node.transientFailureCodes.includes(event.reason.code)
  const status = transient && node.attemptCount < node.maxAttempts ? 'retryable' : 'failed'
  return replaceNode({ ...snapshot, budget: { ...snapshot.budget, used } }, {
    ...node,
    status,
    budget: { ...node.budget, used: nodeUsed },
    activeAttemptId: undefined,
    deadlineAt: undefined,
    reasons: [...node.reasons, event.reason],
    updatedAt: event.at,
  })
}

function reduceAttemptClosed(
  snapshot: RunRuntimeSnapshot,
  event: Extract<RunEvent, { type: 'attempt-cancelled' | 'attempt-timed-out' }>,
  status: 'cancelled' | 'timed-out',
): RunRuntimeSnapshot {
  const node = requireNode(snapshot, event.nodeId)
  if (!ownsAttempt(node, event.attemptId) || snapshot.status !== 'active') return snapshot
  if (event.at < node.updatedAt) throw new Error(`Attempt settlement predates its start: ${event.attemptId}`)
  const elapsed = event.type === 'attempt-timed-out' && node.deadlineAt !== undefined
    ? Math.min(node.deadlineAt, snapshot.authorizationExpiresAt) - node.updatedAt
    : event.at - node.updatedAt
  const used = addBudgets(snapshot.budget.used, { ...emptyBudget(), timeMs: elapsed })
  const nodeUsed = addBudgets(node.budget.used, { ...emptyBudget(), timeMs: elapsed })
  if (!budgetWithin(used, snapshot.budget.limit) || !budgetWithin(nodeUsed, node.budget.limit)) {
    const blockedReason = reason('closed-attempt-budget-exceeded', node.nodeId, [node.nodeId], {
      used: nodeUsed,
      limit: node.budget.limit,
    })
    return replaceNode({
      ...snapshot,
      status: 'blocked',
      budget: { ...snapshot.budget, used },
      reasons: [...snapshot.reasons, blockedReason],
    }, {
      ...node,
      status: 'failed',
      budget: { ...node.budget, used: nodeUsed },
      activeAttemptId: undefined,
      deadlineAt: undefined,
      reasons: [...node.reasons, event.reason, blockedReason],
      updatedAt: event.at,
    })
  }
  return replaceNode({ ...snapshot, budget: { ...snapshot.budget, used } }, {
    ...node,
    status,
    budget: { ...node.budget, used: nodeUsed },
    activeAttemptId: undefined,
    deadlineAt: undefined,
    reasons: [...node.reasons, event.reason],
    updatedAt: event.at,
  })
}

function cancelRuntime(snapshot: RunRuntimeSnapshot, event: Extract<RunEvent, { type: 'run-cancelled' }>): RunRuntimeSnapshot {
  let used = snapshot.budget.used
  const nodes = Object.fromEntries(Object.entries(snapshot.nodes).map(([id, node]) => {
    if (node.status === 'succeeded' || node.status === 'failed') return [id, node]
    const elapsed = node.status === 'running'
      ? Math.max(0, Math.min(event.at, node.deadlineAt ?? event.at) - node.updatedAt)
      : 0
    const nodeUsed = addBudgets(node.budget.used, { ...emptyBudget(), timeMs: elapsed })
    used = addBudgets(used, { ...emptyBudget(), timeMs: elapsed })
    return [id, runNodeStateSchema.parse({
      ...node,
      status: 'cancelled',
      budget: { ...node.budget, used: nodeUsed },
      activeAttemptId: undefined,
      deadlineAt: undefined,
      reasons: [...node.reasons, event.reason],
      updatedAt: event.at,
    })]
  }))
  return {
    ...snapshot,
    nodes,
    budget: { ...snapshot.budget, used },
    phase: 'terminal',
    status: 'cancelled',
    reasons: [...snapshot.reasons, event.reason],
  }
}

function failRuntime(snapshot: RunRuntimeSnapshot, event: Extract<RunEvent, { type: 'run-failed' }>): RunRuntimeSnapshot {
  if (Object.values(snapshot.nodes).some((node) => node.status === 'running')) {
    throw new Error('A run cannot fail terminally while an attempt still owns execution.')
  }
  const nodes = Object.fromEntries(Object.entries(snapshot.nodes).map(([id, node]) => [id,
    node.status === 'succeeded' || node.status === 'failed' || node.status === 'timed-out'
      ? node
      : runNodeStateSchema.parse({
          ...node,
          status: 'failed',
          reasons: [...node.reasons, event.reason],
          updatedAt: event.at,
        }),
  ]))
  return { ...snapshot, nodes, phase: 'terminal', status: 'failed', reasons: [...snapshot.reasons, event.reason] }
}

function evaluateRuntime(snapshot: RunRuntimeSnapshot, event: Extract<RunEvent, { type: 'run-evaluated' }>): RunRuntimeSnapshot {
  if (snapshot.phase !== 'evaluate') throw new Error('Run evaluation requires the evaluate phase.')
  const repairIds = new Set(event.repairNodeIds)
  if ([...repairIds].some((id) => !snapshot.nodes[id])) throw new Error('Evaluation references an unknown repair node.')
  if (repairIds.size > 0) {
    const nodes = { ...snapshot.nodes }
    const oneAttempt = { ...emptyBudget(), attempts: 1 }
    if (!budgetWithin(addBudgets(snapshot.budget.used, oneAttempt), snapshot.budget.limit)) {
      throw new Error('Exhausted Run budget cannot be reopened under old authority.')
    }
    for (const id of repairIds) {
      const node = nodes[id]!
      if (node.status !== 'failed' && node.status !== 'timed-out' && node.status !== 'retryable') {
        throw new Error(`Evaluation cannot repair node in state ${node.status}: ${id}`)
      }
      if (node.attemptCount >= node.maxAttempts
        || !budgetWithin(addBudgets(node.budget.used, oneAttempt), node.budget.limit)) {
        throw new Error(`Exhausted node budget cannot be reopened under old authority: ${id}`)
      }
      nodes[id] = runNodeStateSchema.parse({
        ...node,
        status: 'queued',
        activeAttemptId: undefined,
        deadlineAt: undefined,
        updatedAt: event.at,
      })
    }
    return { ...snapshot, nodes, phase: 'repair', status: 'active' }
  }
  if (Object.values(snapshot.nodes).some((node) => node.status !== 'succeeded')) {
    throw new Error('A non-repair evaluation requires every node to be settled successfully.')
  }
  return { ...snapshot, phase: 'deliver', status: 'active' }
}

function reason(code: string, nodeId: string, dependencyPath: readonly string[], evidence: Record<string, unknown>): ReasonPath {
  return reasonPathSchema.parse({
    code,
    message: code,
    nodeId,
    dependencyPath,
    evidence: Object.entries(evidence).map(([key, value]) => ({ key, value })),
  })
}

function usageBudget(usage: ResultUsage): Budget {
  return { attempts: 0, ...usage }
}

function replaceNode(snapshot: RunRuntimeSnapshot, node: RunNodeState): RunRuntimeSnapshot {
  return { ...snapshot, nodes: { ...snapshot.nodes, [node.nodeId]: runNodeStateSchema.parse(node) } }
}

function requireNode(snapshot: RunRuntimeSnapshot, nodeId: string): RunNodeState {
  const node = snapshot.nodes[nodeId]
  if (!node) throw new Error(`Unknown run node: ${nodeId}`)
  return node
}

function ownsAttempt(node: RunNodeState, attemptId: string): boolean {
  return node.status === 'running' && node.activeAttemptId === attemptId
}

function isRunTerminal(snapshot: RunRuntimeSnapshot): boolean {
  return snapshot.phase === 'terminal'
}

function assertPhaseTransition(current: RunPhase, next: RunPhase): void {
  const allowed: Record<RunPhase, readonly RunPhase[]> = {
    understand: ['contract'],
    contract: ['plan'],
    plan: ['authorize'],
    authorize: ['execute'],
    execute: ['evaluate'],
    evaluate: [],
    repair: ['evaluate'],
    deliver: [],
    terminal: [],
  }
  if (!allowed[current].includes(next)) throw new Error(`Illegal lifecycle transition: ${current} -> ${next}`)
}

function hashCanonical(value: unknown): string {
  return sha256(canonicalJson(value))
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && new Set(left).size === left.length
    && left.every((id) => right.includes(id))
}

function remainingUsageLimit(
  runUsed: Budget,
  runLimit: Budget,
  nodeUsed: Budget,
  nodeLimit: Budget,
): ResultUsage {
  return resultUsageSchema.parse({
    artifacts: Math.min(runLimit.artifacts - runUsed.artifacts, nodeLimit.artifacts - nodeUsed.artifacts),
    bytes: Math.min(runLimit.bytes - runUsed.bytes, nodeLimit.bytes - nodeUsed.bytes),
    timeMs: Math.min(runLimit.timeMs - runUsed.timeMs, nodeLimit.timeMs - nodeUsed.timeMs),
    spendUnits: Math.min(
      runLimit.spendUnits - runUsed.spendUnits,
      nodeLimit.spendUnits - nodeUsed.spendUnits,
    ),
  })
}

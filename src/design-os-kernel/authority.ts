import { z } from 'zod'
import { fingerprint } from '@/design-ir/fingerprint'
import {
  budgetSchema,
  capabilityCatalogSchema,
  executionPlanSchema,
  outcomeContractSchema,
  recordIdSchema,
  sha256Schema,
  timestampSchema,
  type Budget,
  type CapabilityCatalog,
  type ExecutionPlan,
  type ExecutionPlanNode,
  type FrozenDocument,
  type OutcomeContract,
} from './contracts'

export const authorizationReferenceSchema = z.object({
  id: recordIdSchema,
  contractHash: sha256Schema,
  planHash: sha256Schema,
  approvedNodeIds: z.array(recordIdSchema).max(20_000),
  issuedAt: timestampSchema,
  expiresAt: timestampSchema,
  issuer: z.object({ kind: z.literal('host'), id: recordIdSchema }).strict(),
}).strict().superRefine((authorization, context) => {
  if (authorization.expiresAt <= authorization.issuedAt) {
    context.addIssue({ code: 'custom', message: 'Authorization expiry must follow issuance.' })
  }
  if (new Set(authorization.approvedNodeIds).size !== authorization.approvedNodeIds.length) {
    context.addIssue({ code: 'custom', message: 'Authorized node ids must be unique.' })
  }
})
export type AuthorizationReference = z.infer<typeof authorizationReferenceSchema>

export const hostLimitsSchema = z.object({
  graphNodes: z.number().int().positive(),
  artifacts: z.number().int().positive(),
  bytes: z.number().int().positive(),
  timeMs: z.number().int().positive(),
  attempts: z.number().int().positive(),
  spendUnits: z.number().nonnegative(),
}).strict()
export type HostLimits = z.infer<typeof hostLimitsSchema>

export const successorProposalSchema = z.object({
  version: z.literal('design-os.successor-proposal.v1'),
  predecessorContractHash: sha256Schema,
  predecessorPlanHash: sha256Schema,
  requestedChanges: z.array(z.object({
    dimension: z.enum(['scope', 'constraint', 'capability', 'budget', 'target']),
    current: z.array(recordIdSchema),
    proposed: z.array(recordIdSchema),
  }).strict()).min(1).max(10_000),
  executable: z.literal(false),
}).strict()
export type SuccessorProposal = z.infer<typeof successorProposalSchema>

export interface AuthorityValidation {
  readonly valid: boolean
  readonly reasons: readonly string[]
}

export async function freezeDocument<Document>(document: Document): Promise<FrozenDocument<Document>> {
  return { document: structuredClone(document), contentHash: await fingerprint(document) }
}

export async function verifyFrozenDocument<Document>(frozen: FrozenDocument<Document>): Promise<void> {
  if (await fingerprint(frozen.document) !== frozen.contentHash) {
    throw new Error('Frozen document content no longer matches its content hash.')
  }
}

export function validatePlanAuthority(input: {
  readonly contract: OutcomeContract
  readonly plan: ExecutionPlan
  readonly catalog: CapabilityCatalog
  readonly hostLimits: HostLimits
}): AuthorityValidation {
  const contract = outcomeContractSchema.parse(input.contract)
  const plan = executionPlanSchema.parse(input.plan)
  const catalog = capabilityCatalogSchema.parse(input.catalog)
  const limits = hostLimitsSchema.parse(input.hostLimits)
  const reasons: string[] = []
  const allowedNodes = new Set(contract.body.allowedOutcomeNodeIds)
  const allowedCapabilities = new Set(contract.body.allowedCapabilityIds)
  const availableCapabilities = new Set(catalog.body.entries.map((entry) => entry.id))
  const allowedTargets = new Set(contract.body.allowedTargetIds)
  const allowedConstraints = new Set(contract.body.constraintIds)
  if (plan.body.nodes.length > limits.graphNodes) reasons.push('host-graph-node-budget-exceeded')
  if (!budgetWithin(plan.body.budget, contract.body.budget)) reasons.push('contract-budget-exceeded')
  if (!budgetWithin(plan.body.budget, hostBudget(limits))) reasons.push('host-budget-exceeded')
  const summed = sumBudgets(plan.body.nodes.map((node) => node.budget))
  if (!budgetWithin(summed, plan.body.budget)) reasons.push('plan-node-budget-sum-exceeded')
  const plannedOutcomeNodeIds = new Set(plan.body.nodes.map((node) => node.outcomeNodeId))
  for (const outcomeNodeId of allowedNodes) {
    if (!plannedOutcomeNodeIds.has(outcomeNodeId)) reasons.push(`missing-outcome-plan:${outcomeNodeId}`)
  }
  for (const node of plan.body.nodes) {
    if (!allowedNodes.has(node.outcomeNodeId)) reasons.push(`out-of-scope:${node.id}`)
    if (!allowedCapabilities.has(node.capabilityId)) reasons.push(`unapproved-capability:${node.id}`)
    if (!availableCapabilities.has(node.capabilityId)) reasons.push(`unavailable-capability:${node.id}`)
    if (!allowedTargets.has(node.targetId)) reasons.push(`unapproved-target:${node.id}`)
    if (node.constraints.some((constraint) => !allowedConstraints.has(constraint))) {
      reasons.push(`unapproved-constraint:${node.id}`)
    }
    const capability = catalog.body.entries.find((entry) => entry.id === node.capabilityId)
    if (capability && !capability.outputSchemas.some((schema) => schema.id === node.outputSchema.id
      && schema.version === node.outputSchema.version)) {
      reasons.push(`unsupported-output-schema:${node.id}`)
    }
    if (capability && node.transientFailureCodes.some((code) => !capability.transientFailureCodes.includes(code))) {
      reasons.push(`unsupported-transient-failure:${node.id}`)
    }
    if (node.maxAttempts > node.budget.attempts) reasons.push(`attempt-budget-mismatch:${node.id}`)
    if (node.deadlineMs > node.budget.timeMs) reasons.push(`deadline-budget-mismatch:${node.id}`)
  }
  if (hasCycle(plan.body.nodes)) reasons.push('plan-dependency-cycle')
  return { valid: reasons.length === 0, reasons }
}

export async function issueAuthorization(input: {
  readonly id: string
  readonly contract: FrozenDocument<OutcomeContract>
  readonly plan: FrozenDocument<ExecutionPlan>
  readonly catalog: CapabilityCatalog
  readonly hostLimits: HostLimits
  readonly issuerId: string
  readonly issuedAt: number
  readonly expiresAt: number
}): Promise<AuthorizationReference> {
  await verifyFrozenDocument(input.contract)
  await verifyFrozenDocument(input.plan)
  if (input.plan.document.body.contract.id !== input.contract.document.identity.id
    || input.plan.document.body.contract.revision !== input.contract.document.identity.revision
    || input.plan.document.body.contract.contentHash !== input.contract.contentHash) {
    throw new Error('Plan is not bound to the supplied frozen Contract.')
  }
  const validation = validatePlanAuthority({
    contract: input.contract.document,
    plan: input.plan.document,
    catalog: input.catalog,
    hostLimits: input.hostLimits,
  })
  if (!validation.valid) throw new Error(`Plan authority rejected: ${validation.reasons.join(', ')}`)
  return authorizationReferenceSchema.parse({
    id: input.id,
    contractHash: input.contract.contentHash,
    planHash: input.plan.contentHash,
    approvedNodeIds: input.plan.document.body.nodes.map((node) => node.id),
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    issuer: { kind: 'host', id: input.issuerId },
  })
}

export async function assertNodeAuthority(input: {
  readonly node: ExecutionPlanNode
  readonly authorization: AuthorizationReference
  readonly contract: FrozenDocument<OutcomeContract>
  readonly plan: FrozenDocument<ExecutionPlan>
  readonly now: number
}): Promise<void> {
  const authorization = authorizationReferenceSchema.parse(input.authorization)
  await verifyFrozenDocument(input.contract)
  await verifyFrozenDocument(input.plan)
  if (input.plan.document.body.contract.id !== input.contract.document.identity.id
    || input.plan.document.body.contract.revision !== input.contract.document.identity.revision
    || input.plan.document.body.contract.contentHash !== input.contract.contentHash) {
    throw new Error('Frozen Plan is not bound to the frozen Contract.')
  }
  if (authorization.contractHash !== input.contract.contentHash
    || authorization.planHash !== input.plan.contentHash) {
    throw new Error('Authorization is not bound to the frozen Contract and Plan.')
  }
  if (input.now < authorization.issuedAt) throw new Error('Authorization is not active yet.')
  if (input.now >= authorization.expiresAt) throw new Error('Authorization has expired.')
  if (!authorization.approvedNodeIds.includes(input.node.id)) {
    throw new Error(`Plan node is outside authorized scope: ${input.node.id}`)
  }
  const frozenNode = input.plan.document.body.nodes.find((node) => node.id === input.node.id)
  if (!frozenNode || await fingerprint(frozenNode) !== await fingerprint(input.node)) {
    throw new Error(`Executor node contract differs from the frozen Plan: ${input.node.id}`)
  }
}

export function proposeSuccessor(input: {
  readonly contractHash: string
  readonly planHash: string
  readonly changes: SuccessorProposal['requestedChanges']
}): SuccessorProposal {
  return successorProposalSchema.parse({
    version: 'design-os.successor-proposal.v1',
    predecessorContractHash: input.contractHash,
    predecessorPlanHash: input.planHash,
    requestedChanges: input.changes,
    executable: false,
  })
}

export function budgetWithin(used: Budget, limit: Budget): boolean {
  return used.attempts <= limit.attempts
    && used.artifacts <= limit.artifacts
    && used.bytes <= limit.bytes
    && used.timeMs <= limit.timeMs
    && used.spendUnits <= limit.spendUnits
}

export function addBudgets(left: Budget, right: Budget): Budget {
  return budgetSchema.parse({
    attempts: left.attempts + right.attempts,
    artifacts: left.artifacts + right.artifacts,
    bytes: left.bytes + right.bytes,
    timeMs: left.timeMs + right.timeMs,
    spendUnits: left.spendUnits + right.spendUnits,
  })
}

export function emptyBudget(): Budget {
  return { attempts: 0, artifacts: 0, bytes: 0, timeMs: 0, spendUnits: 0 }
}

function sumBudgets(budgets: readonly Budget[]): Budget {
  return budgets.reduce(addBudgets, emptyBudget())
}

function hostBudget(limits: HostLimits): Budget {
  return {
    attempts: limits.attempts,
    artifacts: limits.artifacts,
    bytes: limits.bytes,
    timeMs: limits.timeMs,
    spendUnits: limits.spendUnits,
  }
}

function hasCycle(nodes: readonly ExecutionPlanNode[]): boolean {
  const dependencies = new Map(nodes.map((node) => [node.id, node.dependencyNodeIds]))
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true
    if (visited.has(id)) return false
    visiting.add(id)
    for (const dependency of dependencies.get(id) ?? []) {
      if (visit(dependency)) return true
    }
    visiting.delete(id)
    visited.add(id)
    return false
  }
  return nodes.some((node) => visit(node.id))
}

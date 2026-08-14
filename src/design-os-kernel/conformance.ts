import { z } from 'zod'
import { canonicalJson, fingerprint } from '@/design-ir/fingerprint'
import {
  evaluationReportSchema,
  evidenceGraphSchema,
  executionPlanSchema,
  outcomeContractSchema,
  outcomeGraphSchema,
  recordIdSchema,
  type EvaluationReport,
  type EvidenceGraph,
  type ExecutionPlan,
  type OutcomeContract,
  type OutcomeGraph,
} from './contracts'

export const hostBindingsSchema = z.object({
  hostId: recordIdSchema,
  authorizationId: recordIdSchema,
  capabilityRoutes: z.record(recordIdSchema, recordIdSchema),
  targetBindings: z.record(recordIdSchema, recordIdSchema),
}).strict()
export type HostBindings = z.infer<typeof hostBindingsSchema>

export interface HostCompilation {
  readonly evidenceGraph: EvidenceGraph
  readonly outcomeGraph: OutcomeGraph
  readonly contract: OutcomeContract
  readonly plan: ExecutionPlan
  readonly evaluation: EvaluationReport
  readonly bindings: HostBindings
}

export interface NormalizedHostCompilation {
  readonly evidence: EvidenceGraph
  readonly outcome: OutcomeGraph
  readonly contract: Omit<OutcomeContract, 'body'> & {
    readonly body: Omit<OutcomeContract['body'], 'allowedTargetIds'> & { readonly allowedTargetIds: readonly string[] }
  }
  readonly plan: {
    readonly protocol: ExecutionPlan['protocol']
    readonly kind: ExecutionPlan['kind']
    readonly schema: ExecutionPlan['schema']
    readonly identity: ExecutionPlan['identity']
    readonly provenance: ExecutionPlan['provenance']
    readonly contract: { readonly id: string, readonly revision: string }
    readonly nodes: readonly ExecutionPlan['body']['nodes'][number][]
    readonly budget: ExecutionPlan['body']['budget']
  }
  readonly evaluation: EvaluationReport
}

export function normalizeHostCompilation(input: HostCompilation): NormalizedHostCompilation {
  const evidence = evidenceGraphSchema.parse(input.evidenceGraph)
  const outcome = outcomeGraphSchema.parse(input.outcomeGraph)
  const contract = outcomeContractSchema.parse(input.contract)
  const plan = executionPlanSchema.parse(input.plan)
  const evaluation = evaluationReportSchema.parse(input.evaluation)
  const bindings = hostBindingsSchema.parse(input.bindings)
  assertBindingCoverage(bindings.capabilityRoutes, contract.body.allowedCapabilityIds, 'capability')
  assertBindingCoverage(bindings.targetBindings, contract.body.allowedTargetIds, 'target')
  const logicalTargetByHost = new Map(Object.entries(bindings.targetBindings).map(([logical, host]) => [host, logical]))
  const logicalCapabilityByHost = new Map(Object.entries(bindings.capabilityRoutes).map(([logical, host]) => [host, logical]))
  const normalizeTarget = (targetId: string) => logicalTargetByHost.get(targetId) ?? targetId
  const normalizeCapability = (capabilityId: string) => logicalCapabilityByHost.get(capabilityId) ?? capabilityId
  return {
    evidence,
    outcome,
    contract: {
      ...contract,
      body: {
        ...contract.body,
        allowedCapabilityIds: contract.body.allowedCapabilityIds.map(normalizeCapability).sort(),
        allowedTargetIds: contract.body.allowedTargetIds.map(normalizeTarget).sort(),
      },
    },
    plan: {
      protocol: plan.protocol,
      kind: plan.kind,
      schema: plan.schema,
      identity: plan.identity,
      provenance: plan.provenance,
      contract: { id: plan.body.contract.id, revision: plan.body.contract.revision },
      nodes: plan.body.nodes.map((node) => ({
        ...node,
        capabilityId: normalizeCapability(node.capabilityId),
        targetId: normalizeTarget(node.targetId),
      })),
      budget: plan.body.budget,
    },
    evaluation,
  }
}

export function assertCrossHostConformance(left: HostCompilation, right: HostCompilation): void {
  const leftNormalized = normalizeHostCompilation(left)
  const rightNormalized = normalizeHostCompilation(right)
  if (canonicalJson(leftNormalized) !== canonicalJson(rightNormalized)) {
    throw new Error(`Host semantic conformance failed: ${left.bindings.hostId} != ${right.bindings.hostId}`)
  }
}

export const ownerDeclarationSchema = z.object({
  kind: z.enum(['schema', 'recipe', 'reducer', 'evaluator']),
  id: recordIdSchema,
  ownerLayer: z.enum(['kernel', 'profile', 'host']),
  source: z.string().min(1).max(1_000),
}).strict()
export type OwnerDeclaration = z.infer<typeof ownerDeclarationSchema>

export function validateCanonicalOwnership(declarations: readonly OwnerDeclaration[]): void {
  for (const declarationInput of declarations) {
    const declaration = ownerDeclarationSchema.parse(declarationInput)
    if (declaration.ownerLayer === 'host') {
      throw new Error(`Host-local canonical ${declaration.kind} is forbidden: ${declaration.id}`)
    }
    if ((declaration.kind === 'schema' || declaration.kind === 'reducer')
      && declaration.ownerLayer !== 'kernel') {
      throw new Error(`Canonical ${declaration.kind} must be Kernel-owned: ${declaration.id}`)
    }
  }
}

export const benchmarkPromotionSchema = z.object({
  id: recordIdSchema,
  finding: z.string().min(1).max(5_000),
  ownership: z.enum(['Kernel', 'Profile', 'Host']),
  profileEvidence: z.array(z.object({ profileId: recordIdSchema, evidenceHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).max(100),
}).strict().superRefine((promotion, context) => {
  if (promotion.ownership !== 'Kernel') return
  const profiles = new Set(promotion.profileEvidence.map((evidence) => evidence.profileId))
  const evidenceHashes = new Set(promotion.profileEvidence.map((evidence) => evidence.evidenceHash))
  if (profiles.size < 2 || evidenceHashes.size < 2) {
    context.addIssue({ code: 'custom', message: 'Kernel promotion requires distinct proof from at least two profiles.' })
  }
})
export type BenchmarkPromotion = z.infer<typeof benchmarkPromotionSchema>

export async function benchmarkPromotionIdentity(promotion: BenchmarkPromotion): Promise<string> {
  return fingerprint(benchmarkPromotionSchema.parse(promotion))
}

function assertBindingCoverage(
  bindings: Readonly<Record<string, string>>,
  actualIds: readonly string[],
  kind: 'capability' | 'target',
): void {
  const hostIds = Object.values(bindings)
  if (new Set(hostIds).size !== hostIds.length
    || hostIds.length !== actualIds.length
    || actualIds.some((id) => !hostIds.includes(id))) {
    throw new Error(`Host ${kind} bindings must cover every and only compiled ${kind} id.`)
  }
}

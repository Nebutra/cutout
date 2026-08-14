import { z } from 'zod'
import {
  artifactGraphSchema,
  evaluateOutcomeGraph,
  type ArtifactGraph,
  type EvaluationReport,
  type EvaluatorRule,
  type ExecutionPlan,
  type OutcomeGraph,
  type ReasonPath,
} from '@/design-os-kernel'
import {
  capabilityReceiptSchema,
  commerceMediaArtifactSchema,
  localizedDescriptionSchema,
  strategyDocumentSchema,
  validationFindingSchema,
  type CapabilityReceipt,
  type CommerceMediaArtifact,
  type LocalizedDescription,
  type ProductFacts,
  type StrategyDocument,
  type ValidationFinding,
} from './contracts'
import type { AttributeIndex, CategoryIndex } from './catalog'
import { validateCommerceMedia, validateLocalizedDescription, type CommercePolicyPack } from './policies'
import {
  COMMERCE_SEMANTIC_ROLES,
  commerceOutcomePayloadSchema,
  policyForOutcome,
  type CommerceSemanticRole,
} from './profile'

const materialPayloadSchema = z.union([
  localizedDescriptionSchema,
  commerceMediaArtifactSchema,
  strategyDocumentSchema,
])
const supportingReceiptSchema = z.object({
  id: z.string().min(1).max(240),
  routeId: z.string().min(1).max(240),
}).strict()
export type CommerceMaterialPayload = LocalizedDescription | CommerceMediaArtifact | StrategyDocument

export const commerceMaterialPublicationSchema = z.object({
  artifactId: z.string().min(1).max(240),
  outcomeNodeId: z.string().min(1).max(240),
  mediaType: z.string().min(1).max(120),
  byteLength: z.number().int().positive(),
  payload: materialPayloadSchema,
}).strict()
export type CommerceMaterialPublication = z.infer<typeof commerceMaterialPublicationSchema>

export interface CommerceEvaluationResult {
  readonly ready: boolean
  readonly findings: readonly ValidationFinding[]
  readonly validArtifactIds: readonly string[]
  readonly failedOutcomeNodeIds: readonly string[]
  readonly repairPlanNodeIds: readonly string[]
  readonly imageUsability: {
    readonly usable: number
    readonly required: number
    readonly ratio: number
  }
}

function finding(
  outcomeNodeId: string,
  code: string,
  message: string,
  artifactId?: string,
): ValidationFinding {
  return validationFindingSchema.parse({
    code,
    message,
    outcomeNodeId,
    ...(artifactId ? { artifactId } : {}),
    severity: 'blocking',
    factIds: [],
  })
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort()
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function validateStrategy(input: {
  readonly nodeId: string
  readonly artifactId: string
  readonly strategy: StrategyDocument
  readonly facts: ProductFacts
  readonly plan: ExecutionPlan
  readonly receipts: readonly CapabilityReceipt[]
  readonly supportingReceipts: readonly z.infer<typeof supportingReceiptSchema>[]
  readonly priorFindings: readonly ValidationFinding[]
  readonly mediaType: string
  readonly byteLength: number
  readonly policy: CommercePolicyPack
}): readonly ValidationFinding[] {
  const result: ValidationFinding[] = []
  const knownFacts = new Set(input.facts.facts
    .filter((fact) => fact.confidence !== 'unknown' && fact.value.type !== 'unknown')
    .map((fact) => fact.id))
  if (input.strategy.factIds.some((factId) => !knownFacts.has(factId))) {
    result.push(finding(input.nodeId, 'strategy-fact-unresolved', 'Strategy references an unavailable or unknown product fact.', input.artifactId))
  }
  const expectedPlanNodes = sortedUnique(input.plan.body.nodes.map((node) => node.id))
  if (!arraysEqual(sortedUnique(input.strategy.planNodeIds), expectedPlanNodes)) {
    result.push(finding(input.nodeId, 'strategy-plan-incomplete', 'Strategy must cite the exact compiled plan node closure.', input.artifactId))
  }
  const strategyPlanNodeIds = new Set(input.plan.body.nodes
    .filter((node) => node.outputSchema.id === 'commerce.strategy-document')
    .map((node) => node.id))
  const evidenceReceipts = input.receipts.filter((receipt) => !strategyPlanNodeIds.has(receipt.nodeId))
  const expectedRoutes = sortedUnique([
    ...evidenceReceipts.map((receipt) => receipt.routeId),
    ...input.supportingReceipts.map((receipt) => receipt.routeId),
  ])
  if (!arraysEqual(sortedUnique(input.strategy.routeIds), expectedRoutes)) {
    result.push(finding(input.nodeId, 'strategy-routes-incomplete', 'Strategy must cite the actual capability routes.', input.artifactId))
  }
  const expectedReceipts = sortedUnique([
    ...evidenceReceipts.map((receipt) => receipt.id),
    ...input.supportingReceipts.map((receipt) => receipt.id),
  ])
  if (!arraysEqual(sortedUnique(input.strategy.receiptIds), expectedReceipts)) {
    result.push(finding(input.nodeId, 'strategy-receipts-incomplete', 'Strategy must cite the actual capability receipts.', input.artifactId))
  }
  const expectedRepairs = sortedUnique(evidenceReceipts.filter((receipt) => receipt.attempt > 1).map((receipt) => receipt.id))
  if (!arraysEqual(sortedUnique(input.strategy.repairReceiptIds), expectedRepairs)) {
    result.push(finding(input.nodeId, 'strategy-repairs-incomplete', 'Strategy must cite the actual repair receipts.', input.artifactId))
  }
  const expectedValidationCodes = input.priorFindings.length > 0
    ? sortedUnique(input.priorFindings.map((item) => item.code))
    : ['all-gates-passed']
  if (!arraysEqual(sortedUnique(input.strategy.validationFindingCodes), expectedValidationCodes)) {
    result.push(finding(input.nodeId, 'strategy-validations-incomplete', 'Strategy must cite the actual validation result closure.', input.artifactId))
  }
  for (const claim of input.strategy.narrative) {
    if (claim.citations.some((citation) => !knownFacts.has(citation.factId))) {
      result.push(finding(input.nodeId, 'strategy-narrative-uncited', 'Strategy narrative must cite non-unknown normalized facts.', input.artifactId))
    }
  }
  if (!input.policy.constraints.strategyMediaTypes.includes(input.mediaType)) {
    result.push(finding(input.nodeId, 'strategy-media-type-invalid', `Strategy media type is not permitted: ${input.mediaType}`, input.artifactId))
  }
  if (input.byteLength > input.policy.constraints.strategyMaximumBytes) {
    result.push(finding(input.nodeId, 'strategy-size-invalid', `Strategy exceeds ${input.policy.constraints.strategyMaximumBytes} bytes.`, input.artifactId))
  }
  return result
}

export function evaluateCommerceProduction(input: {
  readonly facts: ProductFacts
  readonly categoryIndex: CategoryIndex
  readonly attributeIndex: AttributeIndex
  readonly outcomeGraph: OutcomeGraph
  readonly plan: ExecutionPlan
  readonly publications: readonly CommerceMaterialPublication[]
  readonly receipts: readonly CapabilityReceipt[]
  readonly supportingReceipts?: readonly z.infer<typeof supportingReceiptSchema>[]
  readonly validationHistory?: readonly ValidationFinding[]
}): CommerceEvaluationResult {
  const publications = input.publications.map((publication) => commerceMaterialPublicationSchema.parse(publication))
  const receipts = input.receipts.map((receipt) => capabilityReceiptSchema.parse(receipt))
  const supportingReceipts = (input.supportingReceipts ?? []).map((receipt) => supportingReceiptSchema.parse(receipt))
  const primaryReceiptIds = new Set(receipts.map((receipt) => receipt.id))
  const supportingReceiptIds = supportingReceipts.map((receipt) => receipt.id)
  if (new Set(supportingReceiptIds).size !== supportingReceiptIds.length
    || supportingReceiptIds.some((id) => primaryReceiptIds.has(id))) {
    throw new Error('Commerce supporting receipt ids must be unique and distinct from capability receipts.')
  }
  const outcomeById = new Map(input.outcomeGraph.body.nodes.map((node) => [node.id, node]))
  const planByOutcomeId = new Map(input.plan.body.nodes.map((node) => [node.outcomeNodeId, node]))
  const publicationByOutcomeId = new Map<string, CommerceMaterialPublication>()
  const findings: ValidationFinding[] = []
  const artifactIds = publications.map((publication) => publication.artifactId)
  if (new Set(artifactIds).size !== artifactIds.length) {
    findings.push(finding('outcome:commerce:profile', 'artifact-id-duplicate', 'Commerce publications must use unique artifact ids.'))
  }
  const receiptIds = receipts.map((receipt) => receipt.id)
  if (new Set(receiptIds).size !== receiptIds.length) {
    findings.push(finding('outcome:commerce:profile', 'receipt-id-duplicate', 'Capability receipt ids must be unique.'))
  }
  const knownPlanNodeIds = new Set(input.plan.body.nodes.map((node) => node.id))
  if (receipts.some((receipt) => !knownPlanNodeIds.has(receipt.nodeId))) {
    findings.push(finding('outcome:commerce:profile', 'receipt-node-unknown', 'Capability receipt references an unknown plan node.'))
  }
  for (const publication of publications) {
    if (!outcomeById.has(publication.outcomeNodeId)) {
      findings.push(finding('outcome:commerce:profile', 'publication-outcome-unknown', `Publication references unknown Outcome: ${publication.outcomeNodeId}`, publication.artifactId))
      continue
    }
    if (publicationByOutcomeId.has(publication.outcomeNodeId)) {
      findings.push(finding(publication.outcomeNodeId, 'duplicate-publication', 'Each Commerce Outcome must publish exactly one artifact.', publication.artifactId))
      continue
    }
    publicationByOutcomeId.set(publication.outcomeNodeId, publication)
  }
  const graphRoles = input.outcomeGraph.body.nodes.map((node) => commerceOutcomePayloadSchema.parse(node.payload).semanticRole)
  for (const role of COMMERCE_SEMANTIC_ROLES) {
    if (!graphRoles.includes(role)) findings.push(finding(`outcome:commerce:${role}`, 'semantic-role-missing', `Required semantic role is missing: ${role}`))
  }
  if (graphRoles.some((role, index) => graphRoles.indexOf(role) !== index) || graphRoles.length !== COMMERCE_SEMANTIC_ROLES.length) {
    findings.push(finding('outcome:commerce:profile', 'semantic-role-closure-invalid', 'Commerce graph must contain every and only required semantic role once.'))
  }

  for (const node of input.outcomeGraph.body.nodes.filter((candidate) => {
    const payload = commerceOutcomePayloadSchema.parse(candidate.payload)
    return payload.kind !== 'strategy'
  })) {
    const payload = commerceOutcomePayloadSchema.parse(node.payload)
    const publication = publicationByOutcomeId.get(node.id)
    if (!publication) {
      findings.push(finding(node.id, 'publication-missing', `No material was published for ${payload.semanticRole}.`))
      continue
    }
    const planNode = planByOutcomeId.get(node.id)
    const matchingReceipts = receipts.filter((receipt) => receipt.nodeId === planNode?.id
      && receipt.capabilityId === planNode.capabilityId
      && receipt.artifactId === publication.artifactId)
    const acceptedReceipt = matchingReceipts.find((receipt) => receipt.status === 'accepted')
    if (!acceptedReceipt) {
      findings.push(finding(node.id, 'receipt-not-accepted', 'Published material requires a matching accepted capability receipt.', publication.artifactId))
      continue
    }
    if (payload.kind === 'localized-description') {
      const parsed = localizedDescriptionSchema.safeParse(publication.payload)
      if (!parsed.success) {
        findings.push(finding(node.id, 'localized-description-malformed', parsed.error.message, publication.artifactId))
        continue
      }
      findings.push(...validateLocalizedDescription({
        outcomeNodeId: node.id,
        description: parsed.data,
        facts: input.facts,
        policy: policyForOutcome(node),
        categoryIndex: input.categoryIndex,
        attributeIndex: input.attributeIndex,
        artifactId: publication.artifactId,
        mediaType: publication.mediaType,
        byteLength: publication.byteLength,
      }))
    } else if (payload.kind === 'media') {
      const parsed = commerceMediaArtifactSchema.safeParse(publication.payload)
      if (!parsed.success) {
        findings.push(finding(node.id, 'media-artifact-malformed', parsed.error.message, publication.artifactId))
        continue
      }
      findings.push(...validateCommerceMedia({
        outcomeNodeId: node.id,
        artifactId: publication.artifactId,
        artifact: parsed.data,
        facts: input.facts,
        policy: policyForOutcome(node),
        expectedRole: payload.semanticRole,
        expectedMediaKind: payload.mediaKind,
        identityLockId: payload.identityLockId,
        creativeDirectionId: payload.creativeDirectionId,
      }))
      if (publication.mediaType !== parsed.data.mediaType || publication.byteLength !== parsed.data.byteLength) {
        findings.push(finding(node.id, 'publication-media-metadata-mismatch', 'Published media metadata must match the validated media payload.', publication.artifactId))
      }
    }
  }

  const priorFindings = [
    ...(input.validationHistory ?? []).map((item) => validationFindingSchema.parse(item)),
    ...findings,
  ]
  const strategyNode = input.outcomeGraph.body.nodes.find((node) => (
    commerceOutcomePayloadSchema.parse(node.payload).kind === 'strategy'
  ))
  if (strategyNode) {
    const publication = publicationByOutcomeId.get(strategyNode.id)
    if (!publication) {
      findings.push(finding(strategyNode.id, 'publication-missing', 'No evidence-derived strategy was published.'))
    } else {
      const planNode = planByOutcomeId.get(strategyNode.id)
      const acceptedReceipt = receipts.find((receipt) => receipt.nodeId === planNode?.id
        && receipt.capabilityId === planNode.capabilityId
        && receipt.artifactId === publication.artifactId
        && receipt.status === 'accepted')
      if (!acceptedReceipt) {
        findings.push(finding(strategyNode.id, 'receipt-not-accepted', 'Strategy requires a matching accepted capability receipt.', publication.artifactId))
      } else {
        const parsed = strategyDocumentSchema.safeParse(publication.payload)
        if (!parsed.success) findings.push(finding(strategyNode.id, 'strategy-malformed', parsed.error.message, publication.artifactId))
        else findings.push(...validateStrategy({
          nodeId: strategyNode.id,
          artifactId: publication.artifactId,
          strategy: parsed.data,
          facts: input.facts,
          plan: input.plan,
          receipts,
          supportingReceipts,
          priorFindings,
          mediaType: publication.mediaType,
          byteLength: publication.byteLength,
          policy: policyForOutcome(strategyNode),
        }))
      }
    }
  }

  const failedOutcomeNodeIds = sortedUnique(findings.map((item) => item.outcomeNodeId)
    .filter((nodeId) => outcomeById.has(nodeId)))
  const failed = new Set(failedOutcomeNodeIds)
  const validArtifactIds = publications
    .filter((publication) => !failed.has(publication.outcomeNodeId))
    .map((publication) => publication.artifactId)
    .sort()
  const imageNodeIds = input.outcomeGraph.body.nodes.filter((node) => {
    const payload = commerceOutcomePayloadSchema.parse(node.payload)
    return payload.kind === 'media' && payload.mediaKind === 'image'
  }).map((node) => node.id)
  const usableImages = imageNodeIds.filter((nodeId) => publicationByOutcomeId.has(nodeId) && !failed.has(nodeId)).length
  const ratio = imageNodeIds.length === 0 ? 0 : usableImages / imageNodeIds.length
  if (ratio < 0.8) {
    findings.push(finding('outcome:commerce:profile', 'image-usability-below-threshold', `Only ${usableImages}/${imageNodeIds.length} images are usable.`))
  }
  return {
    ready: findings.length === 0,
    findings,
    validArtifactIds,
    failedOutcomeNodeIds,
    repairPlanNodeIds: input.plan.body.nodes
      .filter((node) => failed.has(node.outcomeNodeId))
      .map((node) => node.id)
      .sort(),
    imageUsability: { usable: usableImages, required: imageNodeIds.length, ratio },
  }
}

function reasonFromFinding(findingValue: ValidationFinding): ReasonPath {
  return {
    code: findingValue.code,
    message: findingValue.message,
    nodeId: findingValue.outcomeNodeId,
    dependencyPath: [findingValue.outcomeNodeId],
    evidence: findingValue.factIds.map((factId) => ({ key: 'factId', value: factId })),
  }
}

export function createCommerceEvaluatorRules(input: {
  readonly evaluation: CommerceEvaluationResult
  readonly publications: readonly CommerceMaterialPublication[]
}): Readonly<Record<string, EvaluatorRule>> {
  const publicationByOutcomeId = new Map(input.publications.map((publication) => [publication.outcomeNodeId, publication]))
  const rule: EvaluatorRule = {
    id: 'commerce.material-evaluator',
    version: 1,
    evaluate: ({ outcome }) => {
      const reasons = input.evaluation.findings.filter((findingValue) => findingValue.outcomeNodeId === outcome.id)
      const publication = publicationByOutcomeId.get(outcome.id)
      return {
        status: reasons.length > 0 ? 'repairable' : 'passed',
        artifactIds: publication && reasons.length === 0 ? [publication.artifactId] : [],
        reasons: reasons.map(reasonFromFinding),
      }
    },
  }
  return {
    'commerce.localized-description@1': rule,
    'commerce.media-artifact@1': rule,
    'commerce.strategy-document@1': rule,
  }
}

export async function createCommerceKernelEvaluation(input: {
  readonly id: string
  readonly revision: string
  readonly evidenceGraph: Parameters<typeof evaluateOutcomeGraph>[0]['evidenceGraph']
  readonly outcomeGraph: OutcomeGraph
  readonly artifactGraph: ArtifactGraph
  readonly evaluation: CommerceEvaluationResult
  readonly publications: readonly CommerceMaterialPublication[]
}): Promise<EvaluationReport> {
  return evaluateOutcomeGraph({
    id: input.id,
    revision: input.revision,
    evidenceGraph: input.evidenceGraph,
    outcomeGraph: input.outcomeGraph,
    artifactGraph: artifactGraphSchema.parse(input.artifactGraph),
    evaluatorByOutcomeSchema: createCommerceEvaluatorRules(input),
  })
}

export function semanticRoleForPublication(
  publication: CommerceMaterialPublication,
  graph: OutcomeGraph,
): CommerceSemanticRole {
  const node = graph.body.nodes.find((candidate) => candidate.id === publication.outcomeNodeId)
  if (!node) throw new Error(`Publication references unknown Outcome: ${publication.outcomeNodeId}`)
  return commerceOutcomePayloadSchema.parse(node.payload).semanticRole
}

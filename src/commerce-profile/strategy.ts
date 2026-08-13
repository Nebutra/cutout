import { strategyDocumentSchema, type CapabilityReceipt, type ProductFacts, type StrategyDocument, type ValidationFinding } from './contracts'
import type { ExecutionPlan } from '@/design-os-kernel'

export function buildCommerceStrategyDocument(input: {
  readonly facts: ProductFacts
  readonly plan: ExecutionPlan
  readonly receipts: readonly CapabilityReceipt[]
  readonly findings: readonly ValidationFinding[]
}): StrategyDocument {
  const evidencedFacts = input.facts.facts.filter((fact) => fact.confidence !== 'unknown' && fact.value.type !== 'unknown')
  const narrativeFact = evidencedFacts.find((fact) => fact.field === 'title')
    ?? evidencedFacts.find((fact) => fact.field === 'identity.product-id')
  if (!narrativeFact) throw new Error('Strategy requires at least one non-unknown identity or title fact.')
  const strategyNodeIds = new Set(input.plan.body.nodes
    .filter((node) => node.outputSchema.id === 'commerce.strategy-document')
    .map((node) => node.id))
  const evidenceReceipts = input.receipts.filter((receipt) => !strategyNodeIds.has(receipt.nodeId))
  const repairReceipts = evidenceReceipts.filter((receipt) => receipt.attempt > 1)
  return strategyDocumentSchema.parse({
    schema: 'commerce.strategy-document.v1',
    factIds: evidencedFacts.map((fact) => fact.id).sort(),
    planNodeIds: input.plan.body.nodes.map((node) => node.id).sort(),
    routeIds: [...new Set(evidenceReceipts.map((receipt) => receipt.routeId))].sort(),
    validationFindingCodes: input.findings.length > 0
      ? [...new Set(input.findings.map((finding) => finding.code))].sort()
      : ['all-gates-passed'],
    receiptIds: evidenceReceipts.map((receipt) => receipt.id).sort(),
    repairReceiptIds: repairReceipts.map((receipt) => receipt.id).sort(),
    narrative: [{
      text: repairReceipts.length > 0
        ? 'The material route retained accepted siblings and regenerated only rejected outcomes.'
        : 'The material route used one shared product identity and creative direction across all outcomes.',
      citations: [{ factId: narrativeFact.id }],
    }],
  })
}

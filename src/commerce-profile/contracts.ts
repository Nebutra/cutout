import { z } from 'zod'

export const commerceLocaleSchema = z.enum(['en-US', 'ko-KR', 'pt-BR'])
export type CommerceLocale = z.infer<typeof commerceLocaleSchema>

export const factConfidenceSchema = z.enum(['explicit', 'derived', 'unknown'])
export type FactConfidence = z.infer<typeof factConfidenceSchema>

export const factSourceSchema = z.object({
  file: z.string().min(1).max(512),
  pointer: z.string().startsWith('/').max(2_000),
}).strict()

const factValueSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), value: z.string().min(1).max(100_000) }).strict(),
  z.object({
    type: z.literal('measurement'),
    value: z.number().finite(),
    unit: z.string().min(1).max(32),
  }).strict(),
  z.object({ type: z.literal('boolean'), value: z.boolean() }).strict(),
  z.object({
    type: z.literal('media'),
    mediaKind: z.enum(['image', 'video']),
    descriptor: z.string().min(1).max(4_096),
  }).strict(),
  z.object({ type: z.literal('unknown'), reason: z.string().min(1).max(500) }).strict(),
])
export type FactValue = z.infer<typeof factValueSchema>

export const productFactSchema = z.object({
  id: z.string().min(1).max(240),
  field: z.string().min(1).max(240),
  value: factValueSchema,
  confidence: factConfidenceSchema,
  source: factSourceSchema,
}).strict()
export type ProductFact = z.infer<typeof productFactSchema>

const skuFactReferencesSchema = z.object({
  id: z.string().min(1).max(240),
  skuIdFactId: z.string().min(1).max(240),
  attributeFactIds: z.array(z.string().min(1).max(240)).max(200),
  measurementFactIds: z.array(z.string().min(1).max(240)).max(100),
  mediaFactIds: z.array(z.string().min(1).max(240)).max(100),
}).strict()

export const productFactsSchema = z.object({
  schema: z.literal('product-facts.v1'),
  sourceFile: z.string().min(1).max(512),
  sourceShape: z.enum(['direct-product', 'nested-ret-result-result']),
  identity: z.object({
    productIdFactId: z.string().min(1).max(240),
    sourcePlatformFactId: z.string().min(1).max(240),
    sourceUrlFactId: z.string().min(1).max(240),
  }).strict(),
  titleFactIds: z.array(z.string().min(1).max(240)).min(1).max(20),
  descriptionFactIds: z.array(z.string().min(1).max(240)).min(1).max(20),
  categoryFactId: z.string().min(1).max(240),
  mediaFactIds: z.array(z.string().min(1).max(240)).max(2_000),
  skus: z.array(skuFactReferencesSchema).max(2_000),
  attributeFactIds: z.array(z.string().min(1).max(240)).max(2_000),
  measurementFactIds: z.array(z.string().min(1).max(240)).max(1_000),
  requiredUnknownFactIds: z.array(z.string().min(1).max(240)).max(100),
  facts: z.array(productFactSchema).min(1).max(20_000),
}).strict().superRefine((record, context) => {
  const ids = record.facts.map((fact) => fact.id)
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: 'custom', message: 'Product fact ids must be unique.' })
  }
  const known = new Set(ids)
  const referenced = [
    ...Object.values(record.identity),
    ...record.titleFactIds,
    ...record.descriptionFactIds,
    record.categoryFactId,
    ...record.mediaFactIds,
    ...record.attributeFactIds,
    ...record.measurementFactIds,
    ...record.requiredUnknownFactIds,
    ...record.skus.flatMap((sku) => [
      sku.skuIdFactId,
      ...sku.attributeFactIds,
      ...sku.measurementFactIds,
      ...sku.mediaFactIds,
    ]),
  ]
  if (referenced.some((id) => !known.has(id))) {
    context.addIssue({ code: 'custom', message: 'Product fact references must resolve.' })
  }
  if (record.requiredUnknownFactIds.some((id) => {
    const fact = record.facts.find((candidate) => candidate.id === id)
    return fact?.confidence !== 'unknown' || fact.value.type !== 'unknown'
  })) {
    context.addIssue({ code: 'custom', message: 'Required unknown references must point to unknown facts.' })
  }
})
export type ProductFacts = z.infer<typeof productFactsSchema>

export const citationSchema = z.object({ factId: z.string().min(1).max(240) }).strict()
export type Citation = z.infer<typeof citationSchema>

export const citedClaimSchema = z.object({
  text: z.string().min(1).max(10_000),
  citations: z.array(citationSchema).min(1).max(100),
}).strict()
export type CitedClaim = z.infer<typeof citedClaimSchema>

export const visualOverlaySchema = z.object({
  text: z.string().min(1).max(500),
  citations: z.array(citationSchema).min(1).max(20),
}).strict()
export type VisualOverlay = z.infer<typeof visualOverlaySchema>

export const localizedDescriptionSchema = z.object({
  schema: z.literal('commerce.localized-description.v1'),
  locale: commerceLocaleSchema,
  title: citedClaimSchema,
  summary: z.array(citedClaimSchema).min(1).max(30),
  skuBreakdown: z.array(citedClaimSchema).max(2_000),
  attributes: z.array(citedClaimSchema).max(2_000),
  sourcePlatform: citedClaimSchema,
  productIdentity: citedClaimSchema,
  mediaDescriptions: z.array(citedClaimSchema).max(2_000),
  categoryId: z.string().min(1).max(240),
  catalogAttributes: z.record(z.string().min(1).max(240), z.string().min(1).max(500)),
}).strict()
export type LocalizedDescription = z.infer<typeof localizedDescriptionSchema>

export const commerceMediaArtifactSchema = z.object({
  schema: z.literal('commerce.media-artifact.v1'),
  role: z.string().min(1).max(120),
  mediaKind: z.enum(['image', 'video']),
  mediaType: z.string().min(1).max(120),
  byteLength: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  playable: z.boolean().optional(),
  identityLockId: z.string().min(1).max(240),
  creativeDirectionId: z.string().min(1).max(240),
  overlays: z.array(visualOverlaySchema).max(20),
  visualReviewLabels: z.array(z.string().min(1).max(240)).max(200),
}).strict()
export type CommerceMediaArtifact = z.infer<typeof commerceMediaArtifactSchema>

export const validationFindingSchema = z.object({
  code: z.string().min(1).max(120),
  message: z.string().min(1).max(2_000),
  outcomeNodeId: z.string().min(1).max(240),
  artifactId: z.string().min(1).max(240).optional(),
  severity: z.enum(['blocking', 'warning']),
  factIds: z.array(z.string().min(1).max(240)).max(200),
}).strict()
export type ValidationFinding = z.infer<typeof validationFindingSchema>

export const capabilityReceiptSchema = z.object({
  id: z.string().min(1).max(240),
  nodeId: z.string().min(1).max(240),
  capabilityId: z.string().min(1).max(240),
  routeId: z.string().min(1).max(240),
  attempt: z.number().int().positive(),
  artifactId: z.string().min(1).max(240),
  status: z.enum(['accepted', 'rejected']),
}).strict()
export type CapabilityReceipt = z.infer<typeof capabilityReceiptSchema>

export const strategyDocumentSchema = z.object({
  schema: z.literal('commerce.strategy-document.v1'),
  factIds: z.array(z.string().min(1).max(240)).min(1).max(20_000),
  planNodeIds: z.array(z.string().min(1).max(240)).min(1).max(20_000),
  routeIds: z.array(z.string().min(1).max(240)).min(1).max(1_000),
  validationFindingCodes: z.array(z.string().min(1).max(120)).max(20_000),
  receiptIds: z.array(z.string().min(1).max(240)).min(1).max(20_000),
  repairReceiptIds: z.array(z.string().min(1).max(240)).max(20_000),
  narrative: z.array(citedClaimSchema).min(1).max(100),
}).strict().superRefine((document, context) => {
  for (const [label, ids] of [
    ['fact', document.factIds],
    ['plan node', document.planNodeIds],
    ['route', document.routeIds],
    ['validation finding', document.validationFindingCodes],
    ['receipt', document.receiptIds],
    ['repair receipt', document.repairReceiptIds],
  ] as const) {
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: 'custom', message: `Strategy ${label} ids must be unique.` })
    }
  }
})
export type StrategyDocument = z.infer<typeof strategyDocumentSchema>

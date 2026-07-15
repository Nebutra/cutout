import { z } from 'zod'
import { componentCandidateSchema, type ComponentCandidate } from '@/components-compiler'
import { designDocumentSchema, type DesignDocument } from '@/design-ir'

export const structuredNodeKindSchema = z.enum(['frame', 'text', 'image', 'component'])
const selectionSchema = z.object({
  materialId: z.string().min(1), revisionId: z.string().min(1), pageId: z.string().min(1),
  bounds: z.object({ x: z.number().nonnegative(), y: z.number().nonnegative(), width: z.number().positive(), height: z.number().positive() }).strict(),
  selectedBy: z.string().min(1), selectedAt: z.string().datetime(),
}).strict()
const constraintsSchema = z.object({ horizontal: z.enum(['fixed', 'fill', 'hug']), vertical: z.enum(['fixed', 'fill', 'hug']), minWidth: z.number().nonnegative().optional(), maxWidth: z.number().positive().optional(), minHeight: z.number().nonnegative().optional(), maxHeight: z.number().positive().optional(), aspectRatio: z.number().positive().optional() }).strict()
export const structuredPromotionSchema = z.object({
  version: z.literal('structured-promotion.v1'), id: z.string().min(1), kind: structuredNodeKindSchema, name: z.string().min(1),
  selection: selectionSchema, confidence: z.number().min(0).max(1), constraints: constraintsSchema,
  responsive: z.array(z.object({ breakpoint: z.string().min(1), changes: z.object({ horizontal: z.enum(['fixed', 'fill', 'hug']).optional(), vertical: z.enum(['fixed', 'fill', 'hug']).optional(), hidden: z.boolean().optional() }).strict() }).strict()).default([]),
  tokenBindings: z.array(z.object({ property: z.string().min(1), tokenId: z.string().min(1) }).strict()).default([]),
  text: z.string().optional(), imageAssetRef: z.string().optional(), component: componentCandidateSchema.optional(),
}).strict().superRefine((promotion, ctx) => {
  if (promotion.kind === 'text' && !promotion.text) ctx.addIssue({ code: 'custom', path: ['text'], message: 'Text promotion requires editable text.' })
  if (promotion.kind === 'image' && !promotion.imageAssetRef) ctx.addIssue({ code: 'custom', path: ['imageAssetRef'], message: 'Image promotion requires an asset reference.' })
  if (promotion.kind === 'component' && !promotion.component) ctx.addIssue({ code: 'custom', path: ['component'], message: 'Component promotion requires an editable component contract.' })
})
export type StructuredPromotion = z.infer<typeof structuredPromotionSchema>

export interface PromotionResult { readonly node: StructuredPromotion; readonly componentCandidate?: ComponentCandidate; readonly registry: { readonly status: 'draft' | 'ready'; readonly designIrRefs: readonly string[]; readonly tokenRefs: readonly string[]; readonly blockers: readonly string[] } }

/** User selection is mandatory; this function never detects regions from pixels. */
export function promoteSelection(documentInput: DesignDocument, input: unknown): PromotionResult {
  const document = designDocumentSchema.parse(documentInput), promotion = structuredPromotionSchema.parse(input)
  const material = document.materials.find(({ id }) => id === promotion.selection.materialId)
  if (!material?.revisions.some(({ id }) => id === promotion.selection.revisionId)) throw new Error('Promotion evidence does not match a Design IR material revision.')
  if (!document.prototype?.plan.pages.some(({ id }) => id === promotion.selection.pageId)) throw new Error('Promotion evidence does not match a structured prototype page.')
  const tokens = new Set(document.tokens.map(({ id }) => id))
  for (const binding of promotion.tokenBindings) if (!tokens.has(binding.tokenId)) throw new Error(`Promotion token binding references unknown token "${binding.tokenId}".`)
  if (promotion.component) {
    if (promotion.component.evidence?.materialId !== promotion.selection.materialId || promotion.component.evidence.revisionId !== promotion.selection.revisionId) throw new Error('Component evidence must equal the explicit user selection.')
    if (promotion.component.confidence !== promotion.confidence) throw new Error('Component confidence must equal the reviewed promotion confidence.')
    const componentBindings = new Set((promotion.component.tokenBindings ?? []).map(({ tokenId }) => tokenId))
    for (const binding of promotion.tokenBindings) if (!componentBindings.has(binding.tokenId)) throw new Error('Component contract must preserve promotion token bindings.')
  }
  const blockers = promotion.kind === 'component' && promotion.component?.status !== 'ready' ? ['Component contract remains draft.'] : []
  return { node: promotion, ...(promotion.component ? { componentCandidate: promotion.component } : {}), registry: { status: blockers.length ? 'draft' : 'ready', designIrRefs: [promotion.selection.materialId, promotion.selection.revisionId, promotion.selection.pageId, ...(promotion.component ? [promotion.component.id] : [])], tokenRefs: promotion.tokenBindings.map(({ tokenId }) => tokenId), blockers } }
}

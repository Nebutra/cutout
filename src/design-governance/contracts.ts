import { z } from 'zod'

export const governanceModeSchema = z.enum(['light', 'dark', 'high-contrast'])
export const governanceStateSchema = z.enum(['default', 'hover', 'focus', 'disabled', 'selected'])
export const governanceKindSchema = z.enum(['text', 'ui-boundary', 'focus-indicator', 'color-only'])
export const promotionTargetSchema = z.enum(['brand-kit', 'design-system-kit', 'component', 'starter', 'figma', 'delivery'])

export const tokenUsageBindingSchema = z.object({
  id: z.string().min(1), selector: z.string().min(1), componentId: z.string().optional(),
  foregroundTokenId: z.string().min(1), backgroundTokenId: z.string().min(1),
  kind: governanceKindSchema, modes: z.array(governanceModeSchema).min(1),
  states: z.array(governanceStateSchema).min(1), lockedTokenIds: z.array(z.string()).default([]),
}).strict()

export const governanceScenarioSchema = tokenUsageBindingSchema.omit({ modes: true, states: true }).extend({
  scenarioId: z.string().min(1), mode: governanceModeSchema, state: governanceStateSchema,
}).strict()

export const nonColorCueEvidenceSchema = z.object({
  evidenceId: z.string().min(1),
  state: governanceStateSchema,
  kind: z.enum(['text', 'icon', 'shape', 'pattern', 'position']),
  source: z.enum(['design-ir', 'human-review', 'dom-contract']),
}).strict()

export const computedStyleFactSchema = z.object({
  scenarioId: z.string().min(1), viewport: z.string().min(1),
  foreground: z.string().min(1), backgroundLayers: z.array(z.string().min(1)).min(1),
  fontSizePx: z.number().nonnegative(), fontWeight: z.number().int().nonnegative(),
  borderColor: z.string().optional(), outlineColor: z.string().optional(), outlineWidthPx: z.number().nonnegative().default(0),
  nonColorCueEvidence: z.array(nonColorCueEvidenceSchema).default([]), axeViolations: z.array(z.object({ id: z.string(), impact: z.enum(['minor','moderate','serious','critical']).nullable() }).strict()).default([]),
}).strict()

export const governanceFindingSchema = z.object({
  id: z.string(), scenarioId: z.string(), rule: z.string(), severity: z.enum(['hard', 'advisory']),
  status: z.enum(['passed', 'failed']), summary: z.string(), evidence: z.record(z.string(), z.unknown()).default({}),
}).strict()

export const governanceReceiptSchema = z.object({
  version: z.literal('cutout.design-governance-receipt.v1'), receiptId: z.string(), createdAt: z.number().int().nonnegative(),
  status: z.enum(['passed', 'advisory', 'blocked']), findings: z.array(governanceFindingSchema), evidenceHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict()

export const governanceRepairTaskSchema = z.object({
  version: z.literal('cutout.design-governance-repair.v1'), taskId: z.string(), receiptId: z.string(),
  failedFindingIds: z.array(z.string()).min(1), scenarioIds: z.array(z.string()).min(1),
  touchesBrandLock: z.boolean(), requiresHumanApproval: z.boolean(), approvalId: z.string().optional(),
}).strict().superRefine((value, ctx) => { if (value.touchesBrandLock && !value.requiresHumanApproval) ctx.addIssue({ code: 'custom', message: 'Brand-lock repairs require human approval.' }) })

export type TokenUsageBinding = z.infer<typeof tokenUsageBindingSchema>
export type GovernanceScenario = z.infer<typeof governanceScenarioSchema>
export type ComputedStyleFact = z.infer<typeof computedStyleFactSchema>
export type NonColorCueEvidence = z.infer<typeof nonColorCueEvidenceSchema>
export type GovernanceReceipt = z.infer<typeof governanceReceiptSchema>
export type PromotionTarget = z.infer<typeof promotionTargetSchema>
export type GovernanceRepairTask = z.infer<typeof governanceRepairTaskSchema>

const locationSchema = z.object({ entityId: z.string(), path: z.string() }).strict()
export const governanceTokenSchema = z.object({ id:z.string(), name:z.string(), type:z.enum(['color','dimension','number','fontFamily','fontWeight','duration','cubicBezier','shadow','border','gradient','typography']), tier:z.enum(['primitive','semantic','component']), value:z.unknown().optional(), alias:z.string().optional(), mode:z.string(), brandLock:z.object({ approvedValue:z.unknown(), approvalId:z.string() }).strict().optional(), location:locationSchema }).strict()
export const governancePolicySchema = z.object({ version:z.literal('design-governance-policy.v1'), id:z.string(), standards:z.object({ wcag:z.string(), dtcg:z.string(), cssColor:z.string() }).strict(), severity:z.record(z.string(),z.enum(['error','warning','advisory'])), thresholds:z.object({ perceptualDeltaE:z.number(), spacingBase:z.number().positive(), maxMotionMs:z.number().nonnegative(), minFocusArea:z.number().nonnegative() }).strict() }).strict()
const legacyFindingSchema = z.object({ id:z.string(), ruleId:z.string(), standard:z.string(), policyVersion:z.string(), severity:z.enum(['error','warning','advisory']), blocking:z.boolean(), applicability:z.string(), message:z.string(), measurements:z.record(z.string(),z.union([z.string(),z.number(),z.boolean()])), locations:z.array(locationSchema), evidence:z.array(z.object({kind:z.string(),value:z.string()}).strict()), repairSuggestions:z.array(z.string()) }).strict()
export const governanceReportSchema = z.object({ protocol:z.literal('design-governance-report.v1'), id:z.string(), documentId:z.string(), revisionId:z.string(), policy:governancePolicySchema, summary:z.object({errors:z.number(),warnings:z.number(),advisories:z.number(),blocking:z.boolean()}).strict(), findings:z.array(legacyFindingSchema), measurements:z.object({evaluatedRules:z.number(),evaluatedLocations:z.number()}).strict(), completedAt:z.string().datetime() }).strict()
export type GovernanceToken = z.infer<typeof governanceTokenSchema>
export type GovernancePolicy = z.infer<typeof governancePolicySchema>
export type GovernanceFinding = z.infer<typeof legacyFindingSchema>

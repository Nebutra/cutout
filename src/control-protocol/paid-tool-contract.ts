import { z } from 'zod'
import type { ModelAssignments } from '@/services/ai/model-assignment-types'
import type { ModelAssignment } from '@/services/ai/model-assignment-types'
import type { ProviderConfig } from '@/services/ai/provider-types'

const CREDENTIAL_VALUE = /(?:\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b|\bBearer\s+[A-Za-z0-9._~+/-]+\b)/i
const safeText = z.string().refine((value) => !CREDENTIAL_VALUE.test(value), 'Credential-shaped values are not accepted.')

export const paidToolIntentMaxLength = 20_000
export const paidToolPromptMaxLength = 200_000

export const paidToolCapabilitySchema = z.enum([
  'generate-image',
  'edit-image',
  'cutout',
  'semantic-cutout',
])
export type PaidToolCapability = z.infer<typeof paidToolCapabilitySchema>

export const moneyEstimateSchema = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/),
  amount: z.number().nonnegative().finite(),
  credits: z.number().nonnegative().finite().optional(),
}).strict()
export type MoneyEstimate = z.infer<typeof moneyEstimateSchema>

export const paidToolRequestSchema = z.object({
  capability: paidToolCapabilitySchema,
  providerId: safeText.min(1).max(160).optional(),
  model: safeText.min(1).max(300).optional(),
  intent: safeText.min(1).max(paidToolIntentMaxLength),
  prompt: safeText.min(1).max(paidToolPromptMaxLength).optional(),
  inputArtifactIds: z.array(safeText.min(1).max(300)).max(32).default([]),
  budgetCeiling: moneyEstimateSchema,
  approvalPolicy: z.enum(['explicit', 'auto-within-budget']).default('auto-within-budget'),
}).strict()
export type PaidToolRequest = z.infer<typeof paidToolRequestSchema>

/** The bounded intent is for approval and audit. Only this projection crosses
 * into provider execution, preserving legacy requests without a prompt. */
export function paidToolExecutionPrompt(
  request: Pick<PaidToolRequest, 'intent' | 'prompt'>,
): string {
  return request.prompt ?? request.intent
}

/** Host-owned declaration. It contains routing metadata, never credentials. */
export const paidToolExecutorCapabilitySchema = z.object({
  capability: paidToolCapabilitySchema,
  providerId: safeText.min(1).max(160),
  model: safeText.min(1).max(300),
  available: z.boolean(),
  estimatedCost: moneyEstimateSchema,
}).strict()
export type PaidToolExecutorCapability = z.infer<typeof paidToolExecutorCapabilitySchema>

export type PaidToolPlanStatus = 'ready' | 'authorization-required' | 'capability-required' | 'budget-exceeded'

export interface PaidToolPlan {
  readonly capability: PaidToolCapability
  readonly providerId?: string
  readonly model?: string
  readonly estimatedCost?: MoneyEstimate
  readonly budgetCeiling: MoneyEstimate
  readonly approvalPolicy: PaidToolRequest['approvalPolicy']
  readonly status: PaidToolPlanStatus
  readonly executable: boolean
  readonly reason?: string
}

export interface PaidToolPolicy {
  readonly allowPaid: boolean
  readonly maxCost?: MoneyEstimate
}

export function planPaidTool(
  request: PaidToolRequest,
  capability: PaidToolExecutorCapability | undefined,
  policy: PaidToolPolicy,
  hasExplicitApproval: boolean,
): PaidToolPlan {
  const base = {
    capability: request.capability,
    providerId: capability?.providerId ?? request.providerId,
    model: capability?.model ?? request.model,
    estimatedCost: capability?.estimatedCost,
    budgetCeiling: request.budgetCeiling,
    approvalPolicy: request.approvalPolicy,
  }
  if (!capability?.available) {
    return { ...base, status: 'capability-required', executable: false, reason: 'No host executor is available for this capability.' }
  }
  if (!policy.allowPaid) {
    return { ...base, status: 'authorization-required', executable: false, reason: 'Paid actions are disabled by host policy.' }
  }
  if (!sameCurrency(request.budgetCeiling, capability.estimatedCost)
    || capability.estimatedCost.amount > request.budgetCeiling.amount
    || exceedsCredits(capability.estimatedCost, request.budgetCeiling)
    || (policy.maxCost && exceeds(capability.estimatedCost, policy.maxCost))) {
    return { ...base, status: 'budget-exceeded', executable: false, reason: 'The host estimate exceeds the approved budget ceiling.' }
  }
  if (request.approvalPolicy === 'explicit' && !hasExplicitApproval) {
    return { ...base, status: 'authorization-required', executable: false, reason: 'This request requires explicit approval.' }
  }
  return { ...base, status: 'ready', executable: true }
}

function sameCurrency(left: MoneyEstimate, right: MoneyEstimate): boolean {
  return left.currency === right.currency
}

function exceedsCredits(cost: MoneyEstimate, ceiling: MoneyEstimate): boolean {
  return cost.credits !== undefined && ceiling.credits !== undefined && cost.credits > ceiling.credits
}

function exceeds(cost: MoneyEstimate, ceiling: MoneyEstimate): boolean {
  return !sameCurrency(cost, ceiling) || cost.amount > ceiling.amount || exceedsCredits(cost, ceiling)
}

export const paidToolReceiptSchema = z.object({
  receiptId: safeText.min(1).max(160),
  requestId: safeText.min(1).max(160),
  capability: paidToolCapabilitySchema,
  providerId: safeText.min(1).max(160),
  model: safeText.min(1).max(300),
  status: z.enum(['succeeded', 'failed', 'cancelled']),
  charged: moneyEstimateSchema,
  outputArtifactIds: z.array(safeText.min(1).max(300)).max(128),
  startedAt: z.number().int().nonnegative(),
  completedAt: z.number().int().nonnegative(),
}).strict()
export type PaidToolReceipt = z.infer<typeof paidToolReceiptSchema>
export function migratePaidToolReceipt(input:unknown):PaidToolReceipt{const value=input as Record<string,unknown>,{outputs:legacyOutputs,...current}=value;return paidToolReceiptSchema.parse({...current,outputArtifactIds:Array.isArray(value?.outputArtifactIds)?value.outputArtifactIds:Array.isArray(legacyOutputs)?legacyOutputs:[]})}
export function previewPaidToolReceiptDowngrade(input:unknown){const receipt=paidToolReceiptSchema.parse(input);return{target:'cutout.paid-tool-receipt.v0' as const,data:{...receipt,outputs:receipt.outputArtifactIds},losses:receipt.outputArtifactIds.length>1?[{path:'outputArtifactIds',count:receipt.outputArtifactIds.length-1,reason:'Some v0 consumers read only the first output.'}]:[]}}

/** Maps desktop BYOK configuration to the same non-secret routing contract. */
export function desktopPaidToolCapabilities(
  providers: readonly ProviderConfig[],
  assignments: ModelAssignments,
  estimates: Partial<Record<PaidToolCapability, MoneyEstimate>> = {},
): readonly PaidToolExecutorCapability[] {
  const enabled = new Set(providers.filter((provider) => provider.enabled).map((provider) => provider.id))
  const image = assignments.image
  if (!image || !enabled.has(image.providerId)) return []
  const fallback = { currency: 'USD', amount: 0, credits: 0 }
  return (['generate-image', 'edit-image'] as const).map((capability) => ({
    capability,
    providerId: image.providerId,
    model: image.model,
    available: true,
    estimatedCost: estimates[capability] ?? fallback,
  }))
}

/** Projects a locked desktop composer route into a transport-neutral request. */
export function composerRouteToPaidToolRequest(input: {
  readonly capability: PaidToolCapability
  readonly intent: string
  readonly prompt?: string
  readonly image: ModelAssignment
  readonly inputArtifactIds?: readonly string[]
  readonly budgetCeiling: MoneyEstimate
  readonly approvalPolicy?: PaidToolRequest['approvalPolicy']
}): PaidToolRequest {
  return paidToolRequestSchema.parse({
    capability: input.capability,
    providerId: input.image.providerId,
    model: input.image.model,
    intent: input.intent,
    ...(input.prompt !== undefined ? { prompt: input.prompt } : {}),
    inputArtifactIds: input.inputArtifactIds ?? [],
    budgetCeiling: input.budgetCeiling,
    approvalPolicy: input.approvalPolicy ?? 'auto-within-budget',
  })
}

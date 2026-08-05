import { z } from 'zod'
import type { ModelAssignments } from '@/services/ai/model-assignment-types'
import type { ModelAssignment } from '@/services/ai/model-assignment-types'
import type { ProviderConfig } from '@/services/ai/provider-types'
import type { CapabilityBindings, ModelDescriptor } from '@/services/ai/model-capabilities'
import {
  assessImageRoute,
  exactImageRouteDescriptor,
} from '@/services/ai/image-route-assessment'

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

export const moneyAmountSchema = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/),
  amount: z.number().nonnegative().finite(),
  credits: z.number().nonnegative().finite().optional(),
}).strict()
export type MoneyAmount = z.infer<typeof moneyAmountSchema>

export const paidToolRequestSchema = z.object({
  capability: paidToolCapabilitySchema,
  providerId: safeText.min(1).max(160).optional(),
  model: safeText.min(1).max(300).optional(),
  intent: safeText.min(1).max(paidToolIntentMaxLength),
  prompt: safeText.min(1).max(paidToolPromptMaxLength),
  inputArtifactIds: z.array(safeText.min(1).max(300)).max(32).default([]),
  approvalPolicy: z.enum(['explicit', 'auto']).default('auto'),
}).strict()
export type PaidToolRequest = z.infer<typeof paidToolRequestSchema>

/** The bounded intent is for approval and audit. The execution prompt is the
 * complete provider instruction authored for the current request. */
export function paidToolExecutionPrompt(
  request: Pick<PaidToolRequest, 'intent' | 'prompt'>,
): string {
  if (!request.prompt) throw new Error('A provider execution prompt is required.')
  return request.prompt
}

/** Host-owned declaration. It contains routing metadata, never credentials. */
export const paidToolExecutorCapabilitySchema = z.object({
  capability: paidToolCapabilitySchema,
  providerId: safeText.min(1).max(160),
  model: safeText.min(1).max(300),
  available: z.boolean(),
}).strict()
export type PaidToolExecutorCapability = z.infer<typeof paidToolExecutorCapabilitySchema>

export type PaidToolPlanStatus = 'ready' | 'authorization-required' | 'capability-required'

export interface PaidToolPlan {
  readonly capability: PaidToolCapability
  readonly providerId?: string
  readonly model?: string
  readonly approvalPolicy: PaidToolRequest['approvalPolicy']
  readonly status: PaidToolPlanStatus
  readonly executable: boolean
  readonly reason?: string
}

export interface PaidToolPolicy {
  readonly allowPaid: boolean
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
    approvalPolicy: request.approvalPolicy,
  }
  if (!capability?.available) {
    return { ...base, status: 'capability-required', executable: false, reason: 'No host executor is available for this capability.' }
  }
  if (!policy.allowPaid) {
    return { ...base, status: 'authorization-required', executable: false, reason: 'Paid actions are disabled by host policy.' }
  }
  if (request.approvalPolicy === 'explicit' && !hasExplicitApproval) {
    return { ...base, status: 'authorization-required', executable: false, reason: 'This request requires explicit approval.' }
  }
  return { ...base, status: 'ready', executable: true }
}

export const paidToolReceiptSchema = z.object({
  receiptId: safeText.min(1).max(160),
  requestId: safeText.min(1).max(160),
  capability: paidToolCapabilitySchema,
  providerId: safeText.min(1).max(160),
  model: safeText.min(1).max(300),
  status: z.enum(['succeeded', 'failed', 'cancelled']),
  charged: moneyAmountSchema.optional(),
  outputArtifactIds: z.array(safeText.min(1).max(300)).max(128),
  startedAt: z.number().int().nonnegative(),
  completedAt: z.number().int().nonnegative(),
}).strict()
export type PaidToolReceipt = z.infer<typeof paidToolReceiptSchema>

/** Maps desktop BYOK configuration to the same non-secret routing contract. */
export function desktopPaidToolCapabilities(
  providers: readonly ProviderConfig[],
  assignments: ModelAssignments,
  evidence: {
    readonly descriptors?: readonly ModelDescriptor[]
    readonly bindings?: CapabilityBindings['bindings']
  } = {},
): readonly PaidToolExecutorCapability[] {
  const generation = evidence.bindings?.['image-generation'] ?? assignments.image
  const edit = evidence.bindings?.['image-edit'] ?? generation
  const routes = [
    { capability: 'generate-image' as const, assignment: generation },
    { capability: 'edit-image' as const, assignment: edit },
  ]
  return routes.flatMap(({ capability, assignment }) => {
    if (!assignment) return []
    const provider = providers.find((candidate) =>
      candidate.id === assignment.providerId && candidate.enabled)
    if (!provider) return []
    const assessment = assessImageRoute({
      assignment,
      provider,
      descriptor: exactImageRouteDescriptor(evidence.descriptors ?? [], assignment),
    })
    const supported = capability === 'edit-image'
      ? assessment.edit.supported
      : assessment.generation.supported
    return supported ? [{
      capability,
      providerId: assignment.providerId,
      model: assignment.model,
      available: true,
    }] : []
  })
}

/** Projects a locked desktop composer route into a transport-neutral request. */
export function composerRouteToPaidToolRequest(input: {
  readonly capability: PaidToolCapability
  readonly intent: string
  readonly prompt: string
  readonly image: ModelAssignment
  readonly inputArtifactIds?: readonly string[]
  readonly approvalPolicy?: PaidToolRequest['approvalPolicy']
}): PaidToolRequest {
  return paidToolRequestSchema.parse({
    capability: input.capability,
    providerId: input.image.providerId,
    model: input.image.model,
    intent: input.intent,
    prompt: input.prompt,
    inputArtifactIds: input.inputArtifactIds ?? [],
    approvalPolicy: input.approvalPolicy ?? 'auto',
  })
}

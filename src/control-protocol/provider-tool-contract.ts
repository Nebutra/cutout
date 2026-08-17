import { z } from 'zod'
import type { ModelAssignments } from '@/services/ai/model-assignment-types'
import type { ModelAssignment } from '@/services/ai/model-assignment-types'
import type { ProviderConfig } from '@/services/ai/provider-types'
import type { CapabilityBindings, ModelDescriptor } from '@/services/ai/model-capabilities'
import {
  assessImageRoute,
  exactImageRouteDescriptor,
  imageAdapterStrategySchema,
} from '@/services/ai/image-route-assessment'

const CREDENTIAL_VALUE = /(?:\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b|\bBearer\s+[A-Za-z0-9._~+/-]+\b)/i
const safeText = z.string().refine((value) => !CREDENTIAL_VALUE.test(value), 'Credential-shaped values are not accepted.')

export const providerToolIntentMaxLength = 20_000
export const providerToolPromptMaxLength = 200_000

export const providerToolCapabilitySchema = z.enum([
  'generate-image',
  'edit-image',
  'cutout',
  'semantic-cutout',
])
export type ProviderToolCapability = z.infer<typeof providerToolCapabilitySchema>

export const providerToolRequestSchema = z.object({
  capability: providerToolCapabilitySchema,
  providerId: safeText.min(1).max(160).optional(),
  model: safeText.min(1).max(300).optional(),
  intent: safeText.min(1).max(providerToolIntentMaxLength),
  prompt: safeText.min(1).max(providerToolPromptMaxLength),
  inputArtifactIds: z.array(safeText.min(1).max(300)).max(32).default([]),
  approvalPolicy: z.enum(['explicit', 'auto']).default('auto'),
}).strict()
export type ProviderToolRequest = z.infer<typeof providerToolRequestSchema>

/** The bounded intent is for approval and audit. The execution prompt is the
 * complete provider instruction authored for the current request. */
export function providerToolExecutionPrompt(
  request: Pick<ProviderToolRequest, 'intent' | 'prompt'>,
): string {
  if (!request.prompt) throw new Error('A provider execution prompt is required.')
  return request.prompt
}

/** Host-owned declaration. It contains routing metadata, never credentials. */
export const providerToolExecutorCapabilitySchema = z.object({
  capability: providerToolCapabilitySchema,
  providerId: safeText.min(1).max(160),
  model: safeText.min(1).max(300),
  available: z.boolean(),
  transportStrategy: imageAdapterStrategySchema.optional(),
}).strict()
export type ProviderToolExecutorCapability = z.infer<typeof providerToolExecutorCapabilitySchema>

export type ProviderToolPlanStatus = 'ready' | 'authorization-required' | 'capability-required'

export interface ProviderToolPlan {
  readonly capability: ProviderToolCapability
  readonly providerId?: string
  readonly model?: string
  readonly approvalPolicy: ProviderToolRequest['approvalPolicy']
  readonly status: ProviderToolPlanStatus
  readonly executable: boolean
  readonly reason?: string
}

export interface ProviderToolPolicy {
  readonly allowProviderExecution: boolean
}

export function planProviderTool(
  request: ProviderToolRequest,
  capability: ProviderToolExecutorCapability | undefined,
  policy: ProviderToolPolicy,
  hasExplicitApproval: boolean,
): ProviderToolPlan {
  const base = {
    capability: request.capability,
    providerId: capability?.providerId ?? request.providerId,
    model: capability?.model ?? request.model,
    approvalPolicy: request.approvalPolicy,
  }
  if (!capability?.available) {
    return { ...base, status: 'capability-required', executable: false, reason: 'No host executor is available for this capability.' }
  }
  if (!policy.allowProviderExecution) {
    return { ...base, status: 'authorization-required', executable: false, reason: 'Provider execution is disabled by host policy.' }
  }
  if (request.approvalPolicy === 'explicit' && !hasExplicitApproval) {
    return { ...base, status: 'authorization-required', executable: false, reason: 'This request requires explicit approval.' }
  }
  return { ...base, status: 'ready', executable: true }
}

export const providerToolReceiptSchema = z.object({
  receiptId: safeText.min(1).max(160),
  requestId: safeText.min(1).max(160),
  capability: providerToolCapabilitySchema,
  providerId: safeText.min(1).max(160),
  model: safeText.min(1).max(300),
  status: z.enum(['succeeded', 'failed', 'cancelled']),
  outputArtifactIds: z.array(safeText.min(1).max(300)).max(128),
  startedAt: z.number().int().nonnegative(),
  completedAt: z.number().int().nonnegative(),
}).strict()
export type ProviderToolReceipt = z.infer<typeof providerToolReceiptSchema>

/** Maps desktop BYOK configuration to the same non-secret routing contract. */
export function desktopProviderToolCapabilities(
  providers: readonly ProviderConfig[],
  assignments: ModelAssignments,
  evidence: {
    readonly descriptors?: readonly ModelDescriptor[]
    readonly bindings?: CapabilityBindings['bindings']
  } = {},
): readonly ProviderToolExecutorCapability[] {
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
    const route = capability === 'edit-image' ? assessment.edit : assessment.generation
    return route.supported ? [{
      capability,
      providerId: assignment.providerId,
      model: assignment.model,
      available: true,
      transportStrategy: route.strategy,
    }] : []
  })
}

/** Projects a locked desktop composer route into a transport-neutral request. */
export function composerRouteToProviderToolRequest(input: {
  readonly capability: ProviderToolCapability
  readonly intent: string
  readonly prompt: string
  readonly image: ModelAssignment
  readonly inputArtifactIds?: readonly string[]
  readonly approvalPolicy?: ProviderToolRequest['approvalPolicy']
}): ProviderToolRequest {
  return providerToolRequestSchema.parse({
    capability: input.capability,
    providerId: input.image.providerId,
    model: input.image.model,
    intent: input.intent,
    prompt: input.prompt,
    inputArtifactIds: input.inputArtifactIds ?? [],
    approvalPolicy: input.approvalPolicy ?? 'auto',
  })
}

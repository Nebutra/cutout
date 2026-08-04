import { Channel, invoke } from '@tauri-apps/api/core'
import { z } from 'zod'

export const planningRuntimeIdSchema = z.enum(['codex-system', 'direct-provider'])
export type PlanningRuntimeId = z.infer<typeof planningRuntimeIdSchema>

export const stableRuntimeReasonSchema = z.enum([
  'not-installed',
  'unsupported-platform',
  'executable-identity-rejected',
  'authentication-required',
  'protocol-unsupported',
  'runtime-version-unsupported',
  'execution-adapter-unavailable',
  'probe-failed',
])
export type StableRuntimeReason = z.infer<typeof stableRuntimeReasonSchema>

export const planningRuntimeFailureReasonSchema = z.enum([
  'upstream-unavailable',
  'model-output-invalid',
  'runtime-failed',
])
export type PlanningRuntimeFailureReason = z.infer<typeof planningRuntimeFailureReasonSchema>

export const planningRuntimeEvidenceSchema = z.object({
  runtimeId: z.literal('codex-system'),
  installed: z.boolean(),
  authenticated: z.boolean(),
  authClass: z.enum(['chatgpt', 'api-key', 'access-token', 'unauthenticated', 'unknown']),
  capability: z.enum(['proven', 'unsupported', 'unknown']),
  execution: z.enum(['unproven', 'succeeded', 'failed', 'stale']),
  lastFailure: planningRuntimeFailureReasonSchema.optional(),
  version: z.string().regex(/^\d[0-9A-Za-z.+-]{0,39}$/).optional(),
  reason: stableRuntimeReasonSchema.optional(),
}).strict().superRefine((value, context) => {
  const authenticatedClass = value.authClass === 'chatgpt'
    || value.authClass === 'api-key'
    || value.authClass === 'access-token'
  if (value.authenticated !== authenticatedClass) {
    context.addIssue({ code: 'custom', path: ['authenticated'], message: 'Authentication evidence conflicts.' })
  }
  if (!value.installed && (value.authenticated || value.version !== undefined)) {
    context.addIssue({ code: 'custom', path: ['installed'], message: 'Runtime evidence requires an installed executable.' })
  }
  if (value.capability === 'proven' && (!value.installed || !value.authenticated)) {
    context.addIssue({ code: 'custom', path: ['capability'], message: 'Capability evidence requires an installed, authenticated runtime.' })
  }
  if (value.execution !== 'unproven' && value.capability !== 'proven') {
    context.addIssue({ code: 'custom', path: ['execution'], message: 'Execution evidence requires a capability-proven runtime.' })
  }
  if (value.lastFailure !== undefined && value.execution !== 'failed') {
    context.addIssue({ code: 'custom', path: ['lastFailure'], message: 'A runtime failure reason requires failed execution evidence.' })
  }
  if (value.execution === 'failed' && value.lastFailure === undefined) {
    context.addIssue({ code: 'custom', path: ['lastFailure'], message: 'Failed execution evidence requires a sanitized failure reason.' })
  }
  if (value.capability === 'unsupported' && value.reason === undefined) {
    context.addIssue({ code: 'custom', path: ['reason'], message: 'Unsupported runtime evidence requires a reason.' })
  }
})
export type PlanningRuntimeEvidence = z.infer<typeof planningRuntimeEvidenceSchema>

const opaqueIdSchema = z.string().min(1).max(200).regex(/^[A-Za-z0-9._:-]+$/)
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/)

export const codexPlanningEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('started'),
    requestId: z.uuid(),
    turnId: opaqueIdSchema,
    bindingId: opaqueIdSchema,
    contextDigest: digestSchema,
  }).strict(),
  z.object({
    type: z.literal('delta'),
    requestId: z.uuid(),
    turnId: opaqueIdSchema,
    text: z.string(),
  }).strict(),
  z.object({
    type: z.literal('retrying'),
    requestId: z.uuid(),
    turnId: opaqueIdSchema,
    attempt: z.number().int().positive(),
    reason: z.enum([
      'response-stream-disconnected',
      'response-stream-connection-failed',
      'server-overloaded',
      'transient-runtime-error',
    ]),
  }).strict(),
  z.object({
    type: z.literal('completed'),
    requestId: z.uuid(),
    turnId: opaqueIdSchema,
    receipt: z.lazy(() => codexExecutionReceiptSchema),
  }).strict(),
  z.object({
    type: z.literal('interrupted'),
    requestId: z.uuid(),
    turnId: opaqueIdSchema,
  }).strict(),
  z.object({
    type: z.literal('failed'),
    requestId: z.uuid(),
    turnId: opaqueIdSchema,
    reason: planningRuntimeFailureReasonSchema,
  }).strict(),
])
export type CodexPlanningEvent = z.infer<typeof codexPlanningEventSchema>

export const codexExecutionReceiptSchema = z.object({
  protocol: z.literal('cutout.codex-execution.v1'),
  runtimeId: z.literal('codex-system'),
  runtimeVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  bindingId: opaqueIdSchema,
  requestId: z.uuid(),
  turnId: opaqueIdSchema,
  contextRevision: opaqueIdSchema,
  contextDigest: digestSchema,
  outputDigest: digestSchema,
  completedAt: z.number().int().nonnegative(),
}).strict()
export type CodexExecutionReceipt = z.infer<typeof codexExecutionReceiptSchema>

export const codexTurnResultSchema = z.object({
  output: z.unknown(),
  receipt: codexExecutionReceiptSchema,
}).strict()
export type CodexTurnResult = z.infer<typeof codexTurnResultSchema>

export const codexTurnStartInputSchema = z.object({
  requestId: z.uuid(),
  workspaceHandle: opaqueIdSchema,
  conversationId: opaqueIdSchema.max(160),
  contextRevision: opaqueIdSchema.max(160),
  prompt: z.string().trim().min(1).max(64 * 1024),
  context: z.unknown(),
  outputSchema: z.record(z.string(), z.unknown()),
}).strict()
export type CodexTurnStartInput = z.infer<typeof codexTurnStartInputSchema>

export async function probeCodexSystemRuntime(): Promise<PlanningRuntimeEvidence> {
  return planningRuntimeEvidenceSchema.parse(await invoke<unknown>('codex_system_probe'))
}

export async function runCodexSystemTurn(
  rawInput: CodexTurnStartInput,
  options: {
    readonly signal?: AbortSignal
    readonly onEvent?: (event: CodexPlanningEvent) => void
  } = {},
): Promise<CodexTurnResult> {
  const input = codexTurnStartInputSchema.parse(rawInput)
  const channel = new Channel<unknown>()
  channel.onmessage = (payload) => {
    options.onEvent?.(codexPlanningEventSchema.parse(payload))
  }
  const interrupt = () => {
    void interruptCodexSystemTurn(input.requestId)
  }
  if (options.signal?.aborted) {
    throw new DOMException('Planning turn was interrupted.', 'AbortError')
  }
  options.signal?.addEventListener('abort', interrupt, { once: true })
  try {
    return codexTurnResultSchema.parse(await invoke<unknown>('codex_system_turn_start', {
      input,
      onEvent: channel,
    }))
  } catch (error) {
    if (options.signal?.aborted) {
      throw new DOMException('Planning turn was interrupted.', 'AbortError')
    }
    throw error
  } finally {
    options.signal?.removeEventListener('abort', interrupt)
  }
}

export async function steerCodexSystemTurn(requestId: string, text: string): Promise<boolean> {
  return z.boolean().parse(await invoke<unknown>('codex_system_turn_steer', {
    requestId: z.uuid().parse(requestId),
    text: z.string().trim().min(1).max(64 * 1024).parse(text),
  }))
}

export async function interruptCodexSystemTurn(requestId: string): Promise<boolean> {
  return z.boolean().parse(await invoke<unknown>('codex_system_turn_interrupt', {
    requestId: z.uuid().parse(requestId),
  }))
}

export async function resetCodexSystemConversation(
  workspaceHandle: string,
  conversationId: string,
): Promise<boolean> {
  return z.boolean().parse(await invoke<unknown>('codex_system_conversation_reset', {
    workspaceHandle: opaqueIdSchema.parse(workspaceHandle),
    conversationId: opaqueIdSchema.max(160).parse(conversationId),
  }))
}

export interface DirectPlanningRoute {
  readonly runtimeId: 'direct-provider'
  readonly providerId: string
  readonly model: string
}

export type SelectedPlanningRuntime =
  | { readonly runtimeId: 'codex-system'; readonly evidence: PlanningRuntimeEvidence }
  | DirectPlanningRoute

export function selectPlanningRuntime(input: {
  readonly codex?: PlanningRuntimeEvidence
  readonly direct?: Omit<DirectPlanningRoute, 'runtimeId'>
  /** Explicit user-owned recovery attempt after a failed/stale Codex turn. */
  readonly retryCodex?: boolean
}): SelectedPlanningRuntime | undefined {
  if (
    input.codex?.authenticated
    && input.codex.capability === 'proven'
    && (
      input.retryCodex
      || (input.codex.execution !== 'failed' && input.codex.execution !== 'stale')
    )
  ) {
    return { runtimeId: 'codex-system', evidence: input.codex }
  }
  return input.direct ? { runtimeId: 'direct-provider', ...input.direct } : undefined
}

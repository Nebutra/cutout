import { Channel, invoke } from '@tauri-apps/api/core'
import { z } from 'zod'
import type { PromptPart, PromptService } from '@/prompts/types'
import { err, ok, type Result } from '@/services/types'
import type { GenerateInput, GenerationService } from './types'

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

const codexPlanningTextSchema = z.object({
  text: z.string(),
}).strict()

export interface CodexPlanningGenerationOptions {
  readonly workspaceHandle: string
  readonly conversationPrefix: string
  readonly contextRevision: string
  readonly prompts: Pick<PromptService, 'render'>
  readonly onEvent?: (event: CodexPlanningEvent) => void
}

type CodexPlanningGenerationService = Pick<
  GenerationService,
  'generateObject' | 'streamText'
> & {
  runExclusive<T>(signal: AbortSignal | undefined, run: () => Promise<T>): Promise<T>
}

interface SerialPlanningJob {
  started: boolean
  cancelled: boolean
  readonly run: () => Promise<void>
}

function createPlanningTurnQueue() {
  const jobs: SerialPlanningJob[] = []
  let active = false

  const drain = async (): Promise<void> => {
    if (active) return
    const job = jobs.shift()
    if (!job) return
    if (job.cancelled) {
      void drain()
      return
    }
    active = true
    job.started = true
    try {
      await job.run()
    } finally {
      active = false
      void drain()
    }
  }

  return <T>(signal: AbortSignal | undefined, run: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException('Planning turn was interrupted.', 'AbortError'))
        return
      }
      const job: SerialPlanningJob = {
        started: false,
        cancelled: false,
        run: async () => {
          signal?.removeEventListener('abort', cancelQueued)
          try {
            resolve(await run())
          } catch (error) {
            reject(error)
          }
        },
      }
      const cancelQueued = () => {
        if (job.started || job.cancelled) return
        job.cancelled = true
        signal?.removeEventListener('abort', cancelQueued)
        reject(new DOMException('Planning turn was interrupted.', 'AbortError'))
      }
      signal?.addEventListener('abort', cancelQueued, { once: true })
      jobs.push(job)
      void drain()
    })
}

// Tool gates, primary Plans, alternatives, and revision changes can each
// construct an adapter, but they all share one native Codex runtime.
const enqueueCodexPlanningSession = createPlanningTurnQueue()

function planningPartText(parts: readonly PromptPart[]): Result<string> {
  if (parts.some((part) => part.type !== 'text')) {
    return err('The local planning runtime accepts text context only.')
  }
  return ok(parts
    .map((part) => part.type === 'text' ? part.text : '')
    .filter((text) => text.length > 0)
    .join('\n\n'))
}

async function renderCodexPlanningInput(
  input: GenerateInput,
  prompts: Pick<PromptService, 'render'>,
): Promise<Result<string>> {
  const instructionCount = [input.prompt, input.system, input.promptRef]
    .filter((value) => value !== undefined).length
  if (instructionCount !== 1) {
    return err('provide exactly one of prompt, system, or promptRef')
  }
  if (input.prompt !== undefined) {
    return ok([input.systemContext, input.prompt].filter(Boolean).join('\n\n'))
  }

  let system = input.system
  let scaffold: readonly PromptPart[] = []
  if (input.promptRef !== undefined) {
    try {
      const rendered = await prompts.render(input.promptRef)
      system = rendered.system
      scaffold = rendered.userScaffold ?? []
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error))
    }
  }
  const userText = planningPartText([...scaffold, ...(input.input ?? [])])
  if (!userText.ok) return userText
  if (userText.data.length === 0) {
    return err('planning input is required for system/promptRef generation')
  }
  return ok([
    input.systemContext,
    system,
    'Planning input:',
    userText.data,
  ].filter(Boolean).join('\n\n'))
}

function sanitizedPlanningRuntimeError(
  error: unknown,
  signal?: AbortSignal,
): string {
  if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
    return 'AbortError: operation aborted'
  }
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase()
  if (message.includes('timed out')) return 'Planning runtime timed out.'
  if (message.includes('upstream is unavailable')) return 'Planning runtime upstream is unavailable.'
  if (message.includes('output did not match')) return 'Planning runtime output did not match the required schema.'
  if (message.includes('already active')) return 'Planning runtime is busy.'
  if (message.includes('not ready')) return 'Planning runtime is not ready.'
  if (message.includes('interrupted')) return 'AbortError: operation aborted'
  return 'Planning runtime failed.'
}

/**
 * Adapts the reviewed native Codex planning turn to the two generation methods
 * consumed by the formal prototype Planner. Every stage gets a distinct native
 * conversation and runs through one serialized queue because the native host
 * intentionally owns exactly one active Codex turn.
 */
export function createCodexPlanningGenerationService(
  options: CodexPlanningGenerationOptions,
): CodexPlanningGenerationService {
  const workspaceHandle = opaqueIdSchema.parse(options.workspaceHandle)
  const conversationPrefix = opaqueIdSchema.max(120).parse(options.conversationPrefix)
  const contextRevision = opaqueIdSchema.max(160).parse(options.contextRevision)
  const enqueueTurn = createPlanningTurnQueue()
  let sequence = 0

  const runTurn = async <T>(
    input: GenerateInput,
    schema: z.ZodType<T>,
    mode: 'structured' | 'text',
  ): Promise<Result<T>> => {
    const rendered = await renderCodexPlanningInput(input, options.prompts)
    if (!rendered.ok) return rendered
    const ordinal = ++sequence
    const conversationId = `${conversationPrefix}:${ordinal}`
    const prompt = mode === 'text'
      ? `${rendered.data}\n\nReturn the exact requested textual result in the text field.`
      : rendered.data
    try {
      const result = await enqueueTurn(input.signal, async () => {
        try {
          return await invokeCodexSystemTurn({
            requestId: crypto.randomUUID(),
            workspaceHandle,
            conversationId,
            contextRevision,
            prompt,
            context: {
              version: 'cutout.prototype-planner-context.v1',
              stageOrdinal: ordinal,
              outputMode: mode,
            },
            outputSchema: z.toJSONSchema(schema),
          }, {
            signal: input.signal,
            onEvent: options.onEvent,
          })
        } finally {
          await resetCodexSystemConversation(workspaceHandle, conversationId)
            .catch(() => false)
        }
      })
      const parsed = schema.safeParse(result.output)
      return parsed.success
        ? ok(parsed.data)
        : err('Planning runtime output did not match the required schema.')
    } catch (error) {
      return err(sanitizedPlanningRuntimeError(error, input.signal))
    }
  }

  return {
    runExclusive: (signal, run) => enqueueCodexPlanningSession(signal, run),
    generateObject: (input, schema) => runTurn(input, schema, 'structured'),
    async *streamText(input) {
      const result = await runTurn(input, codexPlanningTextSchema, 'text')
      if (!result.ok) throw new Error(result.error)
      yield result.data.text
    },
  }
}

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
  return enqueueCodexPlanningSession(options.signal, () =>
    invokeCodexSystemTurn(rawInput, options))
}

async function invokeCodexSystemTurn(
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
      // A successful probe proves the bounded zero-tool runtime contract. Its
      // first real Planner turn is the execution proof, so routing it to a
      // weaker direct Provider first would create an impossible bootstrap.
      || input.codex.execution === 'unproven'
      || input.codex.execution === 'succeeded'
    )
  ) {
    return { runtimeId: 'codex-system', evidence: input.codex }
  }
  return input.direct ? { runtimeId: 'direct-provider', ...input.direct } : undefined
}

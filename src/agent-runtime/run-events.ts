import type {
  MaterialEvidence,
  MissingRequirement,
} from './outcome-runtime'
import { z } from 'zod'
import { moneyEstimateSchema, paidToolReceiptSchema, type MoneyEstimate, type PaidToolReceipt } from '@/control-protocol/paid-tool-contract'
import { prototypeHumanLoopChoiceSchema, type HumanLoopChoice } from '@/prototype/prototype-plan'

const runEventBaseSchema = z.object({
  eventId: z.string().min(1).max(160),
  runId: z.string().min(1).max(160),
  at: z.number().int().nonnegative(),
})

const eventText = z.string().min(1).max(20_000)
const materialEvidenceSchema = z.object({
  id: z.string(),
  kind: z.enum(['design-system', 'prototype-page', 'cutout-slice', 'design-markdown']),
  label: z.string(),
  source: z.enum(['agent', 'algorithm', 'user']),
  evidenceKey: z.string().optional(),
}).strict()
const missingRequirementSchema = z.object({
  kind: z.enum(['design-system', 'prototype-page', 'cutout-slice', 'design-markdown']),
  count: z.number().int().nonnegative(),
  label: z.string(),
}).strict()

export const agentRunEventSchema = z.discriminatedUnion('type', [
  runEventBaseSchema.extend({ type: z.literal('run-started'), mode: z.enum(['create', 'repair']) }).strict(),
  runEventBaseSchema.extend({ type: z.literal('intent-recorded'), intent: eventText }).strict(),
  runEventBaseSchema.extend({ type: z.literal('steer-recorded'), instruction: eventText }).strict(),
  runEventBaseSchema.extend({ type: z.literal('plan-recorded'), planId: eventText, summary: eventText, stepIds: z.array(eventText) }).strict(),
  runEventBaseSchema.extend({ type: z.enum(['step-started', 'step-succeeded']), stepId: eventText, label: eventText, detail: eventText.optional() }).strict(),
  runEventBaseSchema.extend({ type: z.enum(['step-failed', 'step-cancelled']), stepId: eventText, label: eventText, detail: eventText }).strict(),
  runEventBaseSchema.extend({ type: z.literal('tool-started'), toolCallId: eventText, tool: eventText, label: eventText, stepId: eventText.optional(), model: z.object({ providerId: eventText, model: eventText }).strict().optional() }).strict(),
  runEventBaseSchema.extend({
    type: z.literal('tool-approval-requested'),
    toolCallId: eventText,
    requestId: eventText,
    tool: eventText,
    label: eventText,
    stepId: eventText.optional(),
    model: z.object({ providerId: eventText, model: eventText }).strict().optional(),
    estimatedCost: moneyEstimateSchema,
    budgetCeiling: moneyEstimateSchema,
    approvalPolicy: z.enum(['explicit', 'auto-within-budget']),
    reason: eventText,
  }).strict(),
  runEventBaseSchema.extend({ type: z.enum(['tool-approved', 'tool-denied']), toolCallId: eventText, requestId: eventText, reason: eventText }).strict(),
  runEventBaseSchema.extend({ type: z.literal('tool-retry-linked'), toolCallId: eventText, previousRequestId: eventText, requestId: eventText }).strict(),
  runEventBaseSchema.extend({ type: z.literal('tool-receipt-recorded'), toolCallId: eventText, receipt: paidToolReceiptSchema }).strict(),
  runEventBaseSchema.extend({ type: z.literal('tool-succeeded'), toolCallId: eventText, tool: eventText, label: eventText, stepId: eventText.optional(), outputRefs: z.array(eventText), receipt: paidToolReceiptSchema.optional() }).strict(),
  runEventBaseSchema.extend({ type: z.enum(['tool-failed', 'tool-cancelled']), toolCallId: eventText, tool: eventText, label: eventText, stepId: eventText.optional(), detail: eventText, receipt: paidToolReceiptSchema.optional() }).strict(),
  runEventBaseSchema.extend({ type: z.literal('material-recorded'), material: materialEvidenceSchema }).strict(),
  runEventBaseSchema.extend({ type: z.literal('capability-fallback'), capability: eventText, detail: eventText }).strict(),
  runEventBaseSchema.extend({ type: z.literal('outcome-evaluated'), status: z.enum(['satisfied', 'needs-repair']), missing: z.array(missingRequirementSchema) }).strict(),
  runEventBaseSchema.extend({ type: z.literal('run-cancelled'), reason: eventText }).strict(),
  runEventBaseSchema.extend({
    type: z.literal('agent-message'),
    message: eventText,
    action: z.object({
      type: z.literal('proceed-anyway'),
      label: eventText,
      brief: eventText,
    }).strict().optional(),
  }).strict(),
  runEventBaseSchema.extend({
    type: z.literal('human-loop-asked'),
    askId: eventText,
    question: eventText,
    choices: z.array(prototypeHumanLoopChoiceSchema).min(2).max(4),
    defaultChoiceId: eventText,
  }).strict(),
  runEventBaseSchema.extend({ type: z.literal('human-loop-answered'), askId: eventText }).strict(),
])

export interface RunEventBase {
  readonly eventId: string
  readonly runId: string
  readonly at: number
}

export interface AgentModelRef {
  readonly providerId: string
  readonly model: string
}

export type AgentRunEvent =
  | (RunEventBase & {
      readonly type: 'run-started'
      readonly mode: 'create' | 'repair'
    })
  | (RunEventBase & {
      readonly type: 'intent-recorded'
      readonly intent: string
    })
  | (RunEventBase & {
      readonly type: 'steer-recorded'
      readonly instruction: string
    })
  | (RunEventBase & {
      readonly type: 'plan-recorded'
      readonly planId: string
      readonly summary: string
      readonly stepIds: readonly string[]
    })
  | (RunEventBase & {
      readonly type: 'step-started' | 'step-succeeded'
      readonly stepId: string
      readonly label: string
      readonly detail?: string
    })
  | (RunEventBase & {
      readonly type: 'step-failed' | 'step-cancelled'
      readonly stepId: string
      readonly label: string
      readonly detail: string
    })
  | (RunEventBase & {
      readonly type: 'tool-started'
      readonly toolCallId: string
      readonly tool: string
      readonly label: string
      readonly stepId?: string
      readonly model?: AgentModelRef
    })
  | (RunEventBase & {
      readonly type: 'tool-approval-requested'
      readonly toolCallId: string
      readonly requestId: string
      readonly tool: string
      readonly label: string
      readonly stepId?: string
      readonly model?: AgentModelRef
      readonly estimatedCost: MoneyEstimate
      readonly budgetCeiling: MoneyEstimate
      readonly approvalPolicy: 'explicit' | 'auto-within-budget'
      readonly reason: string
    })
  | (RunEventBase & {
      readonly type: 'tool-approved' | 'tool-denied'
      readonly toolCallId: string
      readonly requestId: string
      readonly reason: string
    })
  | (RunEventBase & {
      readonly type: 'tool-retry-linked'
      readonly toolCallId: string
      readonly previousRequestId: string
      readonly requestId: string
    })
  | (RunEventBase & {
      readonly type: 'tool-receipt-recorded'
      readonly toolCallId: string
      readonly receipt: PaidToolReceipt
    })
  | (RunEventBase & {
      readonly type: 'tool-succeeded'
      readonly toolCallId: string
      readonly tool: string
      readonly label: string
      readonly stepId?: string
      readonly outputRefs: readonly string[]
      readonly receipt?: PaidToolReceipt
    })
  | (RunEventBase & {
      readonly type: 'tool-failed' | 'tool-cancelled'
      readonly toolCallId: string
      readonly tool: string
      readonly label: string
      readonly stepId?: string
      readonly detail: string
      readonly receipt?: PaidToolReceipt
    })
  | (RunEventBase & {
      readonly type: 'material-recorded'
      readonly material: MaterialEvidence
    })
  | (RunEventBase & {
      readonly type: 'capability-fallback'
      readonly capability: string
      readonly detail: string
    })
  | (RunEventBase & {
      readonly type: 'outcome-evaluated'
      readonly status: 'satisfied' | 'needs-repair'
      readonly missing: readonly MissingRequirement[]
    })
  | (RunEventBase & {
      readonly type: 'run-cancelled'
      readonly reason: string
    })
  | (RunEventBase & {
      readonly type: 'agent-message'
      readonly message: string
      readonly action?: {
        readonly type: 'proceed-anyway'
        readonly label: string
        readonly brief: string
      }
    })
  | (RunEventBase & {
      readonly type: 'human-loop-asked'
      readonly askId: string
      readonly question: string
      readonly choices: readonly HumanLoopChoice[]
      readonly defaultChoiceId: string
    })
  | (RunEventBase & {
      readonly type: 'human-loop-answered'
      readonly askId: string
    })

export type AgentRunEventPayload = AgentRunEvent extends infer Event
  ? Event extends AgentRunEvent
    ? Omit<Event, keyof RunEventBase>
    : never
  : never

export type AgentRunStatus =
  | 'running'
  | 'ready'
  | 'needs-repair'
  | 'cancelled'

export interface AgentStepProjection {
  readonly id: string
  readonly label: string
  readonly detail?: string
  readonly status: 'running' | 'succeeded' | 'failed' | 'cancelled'
}

export interface AgentToolProjection {
  readonly id: string
  readonly tool: string
  readonly label: string
  readonly stepId?: string
  readonly model?: AgentModelRef
  readonly status: 'running' | 'succeeded' | 'failed' | 'cancelled'
  readonly detail?: string
  readonly outputRefs: readonly string[]
  readonly requestId?: string
  readonly previousRequestId?: string
  readonly estimatedCost?: MoneyEstimate
  readonly budgetCeiling?: MoneyEstimate
  readonly approvalPolicy?: 'explicit' | 'auto-within-budget'
  readonly approvalReason?: string
  readonly approvalStatus?: 'required' | 'approved' | 'denied'
  readonly receipt?: PaidToolReceipt
}

export interface AgentRunProjection {
  readonly runId: string
  readonly mode: 'create' | 'repair'
  readonly startedAt: number
  readonly status: AgentRunStatus
  readonly intent: string | null
  readonly plan: {
    readonly id: string
    readonly summary: string
    readonly stepIds: readonly string[]
  } | null
  readonly steps: Readonly<Record<string, AgentStepProjection>>
  readonly tools: Readonly<Record<string, AgentToolProjection>>
  readonly materials: readonly MaterialEvidence[]
  readonly outcome: {
    readonly status: 'satisfied' | 'needs-repair'
    readonly missing: readonly MissingRequirement[]
  } | null
  readonly cancelledReason: string | null
  /** The question currently awaiting an answer, if a suspended `ask_clarifying_question` call is pending. */
  readonly humanLoopAsk: {
    readonly askId: string
    readonly question: string
    readonly choices: readonly HumanLoopChoice[]
    readonly defaultChoiceId: string
  } | null
}

export interface AgentRunEventStore {
  readonly version: 'agent-run-events.v1'
  readonly activeRunId: string | null
  readonly events: readonly AgentRunEvent[]
  readonly activeRun: AgentRunProjection | null
}

export const agentRunEventStoreSchema = z.object({
  version: z.literal('agent-run-events.v1'),
  activeRunId: z.string().nullable(),
  events: z.array(agentRunEventSchema),
  activeRun: z.unknown().nullable(),
}).strict().transform((store) => replayRunEvents(store.events))

export function createRunEventStore(): AgentRunEventStore {
  return {
    version: 'agent-run-events.v1',
    activeRunId: null,
    events: [],
    activeRun: null,
  }
}

export function replayRunEvents(
  events: readonly AgentRunEvent[],
): AgentRunEventStore {
  return events.reduce(appendRunEvent, createRunEventStore())
}

/**
 * Pure append/replay reducer. It never invokes tools or reads external state.
 * Event payloads intentionally expose observable facts only, never hidden
 * reasoning or chain-of-thought.
 */
export function appendRunEvent(
  store: AgentRunEventStore,
  event: AgentRunEvent,
): AgentRunEventStore {
  if (store.events.some((item) => item.eventId === event.eventId)) return store

  if (event.type === 'run-started') {
    if (event.runId === store.activeRunId) return store
    const activeRun = createRunProjection(event)
    return {
      ...store,
      activeRunId: event.runId,
      events: [...store.events, event],
      activeRun,
    }
  }

  if (event.runId !== store.activeRunId || !store.activeRun) return store
  if (store.activeRun.status === 'cancelled') return store
  if (!hasValidLifecyclePredecessor(store.activeRun, event)) return store

  return {
    ...store,
    events: [...store.events, event],
    activeRun: reduceActiveRun(store.activeRun, event),
  }
}

function hasValidLifecyclePredecessor(
  run: AgentRunProjection,
  event: Exclude<AgentRunEvent, { type: 'run-started' }>,
): boolean {
  if (
    event.type === 'tool-succeeded' ||
    event.type === 'tool-failed' ||
    event.type === 'tool-cancelled'
  ) {
    return run.tools[event.toolCallId]?.status === 'running'
  }
  if (event.type === 'tool-approved' || event.type === 'tool-denied' || event.type === 'tool-retry-linked' || event.type === 'tool-receipt-recorded') {
    return Boolean(run.tools[event.toolCallId])
  }
  if (
    event.type === 'step-succeeded' ||
    event.type === 'step-failed' ||
    event.type === 'step-cancelled'
  ) {
    return run.steps[event.stepId]?.status === 'running'
  }
  if (event.type === 'human-loop-asked') {
    return run.humanLoopAsk === null
  }
  if (event.type === 'human-loop-answered') {
    return run.humanLoopAsk?.askId === event.askId
  }
  return true
}

export function createRunEvent(
  runId: string,
  event: AgentRunEventPayload,
  options: { readonly eventId?: string; readonly at?: number } = {},
): AgentRunEvent {
  return {
    ...event,
    eventId: options.eventId ?? crypto.randomUUID(),
    runId,
    at: options.at ?? Date.now(),
  } as AgentRunEvent
}

/** A retry is a new billable request, never a replay of an idempotency key. */
export function createToolRetryEvent(
  runId: string,
  toolCallId: string,
  previousRequestId: string,
  options: { readonly requestId?: string; readonly eventId?: string; readonly at?: number } = {},
): Extract<AgentRunEvent, { type: 'tool-retry-linked' }> {
  const requestId = options.requestId ?? crypto.randomUUID()
  if (requestId === previousRequestId) throw new Error('A tool retry requires a new request id.')
  return createRunEvent(runId, {
    type: 'tool-retry-linked',
    toolCallId,
    previousRequestId,
    requestId,
  }, options) as Extract<AgentRunEvent, { type: 'tool-retry-linked' }>
}

function createRunProjection(
  event: Extract<AgentRunEvent, { type: 'run-started' }>,
): AgentRunProjection {
  return {
    runId: event.runId,
    mode: event.mode,
    startedAt: event.at,
    status: 'running',
    intent: null,
    plan: null,
    steps: {},
    tools: {},
    materials: [],
    outcome: null,
    cancelledReason: null,
    humanLoopAsk: null,
  }
}

function reduceActiveRun(
  run: AgentRunProjection,
  event: Exclude<AgentRunEvent, { type: 'run-started' }>,
): AgentRunProjection {
  switch (event.type) {
    case 'intent-recorded':
      return { ...run, intent: event.intent }
    case 'steer-recorded':
      return run
    case 'plan-recorded':
      return {
        ...run,
        plan: { id: event.planId, summary: event.summary, stepIds: event.stepIds },
      }
    case 'step-started':
    case 'step-succeeded':
    case 'step-failed':
    case 'step-cancelled':
      return {
        ...run,
        steps: {
          ...run.steps,
          [event.stepId]: {
            id: event.stepId,
            label: event.label,
            detail: event.detail,
            status: lifecycleStatus(event.type),
          },
        },
      }
    case 'tool-started':
      return {
        ...run,
        tools: {
          ...run.tools,
          [event.toolCallId]: {
            id: event.toolCallId,
            tool: event.tool,
            label: event.label,
            stepId: event.stepId,
            model: event.model,
            status: 'running',
            outputRefs: [],
          },
        },
      }
    case 'tool-approval-requested':
      return {
        ...run,
        tools: {
          ...run.tools,
          [event.toolCallId]: {
            id: event.toolCallId,
            tool: event.tool,
            label: event.label,
            stepId: event.stepId,
            model: event.model,
            status: 'running',
            outputRefs: [],
            requestId: event.requestId,
            estimatedCost: event.estimatedCost,
            budgetCeiling: event.budgetCeiling,
            approvalPolicy: event.approvalPolicy,
            approvalReason: event.reason,
            approvalStatus: 'required',
          },
        },
      }
    case 'tool-approved':
    case 'tool-denied': {
      const existing = run.tools[event.toolCallId]
      return {
        ...run,
        tools: {
          ...run.tools,
          [event.toolCallId]: {
            ...existing,
            approvalStatus: event.type === 'tool-approved' ? 'approved' : 'denied',
            approvalReason: event.reason,
            detail: event.type === 'tool-denied' ? event.reason : existing.detail,
          },
        },
      }
    }
    case 'tool-retry-linked': {
      const existing = run.tools[event.toolCallId]
      return {
        ...run,
        tools: {
          ...run.tools,
          [event.toolCallId]: {
            ...existing,
            requestId: event.requestId,
            previousRequestId: event.previousRequestId,
            approvalStatus: existing.approvalPolicy === 'explicit' ? 'required' : existing.approvalStatus,
          },
        },
      }
    }
    case 'tool-receipt-recorded': {
      const existing = run.tools[event.toolCallId]
      return {
        ...run,
        tools: {
          ...run.tools,
          [event.toolCallId]: { ...existing, receipt: event.receipt },
        },
      }
    }
    case 'tool-succeeded':
    case 'tool-failed':
    case 'tool-cancelled': {
      const existing = run.tools[event.toolCallId]
      return {
        ...run,
        tools: {
          ...run.tools,
          [event.toolCallId]: {
            id: event.toolCallId,
            tool: event.tool,
            label: event.label,
            stepId: event.stepId ?? existing?.stepId,
            model: existing?.model,
            status: lifecycleStatus(event.type),
            detail: event.type === 'tool-succeeded' ? undefined : event.detail,
            outputRefs: event.type === 'tool-succeeded' ? event.outputRefs : [],
            requestId: existing?.requestId,
            previousRequestId: existing?.previousRequestId,
            estimatedCost: existing?.estimatedCost,
            budgetCeiling: existing?.budgetCeiling,
            approvalPolicy: existing?.approvalPolicy,
            approvalReason: existing?.approvalReason,
            approvalStatus: existing?.approvalStatus,
            receipt: event.receipt ?? existing?.receipt,
          },
        },
      }
    }
    case 'material-recorded':
      return {
        ...run,
        materials: run.materials.some((item) => item.id === event.material.id)
          ? run.materials
          : [...run.materials, event.material],
      }
    case 'capability-fallback':
    case 'agent-message':
      return run
    case 'outcome-evaluated':
      return {
        ...run,
        status: event.status === 'satisfied' ? 'ready' : 'needs-repair',
        outcome: { status: event.status, missing: event.missing },
      }
    case 'run-cancelled':
      return { ...run, status: 'cancelled', cancelledReason: event.reason, humanLoopAsk: null }
    case 'human-loop-asked':
      return run.humanLoopAsk === null
        ? {
            ...run,
            humanLoopAsk: {
              askId: event.askId,
              question: event.question,
              choices: event.choices,
              defaultChoiceId: event.defaultChoiceId,
            },
          }
        : run
    case 'human-loop-answered':
      return run.humanLoopAsk?.askId === event.askId ? { ...run, humanLoopAsk: null } : run
  }
}

function lifecycleStatus(
  type: AgentRunEvent['type'],
): 'running' | 'succeeded' | 'failed' | 'cancelled' {
  if (type.endsWith('-started')) return 'running'
  if (type.endsWith('-succeeded')) return 'succeeded'
  if (type.endsWith('-failed')) return 'failed'
  return 'cancelled'
}

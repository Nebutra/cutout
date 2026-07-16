import type {
  MaterialKind,
  OutcomeRuntimeState,
} from '@/agent-runtime/outcome-runtime'
import type { WorkspaceWorkflowPhase } from '@/workspace/workspace-snapshot'
import type {
  AgentRunEvent,
  AgentRunEventStore,
} from '@/agent-runtime/run-events'
import { CHAT_SURFACE_TOOLS, toolEventLabel } from '@/agent-runtime/tool-loop'
import type { MoneyEstimate } from '@/control-protocol'

export type AgentStageStatus = 'pending' | 'running' | 'done'

export interface AgentStageFact {
  readonly id: string
  readonly label: string
  readonly detail: string
  readonly status: AgentStageStatus
}

export interface AgentViewModelInput {
  readonly brief: string
  readonly workflowPhase: WorkspaceWorkflowPhase
  readonly stages: readonly AgentStageFact[]
  readonly outcome: OutcomeRuntimeState | null | undefined
  readonly working: boolean
  /** The request is being classified before a workflow phase has begun. */
  readonly preparing?: boolean
  readonly elapsedSeconds: number
  readonly runError: string | null
  readonly notices?: readonly string[]
  readonly runEvents?: AgentRunEventStore | null
}

export type AgentFeedItem =
  | {
      readonly id: string
      readonly type: 'message'
      /** Chat bubble role — user right, agent left. */
      readonly role: 'user' | 'agent'
      readonly status: 'complete'
      readonly title: 'You' | 'Agent'
      readonly detail: string
      readonly provenance: 'runtime'
      readonly action?: {
        readonly type: 'proceed-anyway'
        readonly label: string
        readonly brief: string
      }
    }
  | {
      readonly id: string
      readonly type: 'notice'
      readonly status: 'complete'
      readonly title: string
      readonly detail: string
      readonly provenance: 'runtime'
    }
  | {
      readonly id: string
      readonly type: 'tool'
      readonly status: 'running' | 'complete' | 'waiting' | 'stopped'
      readonly title: string
      readonly detail: string
      readonly provenance: 'runtime'
      readonly toolCallId: string
      /** Registry tool name when known — used to hide chat-surface tools from ops feed. */
      readonly toolName?: string
      readonly requestId?: string
      readonly providerModel?: string
      readonly estimatedCost?: MoneyEstimate
      readonly charged?: MoneyEstimate
      readonly approval?: {
        readonly status: 'required' | 'approved' | 'denied' | 'automatic'
        readonly reason: string
      }
      readonly receiptId?: string
      readonly outputRefs?: readonly string[]
      readonly retryOfRequestId?: string
      readonly actions?: readonly ('approve' | 'deny' | 'cancel' | 'retry')[]
    }
  | {
      readonly id: string
      readonly type: 'stage'
      readonly status: 'running' | 'complete'
      readonly title: string
      readonly detail: string
      readonly provenance: 'runtime'
    }
  | {
      readonly id: string
      readonly type: 'material'
      readonly status: 'complete'
      readonly title: string
      readonly detail: string
      readonly materialKind: MaterialKind
      readonly provenance: 'agent' | 'algorithm' | 'user'
    }
  | {
      readonly id: string
      readonly type: 'error'
      readonly status: 'stopped'
      readonly title: 'Run stopped'
      readonly detail: string
      readonly provenance: 'runtime'
    }

export interface OutcomeChecklistItem {
  readonly id: MaterialKind
  readonly label: string
  readonly status: 'complete' | 'missing'
  readonly completedCount: number
  readonly requiredCount: number
  readonly detail: string
}

export interface AgentRunSummary {
  readonly status: 'draft' | 'running' | 'needs-repair' | 'ready' | 'stopped' | 'cancelled'
  readonly title: string
  readonly detail: string
  readonly intent: string | null
  readonly elapsedLabel: string | null
}

export interface AgentWorkspaceViewModel {
  readonly summary: AgentRunSummary
  readonly feed: readonly AgentFeedItem[]
  readonly checklist: readonly OutcomeChecklistItem[]
  /** Policy disclosure only. Provider billing is the source of truth. */
  readonly costNotice: '自动执行付费模型，费用以提供商为准'
  readonly cost?: {
    readonly estimated: readonly MoneyEstimate[]
    readonly charged: readonly MoneyEstimate[]
  }
}

const COST_NOTICE = '自动执行付费模型，费用以提供商为准' as const

export function buildAgentViewModel(input: AgentViewModelInput): AgentWorkspaceViewModel {
  const feed = buildFeed(input)
  return {
    summary: buildRunSummary(input),
    feed,
    checklist: buildOutcomeChecklist(input.outcome),
    costNotice: COST_NOTICE,
    cost: summarizeCosts(feed),
  }
}

function summarizeCosts(feed: readonly AgentFeedItem[]): AgentWorkspaceViewModel['cost'] {
  const tools = feed.filter((item): item is Extract<AgentFeedItem, { type: 'tool' }> => item.type === 'tool')
  return {
    estimated: tools.flatMap((item) => item.estimatedCost ? [item.estimatedCost] : []),
    charged: tools.flatMap((item) => item.charged ? [item.charged] : []),
  }
}

function buildFeed(input: AgentViewModelInput): readonly AgentFeedItem[] {
  const events = input.runEvents?.events ?? []
  const activeRunId = input.runEvents?.activeRunId

  // Chat transcript spans every run so multi-turn dialogue stays visible.
  const conversationItems = events.flatMap((event) => {
    if (event.type !== 'intent-recorded' && event.type !== 'agent-message') return []
    return feedItemFromRunEvent(event)
  })

  // Ops rows (tools/stages/materials/errors) stay scoped to the active run.
  const activeOpsItems = activeRunId
    ? collapseToolLifecycle(
      events.flatMap((event) => {
        if (event.runId !== activeRunId) return []
        if (event.type === 'intent-recorded' || event.type === 'agent-message') return []
        return feedItemFromRunEvent(event)
      }),
    )
    : []

  const stageItems: AgentFeedItem[] = input.stages.flatMap((stage) => {
    if (stage.status === 'pending') return []
    return [{
      id: `stage:${stage.id}`,
      type: 'stage',
      status: stage.status === 'done' ? 'complete' : 'running',
      title: stage.status === 'done' ? `${stage.label} completed` : `Creating ${stage.label}`,
      detail: stage.detail,
      provenance: 'runtime',
    }]
  })

  const materialItems: AgentFeedItem[] = (input.outcome?.materials ?? []).map((material) => ({
    id: `material:${material.id}`,
    type: 'material',
    status: 'complete',
    title: material.label,
    detail: materialDetail(material.kind),
    materialKind: material.kind,
    provenance: material.source,
  }))

  const errorItems: AgentFeedItem[] = input.runError
    ? [{
        id: 'runtime:error',
        type: 'error',
        status: 'stopped',
        title: 'Run stopped',
        detail: input.runError,
        provenance: 'runtime',
      }]
    : []

  const noticeItems: AgentFeedItem[] = (input.notices ?? []).map((detail, index) => ({
    id: `runtime:notice:${index}`,
    type: 'notice',
    status: 'complete',
    title: 'Capability fallback',
    detail,
    provenance: 'runtime',
  }))

  const fallbackItems = [...noticeItems, ...stageItems, ...materialItems, ...errorItems]
  const eventItems = [...conversationItems, ...activeOpsItems]
  if (eventItems.length === 0) return fallbackItems

  // Durable events are authoritative for facts they contain, but the current
  // runtime does not yet emit every stage/material transition. Keep verified
  // Outcome evidence and live stage facts visible until instrumentation is
  // complete, while avoiding a duplicate inferred error.
  const hasDurableError = eventItems.some((item) => item.type === 'error')
  return [
    ...eventItems,
    ...fallbackItems.filter((item) => !(hasDurableError && item.type === 'error')),
  ]
}

type ToolFeedItem = Extract<AgentFeedItem, { type: 'tool' }>

/**
 * Lifecycle rows come from tool-started / succeeded / failed / cancelled.
 * Approval gates and execution receipts share a toolCallId but must stay as
 * their own rows — collapsing everything by toolCallId would hide approvals.
 */
function isLifecycleToolRow(item: ToolFeedItem): boolean {
  if (item.title === 'Execution receipt') return false
  if (item.title === 'Tool approved' || item.title === 'Tool denied') return false
  if (item.title === 'Tool retry prepared') return false
  if (item.status === 'waiting') return false
  return true
}

/**
 * Each tool call emits started + succeeded/failed as separate events. Project
 * them to a single feed row so a completed tool never leaves a stuck spinner.
 */
function collapseToolLifecycle(items: readonly AgentFeedItem[]): AgentFeedItem[] {
  const latestLifecycle = new Map<string, ToolFeedItem>()
  for (const item of items) {
    if (item.type === 'tool' && isLifecycleToolRow(item)) {
      latestLifecycle.set(item.toolCallId, item)
    }
  }
  const emittedLifecycle = new Set<string>()
  const result: AgentFeedItem[] = []
  for (const item of items) {
    if (item.type !== 'tool' || !isLifecycleToolRow(item)) {
      result.push(item)
      continue
    }
    if (emittedLifecycle.has(item.toolCallId)) continue
    emittedLifecycle.add(item.toolCallId)
    result.push(latestLifecycle.get(item.toolCallId)!)
  }
  return result
}

function humanToolTitle(toolName: string | undefined, label: string): string {
  if (toolName) {
    const known = toolEventLabel(toolName)
    // Prefer the short registry label when the event still carries a model instruction.
    if (label.length > 48 || label.startsWith('Call this') || label === toolName) return known
  }
  return label
}

function feedItemFromRunEvent(event: AgentRunEvent): readonly AgentFeedItem[] {
  switch (event.type) {
    case 'run-started':
      return []
    case 'intent-recorded':
      // User turn in the conversation — right-side bubble, not an ops stage row.
      return [{
        id: event.eventId,
        type: 'message',
        role: 'user',
        status: 'complete',
        title: 'You',
        detail: event.intent,
        provenance: 'runtime',
      }]
    case 'plan-recorded':
      return [{
        id: event.eventId,
        type: 'stage',
        status: 'complete',
        title: 'Plan ready',
        detail: event.summary,
        provenance: 'runtime',
      }]
    case 'step-started':
    case 'step-succeeded':
      return [{
        id: event.eventId,
        type: 'stage',
        status: event.type === 'step-started' ? 'running' : 'complete',
        title: event.label,
        detail: event.detail ?? (event.type === 'step-started' ? 'Step started.' : 'Step completed.'),
        provenance: 'runtime',
      }]
    case 'tool-started':
      if (CHAT_SURFACE_TOOLS.has(event.tool)) return []
      return [{
        id: event.eventId,
        type: 'tool',
        status: 'running',
        title: humanToolTitle(event.tool, event.label),
        detail: `Tool: ${event.tool}${event.model ? ` · ${event.model.providerId}/${event.model.model}` : ''}`,
        provenance: 'runtime',
        toolCallId: event.toolCallId,
        toolName: event.tool,
        providerModel: event.model ? `${event.model.providerId}/${event.model.model}` : undefined,
        approval: { status: 'automatic', reason: 'No explicit approval was required by the recorded execution policy.' },
        actions: ['cancel'],
      }]
    case 'tool-approval-requested':
      if (CHAT_SURFACE_TOOLS.has(event.tool)) return []
      return [{
        id: event.eventId,
        type: 'tool',
        status: 'waiting',
        title: humanToolTitle(event.tool, event.label),
        detail: `Tool: ${event.tool}`,
        provenance: 'runtime',
        toolCallId: event.toolCallId,
        toolName: event.tool,
        requestId: event.requestId,
        providerModel: event.model ? `${event.model.providerId}/${event.model.model}` : undefined,
        estimatedCost: event.estimatedCost,
        approval: { status: 'required', reason: event.reason },
        actions: ['approve', 'deny'],
      }]
    case 'tool-approved':
    case 'tool-denied':
      return [{
        id: event.eventId,
        type: 'tool',
        status: event.type === 'tool-approved' ? 'running' : 'stopped',
        title: event.type === 'tool-approved' ? 'Tool approved' : 'Tool denied',
        detail: event.reason,
        provenance: 'runtime',
        toolCallId: event.toolCallId,
        requestId: event.requestId,
        approval: { status: event.type === 'tool-approved' ? 'approved' : 'denied', reason: event.reason },
        actions: event.type === 'tool-approved' ? ['cancel'] : ['retry'],
      }]
    case 'tool-retry-linked':
      return [{
        id: event.eventId,
        type: 'tool',
        status: 'waiting',
        title: 'Tool retry prepared',
        detail: `New request ${event.requestId} replaces ${event.previousRequestId}.`,
        provenance: 'runtime',
        toolCallId: event.toolCallId,
        requestId: event.requestId,
        retryOfRequestId: event.previousRequestId,
      }]
    case 'tool-receipt-recorded':
      return [{
        id: event.eventId,
        type: 'tool',
        status: event.receipt.status === 'succeeded' ? 'complete' : event.receipt.status === 'failed' ? 'stopped' : 'complete',
        title: 'Execution receipt',
        detail: `${event.receipt.capability} · ${event.receipt.status}`,
        provenance: 'runtime',
        toolCallId: event.toolCallId,
        requestId: event.receipt.requestId,
        providerModel: `${event.receipt.providerId}/${event.receipt.model}`,
        charged: event.receipt.charged,
        receiptId: event.receipt.receiptId,
        outputRefs: event.receipt.outputArtifactIds,
        actions: event.receipt.status === 'failed' ? ['retry'] : undefined,
      }]
    case 'tool-succeeded':
      if (CHAT_SURFACE_TOOLS.has(event.tool)) return []
      return [{
        id: event.eventId,
        type: 'tool',
        status: 'complete',
        title: humanToolTitle(event.tool, event.label),
        detail: event.outputRefs.length > 0 ? `Produced ${event.outputRefs.join(', ')}` : `Tool ${event.tool} completed.`,
        provenance: 'runtime',
        toolCallId: event.toolCallId,
        toolName: event.tool,
        outputRefs: event.outputRefs,
      }]
    case 'step-failed':
      return [{ id: event.eventId, type: 'error', status: 'stopped', title: 'Run stopped', detail: `${event.label}: ${event.detail}`, provenance: 'runtime' }]
    case 'tool-failed':
      if (CHAT_SURFACE_TOOLS.has(event.tool)) return []
      return [{
        id: event.eventId,
        type: 'tool',
        status: 'stopped',
        title: humanToolTitle(event.tool, event.label),
        detail: event.detail,
        provenance: 'runtime',
        toolCallId: event.toolCallId,
        toolName: event.tool,
        actions: ['retry'],
      }]
    case 'step-cancelled':
      return [{ id: event.eventId, type: 'notice', status: 'complete', title: event.label, detail: event.detail, provenance: 'runtime' }]
    case 'tool-cancelled':
      if (CHAT_SURFACE_TOOLS.has(event.tool)) return []
      return [{
        id: event.eventId,
        type: 'tool',
        status: 'complete',
        title: humanToolTitle(event.tool, event.label),
        detail: event.detail,
        provenance: 'runtime',
        toolCallId: event.toolCallId,
        toolName: event.tool,
        actions: ['retry'],
      }]
    case 'material-recorded':
      return [{
        id: event.eventId,
        type: 'material',
        status: 'complete',
        title: event.material.label,
        detail: materialDetail(event.material.kind),
        materialKind: event.material.kind,
        provenance: event.material.source,
      }]
    case 'capability-fallback':
      return [{
        id: event.eventId,
        type: 'notice',
        status: 'complete',
        title: 'Capability fallback',
        detail: event.detail,
        provenance: 'runtime',
      }]
    case 'outcome-evaluated':
      return [{
        id: event.eventId,
        type: 'stage',
        status: 'complete',
        title: event.status === 'satisfied' ? 'Outcome verified' : 'Outcome needs repair',
        detail: event.status === 'satisfied'
          ? 'All required materials are verified.'
          : `${event.missing.reduce((sum, item) => sum + item.count, 0)} required materials remain.`,
        provenance: 'runtime',
      }]
    case 'run-cancelled':
      return [{
        id: event.eventId,
        type: 'notice',
        status: 'complete',
        title: 'Run cancelled',
        detail: event.reason,
        provenance: 'runtime',
      }]
    case 'agent-message':
      return [{
        id: event.eventId,
        type: 'message',
        role: 'agent',
        status: 'complete',
        title: 'Agent',
        detail: event.message,
        provenance: 'runtime',
        action: event.action,
      }]
    case 'human-loop-asked':
      return [{
        id: event.eventId,
        type: 'stage',
        status: 'running',
        title: 'Waiting for clarification',
        detail: event.question,
        provenance: 'runtime',
      }]
    case 'human-loop-answered':
      return [{
        id: event.eventId,
        type: 'stage',
        status: 'complete',
        title: 'Clarification answered',
        detail: 'The Agent continues with the answer.',
        provenance: 'runtime',
      }]
  }
}

function buildOutcomeChecklist(
  outcome: OutcomeRuntimeState | null | undefined,
): readonly OutcomeChecklistItem[] {
  if (!outcome) return []
  return outcome.contract.requirements.map((requirement) => {
    const completedCount = countEvidence(outcome, requirement.kind, requirement.expectedKeys)
    const verifiedCount = Math.min(completedCount, requirement.minCount)
    const remaining = Math.max(0, requirement.minCount - completedCount)
    return {
      id: requirement.kind,
      label: requirement.label,
      status: remaining === 0 ? 'complete' : 'missing',
      completedCount: verifiedCount,
      requiredCount: requirement.minCount,
      detail: remaining === 0
        ? `${verifiedCount} of ${requirement.minCount} verified`
        : `${verifiedCount} of ${requirement.minCount} verified; ${remaining} remaining`,
    }
  })
}

function countEvidence(
  outcome: OutcomeRuntimeState,
  kind: MaterialKind,
  expectedKeys: readonly string[] | undefined,
): number {
  const materials = outcome.materials.filter((material) => material.kind === kind)
  if (!expectedKeys) return materials.length
  return new Set(materials.flatMap((material) =>
    material.evidenceKey && expectedKeys.includes(material.evidenceKey)
      ? [material.evidenceKey]
      : [],
  )).size
}

function buildRunSummary(input: AgentViewModelInput): AgentRunSummary {
  const intent = normalizedIntent(input.brief, input.outcome)
  const elapsedLabel = input.elapsedSeconds > 0 ? formatElapsed(input.elapsedSeconds) : null
  if (input.runError) {
    return { status: 'stopped', title: 'Run stopped', detail: input.runError, intent, elapsedLabel }
  }
  if (input.runEvents?.activeRun?.status === 'cancelled') {
    return {
      status: 'cancelled',
      title: 'Run cancelled',
      detail: 'Verified materials remain available. Missing outcomes can be repaired in a new run.',
      intent,
      elapsedLabel,
    }
  }
  if (input.outcome?.status === 'cancelled') {
    return {
      status: 'cancelled',
      title: 'Run cancelled',
      detail: 'Verified materials remain available. Missing outcomes can be repaired in a new run.',
      intent,
      elapsedLabel,
    }
  }
  if (input.outcome?.status === 'ready-to-deliver' || input.outcome?.evaluation.status === 'satisfied') {
    return {
      status: 'ready',
      title: 'Materials ready',
      detail: 'All required outcomes have verified material evidence.',
      intent,
      elapsedLabel,
    }
  }
  if (input.working) {
    if (input.preparing) {
      return {
        status: 'running',
        title: 'Reviewing the request',
        detail: 'Checking intent and routing before generation.',
        intent,
        elapsedLabel,
      }
    }
    const activeStage = input.stages.find((stage) => stage.status === 'running')
    return {
      status: 'running',
      title: activeStage ? `Creating ${activeStage.label}` : phaseTitle(input.workflowPhase),
      detail: activeStage?.detail ?? 'Executing the current outcome plan.',
      intent,
      elapsedLabel,
    }
  }
  if (input.outcome) {
    const missingCount = input.outcome.evaluation.missing.reduce((sum, item) => sum + item.count, 0)
    return {
      status: 'needs-repair',
      title: 'Outcome needs repair',
      detail: `${missingCount} required material${missingCount === 1 ? '' : 's'} remaining.`,
      intent,
      elapsedLabel,
    }
  }
  return {
    status: 'draft',
    title: 'Describe the result you need',
    detail: 'The Agent will plan and execute against a visible outcome checklist.',
    intent,
    elapsedLabel,
  }
}

function normalizedIntent(
  brief: string,
  outcome: OutcomeRuntimeState | null | undefined,
): string | null {
  const value = brief.trim() || outcome?.contract.intent.trim() || ''
  return value || null
}

function phaseTitle(phase: WorkspaceWorkflowPhase): string {
  switch (phase) {
    case 'planning': return 'Planning the outcome'
    case 'review': return 'Reviewing the plan'
    case 'design-system': return 'Creating the design system'
    case 'generating-suite': return 'Generating prototype pages'
    case 'idle': return 'Preparing the run'
  }
}

function materialDetail(kind: MaterialKind): string {
  switch (kind) {
    case 'design-system': return 'Verified design system material'
    case 'prototype-page': return 'Verified prototype page material'
    case 'cutout-slice': return 'Verified cutout asset'
    case 'design-markdown': return 'Verified DESIGN.md material'
  }
}

function formatElapsed(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(safeSeconds / 60)
  return `${minutes}:${String(safeSeconds % 60).padStart(2, '0')}`
}

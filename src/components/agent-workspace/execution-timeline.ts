import type { AgentRunEvent, AgentRunEventStore } from '@/agent-runtime/run-events'
import { CHAT_SURFACE_TOOLS } from '@/agent-runtime/tool-loop'
import type { MoneyEstimate } from '@/control-protocol'

export type ExecutionStatus = 'running' | 'waiting' | 'succeeded' | 'failed' | 'cancelled'

export interface ExecutionTimelineTool {
  readonly id: string
  readonly label: string
  readonly tool: string
  readonly status: ExecutionStatus
  readonly startedAt: number
  readonly endedAt?: number
  readonly detail?: string
  readonly route?: string
  readonly receiptId?: string
  readonly outputRefs: readonly string[]
  readonly policy?: string
  readonly estimatedCost?: MoneyEstimate
  readonly approval?: { readonly toolCallId: string; readonly requestId: string }
}

export interface ExecutionTimelineStep {
  readonly id: string
  readonly label: string
  readonly status: ExecutionStatus
  readonly startedAt: number
  readonly endedAt?: number
  readonly detail?: string
  readonly tools: readonly ExecutionTimelineTool[]
}

export interface ExecutionTimeline {
  readonly runId: string
  readonly steps: readonly ExecutionTimelineStep[]
}

/**
 * The conversation is not an audit log. Keep only work that can still change
 * the user's next action in the dock; completed work remains available on the
 * canvas and in the inspector.
 */
export function activeExecutionTimeline(timeline: ExecutionTimeline | null | undefined): ExecutionTimeline | null {
  if (!timeline) return null
  // A terminal failure belongs to the single Agent error message, not a second
  // execution card. Keep this surface strictly for work still in progress or
  // awaiting a user decision.
  const steps = timeline.steps.filter((step) => step.status === 'running' || step.status === 'waiting')
  return steps.length > 0 ? { ...timeline, steps } : null
}

type MutableTool = Omit<ExecutionTimelineTool, 'outputRefs'> & { outputRefs: string[]; requestId?: string; approvalPolicy?: 'explicit' | 'auto-within-budget' }
type MutableStep = Omit<ExecutionTimelineStep, 'tools'> & { tools: MutableTool[] }

export function projectExecutionTimeline(store: AgentRunEventStore | null | undefined): ExecutionTimeline | null {
  const runId = store?.activeRunId
  if (!runId) return null
  const events = store.events.filter((event) => event.runId === runId).sort(eventOrder)
  const steps = new Map<string, MutableStep>()
  const tools = new Map<string, MutableTool>()

  for (const event of events) {
    // Conversation-only calls already render as one Agent message in the dock.
    // They are not material work and must not manufacture a "Tools / Replying"
    // timeline for the same turn.
    if ('tool' in event && typeof event.tool === 'string' && CHAT_SURFACE_TOOLS.has(event.tool)) continue
    if (event.type === 'step-started') {
      steps.set(event.stepId, { id: event.stepId, label: event.label, detail: event.detail, status: 'running', startedAt: event.at, tools: [] })
    } else if (event.type === 'step-succeeded' || event.type === 'step-failed' || event.type === 'step-cancelled') {
      const step = steps.get(event.stepId)
      if (step) steps.set(event.stepId, { ...step, label: event.label, detail: event.detail ?? step.detail, status: terminalStatus(event.type), endedAt: event.at })
    } else if (event.type === 'tool-started' || event.type === 'tool-approval-requested') {
      const existing = tools.get(event.toolCallId)
      const tool: MutableTool = {
        id: event.toolCallId,
        label: event.label,
        tool: event.tool,
        status: event.type === 'tool-approval-requested' && event.approvalPolicy === 'explicit' ? 'waiting' : 'running',
        startedAt: existing?.startedAt ?? event.at,
        outputRefs: existing?.outputRefs ?? [],
        route: event.model ? `${event.model.providerId}/${event.model.model}` : existing?.route,
        policy: event.type === 'tool-approval-requested' ? event.reason : existing?.policy,
        estimatedCost: event.type === 'tool-approval-requested' ? event.estimatedCost : existing?.estimatedCost,
        requestId: event.type === 'tool-approval-requested' ? event.requestId : existing?.requestId,
        approvalPolicy: event.type === 'tool-approval-requested' ? event.approvalPolicy : existing?.approvalPolicy,
        approval: event.type === 'tool-approval-requested' && event.approvalPolicy === 'explicit'
          ? { toolCallId: event.toolCallId, requestId: event.requestId }
          : existing?.approval,
      }
      tools.set(event.toolCallId, tool)
      attachTool(steps, tool, event.stepId)
    } else if (event.type === 'tool-approved' || event.type === 'tool-denied') {
      const tool = tools.get(event.toolCallId)
      if (tool && tool.requestId === event.requestId) {
        const updated = { ...tool, status: event.type === 'tool-approved' ? 'running' as const : 'failed' as const, endedAt: event.type === 'tool-denied' ? event.at : undefined, detail: event.reason, approval: undefined }
        tools.set(event.toolCallId, updated)
        replaceAttachedTool(steps, updated)
      }
    } else if (event.type === 'tool-receipt-recorded') {
      const tool = tools.get(event.toolCallId)
      if (tool) {
        const updated = { ...tool, receiptId: event.receipt.receiptId, route: `${event.receipt.providerId}/${event.receipt.model}`, outputRefs: [...event.receipt.outputArtifactIds], approval: undefined }
        tools.set(event.toolCallId, updated)
        replaceAttachedTool(steps, updated)
      }
    } else if (event.type === 'tool-succeeded' || event.type === 'tool-failed' || event.type === 'tool-cancelled') {
      const existing = tools.get(event.toolCallId)
      const tool: MutableTool = {
        id: event.toolCallId,
        label: event.label,
        tool: event.tool,
        status: terminalStatus(event.type),
        startedAt: existing?.startedAt ?? event.at,
        endedAt: event.at,
        detail: event.type === 'tool-succeeded' ? existing?.detail : event.detail,
        route: existing?.route,
        receiptId: event.receipt?.receiptId ?? existing?.receiptId,
        outputRefs: event.type === 'tool-succeeded' ? [...event.outputRefs] : existing?.outputRefs ?? [],
        policy: existing?.policy,
        estimatedCost: existing?.estimatedCost,
        requestId: existing?.requestId,
        approvalPolicy: existing?.approvalPolicy,
        approval: undefined,
      }
      tools.set(event.toolCallId, tool)
      replaceAttachedTool(steps, tool, event.stepId)
    } else if (event.type === 'run-cancelled') {
      for (const [toolId, tool] of tools) {
        if (isTerminal(tool.status)) continue
        const cancelled = {
          ...tool,
          status: 'cancelled' as const,
          endedAt: event.at,
          detail: event.reason,
          approval: undefined,
        }
        tools.set(toolId, cancelled)
        replaceAttachedTool(steps, cancelled)
      }
      for (const [stepId, step] of steps) {
        if (isTerminal(step.status)) continue
        steps.set(stepId, {
          ...step,
          status: 'cancelled',
          endedAt: event.at,
          detail: event.reason,
        })
      }
    }
  }

  const attached = new Set([...steps.values()].flatMap((step) => step.tools.map((tool) => tool.id)))
  const orphanTools = [...tools.values()].filter((tool) => !attached.has(tool.id))
  const result = [...steps.values()]
  if (orphanTools.length) {
    const startedAt = Math.min(...orphanTools.map((tool) => tool.startedAt))
    const allTerminal = orphanTools.every((tool) => isTerminal(tool.status))
    result.push({ id: 'unscoped-tools', label: 'Tools', status: allTerminal ? aggregateTerminal(orphanTools) : orphanTools.some((tool) => tool.status === 'waiting') ? 'waiting' : 'running', startedAt, endedAt: allTerminal ? Math.max(...orphanTools.map((tool) => tool.endedAt ?? tool.startedAt)) : undefined, tools: orphanTools })
  }
  if (!result.length) return null
  return { runId, steps: result.sort((a, b) => a.startedAt - b.startedAt) }
}

function attachTool(steps: Map<string, MutableStep>, tool: MutableTool, stepId?: string) {
  if (!stepId) return
  const step = steps.get(stepId)
  if (!step) return
  const index = step.tools.findIndex((item) => item.id === tool.id)
  if (index < 0) step.tools.push(tool)
  else step.tools[index] = tool
}

function replaceAttachedTool(steps: Map<string, MutableStep>, tool: MutableTool, stepId?: string) {
  let replaced = false
  for (const step of steps.values()) {
    const index = step.tools.findIndex((item) => item.id === tool.id)
    if (index >= 0) { step.tools[index] = tool; replaced = true }
  }
  if (!replaced) attachTool(steps, tool, stepId)
}

function eventOrder(a: AgentRunEvent, b: AgentRunEvent) { return a.at - b.at || a.eventId.localeCompare(b.eventId) }
function terminalStatus(type: AgentRunEvent['type']): ExecutionStatus { return type.endsWith('succeeded') ? 'succeeded' : type.endsWith('failed') ? 'failed' : 'cancelled' }
function isTerminal(status: ExecutionStatus) { return status === 'succeeded' || status === 'failed' || status === 'cancelled' }
function aggregateTerminal(tools: readonly MutableTool[]): ExecutionStatus { return tools.some((tool) => tool.status === 'failed') ? 'failed' : tools.some((tool) => tool.status === 'cancelled') ? 'cancelled' : 'succeeded' }

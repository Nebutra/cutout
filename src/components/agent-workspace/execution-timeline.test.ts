import { describe, expect, it } from 'vitest'
import { replayRunEvents, type AgentRunEvent } from '@/agent-runtime/run-events'
import { activeExecutionTimeline, projectExecutionTimeline } from './execution-timeline'

const base: AgentRunEvent[] = [{ eventId: 'start', runId: 'run', at: 1_000, type: 'run-started', mode: 'create' }]
const store = (events: AgentRunEvent[]) => replayRunEvents([...base, ...events])

describe('projectExecutionTimeline', () => {
  it('orders actual started steps and keeps completed steps collapsed by status', () => {
    const timeline = projectExecutionTimeline(store([
      { eventId: 'plan', runId: 'run', at: 1_100, type: 'plan-recorded', planId: 'p', summary: 'Do work', stepIds: ['future'] },
      { eventId: 'b:start', runId: 'run', at: 3_000, type: 'step-started', stepId: 'b', label: 'Second' },
      { eventId: 'a:start', runId: 'run', at: 2_000, type: 'step-started', stepId: 'a', label: 'First' },
      { eventId: 'a:done', runId: 'run', at: 2_500, type: 'step-succeeded', stepId: 'a', label: 'First' },
    ]))!
    expect(timeline.steps.map(({ id, status }) => [id, status])).toEqual([['a', 'succeeded'], ['b', 'running']])
    expect(JSON.stringify(timeline)).not.toContain('future')
  })

  it('groups orphan tools and exposes only unresolved explicit approval', () => {
    const timeline = projectExecutionTimeline(store([
      { eventId: 'auto', runId: 'run', at: 2_000, type: 'tool-approval-requested', toolCallId: 'auto', requestId: 'auto-r', tool: 'image.generate', label: 'Generate reference', estimatedCost: { currency: 'USD', amount: 0.1 }, budgetCeiling: { currency: 'USD', amount: 1 }, approvalPolicy: 'auto-within-budget', reason: 'Auto within policy.' },
      { eventId: 'explicit', runId: 'run', at: 3_000, type: 'tool-approval-requested', toolCallId: 'explicit', requestId: 'explicit-r', tool: 'image.generate', label: 'Protected export', estimatedCost: { currency: 'USD', amount: 0.1 }, budgetCeiling: { currency: 'USD', amount: 1 }, approvalPolicy: 'explicit', reason: 'User approval required.' },
    ]))!
    expect(timeline.steps).toHaveLength(1)
    expect(timeline.steps[0]?.id).toBe('unscoped-tools')
    expect(timeline.steps[0]?.tools.find((tool) => tool.id === 'auto')?.approval).toBeUndefined()
    expect(timeline.steps[0]?.tools.find((tool) => tool.id === 'explicit')?.approval).toEqual({ toolCallId: 'explicit', requestId: 'explicit-r' })
  })

  it('retains factual route, receipt and output references', () => {
    const timeline = projectExecutionTimeline(store([
      { eventId: 'step', runId: 'run', at: 2_000, type: 'step-started', stepId: 'design', label: 'Create reference' },
      { eventId: 'tool', runId: 'run', at: 2_100, type: 'tool-started', toolCallId: 'call', stepId: 'design', tool: 'image.generate', label: 'Generate image', model: { providerId: 'mox', model: 'gpt-image-2' } },
      { eventId: 'done', runId: 'run', at: 3_100, type: 'tool-succeeded', toolCallId: 'call', stepId: 'design', tool: 'image.generate', label: 'Generate image', outputRefs: ['artifact:one'] },
      { eventId: 'step-done', runId: 'run', at: 3_200, type: 'step-succeeded', stepId: 'design', label: 'Create reference' },
    ]))!
    expect(timeline.steps[0]?.tools[0]).toMatchObject({ status: 'succeeded', route: 'mox/gpt-image-2', outputRefs: ['artifact:one'] })
  })

  it('does not turn a conversational reply into a Tools timeline', () => {
    const timeline = projectExecutionTimeline(store([
      { eventId: 'reply:start', runId: 'run', at: 2_000, type: 'tool-started', toolCallId: 'reply', tool: 'reply_conversationally', label: 'Replying' },
      { eventId: 'reply:done', runId: 'run', at: 2_100, type: 'tool-succeeded', toolCallId: 'reply', tool: 'reply_conversationally', label: 'Replying', outputRefs: [] },
    ]))

    expect(timeline).toBeNull()
  })

  it('keeps completed execution out of the conversational activity surface', () => {
    const timeline = projectExecutionTimeline(store([
      { eventId: 'step', runId: 'run', at: 2_000, type: 'step-started', stepId: 'page', label: 'Create page' },
      { eventId: 'done', runId: 'run', at: 2_100, type: 'step-succeeded', stepId: 'page', label: 'Create page' },
    ]))

    expect(activeExecutionTimeline(timeline)).toBeNull()
  })

  it('keeps preparation in the full audit projection but omits a pure preparation card from the dock', () => {
    const timeline = projectExecutionTimeline(store([
      { eventId: 'prepare', runId: 'run', at: 2_000, type: 'step-started', stepId: 'step:prepare:run', label: 'Preparing the run', detail: 'Checking your request…' },
    ]))!

    expect(timeline.steps).toEqual([expect.objectContaining({
      id: 'step:prepare:run',
      status: 'running',
    })])
    expect(activeExecutionTimeline(timeline)).toBeNull()
  })

  it('removes preparation while retaining a substantive active step', () => {
    const timeline = projectExecutionTimeline(store([
      { eventId: 'prepare', runId: 'run', at: 2_000, type: 'step-started', stepId: 'step:prepare:run', label: 'Preparing the run' },
      { eventId: 'build', runId: 'run', at: 3_000, type: 'step-started', stepId: 'step:build', label: 'Creating assets' },
    ]))!

    expect(activeExecutionTimeline(timeline)?.steps).toEqual([
      expect.objectContaining({ id: 'step:build', label: 'Creating assets' }),
    ])
  })

  it('keeps a real tool nested under preparation without repeating the preparation step', () => {
    const timeline = projectExecutionTimeline(store([
      { eventId: 'prepare', runId: 'run', at: 2_000, type: 'step-started', stepId: 'step:prepare:run', label: 'Preparing the run' },
      { eventId: 'tool', runId: 'run', at: 2_100, type: 'tool-started', toolCallId: 'inspect', stepId: 'step:prepare:run', tool: 'inspect-material', label: 'Inspect material' },
    ]))!
    const active = activeExecutionTimeline(timeline)

    expect(active?.steps).toEqual([expect.objectContaining({
      id: 'step:prepare:run:tools',
      label: 'Tools',
      tools: [expect.objectContaining({ id: 'inspect', status: 'running' })],
    })])
    expect(JSON.stringify(active)).not.toContain('Preparing the run')
  })

  it('does not manufacture active Tools from terminal preparation tools', () => {
    const timeline = projectExecutionTimeline(store([
      { eventId: 'prepare', runId: 'run', at: 2_000, type: 'step-started', stepId: 'step:prepare:run', label: 'Preparing the run' },
      { eventId: 'tool', runId: 'run', at: 2_100, type: 'tool-started', toolCallId: 'inspect', stepId: 'step:prepare:run', tool: 'inspect-material', label: 'Inspect material' },
      { eventId: 'tool-done', runId: 'run', at: 2_200, type: 'tool-succeeded', toolCallId: 'inspect', stepId: 'step:prepare:run', tool: 'inspect-material', label: 'Inspect material', outputRefs: [] },
    ]))!

    expect(timeline.steps[0]?.tools).toEqual([expect.objectContaining({ id: 'inspect', status: 'succeeded' })])
    expect(activeExecutionTimeline(timeline)).toBeNull()
  })

  it('keeps an explicit approval nested under preparation visible and actionable', () => {
    const timeline = projectExecutionTimeline(store([
      { eventId: 'prepare', runId: 'run', at: 2_000, type: 'step-started', stepId: 'step:prepare:run', label: 'Preparing the run' },
      { eventId: 'approval', runId: 'run', at: 2_100, type: 'tool-approval-requested', toolCallId: 'generate', requestId: 'request', stepId: 'step:prepare:run', tool: 'image.generate', label: 'Generate hero', estimatedCost: { currency: 'USD', amount: 0.1 }, budgetCeiling: { currency: 'USD', amount: 1 }, approvalPolicy: 'explicit', reason: 'User approval required.' },
    ]))!
    const active = activeExecutionTimeline(timeline)

    expect(active?.steps).toEqual([expect.objectContaining({
      id: 'step:prepare:run:tools',
      status: 'waiting',
      tools: [expect.objectContaining({
        id: 'generate',
        approval: { toolCallId: 'generate', requestId: 'request' },
      })],
    })])
  })

  it('keeps failed execution out of the conversational activity surface', () => {
    const timeline = projectExecutionTimeline(store([
      { eventId: 'step', runId: 'run', at: 2_000, type: 'step-started', stepId: 'visual', label: 'Generate visual' },
      { eventId: 'failed', runId: 'run', at: 2_100, type: 'step-failed', stepId: 'visual', label: 'Generate visual', detail: 'Provider connection interrupted.' },
    ]))

    expect(activeExecutionTimeline(timeline)).toBeNull()
  })

  it('ends running step and tool timers when the run is cancelled', () => {
    const timeline = projectExecutionTimeline(store([
      { eventId: 'step', runId: 'run', at: 2_000, type: 'step-started', stepId: 'visual', label: 'Visual generation' },
      { eventId: 'tool', runId: 'run', at: 2_100, type: 'tool-started', toolCallId: 'refine', stepId: 'visual', tool: 'edit-image', label: 'Refine selected visual' },
      { eventId: 'cancel', runId: 'run', at: 3_000, type: 'run-cancelled', reason: 'Stopped by user' },
    ]))!

    expect(timeline.steps[0]).toMatchObject({ status: 'cancelled', endedAt: 3_000 })
    expect(timeline.steps[0]?.tools[0]).toMatchObject({ status: 'cancelled', endedAt: 3_000 })
    expect(activeExecutionTimeline(timeline)).toBeNull()
  })
})

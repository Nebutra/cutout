import { describe, expect, it } from 'vitest'
import type { OutcomeRuntimeState } from '@/agent-runtime/outcome-runtime'
import { createRunEvent, replayRunEvents } from '@/agent-runtime/run-events'
import {
  buildAgentViewModel,
  type AgentStageFact,
} from './agent-view-model'

const stages: readonly AgentStageFact[] = [
  { id: 'planning', label: 'Plan', detail: 'Map pages and scope.', status: 'done' },
  { id: 'design', label: 'Design system', detail: 'Create the visual system.', status: 'running' },
  { id: 'pages', label: 'Prototype pages', detail: 'Generate planned pages.', status: 'pending' },
]

function outcome(
  status: OutcomeRuntimeState['status'] = 'running',
): OutcomeRuntimeState {
  return {
    version: 'outcome-runtime.v1',
    runId: 'run-1',
    status,
    contract: {
      id: 'contract-1',
      intent: 'Create a reusable mobile checkout prototype',
      requirements: [
        { kind: 'design-system', label: 'Design system', minCount: 1 },
        { kind: 'prototype-page', label: 'Prototype pages', minCount: 2 },
      ],
    },
    materials: [
      {
        id: 'design-1',
        kind: 'design-system',
        label: 'Checkout design system',
        source: 'agent',
      },
      {
        id: 'page-1',
        kind: 'prototype-page',
        label: 'Cart page',
        source: 'agent',
      },
    ],
    evaluation: {
      status: 'needs-repair',
      missing: [{ kind: 'prototype-page', label: 'Prototype pages', count: 1 }],
    },
    events: [],
  }
}

describe('buildAgentViewModel', () => {
  it('projects paid tool approval, provider route, receipt evidence, and cost totals from durable events', () => {
    const runEvents = replayRunEvents([
      { eventId: 'start-paid', runId: 'paid', at: 1, type: 'run-started', mode: 'create' },
      { eventId: 'approval-paid', runId: 'paid', at: 2, type: 'tool-approval-requested', toolCallId: 'image-1', requestId: 'request-1', tool: 'image.generate', label: 'Generate hero', model: { providerId: 'openai', model: 'gpt-image-1' }, estimatedCost: { currency: 'USD', amount: 0.08, credits: 8 }, budgetCeiling: { currency: 'USD', amount: 0.2, credits: 20 }, approvalPolicy: 'explicit', reason: 'Explicit approval is required.' },
      { eventId: 'receipt-paid', runId: 'paid', at: 3, type: 'tool-receipt-recorded', toolCallId: 'image-1', receipt: { receiptId: 'receipt-1', requestId: 'request-1', capability: 'generate-image', providerId: 'openai', model: 'gpt-image-1', status: 'succeeded', charged: { currency: 'USD', amount: 0.07, credits: 7 }, outputArtifactIds: ['hero.png'], startedAt: 2, completedAt: 3 } },
    ])
    const model = buildAgentViewModel({ brief: 'Hero', workflowPhase: 'planning', stages: [], outcome: null, working: true, elapsedSeconds: 1, runError: null, runEvents })
    expect(model.feed[0]).toMatchObject({ type: 'tool', status: 'waiting', providerModel: 'openai/gpt-image-1', actions: ['approve', 'deny'] })
    expect(model.feed[1]).toMatchObject({ type: 'tool', receiptId: 'receipt-1', outputRefs: ['hero.png'] })
    expect(model.cost).toEqual({ estimated: [{ currency: 'USD', amount: 0.08, credits: 8 }], charged: [{ currency: 'USD', amount: 0.07, credits: 7 }] })
  })
  it('projects a typed, factual run feed without fabricated thinking or events', () => {
    const model = buildAgentViewModel({
      brief: 'Create a reusable mobile checkout prototype',
      workflowPhase: 'design-system',
      stages,
      outcome: outcome(),
      working: true,
      elapsedSeconds: 65,
      runError: null,
    })

    expect(model.summary).toMatchObject({
      status: 'running',
      title: 'Creating Design system',
      elapsedLabel: '1:05',
      intent: 'Create a reusable mobile checkout prototype',
    })
    expect(model.feed.map((item) => [item.type, item.title])).toEqual([
      ['stage', 'Plan completed'],
      ['stage', 'Creating Design system'],
      ['material', 'Checkout design system'],
      ['material', 'Cart page'],
    ])
    expect(model.feed.map((item) => item.provenance)).toEqual([
      'runtime',
      'runtime',
      'agent',
      'agent',
    ])
    expect(JSON.stringify(model)).not.toMatch(/thinking|reasoning|heartbeat|request sent/i)
  })

  it('describes request routing before a workflow phase begins', () => {
    const model = buildAgentViewModel({
      brief: 'Hello',
      workflowPhase: 'idle',
      stages: [],
      outcome: null,
      working: true,
      preparing: true,
      elapsedSeconds: 1,
      runError: null,
    })

    expect(model.summary).toMatchObject({
      status: 'running',
      title: 'Reviewing the request',
      detail: 'Checking intent and routing before generation.',
    })
  })

  it('prefers replayed durable events over inferred stage activity', () => {
    const model = buildAgentViewModel({
      brief: 'Checkout',
      workflowPhase: 'design-system',
      stages,
      outcome: outcome(),
      working: true,
      elapsedSeconds: 1,
      runError: null,
      runEvents: replayRunEvents([
        { eventId: 'start', runId: 'run-1', at: 1, type: 'run-started', mode: 'create' },
        { eventId: 'intent', runId: 'run-1', at: 2, type: 'intent-recorded', intent: 'Checkout' },
        {
          eventId: 'tool',
          runId: 'run-1',
          at: 3,
          type: 'tool-started',
          toolCallId: 'image-1',
          tool: 'image.generate',
          label: 'Generate checkout page',
          model: { providerId: 'openai', model: 'gpt-image-1' },
        },
      ]),
    })

    expect(model.feed.map((item) => item.title)).toEqual([
      'You',
      'Generate checkout page',
      'Plan completed',
      'Creating Design system',
      'Checkout design system',
      'Cart page',
    ])
    expect(model.feed[0]).toMatchObject({ type: 'message', role: 'user', detail: 'Checkout' })
    expect(model.feed[1]?.detail).toContain('openai/gpt-image-1')
    expect(JSON.stringify(model.feed)).not.toMatch(/chain.of.thought|reasoning/i)
  })

  it('keeps cancellation terminal before an outcome contract exists', () => {
    const model = buildAgentViewModel({
      brief: 'Checkout',
      workflowPhase: 'idle',
      stages: [],
      outcome: null,
      working: false,
      elapsedSeconds: 2,
      runError: null,
      runEvents: replayRunEvents([
        { eventId: 'start', runId: 'run-1', at: 1, type: 'run-started', mode: 'create' },
        { eventId: 'cancel', runId: 'run-1', at: 2, type: 'run-cancelled', reason: 'Stopped by user' },
      ]),
    })

    expect(model.summary.status).toBe('cancelled')
    expect(model.feed.at(-1)).toMatchObject({ title: 'Run cancelled' })
  })

  it('builds an outcome checklist from requirements and evidence counts', () => {
    const model = buildAgentViewModel({
      brief: 'Checkout',
      workflowPhase: 'review',
      stages,
      outcome: outcome(),
      working: false,
      elapsedSeconds: 0,
      runError: null,
    })

    expect(model.checklist).toEqual([
      {
        id: 'design-system',
        label: 'Design system',
        status: 'complete',
        completedCount: 1,
        requiredCount: 1,
        detail: '1 of 1 verified',
      },
      {
        id: 'prototype-page',
        label: 'Prototype pages',
        status: 'missing',
        completedCount: 1,
        requiredCount: 2,
        detail: '1 of 2 verified; 1 remaining',
      },
    ])
    expect(model.summary.status).toBe('needs-repair')
  })

  it('surfaces an error as a factual feed item and prioritizes stopped status', () => {
    const model = buildAgentViewModel({
      brief: 'Checkout',
      workflowPhase: 'generating-suite',
      stages,
      outcome: outcome(),
      working: false,
      elapsedSeconds: 8,
      runError: 'Provider rejected the image request.',
    })

    expect(model.summary).toMatchObject({
      status: 'stopped',
      title: 'Run stopped',
    })
    expect(model.feed.at(-1)).toMatchObject({
      type: 'error',
      title: 'Run stopped',
      detail: 'Provider rejected the image request.',
      provenance: 'runtime',
    })
  })

  it('surfaces capability degradation as a factual feed notice', () => {
    const model = buildAgentViewModel({
      brief: 'Checkout',
      workflowPhase: 'planning',
      stages: [],
      outcome: null,
      working: true,
      elapsedSeconds: 1,
      runError: null,
      notices: ['Web search is unavailable; continuing without grounding.'],
    })

    expect(model.feed[0]).toMatchObject({
      type: 'notice',
      title: 'Capability fallback',
      detail: 'Web search is unavailable; continuing without grounding.',
      provenance: 'runtime',
    })
  })

  it('marks a satisfied outcome ready and never invents a price', () => {
    const base = outcome('ready-to-deliver')
    const ready: OutcomeRuntimeState = {
      ...base,
      materials: [
        ...base.materials,
        {
          id: 'page-2',
          kind: 'prototype-page',
          label: 'Payment page',
          source: 'agent',
        },
      ],
      evaluation: { status: 'satisfied', missing: [] },
    }

    const model = buildAgentViewModel({
      brief: '',
      workflowPhase: 'idle',
      stages: stages.map((stage) => ({ ...stage, status: 'done' })),
      outcome: ready,
      working: false,
      elapsedSeconds: 90,
      runError: null,
    })

    expect(model.summary).toMatchObject({ status: 'ready', title: 'Materials ready' })
    expect(model.costNotice).toBe('自动执行付费模型，费用以提供商为准')
    expect(model.costNotice).not.toMatch(/[¥$]\s*\d|\d+\.\d{2}/)
  })

  it('returns an honest draft model when no run facts exist', () => {
    const model = buildAgentViewModel({
      brief: '  ',
      workflowPhase: 'idle',
      stages: [],
      outcome: null,
      working: false,
      elapsedSeconds: 0,
      runError: null,
    })

    expect(model.summary).toEqual({
      status: 'draft',
      title: 'Describe the result you need',
      detail: 'The Agent will plan and execute against a visible outcome checklist.',
      intent: null,
      elapsedLabel: null,
    })
    expect(model.feed).toEqual([])
    expect(model.checklist).toEqual([])
  })

  it('projects durable Agent messages and their explicit action into the feed', () => {
    const runId = 'run:conversation'
    const runEvents = replayRunEvents([
      createRunEvent(runId, { type: 'run-started', mode: 'create' }, { eventId: 'start', at: 1 }),
      createRunEvent(runId, {
        type: 'agent-message',
        message: 'Tell me what you would like to design.',
        action: { type: 'proceed-anyway', label: 'Build it anyway', brief: 'hi' },
      }, { eventId: 'reply', at: 2 }),
    ])
    const model = buildAgentViewModel({
      brief: 'hi',
      workflowPhase: 'idle',
      stages: [],
      outcome: null,
      working: false,
      elapsedSeconds: 0,
      runError: null,
      runEvents,
    })

    expect(model.feed).toEqual([expect.objectContaining({
      id: 'reply',
      type: 'message',
      role: 'agent',
      detail: 'Tell me what you would like to design.',
      action: { type: 'proceed-anyway', label: 'Build it anyway', brief: 'hi' },
    })])
  })

  it('projects user intent and agent replies as an ordered multi-turn chat transcript', () => {
    const runEvents = replayRunEvents([
      createRunEvent('run:1', { type: 'run-started', mode: 'create' }, { eventId: 's1', at: 1 }),
      createRunEvent('run:1', { type: 'intent-recorded', intent: '你好' }, { eventId: 'u1', at: 2 }),
      createRunEvent('run:1', {
        type: 'agent-message',
        message: '你好！想让我帮你设计或搭建什么原型吗？',
      }, { eventId: 'a1', at: 3 }),
      createRunEvent('run:2', { type: 'run-started', mode: 'create' }, { eventId: 's2', at: 4 }),
      createRunEvent('run:2', { type: 'intent-recorded', intent: '做一个 landing page' }, { eventId: 'u2', at: 5 }),
    ])
    const model = buildAgentViewModel({
      brief: '做一个 landing page',
      workflowPhase: 'idle',
      stages: [],
      outcome: null,
      working: true,
      elapsedSeconds: 1,
      runError: null,
      runEvents,
    })

    expect(model.feed.filter((item) => item.type === 'message')).toEqual([
      expect.objectContaining({ role: 'user', detail: '你好' }),
      expect.objectContaining({ role: 'agent', detail: '你好！想让我帮你设计或搭建什么原型吗？' }),
      expect.objectContaining({ role: 'user', detail: '做一个 landing page' }),
    ])
  })

  it('collapses tool started+succeeded into one complete row and never leaves a spinner', () => {
    const runId = 'run:tools'
    const runEvents = replayRunEvents([
      createRunEvent(runId, { type: 'run-started', mode: 'create' }, { eventId: 'start', at: 1 }),
      createRunEvent(runId, {
        type: 'tool-started',
        toolCallId: 'call:1',
        tool: 'image.generate',
        label: 'Generate hero',
        model: { providerId: 'openai', model: 'gpt-image-1' },
      }, { eventId: 'started', at: 2 }),
      createRunEvent(runId, {
        type: 'tool-succeeded',
        toolCallId: 'call:1',
        tool: 'image.generate',
        label: 'Generate hero',
        outputRefs: ['hero.png'],
      }, { eventId: 'done', at: 3 }),
    ])
    const model = buildAgentViewModel({
      brief: 'hero',
      workflowPhase: 'idle',
      stages: [],
      outcome: null,
      working: false,
      elapsedSeconds: 0,
      runError: null,
      runEvents,
    })

    const tools = model.feed.filter((item) => item.type === 'tool')
    expect(tools).toHaveLength(1)
    expect(tools[0]).toMatchObject({
      id: 'done',
      status: 'complete',
      title: 'Generate hero',
      toolCallId: 'call:1',
      toolName: 'image.generate',
    })
    expect(tools.some((item) => item.status === 'running')).toBe(false)
  })

  it('hides reply_conversationally tool rows so only the agent message remains', () => {
    const runId = 'run:chat'
    const longDescription =
      'Call this INSTEAD of any other tool when the message is not a request to build'
    const runEvents = replayRunEvents([
      createRunEvent(runId, { type: 'run-started', mode: 'create' }, { eventId: 'start', at: 1 }),
      createRunEvent(runId, {
        type: 'tool-started',
        toolCallId: 'call:reply',
        tool: 'reply_conversationally',
        label: longDescription,
      }, { eventId: 'tool-start', at: 2 }),
      createRunEvent(runId, {
        type: 'tool-succeeded',
        toolCallId: 'call:reply',
        tool: 'reply_conversationally',
        label: longDescription,
        outputRefs: [],
      }, { eventId: 'tool-done', at: 3 }),
      createRunEvent(runId, {
        type: 'agent-message',
        message: '我是你的设计工具 Agent。',
      }, { eventId: 'reply', at: 4 }),
    ])
    const model = buildAgentViewModel({
      brief: '你是谁',
      workflowPhase: 'idle',
      stages: [],
      outcome: null,
      working: false,
      elapsedSeconds: 0,
      runError: null,
      runEvents,
    })

    expect(model.feed).toEqual([expect.objectContaining({
      type: 'message',
      role: 'agent',
      detail: '我是你的设计工具 Agent。',
    })])
    expect(JSON.stringify(model.feed)).not.toMatch(/Call this INSTEAD|reply_conversationally/)
  })

  it('uses a short human title when an event still carries a model-facing description', () => {
    const runId = 'run:label'
    const runEvents = replayRunEvents([
      createRunEvent(runId, { type: 'run-started', mode: 'create' }, { eventId: 'start', at: 1 }),
      createRunEvent(runId, {
        type: 'tool-started',
        toolCallId: 'call:1',
        tool: 'compile_astryx_theme',
        label: 'Call this INSTEAD of any other tool when mapping DESIGN.md colors to Astryx variables for a long instruction string',
      }, { eventId: 'tool', at: 2 }),
    ])
    const model = buildAgentViewModel({
      brief: 'astryx',
      workflowPhase: 'idle',
      stages: [],
      outcome: null,
      working: true,
      elapsedSeconds: 1,
      runError: null,
      runEvents,
    })

    expect(model.feed.find((item) => item.type === 'tool')).toMatchObject({
      title: 'Compiling Astryx theme',
      status: 'running',
    })
  })
})

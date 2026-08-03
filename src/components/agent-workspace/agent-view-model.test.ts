import { describe, expect, it } from 'vitest'
import type { OutcomeRuntimeState } from '@/agent-runtime/outcome-runtime'
import { createRunEvent, replayRunEvents } from '@/agent-runtime/run-events'
import {
  buildAgentViewModel,
  selectLatestAgentMessageRegenerationTarget,
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
  it('projects a revision into the targeted user bubble without adding a turn', () => {
    const runEvents = replayRunEvents([
      createRunEvent('run', { type: 'run-started', mode: 'create' }, { eventId: 'start', at: 1 }),
      createRunEvent('run', { type: 'intent-recorded', intent: 'Make it blue' }, { eventId: 'intent', at: 2 }),
      createRunEvent('run', { type: 'message-revised', targetEventId: 'intent', message: 'Make it green' }, { eventId: 'revision', at: 3 }),
    ])
    const model = buildAgentViewModel({ brief: 'Make it blue', workflowPhase: 'idle', stages: [], outcome: null, working: false, elapsedSeconds: 0, runError: null, runEvents })
    expect(model.feed.filter((item) => item.type === 'message')).toEqual([
      expect.objectContaining({ id: 'intent', role: 'user', detail: 'Make it green' }),
    ])
  })
  it('reconciles a matching receipt so the stale approval is no longer actionable', () => {
    const runEvents = replayRunEvents([
      { eventId: 'start-paid', runId: 'paid', at: 1, type: 'run-started', mode: 'create' },
      { eventId: 'approval-paid', runId: 'paid', at: 2, type: 'tool-approval-requested', toolCallId: 'image-1', requestId: 'request-1', tool: 'image.generate', label: 'Generate hero', model: { providerId: 'openai', model: 'gpt-image-1' }, estimatedCost: { currency: 'USD', amount: 0.08, credits: 8 }, budgetCeiling: { currency: 'USD', amount: 0.2, credits: 20 }, approvalPolicy: 'explicit', reason: 'Explicit approval is required.' },
      { eventId: 'receipt-paid', runId: 'paid', at: 3, type: 'tool-receipt-recorded', toolCallId: 'image-1', receipt: { receiptId: 'receipt-1', requestId: 'request-1', capability: 'generate-image', providerId: 'openai', model: 'gpt-image-1', status: 'succeeded', charged: { currency: 'USD', amount: 0.07, credits: 7 }, outputArtifactIds: ['hero.png'], startedAt: 2, completedAt: 3 } },
    ])
    const model = buildAgentViewModel({ brief: 'Hero', workflowPhase: 'planning', stages: [], outcome: null, working: true, elapsedSeconds: 1, runError: null, runEvents })
    expect(model.feed).toEqual([expect.objectContaining({ type: 'tool', status: 'complete', providerModel: 'openai/gpt-image-1', receiptId: 'receipt-1', outputRefs: ['hero.png'] })])
    expect(model).not.toHaveProperty('cost')
  })

  it('keeps a request-only approval actionable', () => {
    const runEvents = replayRunEvents([
      createRunEvent('approval', { type: 'run-started', mode: 'create' }, { eventId: 'start', at: 1 }),
      createRunEvent('approval', {
        type: 'tool-approval-requested', toolCallId: 'call', requestId: 'request', tool: 'generate-image', label: 'Generate design system',
        estimatedCost: { currency: 'USD', amount: 0.1 }, budgetCeiling: { currency: 'USD', amount: 0.2 }, approvalPolicy: 'explicit', reason: 'Explicit approval is required.',
      }, { eventId: 'approval', at: 2 }),
    ])
    const model = buildAgentViewModel({ brief: 'Kit', workflowPhase: 'design-system', stages: [], outcome: null, working: true, elapsedSeconds: 1, runError: null, runEvents })

    expect(model.feed).toContainEqual(expect.objectContaining({ id: 'approval', requestId: 'request', status: 'waiting', actions: ['approve', 'deny'] }))
  })

  it('removes an auto-approved request once execution starts', () => {
    const runEvents = replayRunEvents([
      createRunEvent('auto', { type: 'run-started', mode: 'create' }, { eventId: 'start', at: 1 }),
      createRunEvent('auto', {
        type: 'tool-approval-requested', toolCallId: 'call', requestId: 'request', tool: 'generate-image', label: 'Generate design system',
        estimatedCost: { currency: 'USD', amount: 0.1 }, budgetCeiling: { currency: 'USD', amount: 0.2 }, approvalPolicy: 'auto-within-budget', reason: 'Eligible for automatic approval within budget.',
      }, { eventId: 'approval', at: 2 }),
      createRunEvent('auto', { type: 'tool-approved', toolCallId: 'call', requestId: 'request', reason: 'Automatically approved within the configured budget.' }, { eventId: 'approved', at: 3 }),
      createRunEvent('auto', { type: 'tool-started', toolCallId: 'call', tool: 'generate-image', label: 'Generate design system' }, { eventId: 'started', at: 4 }),
    ])
    const model = buildAgentViewModel({ brief: 'Kit', workflowPhase: 'design-system', stages: [], outcome: null, working: true, elapsedSeconds: 1, runError: null, runEvents })

    expect(model.feed.some((item) => item.type === 'tool' && item.actions?.includes('approve'))).toBe(false)
    expect(model.feed).toContainEqual(expect.objectContaining({ id: 'started', status: 'running' }))
  })

  it('removes manually approved and denied requests', () => {
    const base = (runId: string, resolution: 'tool-approved' | 'tool-denied') => replayRunEvents([
      createRunEvent(runId, { type: 'run-started', mode: 'create' }, { eventId: `${runId}:start`, at: 1 }),
      createRunEvent(runId, {
        type: 'tool-approval-requested', toolCallId: 'call', requestId: 'request', tool: 'generate-image', label: 'Generate design system',
        estimatedCost: { currency: 'USD', amount: 0.1 }, budgetCeiling: { currency: 'USD', amount: 0.2 }, approvalPolicy: 'explicit', reason: 'Explicit approval is required.',
      }, { eventId: `${runId}:approval`, at: 2 }),
      createRunEvent(runId, { type: resolution, toolCallId: 'call', requestId: 'request', reason: resolution === 'tool-approved' ? 'Approved by user.' : 'Denied by user.' }, { eventId: `${runId}:resolution`, at: 3 }),
    ])
    for (const runEvents of [base('approved', 'tool-approved'), base('denied', 'tool-denied')]) {
      const model = buildAgentViewModel({ brief: 'Kit', workflowPhase: 'design-system', stages: [], outcome: null, working: false, elapsedSeconds: 0, runError: null, runEvents })
      expect(model.feed.some((item) => item.type === 'tool' && item.actions?.includes('approve'))).toBe(false)
    }
  })

  it('shows only the fresh pending approval when a tool call is retried', () => {
    const runEvents = replayRunEvents([
      createRunEvent('retry', { type: 'run-started', mode: 'create' }, { eventId: 'start', at: 1 }),
      createRunEvent('retry', {
        type: 'tool-approval-requested', toolCallId: 'call', requestId: 'old', tool: 'generate-image', label: 'Generate design system',
        estimatedCost: { currency: 'USD', amount: 0.1 }, budgetCeiling: { currency: 'USD', amount: 0.2 }, approvalPolicy: 'explicit', reason: 'Explicit approval is required.',
      }, { eventId: 'old-approval', at: 2 }),
      createRunEvent('retry', { type: 'tool-denied', toolCallId: 'call', requestId: 'old', reason: 'Denied by user.' }, { eventId: 'old-denied', at: 3 }),
      createRunEvent('retry', { type: 'tool-retry-linked', toolCallId: 'call', previousRequestId: 'old', requestId: 'fresh' }, { eventId: 'retry-linked', at: 4 }),
      createRunEvent('retry', {
        type: 'tool-approval-requested', toolCallId: 'call', requestId: 'fresh', tool: 'generate-image', label: 'Generate design system',
        estimatedCost: { currency: 'USD', amount: 0.1 }, budgetCeiling: { currency: 'USD', amount: 0.2 }, approvalPolicy: 'explicit', reason: 'Explicit approval is required.',
      }, { eventId: 'fresh-approval', at: 5 }),
    ])
    const model = buildAgentViewModel({ brief: 'Kit', workflowPhase: 'design-system', stages: [], outcome: null, working: true, elapsedSeconds: 1, runError: null, runEvents })
    const approvals = model.feed.filter((item) => item.type === 'tool' && item.actions?.includes('approve'))

    expect(approvals).toEqual([expect.objectContaining({ id: 'fresh-approval', requestId: 'fresh' })])
  })

  it('uses a later legacy terminal event to close an unresolved approval', () => {
    for (const terminal of ['tool-succeeded', 'tool-failed', 'tool-cancelled'] as const) {
      const terminalEvent = terminal === 'tool-succeeded'
        ? { type: terminal, toolCallId: 'call', tool: 'generate-image', label: 'Generate design system', outputRefs: [] } as const
        : { type: terminal, toolCallId: 'call', tool: 'generate-image', label: 'Generate design system', detail: 'Legacy terminal state.' } as const
      const runEvents = replayRunEvents([
        createRunEvent(terminal, { type: 'run-started', mode: 'create' }, { eventId: `${terminal}:start`, at: 1 }),
        createRunEvent(terminal, {
          type: 'tool-approval-requested', toolCallId: 'call', requestId: 'request', tool: 'generate-image', label: 'Generate design system',
          estimatedCost: { currency: 'USD', amount: 0.1 }, budgetCeiling: { currency: 'USD', amount: 0.2 }, approvalPolicy: 'explicit', reason: 'Explicit approval is required.',
        }, { eventId: `${terminal}:approval`, at: 2 }),
        createRunEvent(terminal, terminalEvent, { eventId: `${terminal}:terminal`, at: 3 }),
      ])
      const model = buildAgentViewModel({ brief: 'Kit', workflowPhase: 'design-system', stages: [], outcome: null, working: false, elapsedSeconds: 0, runError: null, runEvents })
      expect(model.feed.some((item) => item.type === 'tool' && item.actions?.includes('approve'))).toBe(false)
    }
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
      ['message', 'Agent'],
      ['material', 'Checkout design system'],
      ['material', 'Cart page'],
    ])
    expect(model.feed.map((item) => item.provenance)).toEqual([
      'runtime',
      'agent',
      'agent',
    ])
    expect(JSON.stringify(model)).not.toMatch(/thinking|reasoning|heartbeat|request sent/i)
  })

  it('projects request routing as a temporary Agent conversation turn', () => {
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

    expect(model.summary.status).toBe('draft')
    expect(model.feed).toContainEqual(expect.objectContaining({
      id: 'runtime:activity:idle',
      type: 'message',
      role: 'agent',
      status: 'pending',
      detail: 'Checking your request…',
    }))
  })

  it('projects one ephemeral provider stream without adding a second durable turn', () => {
    const model = buildAgentViewModel({
      brief: 'Create a checkout',
      workflowPhase: 'design-system',
      stages: [],
      outcome: null,
      working: true,
      elapsedSeconds: 2,
      runError: null,
      liveAgentMessage: {
        id: 'runtime:stream:run-1',
        label: 'Drafting design system',
        text: '## Checkout\n\nUsing a clear primary action.',
      },
    })

    expect(model.feed).toEqual([expect.objectContaining({
      id: 'runtime:stream:run-1',
      type: 'message',
      role: 'agent',
      status: 'pending',
      detail: '## Checkout\n\nUsing a clear primary action.',
    })])
  })

  it('shows the same pending turn before the provider emits its first delta', () => {
    const model = buildAgentViewModel({
      brief: 'Hello', workflowPhase: 'idle', stages: [], outcome: null,
      working: true, elapsedSeconds: 0, runError: null,
      liveAgentMessage: { id: 'runtime:stream:run-1', label: 'Agent is responding', text: '' },
    })

    expect(model.feed).toEqual([expect.objectContaining({
      id: 'runtime:stream:run-1', role: 'agent', status: 'pending', detail: '',
    })])
  })

  it('keeps internal design synthesis represented as activity instead of conversation text', () => {
    const model = buildAgentViewModel({
      brief: 'Create a checkout',
      workflowPhase: 'design-system',
      stages,
      outcome: null,
      working: true,
      elapsedSeconds: 2,
      runError: null,
    })

    expect(model.feed).toEqual([expect.objectContaining({
      id: 'runtime:activity:design',
      type: 'message',
      activity: expect.objectContaining({ label: 'Creating Design system' }),
      detail: 'Create the visual system.',
    })])
    expect(model.feed.some((item) => item.id.startsWith('runtime:stream:'))).toBe(false)
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
      'Checkout design system',
      'Cart page',
    ])
    expect(model.feed[0]).toMatchObject({ type: 'message', role: 'user', detail: 'Checkout' })
    expect(model.feed[1]?.detail).toContain('openai/gpt-image-1')
    expect(JSON.stringify(model.feed)).not.toMatch(/chain.of.thought|reasoning/i)
  })

  it('projects a steer as one user turn without replacing the original intent', () => {
    const runEvents = replayRunEvents([
      createRunEvent('run', { type: 'run-started', mode: 'create' }, { eventId: 'start', at: 1 }),
      createRunEvent('run', { type: 'intent-recorded', intent: 'Create a fitness app' }, { eventId: 'intent', at: 2 }),
      createRunEvent('run', { type: 'steer-recorded', instruction: 'Use a quieter green' }, { eventId: 'steer', at: 3 }),
    ])
    const model = buildAgentViewModel({
      brief: 'Create a fitness app', workflowPhase: 'planning', stages: [], outcome: null,
      working: true, elapsedSeconds: 1, runError: null, runEvents,
    })

    expect(runEvents.activeRun?.intent).toBe('Create a fitness app')
    expect(model.feed.filter((item) => item.type === 'message').map((item) => item.detail)).toEqual([
      'Create a fitness app',
      'Use a quieter green',
    ])
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
    expect(model).not.toHaveProperty('costNotice')
    expect(model).not.toHaveProperty('cost')
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

  it('resolves the latest Agent reply to the effective revised user turn', () => {
    const events = [
      createRunEvent('run:1', { type: 'run-started', mode: 'create' }, { eventId: 's1', at: 1 }),
      createRunEvent('run:1', { type: 'intent-recorded', intent: 'Make it blue' }, { eventId: 'u1', at: 2 }),
      createRunEvent('run:1', { type: 'agent-message', message: 'First reply' }, { eventId: 'a1', at: 3 }),
      createRunEvent('run:2', { type: 'run-started', mode: 'create' }, { eventId: 's2', at: 4 }),
      createRunEvent('run:2', { type: 'steer-recorded', instruction: 'Use green instead' }, { eventId: 'u2', at: 5 }),
      createRunEvent('run:2', { type: 'agent-message', message: 'Second reply' }, { eventId: 'a2', at: 6 }),
      createRunEvent('run:2', { type: 'message-revised', targetEventId: 'u2', message: 'Use forest green instead' }, { eventId: 'r-u2', at: 7 }),
      createRunEvent('run:2', { type: 'message-revised', targetEventId: 'a2', message: 'Revised second reply' }, { eventId: 'r-a2', at: 8 }),
    ]

    expect(selectLatestAgentMessageRegenerationTarget(events)).toEqual({
      targetEventId: 'a2',
      targetMessage: 'Revised second reply',
      sourceEventId: 'u2',
      sourceMessage: 'Use forest green instead',
    })

    const model = buildAgentViewModel({
      brief: 'Use forest green instead', workflowPhase: 'idle', stages: [], outcome: null,
      working: false, elapsedSeconds: 0, runError: null, runEvents: replayRunEvents(events),
    })
    const replies = model.feed.filter((item) => item.type === 'message' && item.role === 'agent')
    expect(replies).toEqual([
      expect.objectContaining({ id: 'a1', detail: 'First reply' }),
      expect.objectContaining({ id: 'a2', detail: 'Revised second reply', regeneratable: true }),
    ])
    expect(replies[0]).not.toHaveProperty('regeneratable')
  })

  it('renders only the selected sibling with stable branch navigation metadata', () => {
    const runEvents = replayRunEvents([
      createRunEvent('run:1', { type: 'run-started', mode: 'create' }, { eventId: 's1', at: 1 }),
      createRunEvent('run:1', { type: 'intent-recorded', intent: 'Who are you?' }, { eventId: 'user', at: 2 }),
      createRunEvent('run:1', { type: 'agent-message', message: 'First reply', responseToEventId: 'user' }, { eventId: 'first', at: 3 }),
      createRunEvent('run:2', { type: 'run-started', mode: 'create' }, { eventId: 's2', at: 4 }),
      createRunEvent('run:2', { type: 'agent-message', message: 'Second reply', responseToEventId: 'user' }, { eventId: 'second', at: 5 }),
      createRunEvent('run:2', { type: 'branch-selected', sourceEventId: 'user', responseEventId: 'second' }, { eventId: 'select', at: 6 }),
    ])
    const model = buildAgentViewModel({
      brief: 'Who are you?', workflowPhase: 'idle', stages: [], outcome: null,
      working: false, elapsedSeconds: 0, runError: null, runEvents,
    })

    expect(model.feed.filter((item) => item.type === 'message')).toEqual([
      expect.objectContaining({ id: 'user', role: 'user' }),
      expect.objectContaining({
        id: 'second',
        detail: 'Second reply',
        branch: {
          sourceEventId: 'user',
          selectedIndex: 1,
          count: 2,
          previousEventId: 'first',
          nextEventId: undefined,
        },
        regeneratable: true,
      }),
    ])
    expect(selectLatestAgentMessageRegenerationTarget(runEvents.events)?.targetEventId).toBe('second')
  })

  it('projects one unresolved preparation activity for the active run', () => {
    const runEvents = replayRunEvents([
      createRunEvent('run:old', { type: 'run-started', mode: 'create' }, { eventId: 'old-start', at: 1 }),
      createRunEvent('run:old', { type: 'intent-recorded', intent: 'Hello' }, { eventId: 'user', at: 2 }),
      createRunEvent('run:old', { type: 'step-started', stepId: 'step:prepare:old', label: 'Preparing old run' }, { eventId: 'old-prepare-start', at: 3 }),
      createRunEvent('run:old', { type: 'step-succeeded', stepId: 'step:prepare:old', label: 'Preparing old run' }, { eventId: 'old-prepare-done', at: 4 }),
      createRunEvent('run:old', { type: 'agent-message', message: 'Old response', responseToEventId: 'user' }, { eventId: 'old-response', at: 5 }),
      createRunEvent('run:new', { type: 'run-started', mode: 'repair' }, { eventId: 'new-start', at: 6 }),
      createRunEvent('run:new', { type: 'step-started', stepId: 'step:prepare:new', label: 'Preparing the run', detail: 'Checking your request…' }, { eventId: 'new-prepare-start', at: 7 }),
    ])
    const model = buildAgentViewModel({
      brief: 'Hello', workflowPhase: 'idle', stages: [], outcome: null,
      working: true, preparing: true, elapsedSeconds: 2, runError: null, runEvents,
    })

    const activities = model.feed.filter((item) => item.type === 'message' && item.activity)
    expect(activities).toEqual([expect.objectContaining({
      id: 'new-prepare-start',
      status: 'pending',
      detail: 'Checking your request…',
      activity: expect.objectContaining({ label: 'Preparing the run', state: 'running' }),
    })])
    expect(model.feed.filter((item) => item.type === 'message' && item.role === 'user')).toHaveLength(1)
    expect(model.feed.filter((item) => item.type === 'message' && item.role === 'agent')).toHaveLength(2)
    expect(model.feed.some((item) => item.id.startsWith('runtime:activity:'))).toBe(false)
  })

  it('lets live Agent output supersede unresolved preparation activity', () => {
    const runEvents = replayRunEvents([
      createRunEvent('run', { type: 'run-started', mode: 'repair' }, { eventId: 'start', at: 1 }),
      createRunEvent('run', { type: 'step-started', stepId: 'step:prepare:run', label: 'Preparing the run' }, { eventId: 'prepare', at: 2 }),
    ])
    const input = {
      brief: 'Hello', workflowPhase: 'idle', stages: [], outcome: null,
      working: true, preparing: true, elapsedSeconds: 1, runError: null, runEvents,
    } as const
    const awaitingText = buildAgentViewModel({
      ...input,
      liveAgentMessage: { id: 'runtime:stream:run', label: 'Agent is responding', text: '' },
    })
    const model = buildAgentViewModel({
      ...input,
      liveAgentMessage: { id: 'runtime:stream:run', label: 'Agent is responding', text: 'Fresh response' },
    })

    expect(awaitingText.feed.filter((item) => item.type === 'message')).toEqual([
      expect.objectContaining({ id: 'prepare', activity: expect.objectContaining({ state: 'running' }) }),
    ])
    expect(model.feed.filter((item) => item.type === 'message')).toEqual([
      expect.objectContaining({ id: 'runtime:stream:run', detail: 'Fresh response' }),
    ])
    expect(model.feed.some((item) => item.type === 'message' && item.activity)).toBe(false)
  })

  it.each(['step-succeeded', 'step-failed', 'step-cancelled'] as const)(
    'keeps %s preparation evidence out of the conversation transcript',
    (type) => {
      const terminal = type === 'step-succeeded'
        ? { type, stepId: 'step:prepare:run', label: 'Preparing the run', detail: 'Request checked.' } as const
        : { type, stepId: 'step:prepare:run', label: 'Preparing the run', detail: `${type} evidence` } as const
      const runEvents = replayRunEvents([
        createRunEvent('run', { type: 'run-started', mode: 'repair' }, { eventId: 'start', at: 1 }),
        createRunEvent('run', { type: 'intent-recorded', intent: 'Hello' }, { eventId: 'user', at: 2 }),
        createRunEvent('run', { type: 'step-started', stepId: 'step:prepare:run', label: 'Preparing the run' }, { eventId: 'prepare-start', at: 3 }),
        createRunEvent('run', terminal, { eventId: 'prepare-terminal', at: 4 }),
      ])
      const model = buildAgentViewModel({
        brief: 'Hello', workflowPhase: 'idle', stages: [], outcome: null,
        working: true, preparing: true, elapsedSeconds: 1, runError: null, runEvents,
      })

      expect(model.feed.filter((item) => item.type === 'message')).toEqual([
        expect.objectContaining({ id: 'user', role: 'user' }),
      ])
      expect(model.execution?.steps).toContainEqual(expect.objectContaining({
        id: 'step:prepare:run',
        status: type === 'step-succeeded' ? 'succeeded' : type === 'step-failed' ? 'failed' : 'cancelled',
      }))
      expect(runEvents.events).toContainEqual(expect.objectContaining({ eventId: 'prepare-terminal', type }))
    },
  )

  it('does not resurrect preparation activity when response branches change', () => {
    const baseEvents = [
      createRunEvent('run:1', { type: 'run-started', mode: 'create' }, { eventId: 'start-1', at: 1 }),
      createRunEvent('run:1', { type: 'intent-recorded', intent: 'Who are you?' }, { eventId: 'user', at: 2 }),
      createRunEvent('run:1', { type: 'step-started', stepId: 'step:prepare:1', label: 'Preparing the run' }, { eventId: 'prepare-1-start', at: 3 }),
      createRunEvent('run:1', { type: 'step-succeeded', stepId: 'step:prepare:1', label: 'Preparing the run' }, { eventId: 'prepare-1-done', at: 4 }),
      createRunEvent('run:1', { type: 'agent-message', message: 'First reply', responseToEventId: 'user' }, { eventId: 'first', at: 5 }),
      createRunEvent('run:2', { type: 'run-started', mode: 'repair' }, { eventId: 'start-2', at: 6 }),
      createRunEvent('run:2', { type: 'step-started', stepId: 'step:prepare:2', label: 'Preparing the run' }, { eventId: 'prepare-2-start', at: 7 }),
      createRunEvent('run:2', { type: 'step-succeeded', stepId: 'step:prepare:2', label: 'Preparing the run' }, { eventId: 'prepare-2-done', at: 8 }),
      createRunEvent('run:2', { type: 'agent-message', message: 'Second reply', responseToEventId: 'user' }, { eventId: 'second', at: 9 }),
    ]
    for (const [selectedId, selectionAt] of [['first', 10], ['second', 11]] as const) {
      const runEvents = replayRunEvents([
        ...baseEvents,
        createRunEvent('run:2', { type: 'branch-selected', sourceEventId: 'user', responseEventId: selectedId }, { eventId: `select-${selectedId}`, at: selectionAt }),
      ])
      const model = buildAgentViewModel({
        brief: 'Who are you?', workflowPhase: 'idle', stages: [], outcome: null,
        working: false, elapsedSeconds: 0, runError: null, runEvents,
      })

      expect(model.feed.filter((item) => item.type === 'message')).toEqual([
        expect.objectContaining({ id: 'user' }),
        expect.objectContaining({ id: selectedId, branch: expect.objectContaining({ count: 2 }) }),
      ])
      expect(model.feed.some((item) => item.type === 'message' && item.activity)).toBe(false)
    }
  })

  it('suppresses message regeneration while another run is active', () => {
    const runEvents = replayRunEvents([
      createRunEvent('run', { type: 'run-started', mode: 'create' }, { eventId: 'start', at: 1 }),
      createRunEvent('run', { type: 'intent-recorded', intent: 'Who are you?' }, { eventId: 'user', at: 2 }),
      createRunEvent('run', { type: 'agent-message', message: 'I am Cutout.' }, { eventId: 'agent', at: 3 }),
    ])
    const model = buildAgentViewModel({
      brief: 'Who are you?', workflowPhase: 'idle', stages: [], outcome: null,
      working: true, elapsedSeconds: 1, runError: null, runEvents,
    })

    expect(model.feed.find((item) => item.id === 'agent')).not.toHaveProperty('regeneratable')
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

  it('collapses an identical retry intent until the Agent produces a reply', () => {
    const runEvents = replayRunEvents([
      createRunEvent('run:1', { type: 'run-started', mode: 'create' }, { eventId: 's1', at: 1 }),
      createRunEvent('run:1', { type: 'intent-recorded', intent: '做一个健身打卡 App 首页' }, { eventId: 'u1', at: 2 }),
      createRunEvent('run:1', { type: 'step-failed', stepId: 'generate', label: 'Generate', detail: 'Provider timed out.' }, { eventId: 'f1', at: 3 }),
      createRunEvent('run:2', { type: 'run-started', mode: 'repair' }, { eventId: 's2', at: 4 }),
      createRunEvent('run:2', { type: 'intent-recorded', intent: '做一个健身打卡 App 首页' }, { eventId: 'u2', at: 5 }),
    ])
    const model = buildAgentViewModel({
      brief: '做一个健身打卡 App 首页',
      workflowPhase: 'idle',
      stages: [],
      outcome: null,
      working: true,
      elapsedSeconds: 1,
      runError: null,
      runEvents,
    })

    expect(model.feed.filter((item) => item.type === 'message')).toEqual([
      expect.objectContaining({ id: 'u1', role: 'user', detail: '做一个健身打卡 App 首页' }),
    ])
  })

  it('preserves identical user text when an Agent reply starts a new turn', () => {
    const runEvents = replayRunEvents([
      createRunEvent('run:1', { type: 'run-started', mode: 'create' }, { eventId: 's1', at: 1 }),
      createRunEvent('run:1', { type: 'intent-recorded', intent: '继续' }, { eventId: 'u1', at: 2 }),
      createRunEvent('run:1', { type: 'agent-message', message: '请确认继续。' }, { eventId: 'a1', at: 3 }),
      createRunEvent('run:2', { type: 'run-started', mode: 'create' }, { eventId: 's2', at: 4 }),
      createRunEvent('run:2', { type: 'intent-recorded', intent: '继续' }, { eventId: 'u2', at: 5 }),
    ])
    const model = buildAgentViewModel({
      brief: '继续',
      workflowPhase: 'idle',
      stages: [],
      outcome: null,
      working: true,
      elapsedSeconds: 1,
      runError: null,
      runEvents,
    })

    expect(model.feed.filter((item) => item.type === 'message')).toHaveLength(3)
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

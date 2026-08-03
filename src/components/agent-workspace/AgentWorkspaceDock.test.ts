import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { createRunEvent, replayRunEvents } from '@/agent-runtime/run-events'
import { AgentComposer, AgentRunFeed, AgentWorkspaceDock, OutcomeChecklist } from './AgentWorkspaceDock'
import { buildAgentViewModel, type AgentWorkspaceViewModel } from './agent-view-model'

const stoppedModel: AgentWorkspaceViewModel = {
  summary: {
    status: 'stopped',
    title: 'Run stopped',
    detail: 'Generation provider timed out.',
    intent: 'Create a reusable landing page kit',
    elapsedLabel: '1:24',
  },
  feed: [{
    id: 'runtime:error',
    type: 'error',
    status: 'stopped',
    title: 'Run stopped',
    detail: 'Generation provider timed out.',
    provenance: 'runtime',
  }],
  checklist: [{
    id: 'prototype-page',
    label: 'Prototype pages',
    status: 'missing',
    completedCount: 1,
    requiredCount: 2,
    detail: '1 of 2 verified; 1 remaining',
  }],
}

const draftModel: AgentWorkspaceViewModel = {
  summary: {
    status: 'draft',
    title: 'Describe the result you need',
    detail: 'The Agent will plan and execute against a visible outcome checklist.',
    intent: null,
    elapsedLabel: null,
  },
  feed: [],
  checklist: [],
}

function preparingModel(
  events: Parameters<typeof replayRunEvents>[0],
  options: {
    readonly working?: boolean
    readonly liveAgentMessage?: { readonly id: string; readonly label: string; readonly text: string } | null
  } = {},
): AgentWorkspaceViewModel {
  return buildAgentViewModel({
    brief: 'hi',
    workflowPhase: 'idle',
    stages: [],
    outcome: null,
    working: options.working ?? true,
    preparing: true,
    elapsedSeconds: 1,
    runError: null,
    runEvents: replayRunEvents(events),
    liveAgentMessage: options.liveAgentMessage,
  })
}

describe('AgentWorkspaceDock', () => {
  it('renders conversational turns as left/right chat bubbles, without ops Details chrome', () => {
    const onAgentAction = vi.fn()
    const html = renderToStaticMarkup(createElement(AgentWorkspaceDock, {
      viewModel: {
        ...draftModel,
        feed: [
          {
            id: 'user-1',
            type: 'message',
            role: 'user',
            status: 'complete',
            title: 'You',
            detail: 'hi',
            provenance: 'runtime',
          },
          {
            id: 'message-1',
            type: 'message',
            role: 'agent',
            status: 'complete',
            title: 'Agent',
            detail: "Hi! Tell me what you'd like to design or build.",
            provenance: 'runtime',
            action: { type: 'proceed-anyway', label: 'Build it anyway', brief: 'hi' },
          },
        ],
      },
      composer: { value: 'hi', onChange: vi.fn(), onSubmit: vi.fn() },
      onAgentAction,
    }))

    expect(html).toContain('data-slot="agent-conversation"')
    expect(html).toContain('data-slot="user-message"')
    expect(html).toContain('data-slot="agent-message"')
    expect(html).toContain('justify-end')
    expect(html).toContain('justify-start')
    expect(html).toContain('>hi</p>')
    expect(html).toContain("Hi! Tell me what you&#x27;d like to design or build.")
    expect(html).toContain('aria-label="Build it anyway"')
    expect(html).toContain('aria-label="Copy message"')
    expect(html).toContain('data-slot="agent-composer"')
    expect(html).not.toContain('data-slot="agent-details"')
    expect(html).not.toContain('Agent activity')
    expect(html).not.toContain('RUNTIME')
    expect(html).not.toContain('data-sonner-toast')
  })
  it('offers edit only for user messages and keeps the latest Agent suggestion in message actions', () => {
    const html = renderToStaticMarkup(createElement(AgentWorkspaceDock, {
      viewModel: {
        ...draftModel,
        feed: [
          { id: 'user', type: 'message', role: 'user', status: 'complete', title: 'You', detail: 'Make it green', provenance: 'runtime' },
          { id: 'agent', type: 'message', role: 'agent', status: 'complete', title: 'Agent', detail: 'I can help with that.', provenance: 'runtime', action: { type: 'proceed-anyway', label: 'Build it anyway', brief: 'Make it green' } },
        ],
      },
      composer: { value: '', onChange: vi.fn(), onSubmit: vi.fn() },
      onEditMessage: vi.fn(),
      onAgentAction: vi.fn(),
    }))

    expect(html.match(/aria-label="Edit message"/g)).toHaveLength(1)
    expect(html).toContain('data-slot="agent-message"')
    expect(html).toContain('aria-label="Build it anyway"')
    expect(html).not.toContain('mt-2 max-w-full')
  })
  it('renders only the latest actionable Agent message control', () => {
    const html = renderToStaticMarkup(createElement(AgentWorkspaceDock, {
      viewModel: {
        ...draftModel,
        feed: [
          { id: 'old', type: 'message', role: 'agent', status: 'complete', title: 'Agent', detail: 'Earlier reply.', provenance: 'runtime', action: { type: 'proceed-anyway', label: 'Build it anyway', brief: 'old' } },
          { id: 'new', type: 'message', role: 'agent', status: 'complete', title: 'Agent', detail: 'Latest reply.', provenance: 'runtime', action: { type: 'proceed-anyway', label: 'Build it anyway', brief: 'new' } },
        ],
      },
      composer: { value: '', onChange: vi.fn(), onSubmit: vi.fn() },
      onAgentAction: vi.fn(),
    }))
    expect(html.match(/aria-label="Build it anyway"/g)).toHaveLength(1)
  })
  it('keeps the conversation scrollable and hides failed-output diagnostics from the dock', () => {
    const html = renderToStaticMarkup(createElement(AgentWorkspaceDock, {
      viewModel: {
        ...stoppedModel,
        feed: [
          ...stoppedModel.feed,
          { id: 'user', type: 'message', role: 'user', status: 'complete', title: 'You', detail: 'Keep this visible', provenance: 'runtime' },
          { id: 'agent', type: 'message', role: 'agent', status: 'complete', title: 'Agent', detail: 'This remains scrollable.', provenance: 'runtime' },
        ],
      },
      composer: { value: '', onChange: vi.fn(), onSubmit: vi.fn() },
    }))

    expect(html).toMatch(/data-slot="agent-conversation" class="[^"]*min-h-0 flex-1 overflow-y-auto/)
    expect(html).not.toContain('data-slot="agent-details"')
  })
  it('keeps approval focused on the requested action, not provider billing', () => {
    const onApproveTool = vi.fn()
    const html = renderToStaticMarkup(createElement(AgentWorkspaceDock, {
      viewModel: {
        ...draftModel,
        summary: { status: 'running', title: 'Waiting for approval', detail: 'One paid tool is paused.', intent: 'Generate hero', elapsedLabel: '0:02' },
        feed: [{ id: 'approval', type: 'tool', status: 'waiting', title: 'Generate hero', detail: 'Tool: image.generate', provenance: 'runtime', toolCallId: 'tool-1', requestId: 'request-1', providerModel: 'openai/gpt-image-1', estimatedCost: { currency: 'USD', amount: 0.08, credits: 8 }, approval: { status: 'required', reason: 'Explicit approval is required.' }, actions: ['approve', 'deny'] }],
      },
      composer: { value: '', disabled: true, onChange: vi.fn(), onSubmit: vi.fn() },
      onApproveTool,
      onDenyTool: vi.fn(),
    }))
    expect(html).toContain('Explicit approval is required.')
    expect(html).toContain('Approve')
    expect(html).toContain('Deny')
    expect(html).toContain('data-slot="agent-decision-bubble"')
    expect(html).not.toContain('Tool: image.generate')
    expect(html).not.toContain('data-slot="agent-cost-summary"')
    expect(html).not.toContain('Charged')
    expect(html).not.toContain('Budget')
    expect(html).not.toContain('USD 0.08')
    expect(html).not.toContain('Provider estimate')
  })
  it('keeps a real pending approval actionable during local preflight', () => {
    const html = renderToStaticMarkup(createElement(AgentWorkspaceDock, {
      viewModel: {
        ...draftModel,
        feed: [{ id: 'approval', type: 'tool', status: 'waiting', title: 'Split assets', detail: 'Local cutout', provenance: 'runtime', toolCallId: 'tool-1', requestId: 'request-1', approval: { status: 'required', reason: 'Explicit approval is required.' }, actions: ['approve', 'deny'] }],
      },
      composer: { value: '', disabled: true, onChange: vi.fn(), onSubmit: vi.fn() },
      onApproveTool: vi.fn(),
      onDenyTool: vi.fn(),
    }))
    expect(html).toContain('Approve')
    expect(html).toContain('Deny')
  })
  it('renders an empty draft as a compact intent prompt without empty run chrome', () => {
    const html = renderToStaticMarkup(createElement(AgentWorkspaceDock, {
      viewModel: draftModel,
      composer: { value: '', onChange: vi.fn(), onSubmit: vi.fn() },
      onRetry: vi.fn(),
    }))

    expect(html).not.toContain('data-slot="agent-draft-prompt"')
    expect(html).toContain('data-slot="agent-draft-spacer"')
    expect(html).not.toContain('Describe the result you need')
    expect(html).not.toContain('Agent activity')
    expect(html).not.toContain('Activity will appear here')
    expect(html).not.toContain('Run controls')
  })

  it('renders active execution as the latest Agent bubble instead of a separate run overview', () => {
    const html = renderToStaticMarkup(createElement(AgentWorkspaceDock, {
      viewModel: {
        ...draftModel,
        summary: {
          status: 'running',
          title: 'Planning the outcome',
          detail: 'Mapping deliverables.',
          intent: 'Create a checkout flow',
          elapsedLabel: '0:03',
        },
        feed: [{
          id: 'runtime:activity:planning',
          type: 'message',
          role: 'agent',
          status: 'pending',
          title: 'Agent',
          detail: 'Mapping deliverables.',
          provenance: 'runtime',
          activity: { label: 'Creating Plan', elapsedLabel: '0:03' },
        }],
      },
      composer: { value: '', busy: true, disabled: true, onChange: vi.fn(), onSubmit: vi.fn() },
    }))

    expect(html).not.toContain('data-slot="agent-draft-prompt"')
    expect(html).toContain('data-slot="agent-activity-bubble"')
    expect(html).toContain('Creating Plan')
    expect(html).toContain('Mapping deliverables.')
    expect(html).not.toContain('data-slot="agent-run-overview"')
  })

  it('renders one preparation bubble and no duplicate execution timeline', () => {
    const model = preparingModel([
      createRunEvent('run', { type: 'run-started', mode: 'create' }, { eventId: 'start', at: 1 }),
      createRunEvent('run', { type: 'intent-recorded', intent: 'hi' }, { eventId: 'user', at: 2 }),
      createRunEvent('run', { type: 'step-started', stepId: 'step:prepare:run', label: 'Preparing the run', detail: 'Checking your request…' }, { eventId: 'prepare', at: 3 }),
    ])
    const html = renderToStaticMarkup(createElement(AgentWorkspaceDock, {
      viewModel: model,
      composer: { value: '', busy: true, disabled: true, onChange: vi.fn(), onSubmit: vi.fn() },
    }))

    expect(model.execution?.steps).toContainEqual(expect.objectContaining({ id: 'step:prepare:run' }))
    expect(html.match(/data-slot="agent-activity-bubble"/g)).toHaveLength(1)
    expect(html).not.toContain('data-slot="execution-timeline"')
    expect(html.match(/Preparing the run/g)).toHaveLength(1)
  })

  it('shows substantive execution beside preparation without repeating preparation', () => {
    const model = preparingModel([
      createRunEvent('run', { type: 'run-started', mode: 'create' }, { eventId: 'start', at: 1 }),
      createRunEvent('run', { type: 'intent-recorded', intent: 'hi' }, { eventId: 'user', at: 2 }),
      createRunEvent('run', { type: 'step-started', stepId: 'step:prepare:run', label: 'Preparing the run' }, { eventId: 'prepare', at: 3 }),
      createRunEvent('run', { type: 'step-started', stepId: 'step:build', label: 'Creating assets' }, { eventId: 'build', at: 4 }),
    ])
    const html = renderToStaticMarkup(createElement(AgentWorkspaceDock, {
      viewModel: model,
      composer: { value: '', busy: true, disabled: true, onChange: vi.fn(), onSubmit: vi.fn() },
    }))

    expect(html.match(/data-slot="agent-activity-bubble"/g)).toHaveLength(1)
    expect(html.match(/data-slot="execution-timeline"/g)).toHaveLength(1)
    expect(html).toContain('Creating assets')
    expect(html.match(/Preparing the run/g)).toHaveLength(1)
  })

  it('keeps a preparation approval in the timeline and actionable', () => {
    const model = preparingModel([
      createRunEvent('run', { type: 'run-started', mode: 'create' }, { eventId: 'start', at: 1 }),
      createRunEvent('run', { type: 'intent-recorded', intent: 'hi' }, { eventId: 'user', at: 2 }),
      createRunEvent('run', { type: 'step-started', stepId: 'step:prepare:run', label: 'Preparing the run' }, { eventId: 'prepare', at: 3 }),
      createRunEvent('run', { type: 'tool-approval-requested', toolCallId: 'generate', requestId: 'request', stepId: 'step:prepare:run', tool: 'image.generate', label: 'Generate hero', estimatedCost: { currency: 'USD', amount: 0.1 }, budgetCeiling: { currency: 'USD', amount: 1 }, approvalPolicy: 'explicit', reason: 'User approval required.' }, { eventId: 'approval', at: 4 }),
    ])
    const html = renderToStaticMarkup(createElement(AgentWorkspaceDock, {
      viewModel: model,
      composer: { value: '', busy: true, disabled: true, onChange: vi.fn(), onSubmit: vi.fn() },
      onApproveTool: vi.fn(),
      onDenyTool: vi.fn(),
    }))

    expect(html).toContain('data-slot="execution-timeline"')
    expect(html).toContain('>Tools<')
    expect(html).toMatch(/>\s*Approve<\/button>/)
    expect(html).toMatch(/>\s*Deny<\/button>/)
    expect(html.match(/Preparing the run/g)).toHaveLength(1)
  })

  it('lets live text replace preparation without exposing its audit timeline', () => {
    const model = preparingModel([
      createRunEvent('run', { type: 'run-started', mode: 'create' }, { eventId: 'start', at: 1 }),
      createRunEvent('run', { type: 'step-started', stepId: 'step:prepare:run', label: 'Preparing the run' }, { eventId: 'prepare', at: 2 }),
    ], {
      liveAgentMessage: { id: 'live', label: 'Agent is responding', text: 'Fresh response' },
    })
    const html = renderToStaticMarkup(createElement(AgentWorkspaceDock, {
      viewModel: model,
      composer: { value: '', busy: true, disabled: true, onChange: vi.fn(), onSubmit: vi.fn() },
    }))

    expect(html).toContain('Fresh response')
    expect(html).not.toContain('data-slot="agent-activity-bubble"')
    expect(html).not.toContain('data-slot="execution-timeline"')
  })

  it('keeps terminal preparation evidence in the model without rendering dock activity', () => {
    const model = preparingModel([
      createRunEvent('run', { type: 'run-started', mode: 'create' }, { eventId: 'start', at: 1 }),
      createRunEvent('run', { type: 'intent-recorded', intent: 'hi' }, { eventId: 'user', at: 2 }),
      createRunEvent('run', { type: 'step-started', stepId: 'step:prepare:run', label: 'Preparing the run' }, { eventId: 'prepare', at: 3 }),
      createRunEvent('run', { type: 'step-succeeded', stepId: 'step:prepare:run', label: 'Preparing the run', detail: 'Request checked.' }, { eventId: 'prepared', at: 4 }),
    ], { working: false })
    const html = renderToStaticMarkup(createElement(AgentWorkspaceDock, {
      viewModel: model,
      composer: { value: '', onChange: vi.fn(), onSubmit: vi.fn() },
    }))

    expect(model.execution?.steps).toContainEqual(expect.objectContaining({
      id: 'step:prepare:run',
      status: 'succeeded',
    }))
    expect(html).not.toContain('data-slot="agent-activity-bubble"')
    expect(html).not.toContain('data-slot="execution-timeline"')
    expect(html).not.toContain('Preparing the run')
  })

  it('keeps one stop action when the composer owns cancellation', () => {
    const html = renderToStaticMarkup(createElement(AgentWorkspaceDock, {
      viewModel: {
        ...draftModel,
        summary: {
          status: 'running',
          title: 'Reviewing the request',
          detail: 'Checking intent and routing before generation.',
          intent: 'Hello',
          elapsedLabel: null,
        },
      },
      composer: {
        value: 'Hello',
        busy: true,
        disabled: true,
        onChange: vi.fn(),
        onSubmit: vi.fn(),
        onStop: vi.fn(),
      },
      onCancel: vi.fn(),
    }))

    expect(html.match(/aria-label="Stop"/g)).toHaveLength(1)
    expect(html).not.toContain('>Cancel</button>')
  })

  it('renders a pending Agent status as a conversation bubble', () => {
    const html = renderToStaticMarkup(createElement(AgentWorkspaceDock, {
      viewModel: {
        ...draftModel,
        feed: [{
          id: 'runtime:preparing',
          type: 'message',
          role: 'agent',
          status: 'pending',
          title: 'Agent',
          detail: 'Checking your request…',
          provenance: 'runtime',
        }],
      },
      composer: { value: 'Hi', busy: true, disabled: true, onChange: vi.fn(), onSubmit: vi.fn(), onStop: vi.fn() },
    }))

    expect(html).toContain('data-slot="agent-message"')
    expect(html).toContain('Checking your request…')
    expect(html).not.toContain('data-slot="agent-run-overview"')
  })

  it('does not place draft capability notices in the conversation dock', () => {
    const html = renderToStaticMarkup(createElement(AgentWorkspaceDock, {
      viewModel: {
        ...draftModel,
        feed: [{
          id: 'runtime:notice:0',
          type: 'notice',
          status: 'complete',
          title: 'Capability fallback',
          detail: 'Web search is unavailable.',
          provenance: 'runtime',
        }],
      },
      composer: { value: '', onChange: vi.fn(), onSubmit: vi.fn() },
    }))

    expect(html).not.toContain('data-slot="agent-draft-prompt"')
    expect(html).not.toContain('data-slot="agent-run-overview"')
    expect(html).not.toContain('Agent activity')
    expect(html).not.toContain('Capability fallback')
    expect(html).not.toContain('Web search is unavailable.')
  })

  it('expands draft overview for human intervention without empty ops activity', () => {
    const html = renderToStaticMarkup(createElement(AgentWorkspaceDock, {
      viewModel: draftModel,
      composer: { value: '', onChange: vi.fn(), onSubmit: vi.fn() },
      intervention: createElement('button', null, 'Approve scope'),
      onCancel: vi.fn(),
    }))

    expect(html).not.toContain('data-slot="agent-draft-prompt"')
    expect(html).toContain('Approve scope')
    // No fabricated empty Agent activity log just because intervention is open.
    expect(html).not.toContain('Agent activity')
    expect(html).not.toContain('data-slot="agent-details"')
    expect(html).not.toContain('aria-label="Run controls"')
  })

  it('keeps verified outcomes out of the chat dock when the run is ready', () => {
    const html = renderToStaticMarkup(createElement(AgentWorkspaceDock, {
      viewModel: {
        ...draftModel,
        summary: {
          status: 'ready',
          title: 'Materials ready',
          detail: 'All required outcomes have verified material evidence.',
          intent: 'Create a checkout flow',
          elapsedLabel: '0:42',
        },
        checklist: [{
          id: 'prototype-page',
          label: 'Prototype pages',
          status: 'complete',
          completedCount: 2,
          requiredCount: 2,
          detail: '2 of 2 verified',
        }],
      },
      composer: { value: '', onChange: vi.fn(), onSubmit: vi.fn() },
    }))

    expect(html).not.toContain('data-slot="agent-draft-prompt"')
    expect(html).not.toContain('data-slot="agent-run-overview"')
    expect(html).not.toContain('Outcome checklist')
    expect(html).not.toContain('2 of 2 verified')
    expect(html).not.toContain('Agent activity')
  })

  it('keeps recovery controls and intervention visible after an error without an outcome checklist', () => {
    const html = renderToStaticMarkup(createElement(AgentWorkspaceDock, {
      viewModel: stoppedModel,
      composer: { value: '', onChange: vi.fn(), onSubmit: vi.fn() },
      intervention: createElement('button', null, 'Approve repair'),
      onRetry: vi.fn(),
    }))

    expect(html.match(/Run stopped/g)).toHaveLength(1)
    expect(html).not.toContain('data-slot="agent-run-overview"')
    expect(html).not.toContain('1 of 2 verified')
    expect(html).toContain('Repair and retry')
    expect(html).toContain('Approve repair')
    expect(html).not.toContain('data-slot="agent-details"')
  })

  it('renders a failed tool run as one Agent error, not a second execution card', () => {
    const html = renderToStaticMarkup(createElement(AgentWorkspaceDock, {
      viewModel: {
        ...stoppedModel,
        execution: {
          runId: 'failed-run',
          steps: [{
            id: 'visual',
            label: 'Tools',
            status: 'failed',
            startedAt: 1,
            endedAt: 2,
            tools: [{
              id: 'image-call',
              label: 'Generate design system',
              tool: 'image.generate',
              status: 'failed',
              startedAt: 1,
              endedAt: 2,
              detail: 'tls handshake eof',
              route: 'mox/gpt-image-2',
              receiptId: 'receipt-internal',
              outputRefs: [],
            }],
          }],
        },
      },
      composer: { value: '', onChange: vi.fn(), onSubmit: vi.fn() },
      onRetry: vi.fn(),
    }))

    expect(html.match(/Run stopped/g)).toHaveLength(1)
    expect(html).not.toContain('>Tools<')
    expect(html).not.toContain('tls handshake eof')
    expect(html).not.toContain('mox/gpt-image-2')
    expect(html).not.toContain('receipt-internal')
  })

  it('only renders outcome rows with existing evidence as navigation buttons', () => {
    const onOpenArtifact = vi.fn()
    const html = renderToStaticMarkup(createElement(OutcomeChecklist, {
      heading: 'Outcome checklist',
      items: [
        { id: 'prototype-page', label: 'Prototype pages', status: 'complete', completedCount: 2, requiredCount: 2, detail: '2 of 2 verified' },
        { id: 'design-system', label: 'Design system', status: 'missing', completedCount: 0, requiredCount: 1, detail: '0 of 1 verified; 1 remaining' },
      ],
      onOpenArtifact,
    }))

    expect(html).toContain('aria-label="Open Prototype pages"')
    expect(html).not.toContain('aria-label="Open Design system"')
  })

  it('keeps cost disclosure out of idle workspace chrome', () => {
    const hidden = renderToStaticMarkup(createElement(AgentWorkspaceDock, {
      viewModel: stoppedModel,
      composer: { value: '', onChange: vi.fn(), onSubmit: vi.fn() },
    }))
    expect(hidden).not.toContain('自动执行付费模型，费用以提供商为准')
    expect(hidden).not.toContain('USD')
    expect(hidden).not.toContain('Charged')
    expect(hidden).not.toContain('Budget')
  })

  it('drops stale approval gates after a run stops', () => {
    const html = renderToStaticMarkup(createElement(AgentWorkspaceDock, {
      viewModel: {
        ...stoppedModel,
        feed: [
          ...stoppedModel.feed,
          { id: 'stale-approval', type: 'tool', status: 'waiting', title: 'Generate design system', detail: 'Old approval', provenance: 'runtime', toolCallId: 'tool-stale', requestId: 'request-stale', estimatedCost: { currency: 'USD', amount: 0.08 }, actions: ['approve', 'deny'] },
        ],
      },
      composer: { value: '', onChange: vi.fn(), onSubmit: vi.fn() },
      onApproveTool: vi.fn(),
      onDenyTool: vi.fn(),
    }))

    expect(html).not.toContain('Decision needed')
    expect(html).not.toContain('Approve')
    expect(html).not.toContain('Deny')
    expect(html).not.toContain('USD 0.08')
  })

  it('renders a compact, accessible Agent context bar', () => {
    const html = renderToStaticMarkup(createElement(AgentComposer, {
      labels: {
        feed: 'Agent activity',
        outcomes: 'Outcome checklist',
        controls: 'Run controls',
        pause: 'Pause',
        resume: 'Resume',
        cancel: 'Cancel',
        retry: 'Repair and retry',
        send: 'Send',
        stop: 'Stop',
        attach: 'Add attachment',
        toolDetails: 'Execution details',
        noActivity: 'No activity',
        preservedResults: 'Preserved',
        recoveryHint: 'Retry',
        webSearch: 'Web search',
        model: 'Model',
        thinking: 'Thinking',
        running: 'Agent running', budget: 'Budget',
      },
      model: {
        value: '',
        attachments: [{ id: 'brief', label: 'brief.png' }],
        onChange: vi.fn(),
        onSubmit: vi.fn(),
        onAttach: vi.fn(),
        webSearch: { enabled: true, onChange: vi.fn() },
        modelSelection: {
          value: 'auto',
          options: [
            { value: 'auto', label: 'Auto', description: 'Let the Agent Router decide' },
            { value: 'claude-sonnet', label: 'Claude Sonnet' },
          ],
          onChange: vi.fn(),
        },
        thinkingSelection: {
          value: 'high',
          options: [
            { value: 'auto', label: 'Auto' },
            { value: 'high', label: 'High' },
          ],
          onChange: vi.fn(),
        },
      },
    }))

    expect(html).toContain('aria-label="Add attachment"')
    expect(html).toContain('aria-label="Web search"')
    expect(html).toContain('aria-pressed="true"')
    expect(html).not.toContain('aria-label="Model: Auto"')
    expect(html).toContain('aria-label="Thinking: High"')
    expect(html).toContain('>1</span>')
    // Single shell wraps text + tools — no nested textarea surface.
    expect(html).toContain('data-slot="agent-composer-surface"')
    expect(html).toMatch(/class="[^"]*rounded-full[^"]*"[^>]*aria-label="Send"/)
    const surfaceStart = html.indexOf('data-slot="agent-composer-surface"')
    const contextStart = html.indexOf('data-slot="agent-composer-context"')
    expect(surfaceStart).toBeGreaterThan(-1)
    expect(contextStart).toBeGreaterThan(surfaceStart)
  })

  it('locks every context control and exposes a running status while busy', () => {
    const html = renderToStaticMarkup(createElement(AgentComposer, {
      labels: {
        feed: 'Agent activity', outcomes: 'Outcome checklist', controls: 'Run controls',
        pause: 'Pause', resume: 'Resume', cancel: 'Cancel', retry: 'Retry', send: 'Send',
        stop: 'Stop', attach: 'Add attachment', toolDetails: 'Details', noActivity: 'None',
        preservedResults: 'Preserved', recoveryHint: 'Retry', webSearch: 'Web search',
        model: 'Model', thinking: 'Thinking', running: 'Agent running', budget: 'Budget',
      },
      model: {
        value: 'Create a landing page',
        disabled: true,
        busy: true,
        attachments: [{ id: 'brief', label: 'brief.png' }],
        onChange: vi.fn(),
        onSubmit: vi.fn(),
        onAttach: vi.fn(),
        onRemoveAttachment: vi.fn(),
        webSearch: { enabled: true, onChange: vi.fn() },
        modelSelection: { value: 'auto', options: [{ value: 'auto', label: 'Auto' }], onChange: vi.fn() },
        thinkingSelection: { value: 'auto', options: [{ value: 'auto', label: 'Auto' }], onChange: vi.fn() },
      },
    }))

    expect(html).toContain('role="status"')
    expect(html).toContain('Agent running')
    expect(html).toContain('data-slot="agent-composer-context"')
    expect(html.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(4)
  })

  it('shows and clears the selected material as a composer reference', () => {
    const html = renderToStaticMarkup(createElement(AgentComposer, {
      labels: {
        feed: 'Agent activity', outcomes: 'Outcome checklist', controls: 'Run controls',
        pause: 'Pause', resume: 'Resume', cancel: 'Cancel', retry: 'Retry', send: 'Send',
        stop: 'Stop', attach: 'Add attachment', toolDetails: 'Details', noActivity: 'None',
        preservedResults: 'Preserved', recoveryHint: 'Retry', webSearch: 'Web search',
        model: 'Model', thinking: 'Thinking', running: 'Agent running', budget: 'Budget',
      },
      model: {
        value: 'Make the CTA stronger',
        onChange: vi.fn(),
        onSubmit: vi.fn(),
        materialContext: {
          label: 'Checkout',
          onClear: vi.fn(),
        },
      },
    }))

    expect(html).toContain('data-slot="agent-material-context"')
    expect(html).toContain('>@</span>')
    expect(html).toContain('Checkout')
    expect(html).toContain('aria-label="Remove Checkout reference"')
  })

  it('keeps clear available while blocking submit for an uneditable material', () => {
    const html = renderToStaticMarkup(createElement(AgentComposer, {
      labels: {
        feed: 'Feed', outcomes: 'Outcomes', controls: 'Controls', pause: 'Pause',
        resume: 'Resume', cancel: 'Cancel', retry: 'Retry', send: 'Send', stop: 'Stop',
        attach: 'Attach', toolDetails: 'Details', noActivity: 'None', preservedResults: 'Preserved',
        recoveryHint: 'Retry', webSearch: 'Web', model: 'Model', thinking: 'Thinking', running: 'Running', budget: 'Budget',
      },
      model: {
        value: 'Change this slice',
        submitDisabled: true,
        onChange: vi.fn(),
        onSubmit: vi.fn(),
        materialContext: {
          label: 'Unknown slice',
          onClear: vi.fn(),
        },
      },
    }))

    expect(html).toContain('aria-label="Remove Unknown slice reference"')
    expect(html).toContain('aria-label="Send" disabled=""')
  })

  it('keeps an empty dock compact instead of stretching the activity placeholder', () => {
    const html = renderToStaticMarkup(createElement(AgentWorkspaceDock, {
      viewModel: {
        summary: {
          status: 'draft',
          title: 'Describe the result you need',
          detail: 'The Agent will work toward a visible outcome.',
          intent: null,
          elapsedLabel: null,
        },
        feed: [],
        checklist: [],
      },
      composer: { value: '', onChange: vi.fn(), onSubmit: vi.fn() },
    }))

    expect(html).not.toContain('data-slot="agent-draft-prompt"')
    expect(html).toContain('data-slot="agent-composer"')
    expect(html).not.toContain('data-slot="agent-run-feed"')
    expect(html).not.toMatch(/min-h-\[(?:1[0-9]|[2-9][0-9])rem\]/)
    expect(html).not.toContain('py-6 text-center')
  })

  it('allows long Chinese copy to wrap in a narrow dock and uses a two-line composer', () => {
    const longChinese = '代理会根据可见的结果清单规划并执行，并保留已经完成且可以验证的物料结果。'
    const html = renderToStaticMarkup(createElement(AgentWorkspaceDock, {
      viewModel: {
        summary: {
          status: 'running',
          title: '描述你最终需要交付的结果',
          detail: longChinese,
          intent: '生成适用于移动端和桌面端的完整品牌页面，并整理所有可复用素材。',
          elapsedLabel: null,
        },
        feed: [],
        checklist: [],
      },
      labels: { noActivity: longChinese },
      composer: { value: '', onChange: vi.fn(), onSubmit: vi.fn() },
    }))

    expect(html).not.toContain(longChinese)
    expect(html).not.toContain('line-clamp-2 break-words')
    expect(html).toContain('rows="2"')
    expect(html).toContain('sm:max-w-[23rem]')
  })

  it('renders long localized empty activity copy without centered vertical padding', () => {
    const longChinese = '活动会在代理执行过程中逐步显示，并保留已经完成且可以验证的物料结果。'
    const html = renderToStaticMarkup(createElement(AgentRunFeed, {
      items: [],
      heading: '代理活动',
      emptyLabel: longChinese,
      detailsLabel: '执行详情',
    }))

    expect(html).toContain(longChinese)
    expect(html).toContain('max-w-[30ch] break-words py-2')
    expect(html).not.toContain('py-6 text-center')
  })
})

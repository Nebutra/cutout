import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AgentComposer, AgentRunFeed, AgentWorkspaceDock } from './AgentWorkspaceDock'
import type { AgentWorkspaceViewModel } from './agent-view-model'

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
  costNotice: '自动执行付费模型，费用以提供商为准',
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
  costNotice: '自动执行付费模型，费用以提供商为准',
}

describe('AgentWorkspaceDock', () => {
  it('renders approval actions, route/cost facts, receipt evidence, and a compact budget entry', () => {
    const onApproveTool = vi.fn()
    const html = renderToStaticMarkup(createElement(AgentWorkspaceDock, {
      viewModel: {
        ...draftModel,
        summary: { status: 'running', title: 'Waiting for approval', detail: 'One paid tool is paused.', intent: 'Generate hero', elapsedLabel: '0:02' },
        feed: [{ id: 'approval', type: 'tool', status: 'waiting', title: 'Generate hero', detail: 'Tool: image.generate', provenance: 'runtime', toolCallId: 'tool-1', requestId: 'request-1', providerModel: 'openai/gpt-image-1', estimatedCost: { currency: 'USD', amount: 0.08, credits: 8 }, approval: { status: 'required', reason: 'Explicit approval is required.' }, actions: ['approve', 'deny'] }],
        cost: { estimated: [{ currency: 'USD', amount: 0.08, credits: 8 }], charged: [] },
      },
      composer: { value: '', disabled: true, onChange: vi.fn(), onSubmit: vi.fn() },
      onApproveTool,
      onDenyTool: vi.fn(),
      onOpenBudget: vi.fn(),
    }))
    expect(html).toContain('openai/gpt-image-1')
    expect(html).toContain('USD 0.08')
    expect(html).toContain('Explicit approval is required.')
    expect(html).toContain('Approve')
    expect(html).toContain('Deny')
    expect(html).toContain('data-slot="agent-cost-summary"')
    expect(html).toContain('Budget')
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

  it('progressively reveals run overview and activity while running', () => {
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
          id: 'stage:planning',
          type: 'stage',
          status: 'running',
          title: 'Creating Plan',
          detail: 'Mapping deliverables.',
          provenance: 'runtime',
        }],
      },
      composer: { value: '', busy: true, disabled: true, onChange: vi.fn(), onSubmit: vi.fn() },
    }))

    expect(html).not.toContain('data-slot="agent-draft-prompt"')
    expect(html).toContain('Planning the outcome')
    expect(html).toContain('Agent activity')
    expect(html).toContain('Creating Plan')
  })

  it('keeps draft capability notices visible without expanding the run overview', () => {
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
    expect(html).toContain('Agent activity')
    expect(html).toContain('Capability fallback')
    expect(html).toContain('Web search is unavailable.')
  })

  it('expands draft context when human intervention is required', () => {
    const html = renderToStaticMarkup(createElement(AgentWorkspaceDock, {
      viewModel: draftModel,
      composer: { value: '', onChange: vi.fn(), onSubmit: vi.fn() },
      intervention: createElement('button', null, 'Approve scope'),
      onCancel: vi.fn(),
    }))

    expect(html).not.toContain('data-slot="agent-draft-prompt"')
    expect(html).toContain('Describe the result you need')
    expect(html).toContain('Agent activity')
    expect(html).toContain('Approve scope')
    expect(html).not.toContain('aria-label="Run controls"')
  })

  it('keeps verified outcomes visible when the run is ready', () => {
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
    expect(html).toContain('Materials ready')
    expect(html).toContain('Outcome checklist')
    expect(html).toContain('2 of 2 verified')
    expect(html).not.toContain('Agent activity')
  })

  it('keeps recovery, evidence, controls, and intervention visible after an error', () => {
    const html = renderToStaticMarkup(createElement(AgentWorkspaceDock, {
      viewModel: stoppedModel,
      composer: { value: '', onChange: vi.fn(), onSubmit: vi.fn() },
      intervention: createElement('button', null, 'Approve repair'),
      onRetry: vi.fn(),
    }))

    expect(html).toContain('Completed materials remain available')
    expect(html).toContain('1 of 2 verified')
    expect(html).toContain('Repair and retry')
    expect(html).toContain('Approve repair')
    expect(html).toContain('<details')
  })

  it('only renders outcome rows with existing evidence as navigation buttons', () => {
    const onOpenArtifact = vi.fn()
    const html = renderToStaticMarkup(createElement(AgentWorkspaceDock, {
      viewModel: {
        ...stoppedModel,
        checklist: [
          ...stoppedModel.checklist,
          {
            id: 'design-system',
            label: 'Design system',
            status: 'missing',
            completedCount: 0,
            requiredCount: 1,
            detail: '0 of 1 verified; 1 remaining',
          },
        ],
      },
      composer: { value: '', onChange: vi.fn(), onSubmit: vi.fn() },
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
    const visible = renderToStaticMarkup(createElement(AgentWorkspaceDock, {
      viewModel: stoppedModel,
      composer: { value: '', onChange: vi.fn(), onSubmit: vi.fn() },
      showCostNotice: true,
    }))

    expect(hidden).not.toContain(stoppedModel.costNotice)
    expect(visible).not.toContain(stoppedModel.costNotice)
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

  it('shows and clears the selected material context before submission', () => {
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
          detail: 'Redo Checkout and its derived slices; preserve Home and the design system.',
          onClear: vi.fn(),
        },
      },
    }))

    expect(html).toContain('data-slot="agent-material-context"')
    expect(html).toContain('Editing Checkout')
    expect(html).toContain('Redo Checkout')
    expect(html).toContain('aria-label="Clear material context"')
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
          detail: '',
          blockedReason: 'Source page unavailable.',
          onClear: vi.fn(),
        },
      },
    }))

    expect(html).toContain('Source page unavailable.')
    expect(html).toContain('aria-label="Clear material context"')
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
        costNotice: '自动执行付费模型，费用以提供商为准',
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
        costNotice: '自动执行付费模型，费用以提供商为准',
      },
      labels: { noActivity: longChinese },
      composer: { value: '', onChange: vi.fn(), onSubmit: vi.fn() },
    }))

    expect(html).toContain(longChinese)
    expect(html).toContain('line-clamp-2 break-words')
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

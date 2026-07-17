import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ExecutionTimeline } from './ExecutionTimeline'

describe('ExecutionTimeline', () => {
  it('shows only the group duration when a step contains one tool', () => {
    const html = renderToStaticMarkup(createElement(ExecutionTimeline, {
      now: 64_000,
      timeline: {
        runId: 'run',
        steps: [{
          id: 'tools',
          label: 'Tools',
          status: 'running',
          startedAt: 1_000,
          tools: [{
            id: 'tool',
            label: 'Generate design system',
            tool: 'image.generate',
            status: 'running',
            startedAt: 1_000,
            outputRefs: [],
          }],
        }],
      },
    }))

    expect(html.match(/1:03/g)).toHaveLength(1)
  })

  it('opens active work, collapses completed work and keeps automatic approvals non-actionable', () => {
    const html = renderToStaticMarkup(createElement(ExecutionTimeline, {
      now: 4_000,
      onApprove: vi.fn(),
      onDeny: vi.fn(),
      timeline: {
        runId: 'run',
        steps: [
          { id: 'done', label: 'Create reference', status: 'succeeded', startedAt: 1_000, endedAt: 2_000, tools: [] },
          { id: 'active', label: 'Create DESIGN.md', status: 'running', startedAt: 2_000, tools: [{ id: 'tool', label: 'Read visual reference', tool: 'vision', status: 'running', startedAt: 2_100, outputRefs: [], policy: 'Automatically approved within policy.' }] },
        ],
      },
    }))
    expect(html).toContain('aria-label="Execution timeline"')
    expect(html).toMatch(/<details[^>]*><summary[^>]*>.*Create reference/s)
    expect(html).toMatch(/<details open=""[^>]*><summary[^>]*>.*Create DESIGN.md/s)
    expect(html).not.toContain('>Approve<')
    expect(html).not.toContain('future')
  })
})

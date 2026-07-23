import { describe, expect, it } from 'vitest'
import type { PrototypePlan } from './prototype-plan'
import { prototypeReviewMarkdown } from './review-document'

const plan = {
  version: 'prototype-plan.v0',
  product: { name: 'Atlas', summary: 'A useful product.', audience: 'Teams', primaryGoal: 'Finish work.', platform: 'web' },
  designSystem: { styleSummary: 'Quiet and direct.', palette: ['#ffffff'], typography: 'Sans', spacing: '8px', componentPrinciples: ['Clear'], assetDirection: 'Real product imagery.' },
  pages: [
    { id: 'home', name: 'Home', route: '/', purpose: 'Start.', viewport: { platform: 'web', width: 1440, height: 900, scroll: 'single-screen' }, regions: [{ id: 'hero', name: 'Hero', role: 'intro', summary: 'Start', complexity: 'low', decompositionStrategy: 'direct', assetRoute: 'ignore-code-ui', assetOpportunities: [] }], overlays: [], states: [], interactions: [{ id: 'next', label: 'Next', trigger: 'click', sourceElement: 'button', intent: 'Continue', action: { type: 'navigate', targetPageId: 'detail' } }] },
    { id: 'detail', name: 'Detail', route: '/detail', purpose: 'Inspect.', viewport: { platform: 'web', width: 1440, height: 900, scroll: 'single-screen' }, regions: [{ id: 'body', name: 'Body', role: 'content', summary: 'Detail', complexity: 'low', decompositionStrategy: 'direct', assetRoute: 'ignore-code-ui', assetOpportunities: [] }], overlays: [], states: [], interactions: [] },
  ],
  flows: [{ id: 'flow', name: 'Primary', goal: 'Continue', startPageId: 'home', steps: [] }],
  humanLoop: { mode: 'continue', rationale: 'Proceed.' },
} satisfies PrototypePlan

describe('prototype review document', () => {
  it('selects the exact model-authored document for each scope', () => {
    const authored: PrototypePlan = {
      ...plan,
      reviewDocument: {
        format: 'markdown',
        primaryFlow: '# Primary\n\nModel-authored primary artifact.',
        fullPlan: '# Full\n\n| Page | Route |\n| --- | --- |\n| Home | / |',
      },
    }
    expect(prototypeReviewMarkdown(authored, 'primary-flow')).toContain('Model-authored primary')
    expect(prototypeReviewMarkdown(authored, 'full-plan')).toContain('| Page | Route |')
  })

  it('projects legacy plans to scope-aware Markdown without leaking UI structure', () => {
    expect(prototypeReviewMarkdown(plan, 'primary-flow')).not.toContain('## Detail')
    expect(prototypeReviewMarkdown(plan, 'full-plan')).toContain('## Detail')
  })

  it('appends the resolved candidate count, directions, and runtime bounds', () => {
    const explored: PrototypePlan = {
      ...plan,
      designSystem: {
        ...plan.designSystem,
        exploration: {
          mode: 'auto',
          decidedBy: 'agent',
          count: 2,
          rationale: 'Two directions expose the meaningful tradeoff.',
          directions: [
            { id: 'quiet', label: 'Quiet', thesis: 'Restrained.', vary: ['density'], preserve: ['identity'] },
            { id: 'bold', label: 'Bold', thesis: 'Expressive.', vary: ['shape'], preserve: ['identity'] },
          ],
          bounds: { maxCandidates: 8, maxParallelism: 2 },
          estimate: { currency: 'USD', amount: 0.4 },
        },
      },
    }
    const markdown = prototypeReviewMarkdown(explored, 'full-plan')
    expect(markdown).toContain('## Design System directions')
    expect(markdown).toContain('**2 directions**')
    expect(markdown).toContain('### Quiet')
    expect(markdown).toContain('up to 8 candidates, 2 concurrent')
    expect(markdown).toContain('Estimated provider cost: 0.4 USD')
  })
})

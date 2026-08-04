import type { PrototypePlan } from './prototype-plan'

export const currentPrototypeExploration: PrototypePlan['designSystem']['exploration'] = {
  mode: 'auto',
  decidedBy: 'agent',
  count: 1,
  rationale: 'The test requirement establishes one coherent direction.',
  directions: [{
    id: 'direction:test',
    label: 'Test direction',
    thesis: 'Preserve the fixture intent.',
    vary: ['visual treatment'],
    preserve: ['product intent'],
  }],
  bounds: { maxCandidates: 8, maxParallelism: 2 },
}

export const currentPrototypeReviewDocument: PrototypePlan['reviewDocument'] = {
  format: 'markdown',
  primaryFlow: '# Primary flow\n\nCurrent fixture review.',
  fullPlan: '# Full plan\n\nCurrent fixture review.',
}

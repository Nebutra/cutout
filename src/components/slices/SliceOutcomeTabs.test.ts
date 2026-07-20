import { describe, expect, it } from 'vitest'
import { needsSliceReview, unprojectedProductionBlockers } from './slice-review-model'
import { isSliceConsumable } from '@/store/selectors'
import type { Slice } from '@/store/types'

const slice = (overrides: Partial<Slice> = {}): Slice => ({
  id: 'slice-1', index: 0, name: 'hero.png', box: { x: 0, y: 0, width: 100, height: 80 },
  blob: new Blob(['png']), objectUrl: 'blob:hero', width: 100, height: 80, selected: false,
  included: true, confidence: null, reviewIssues: [], regionId: null, pageId: null,
  assetManifestItemId: null, productionTaskId: null, productionRunId: null,
  outputArtifactId: null, readiness: null, ...overrides,
})

describe('slice review projection', () => {
  it('does not invent a failure when confidence was not reported', () => {
    expect(needsSliceReview(slice())).toBe(false)
  })

  it('aggregates low confidence and explicit QA failures', () => {
    expect(needsSliceReview(slice({ confidence: 0.74 }))).toBe(true)
    expect(needsSliceReview(slice({ confidence: 0.99, reviewIssues: ['Edge halo detected'] }))).toBe(true)
  })

  it('does not consume a new production result until it is ready or waived', () => {
    expect(isSliceConsumable(slice({ readiness: 'needs-review', included: true }))).toBe(false)
    expect(isSliceConsumable(slice({ readiness: 'ready' }))).toBe(true)
    expect(isSliceConsumable(slice({ readiness: 'waived' }))).toBe(true)
    expect(isSliceConsumable(slice({ readiness: null }))).toBe(true)
  })

  it('keeps failed tasks visible when they have no projected slice', () => {
    const queue = [
      {
        runId: 'run:1', planId: 'plan:1', taskId: 'task:visible',
        manifestItemId: 'asset:visible', pageId: 'home', regionId: 'hero',
        status: 'needs-review' as const, issues: [],
      },
      {
        runId: 'run:1', planId: 'plan:1', taskId: 'task:missing',
        manifestItemId: 'asset:missing', pageId: 'home', regionId: 'logo',
        status: 'failed' as const, issues: [],
      },
    ]

    expect(unprojectedProductionBlockers(queue, [
      slice({ productionTaskId: 'task:visible', readiness: 'needs-review' }),
    ])).toEqual([expect.objectContaining({ taskId: 'task:missing', status: 'failed' })])
  })
})

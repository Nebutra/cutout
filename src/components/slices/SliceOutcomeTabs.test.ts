import { describe, expect, it } from 'vitest'
import { needsSliceReview } from './slice-review-model'
import type { Slice } from '@/store/types'

const slice = (overrides: Partial<Slice> = {}): Slice => ({
  id: 'slice-1', index: 0, name: 'hero.png', box: { x: 0, y: 0, width: 100, height: 80 },
  blob: new Blob(['png']), objectUrl: 'blob:hero', width: 100, height: 80, selected: false,
  included: true, confidence: null, reviewIssues: [], regionId: null, pageId: null,
  assetManifestItemId: null, ...overrides,
})

describe('slice review projection', () => {
  it('does not invent a failure when confidence was not reported', () => {
    expect(needsSliceReview(slice())).toBe(false)
  })

  it('aggregates low confidence and explicit QA failures', () => {
    expect(needsSliceReview(slice({ confidence: 0.74 }))).toBe(true)
    expect(needsSliceReview(slice({ confidence: 0.99, reviewIssues: ['Edge halo detected'] }))).toBe(true)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getStoreState } from '@/store/index'
import type { AnalysisResult, SliceInput } from '@/store/types'

function sliceInput(id: string, regionId: string, pageId: string): SliceInput {
  return {
    id,
    index: 0,
    box: { x: 0, y: 0, width: 8, height: 8 },
    blob: new Blob([new Uint8Array([1])], { type: 'image/png' }),
    width: 8,
    height: 8,
    regionId,
    pageId,
  }
}

function result(...slices: SliceInput[]): AnalysisResult {
  return { slices }
}

describe('per-region streaming slice actions', () => {
  beforeEach(() => {
    getStoreState().resetProject()
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  it('appends region slices without replacing, tagging region/page and re-indexing', () => {
    const runId = getStoreState().beginRegionSlices()
    expect(getStoreState().analysis.status).toBe('running')

    getStoreState().appendRegionSlices(runId, result(sliceInput('s1', 'hero', 'p1')))
    getStoreState().appendRegionSlices(
      runId,
      result(sliceInput('s2', 'grid', 'p1'), sliceInput('s3', 'grid', 'p1')),
    )

    const slices = getStoreState().analysis.slices
    expect(slices.map((s) => s.id)).toEqual(['s1', 's2', 's3'])
    // Global index stays unique/monotonic across regions.
    expect(slices.map((s) => s.index)).toEqual([0, 1, 2])
    expect(slices.map((s) => s.regionId)).toEqual(['hero', 'grid', 'grid'])
    expect(slices.every((s) => s.pageId === 'p1')).toBe(true)
    expect(getStoreState().analysis.status).toBe('running')

    getStoreState().finishRegionSlices(runId)
    expect(getStoreState().analysis.status).toBe('done')
  })

  it('drops appends for a superseded run', () => {
    const stale = getStoreState().beginRegionSlices()
    const fresh = getStoreState().beginRegionSlices()
    expect(fresh).toBeGreaterThan(stale)

    getStoreState().appendRegionSlices(stale, result(sliceInput('x', 'r', 'p')))
    expect(getStoreState().analysis.slices).toHaveLength(0)

    getStoreState().appendRegionSlices(fresh, result(sliceInput('y', 'r', 'p')))
    expect(getStoreState().analysis.slices.map((s) => s.id)).toEqual(['y'])

    getStoreState().finishRegionSlices(stale)
    expect(getStoreState().analysis.status).toBe('running')
  })
})

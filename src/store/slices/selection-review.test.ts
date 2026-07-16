import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getStoreState } from '@/store'

beforeEach(() => {
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:slice', revokeObjectURL: () => {} })
  getStoreState().resetProject()
  const runId = getStoreState().beginRegionSlices()
  getStoreState().appendRegionSlices(runId, { slices: [{ id: 'slice-1', index: 0, box: { x: 1, y: 2, width: 10, height: 12 }, blob: new Blob(['png']), width: 10, height: 12 }] })
  getStoreState().finishRegionSlices(runId)
})

describe('result review corrections', () => {
  it('keeps include/exclude reversible and omits excluded bulk exports', async () => {
    getStoreState().setSliceIncluded('slice-1', false)
    expect(getStoreState().analysis.slices[0]?.included).toBe(false)
    getStoreState().setSliceIncluded('slice-1', true)
    expect(getStoreState().analysis.slices[0]?.included).toBe(true)
  })

  it('accepts valid bounds and rejects invalid geometry', () => {
    getStoreState().updateSliceBounds('slice-1', { x: 5, y: 6, width: 20, height: 30 })
    expect(getStoreState().analysis.slices[0]?.box).toEqual({ x: 5, y: 6, width: 20, height: 30 })
    getStoreState().updateSliceBounds('slice-1', { x: -1, y: 0, width: 0, height: 2 })
    expect(getStoreState().analysis.slices[0]?.box).toEqual({ x: 5, y: 6, width: 20, height: 30 })
  })
})

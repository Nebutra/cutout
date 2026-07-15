import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getStoreState } from '@/store'
import { createCutoutResultSink } from './cutout-result-sink'

function bitmap(): ImageBitmap {
  return { width: 10, height: 10, close: vi.fn() } as unknown as ImageBitmap
}

describe('CutoutResultSink', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:slice'), revokeObjectURL: vi.fn() })
    getStoreState().resetProject()
  })

  it('commits all slices in one completed analysis state', () => {
    getStoreState().loadImage({ bitmap: bitmap(), name: 'board', autoAnalyze: false })
    const sink = createCutoutResultSink(getStoreState)
    sink.commit({
      execution: {} as never,
      outputArtifactIds: ['artifact:1'],
      slices: [{ id: 'slice-1', index: 0, box: { x: 0, y: 0, width: 2, height: 2 }, png: new Blob(['x']), width: 2, height: 2 }],
    })

    expect(getStoreState().source.autoAnalyze).toBe(false)
    expect(getStoreState().analysis).toMatchObject({ status: 'done', slices: [{ id: 'slice-1', name: 'board-01.png' }] })
  })

  it('rejects publication after the source disappeared', () => {
    const sink = createCutoutResultSink(getStoreState)
    expect(() => sink.commit({ execution: {} as never, outputArtifactIds: [], slices: [] })).toThrow('source changed')
    expect(getStoreState().analysis.slices).toEqual([])
  })

  it('keeps ordinary imports opted into automatic analysis', () => {
    getStoreState().loadImage({ bitmap: bitmap(), name: 'manual' })
    expect(getStoreState().source.autoAnalyze).toBe(true)
  })
})

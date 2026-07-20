import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getStoreState } from '@/store'
import { createCutoutResultSink } from './cutout-result-sink'
import type { DesktopToolExecution } from './desktop-tool-executor'

const sourceArtifactId = `artifact:sha256:${'a'.repeat(64)}`
const outputArtifactId = `artifact:sha256:${'b'.repeat(64)}`

function execution(): DesktopToolExecution {
  return {
    requestId: 'request-1',
    runId: 'agent-run-1',
    toolCallId: 'cutout-1',
    label: 'Cutout',
    expectedRevision: 4,
    request: { inputArtifactIds: [sourceArtifactId] } as DesktopToolExecution['request'],
    approvalGranted: true,
    policy: {} as DesktopToolExecution['policy'],
  }
}

function bitmap(): ImageBitmap {
  return { width: 10, height: 10, close: vi.fn() } as unknown as ImageBitmap
}

describe('CutoutResultSink', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:slice'), revokeObjectURL: vi.fn() })
    getStoreState().resetProject()
  })

  it('commits all slices through production authority before projecting them', async () => {
    getStoreState().loadImage({ bitmap: bitmap(), name: 'board', autoAnalyze: false })
    const sink = createCutoutResultSink(getStoreState)
    await sink.commit({
      execution: execution(),
      outputArtifactIds: [outputArtifactId],
      slices: [{ id: 'slice-1', index: 0, box: { x: 0, y: 0, width: 2, height: 2 }, png: new Blob(['x']), width: 2, height: 2 }],
    })

    expect(getStoreState().source.autoAnalyze).toBe(false)
    expect(getStoreState().analysis).toMatchObject({
      status: 'done',
      slices: [{
        id: 'slice-1',
        name: 'board-01.png',
        readiness: 'ready',
        outputArtifactId,
      }],
    })
    expect(getStoreState().assetProduction.runs['asset-production:tool:request-1']).toMatchObject({
      status: 'completed',
    })
  })

  it('rejects publication after the source disappeared', async () => {
    const sink = createCutoutResultSink(getStoreState)
    await expect(sink.commit({ execution: execution(), outputArtifactIds: [], slices: [] }))
      .rejects.toThrow('source changed')
    expect(getStoreState().analysis.slices).toEqual([])
  })

  it('keeps ordinary imports opted into automatic analysis', () => {
    getStoreState().loadImage({ bitmap: bitmap(), name: 'manual' })
    expect(getStoreState().source.autoAnalyze).toBe(true)
  })
})

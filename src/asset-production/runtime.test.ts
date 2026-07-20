import { describe, expect, it, vi } from 'vitest'
import { compileAssetProductionPlan } from './planner'
import { qualityIssue } from './quality-policy'
import { createMemoryAssetProductionRepository } from './repository'
import { createAssetProductionRuntime, type AssetProductionExecutor } from './runtime'

const sourceRevision = { projectRevisionId: 'revision:1', pageArtifacts: [] }

const artifact = (seed: string) => ({
  artifactId: `artifact:${seed}`,
  sha256: seed.repeat(64).slice(0, 64),
  mediaType: 'image/png',
  width: 100,
  height: 100,
})

async function plan() {
  return compileAssetProductionPlan({
    sourceRevision,
    items: [{ manifestItemId: 'asset:hero', pageId: 'home', regionId: 'hero', route: 'direct-generate' }],
    createdAt: 1,
  })
}

describe('asset production runtime', () => {
  it('checkpoints an accepted output and replays the stored run idempotently', async () => {
    const repository = createMemoryAssetProductionRepository()
    const execute = vi.fn<AssetProductionExecutor['execute']>().mockResolvedValue({
      candidate: artifact('a'),
      output: artifact('b'),
      reviewIssues: [],
      verificationIssues: [],
    })
    const runtime = createAssetProductionRuntime({
      repository,
      executors: { 'direct-generate': { execute } },
      now: incrementingClock(),
    })
    const input = await plan()
    const first = await runtime.execute(input, { runId: 'run:stable' })
    const replay = await runtime.execute(input, { runId: 'run:stable' })

    expect(first.status).toBe('completed')
    expect(replay).toEqual(first)
    expect(execute).toHaveBeenCalledTimes(1)
    expect((await repository.load()).runs['run:stable']).toEqual(first)
  })

  it('does not publish a QA-rejected candidate', async () => {
    const repository = createMemoryAssetProductionRepository()
    const runtime = createAssetProductionRuntime({
      repository,
      executors: {
        'direct-generate': {
          async execute() {
            return {
              candidate: artifact('a'),
              output: artifact('b'),
              reviewIssues: [qualityIssue('qa-rejected', 'Rejected.', 'model-review', 4)],
            }
          },
        },
      },
      now: incrementingClock(),
    })
    const run = await runtime.execute(await plan(), { runId: 'run:review' })
    const task = Object.values(run.tasks)[0]!

    expect(run.status).toBe('needs-review')
    expect(task.status).toBe('needs-review')
    expect(task.output).toBeUndefined()
  })

  it('records cancellation without converting cleanup into completion', async () => {
    const repository = createMemoryAssetProductionRepository()
    const controller = new AbortController()
    const runtime = createAssetProductionRuntime({
      repository,
      executors: {
        'direct-generate': {
          async execute() {
            controller.abort()
            throw new DOMException('Stopped', 'AbortError')
          },
        },
      },
      now: incrementingClock(),
    })
    const run = await runtime.execute(await plan(), { runId: 'run:cancel', signal: controller.signal })
    expect(run.status).toBe('cancelled')
    expect(Object.values(run.tasks)[0]?.status).toBe('cancelled')
  })

  it('fails closed when a route has no executor', async () => {
    const runtime = createAssetProductionRuntime({
      repository: createMemoryAssetProductionRepository(),
      executors: {},
      now: incrementingClock(),
    })
    const run = await runtime.execute(await plan(), { runId: 'run:missing' })
    expect(run.status).toBe('failed')
    expect(Object.values(run.tasks)[0]?.issues[0]?.code).toBe('executor-unavailable')
  })
})

function incrementingClock() {
  let value = 1
  return () => value++
}


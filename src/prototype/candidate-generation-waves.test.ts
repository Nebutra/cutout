import { describe, expect, it, vi } from 'vitest'
import {
  runCandidateGenerationWaves,
  type CandidateGenerationFailure,
} from './candidate-generation-waves'

const routeFailure: CandidateGenerationFailure = {
  message: 'HTTP 503 service unavailable',
  routeWide: true,
  transient: false,
}

function run(input: {
  readonly generate: Parameters<typeof runCandidateGenerationWaves<string>>[0]['generate']
  readonly candidateIds?: readonly string[]
  readonly concurrency?: number
  readonly maxTransientRetries?: number
  readonly onRetry?: Parameters<typeof runCandidateGenerationWaves<string>>[0]['onRetry']
}) {
  return runCandidateGenerationWaves({
    candidateIds: input.candidateIds ?? ['candidate:1', 'candidate:2', 'candidate:3'],
    concurrency: input.concurrency ?? 2,
    maxTransientRetries: input.maxTransientRetries ?? 1,
    generate: input.generate,
    classifyFailure: (error) => error as CandidateGenerationFailure,
    isCancelled: () => false,
    onRetry: input.onRetry,
  })
}

describe('runCandidateGenerationWaves', () => {
  it('settles a partially successful wave and continues remaining candidates', async () => {
    const attempts: string[] = []
    const result = await run({
      maxTransientRetries: 0,
      generate: async ({ candidateId }) => {
        attempts.push(candidateId)
        if (candidateId === 'candidate:2') throw routeFailure
        return `${candidateId}:ready`
      },
    })

    expect(attempts).toEqual(['candidate:1', 'candidate:2', 'candidate:3'])
    expect(result.outcomes.map(({ status }) => status)).toEqual(['ready', 'failed', 'ready'])
    expect(result.routeUnavailable).toBe(false)
    expect(result.complete).toBe(false)
  })

  it('retries a transient failure once with a fresh attempt identity', async () => {
    const attempts: string[] = []
    const retried = vi.fn()
    const generate = vi.fn(async ({ identity }: { readonly identity: string }) => {
      attempts.push(identity)
      if (attempts.length === 1) {
        throw { ...routeFailure, transient: true }
      }
      return 'ready'
    })
    const result = await run({
      candidateIds: ['candidate:1'],
      concurrency: 1,
      generate,
      onRetry: retried,
    })

    expect(attempts).toEqual(['candidate:1', 'candidate:1:retry:1'])
    expect(generate).toHaveBeenCalledTimes(2)
    expect(retried).toHaveBeenCalledWith(
      expect.objectContaining({ candidateId: 'candidate:1', attempt: 1 }),
      expect.objectContaining({ transient: true }),
    )
    expect(result.outcomes).toMatchObject([{ status: 'ready', attempts: 2 }])
    expect(result.complete).toBe(true)

    const exhaustedAttempts: string[] = []
    const exhausted = await run({
      candidateIds: ['candidate:1'],
      concurrency: 1,
      generate: async ({ identity }) => {
        exhaustedAttempts.push(identity)
        throw { ...routeFailure, transient: true }
      },
    })
    expect(exhaustedAttempts).toEqual(['candidate:1', 'candidate:1:retry:1'])
    expect(exhausted.outcomes).toMatchObject([{ status: 'failed', attempts: 2 }])
  })

  it('stops claiming new work only after an all-route-wide wave settles', async () => {
    const settled: string[] = []
    const result = await run({
      maxTransientRetries: 0,
      generate: async ({ candidateId }) => {
        await Promise.resolve()
        settled.push(candidateId)
        throw routeFailure
      },
    })

    expect(settled).toEqual(['candidate:1', 'candidate:2'])
    expect(result.outcomes).toHaveLength(2)
    expect(result.routeUnavailable).toBe(true)
    expect(result.complete).toBe(false)
  })

  it('reports completion only when exactly every requested candidate is ready', async () => {
    const complete = await run({
      generate: async ({ candidateId }) => candidateId,
    })
    const partial = await run({
      maxTransientRetries: 0,
      generate: async ({ candidateId }) => {
        if (candidateId === 'candidate:3') {
          throw { message: 'candidate output invalid', routeWide: false, transient: false }
        }
        return candidateId
      },
    })

    expect(complete.complete).toBe(true)
    expect(complete.outcomes).toHaveLength(3)
    expect(partial.complete).toBe(false)
    expect(partial.outcomes.filter(({ status }) => status === 'ready')).toHaveLength(2)
  })
})

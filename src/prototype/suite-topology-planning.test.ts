import { describe, expect, it, vi } from 'vitest'
import { ok } from '@/services/types'
import { planDistinctSuiteTopologies } from './suite-topology-planning'

describe('planDistinctSuiteTopologies', () => {
  it('plans independent topologies with bounded parallelism and stable outcomes', async () => {
    let active = 0
    let maximum = 0
    const outcomes = await planDistinctSuiteTopologies({
      requests: ['a', 'b', 'c', 'd'],
      concurrency: 3,
      priorFingerprints: [],
      plan: async (request) => {
        active += 1
        maximum = Math.max(maximum, active)
        await Promise.resolve()
        active -= 1
        return ok({ graph: request })
      },
      fingerprint: (plan) => plan.graph,
    })

    expect(maximum).toBe(3)
    expect(outcomes.map(({ request, result }) => [request, result])).toEqual([
      ['a', ok({ graph: 'a' })],
      ['b', ok({ graph: 'b' })],
      ['c', ok({ graph: 'c' })],
      ['d', ok({ graph: 'd' })],
    ])
  })

  it('serially repairs only a colliding result against accepted fingerprints', async () => {
    const calls: Array<{ request: string; prior: readonly string[] }> = []
    const plan = vi.fn(async (request: string, prior: readonly string[]) => {
      calls.push({ request, prior: [...prior] })
      return ok({ graph: request === 'second' && prior.includes('shared') ? 'repaired' : 'shared' })
    })
    const outcomes = await planDistinctSuiteTopologies({
      requests: ['first', 'second'],
      concurrency: 2,
      priorFingerprints: [],
      plan,
      fingerprint: (value) => value.graph,
    })

    expect(plan).toHaveBeenCalledTimes(3)
    expect(calls).toEqual([
      { request: 'first', prior: [] },
      { request: 'second', prior: [] },
      { request: 'second', prior: ['shared'] },
    ])
    expect(outcomes.map(({ result, repairedDuplicate }) => ({
      graph: result.ok ? result.data.graph : null,
      repairedDuplicate,
    }))).toEqual([
      { graph: 'shared', repairedDuplicate: false },
      { graph: 'repaired', repairedDuplicate: true },
    ])
  })

  it('fails closed when one duplicate repair still returns the same graph', async () => {
    const outcomes = await planDistinctSuiteTopologies({
      requests: ['candidate'],
      concurrency: 1,
      priorFingerprints: ['shared'],
      plan: async () => ok({ graph: 'shared' }),
      fingerprint: (value) => value.graph,
    })

    expect(outcomes[0]?.repairedDuplicate).toBe(true)
    expect(outcomes[0]?.result).toEqual({
      ok: false,
      error: 'The planned prototype suite duplicates an existing route graph.',
    })
  })
})

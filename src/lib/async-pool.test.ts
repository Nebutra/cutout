import { describe, expect, it } from 'vitest'
import { createAsyncLimiter, forEachConcurrent } from './async-pool'

describe('forEachConcurrent', () => {
  it('bounds active work while visiting every item once', async () => {
    let active = 0
    let maximum = 0
    const visited: number[] = []

    await forEachConcurrent([1, 2, 3, 4, 5], 2, async (item) => {
      active += 1
      maximum = Math.max(maximum, active)
      await Promise.resolve()
      visited.push(item)
      active -= 1
    })

    expect(maximum).toBe(2)
    expect(visited.sort((left, right) => left - right)).toEqual([1, 2, 3, 4, 5])
  })

  it('treats invalid or sub-one concurrency as one worker', async () => {
    let active = 0
    let maximum = 0
    await forEachConcurrent([1, 2], Number.NaN, async () => {
      active += 1
      maximum = Math.max(maximum, active)
      await Promise.resolve()
      active -= 1
    })
    expect(maximum).toBe(1)
  })

  it('stops claiming new work and waits for in-flight work before rejecting', async () => {
    let releaseSecond!: () => void
    let secondFinished = false
    const visited: number[] = []
    const pending = forEachConcurrent([1, 2, 3], 2, async (item) => {
      visited.push(item)
      if (item === 1) throw new Error('first failed')
      if (item === 2) {
        await new Promise<void>((resolve) => { releaseSecond = resolve })
        secondFinished = true
      }
    })

    await vi.waitFor(() => expect(visited).toEqual([1, 2]))
    let settled = false
    void pending.then(
      () => { settled = true },
      () => { settled = true },
    )
    await Promise.resolve()
    expect(settled).toBe(false)
    releaseSecond()

    await expect(pending).rejects.toThrow('first failed')
    expect(secondFinished).toBe(true)
    expect(visited).toEqual([1, 2])
  })
})

describe('createAsyncLimiter', () => {
  it('bounds active work and preserves every result', async () => {
    const limit = createAsyncLimiter(2)
    let active = 0
    let maximum = 0

    const results = await Promise.all([1, 2, 3, 4, 5].map((value) =>
      limit(async () => {
        active += 1
        maximum = Math.max(maximum, active)
        await Promise.resolve()
        active -= 1
        return value * 2
      }),
    ))

    expect(maximum).toBe(2)
    expect(results).toEqual([2, 4, 6, 8, 10])
  })

  it('normalizes invalid and sub-one widths to one', async () => {
    for (const width of [Number.NaN, 0, -3]) {
      const limit = createAsyncLimiter(width)
      let active = 0
      let maximum = 0
      await Promise.all([1, 2].map(() => limit(async () => {
        active += 1
        maximum = Math.max(maximum, active)
        await Promise.resolve()
        active -= 1
      })))
      expect(maximum).toBe(1)
    }
  })

  it('releases a rejected slot and continues draining queued work', async () => {
    const limit = createAsyncLimiter(1)
    const visited: string[] = []
    const failed = limit(async () => {
      visited.push('failed')
      throw new Error('lane failed')
    })
    const recovered = limit(async () => {
      visited.push('recovered')
      return 42
    })

    await expect(failed).rejects.toThrow('lane failed')
    await expect(recovered).resolves.toBe(42)
    expect(visited).toEqual(['failed', 'recovered'])
  })
})

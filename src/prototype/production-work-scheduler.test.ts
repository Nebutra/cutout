import { describe, expect, it, vi } from 'vitest'
import {
  createPrototypeProductionScheduler,
  interleavePrototypeProductionWork,
  schedulePrototypeProductionWork,
} from './production-work-scheduler'
import {
  createImageRouteHealthRegistry,
  ImageRouteCircuitOpenError,
} from '@/services/ai/image-route-health'

describe('prototype production work scheduler', () => {
  it('shares one image ceiling across overlapping sibling suites', async () => {
    const scheduler = createPrototypeProductionScheduler(3)
    let active = 0
    let maximum = 0

    await Promise.all(['suite-a', 'suite-b', 'suite-c'].map(async () => {
      await Promise.all([1, 2, 3].map(() => scheduler.scheduleImage(async () => {
        active += 1
        maximum = Math.max(maximum, active)
        await Promise.resolve()
        active -= 1
      })))
    }))

    expect(maximum).toBe(3)
  })

  it('serves queued sibling suites round-robin instead of letting one lane flood the pool', async () => {
    const scheduler = createPrototypeProductionScheduler(1)
    const suiteA = scheduler.imageLane('suite-a')
    const suiteB = scheduler.imageLane('suite-b')
    const started: string[] = []
    let releaseFirst!: () => void
    const firstHeld = new Promise<void>((resolve) => { releaseFirst = resolve })

    const first = suiteA(async () => {
      started.push('a1')
      await firstHeld
    })
    const pending = [
      suiteA(async () => { started.push('a2') }),
      suiteA(async () => { started.push('a3') }),
      suiteB(async () => { started.push('b1') }),
      suiteB(async () => { started.push('b2') }),
    ]

    await vi.waitFor(() => expect(started).toEqual(['a1']))
    releaseFirst()
    await Promise.all([first, ...pending])
    expect(started).toEqual(['a1', 'a2', 'b1', 'a3', 'b2'])
  })

  it('reports image work only when it receives an execution slot', async () => {
    const scheduler = createPrototypeProductionScheduler(1)
    const image = scheduler.imageLane('candidate-lane')
    const started: string[] = []
    let releaseFirst!: () => void
    const firstHeld = new Promise<void>((resolve) => { releaseFirst = resolve })

    const first = image(async () => { await firstHeld }, () => started.push('first'))
    const second = image(async () => undefined, () => started.push('second'))

    await vi.waitFor(() => expect(started).toEqual(['first']))
    releaseFirst()
    await Promise.all([first, second])
    expect(started).toEqual(['first', 'second'])
  })

  it('reduces future concurrency after transient pressure without discarding queued siblings', async () => {
    const transient = new Error('HTTP 429 from provider')
    const scheduler = createPrototypeProductionScheduler(2, {
      reduceImageConcurrencyAfter: (error) => error === transient,
    })
    const suiteA = scheduler.imageLane('suite-a')
    const suiteB = scheduler.imageLane('suite-b')
    const started: string[] = []
    let releaseHeld!: () => void
    let failPressure!: () => void
    const held = new Promise<void>((resolve) => { releaseHeld = resolve })
    const pressure = new Promise<void>((_, reject) => { failPressure = () => reject(transient) })

    const first = suiteA(async () => {
      started.push('held')
      await held
    })
    const second = suiteB(async () => {
      started.push('pressure')
      await pressure
    })
    const queued = suiteB(async () => {
      started.push('queued')
    })

    await vi.waitFor(() => expect(started).toEqual(['held', 'pressure']))
    failPressure()
    await expect(second).rejects.toBe(transient)
    await Promise.resolve()
    expect(started).toEqual(['held', 'pressure'])
    releaseHeld()
    await Promise.all([first, queued])
    expect(started).toEqual(['held', 'pressure', 'queued'])
  })

  it('recovers one concurrency slot after two successful calls following transient pressure', async () => {
    const transient = new Error('HTTP 502 from provider')
    const scheduler = createPrototypeProductionScheduler(3, {
      reduceImageConcurrencyAfter: (error) => error === transient,
    })

    await expect(scheduler.scheduleImage(async () => {
      throw transient
    })).rejects.toBe(transient)
    await scheduler.scheduleImage(async () => undefined)
    await scheduler.scheduleImage(async () => undefined)

    let active = 0
    let maximum = 0
    let release!: () => void
    const held = new Promise<void>((resolve) => { release = resolve })
    const pending = Promise.all([1, 2, 3].map(() => scheduler.scheduleImage(async () => {
      active += 1
      maximum = Math.max(maximum, active)
      await held
      active -= 1
    })))

    await vi.waitFor(() => expect(maximum).toBe(3))
    release()
    await pending
  })

  it('keeps revisioned Asset Production stages single-writer', async () => {
    const scheduler = createPrototypeProductionScheduler(3)
    const order: string[] = []
    let releaseFirst!: () => void
    const firstHeld = new Promise<void>((resolve) => { releaseFirst = resolve })

    const first = scheduler.scheduleAssetProduction(async () => {
      order.push('first:start')
      await firstHeld
      order.push('first:end')
    })
    const second = scheduler.scheduleAssetProduction(async () => {
      order.push('second:start')
      order.push('second:end')
    })

    await vi.waitFor(() => expect(order).toEqual(['first:start']))
    releaseFirst()
    await Promise.all([first, second])
    expect(order).toEqual(['first:start', 'first:end', 'second:start', 'second:end'])
  })

  it('stops queued image claims after a terminal route failure', async () => {
    const failure = new Error('Provider credential is invalid.')
    const scheduler = createPrototypeProductionScheduler(2, {
      stopQueuedImageWorkAfter: (error) => error === failure,
    })
    const started: string[] = []
    let releaseFirst!: () => void
    let failSecond!: () => void
    const firstHeld = new Promise<void>((resolve) => { releaseFirst = resolve })
    const secondHeld = new Promise<void>((_, reject) => { failSecond = () => reject(failure) })

    const first = scheduler.scheduleImage(async () => {
      started.push('first')
      await firstHeld
    })
    const second = scheduler.scheduleImage(async () => {
      started.push('second')
      await secondHeld
    })
    const queued = scheduler.scheduleImage(async () => {
      started.push('queued')
    })

    await vi.waitFor(() => expect(started).toEqual(['first', 'second']))
    failSecond()
    await expect(second).rejects.toBe(failure)
    await expect(queued).rejects.toBe(failure)
    releaseFirst()
    await first
    await expect(scheduler.scheduleImage(async () => {
      started.push('late')
    })).rejects.toBe(failure)
    expect(started).toEqual(['first', 'second'])
  })

  it('keeps candidate-local failures from closing independent work', async () => {
    const scheduler = createPrototypeProductionScheduler(1, {
      stopQueuedImageWorkAfter: () => false,
    })
    const started: string[] = []
    await expect(scheduler.scheduleImage(async () => {
      started.push('failed')
      throw new Error('One candidate returned no image.')
    })).rejects.toThrow('One candidate returned no image.')
    await scheduler.scheduleImage(async () => {
      started.push('independent')
    })
    expect(started).toEqual(['failed', 'independent'])
  })

  it('shares an open exact-route circuit with a fresh continuation scheduler', async () => {
    const health = createImageRouteHealthRegistry({ timeoutThreshold: 2 })
    const route = {
      providerId: 'provider-1',
      model: 'exact-image-model',
      operation: 'image-generation' as const,
    }
    const scheduler = createPrototypeProductionScheduler(1, { imageRouteHealth: health })
    const lane = scheduler.imageLane('suite-a', route)
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(lane(async () => {
        throw new Error('Provider request timed out')
      })).rejects.toThrow('timed out')
    }

    const continuation = createPrototypeProductionScheduler(1, { imageRouteHealth: health })
    let paidCallStarted = false
    await expect(continuation.imageLane('suite-a', route)(async () => {
      paidCallStarted = true
    })).rejects.toBeInstanceOf(ImageRouteCircuitOpenError)
    expect(paidCallStarted).toBe(false)
  })

  it('canaries a cold exact route before expanding its image concurrency', async () => {
    const health = createImageRouteHealthRegistry()
    const route = {
      providerId: 'provider-1',
      model: 'cold-image-model',
      operation: 'image-edit' as const,
    }
    const scheduler = createPrototypeProductionScheduler(3, { imageRouteHealth: health })
    const lane = scheduler.imageLane('suite-a', route)
    const started: number[] = []
    const releases: Array<() => void> = []
    const pending = [1, 2, 3].map((ordinal) => lane(async () => {
      started.push(ordinal)
      await new Promise<void>((resolve) => releases.push(resolve))
    }))

    await vi.waitFor(() => expect(started).toEqual([1]))
    releases.shift()?.()
    await vi.waitFor(() => expect(started).toEqual([1, 2, 3]))
    for (const release of releases.splice(0)) release()
    await Promise.all(pending)
  })

  it('keeps recent route pressure effective in a fresh continuation scheduler', async () => {
    const health = createImageRouteHealthRegistry({ timeoutThreshold: 2 })
    const route = {
      providerId: 'provider-1',
      model: 'pressured-image-model',
      operation: 'image-edit' as const,
    }
    await expect(health.run(route, async () => {
      throw new Error('Provider request timed out')
    })).rejects.toThrow('timed out')

    const scheduler = createPrototypeProductionScheduler(3, { imageRouteHealth: health })
    const lane = scheduler.imageLane('suite-a', route)
    const started: number[] = []
    let releaseFirst!: () => void
    const firstHeld = new Promise<void>((resolve) => { releaseFirst = resolve })
    const first = lane(async () => {
      started.push(1)
      await firstHeld
    })
    const second = lane(async () => { started.push(2) })

    await vi.waitFor(() => expect(started).toEqual([1]))
    releaseFirst()
    await Promise.all([first, second])
    expect(started).toEqual([1, 2])
  })

  it('counts same-Provider review work against the shared production ceiling', async () => {
    const health = createImageRouteHealthRegistry()
    const route = {
      providerId: 'provider-1',
      model: 'warm-image-model',
      operation: 'image-edit' as const,
    }
    await health.run(route, async () => undefined)
    const scheduler = createPrototypeProductionScheduler(2, { imageRouteHealth: health })
    const image = scheduler.imageLane('suite-a', route)
    const review = scheduler.providerLane('vision:suite-a')
    const started: string[] = []
    const releases: Array<() => void> = []
    const hold = (label: string) => new Promise<void>((resolve) => {
      started.push(label)
      releases.push(resolve)
    })

    const first = image(() => hold('image-1'))
    const second = image(() => hold('image-2'))
    const third = review(() => hold('review'))
    await vi.waitFor(() => expect(started).toEqual(['image-1', 'image-2']))
    releases.shift()?.()
    await vi.waitFor(() => expect(started).toContain('review'))
    for (const release of releases.splice(0)) release()
    await Promise.all([first, second, third])
  })

  it('does not treat Provider review settlement as image-route recovery evidence', async () => {
    const transient = new Error('HTTP 429 from provider')
    const route = {
      providerId: 'provider-1',
      model: 'exact-image-model',
      operation: 'image-edit' as const,
    }
    const scheduler = createPrototypeProductionScheduler(3, {
      reduceImageConcurrencyAfter: (error) => error === transient,
    })
    const image = scheduler.imageLane('suite-a', route)

    await expect(image(async () => {
      throw transient
    })).rejects.toBe(transient)
    await scheduler.providerLane('vision:suite-a')(async () => undefined)
    await scheduler.providerLane('vision:suite-b')(async () => undefined)

    let active = 0
    let maximum = 0
    let release!: () => void
    const held = new Promise<void>((resolve) => { release = resolve })
    const pending = Promise.all([1, 2, 3].map(() => image(async () => {
      active += 1
      maximum = Math.max(maximum, active)
      await held
      active -= 1
    })))

    await vi.waitFor(() => expect(maximum).toBe(2))
    release()
    await pending
  })

  it('settles paid work already in flight when sibling timeouts open the route circuit', async () => {
    const health = createImageRouteHealthRegistry({ timeoutThreshold: 2 })
    const route = {
      providerId: 'provider-1',
      model: 'exact-image-model',
      operation: 'image-edit' as const,
    }
    await health.run(route, async () => undefined)
    const scheduler = createPrototypeProductionScheduler(3, { imageRouteHealth: health })
    const lane = scheduler.imageLane('suite-a', route)
    let releaseCompleted!: () => void
    const held = new Promise<string>((resolve) => {
      releaseCompleted = () => resolve('paid-node-ready')
    })
    const completed = lane(() => held)
    const firstTimeout = lane(async () => { throw new Error('request timed out') })
    const secondTimeout = lane(async () => { throw new Error('deadline exceeded') })
    let queuedStarted = false
    const queued = lane(async () => {
      queuedStarted = true
    })

    await expect(firstTimeout).rejects.toThrow('timed out')
    await expect(secondTimeout).rejects.toThrow('deadline exceeded')
    await expect(queued).rejects.toBeInstanceOf(ImageRouteCircuitOpenError)
    releaseCompleted()
    await expect(completed).resolves.toBe('paid-node-ready')
    expect(queuedStarted).toBe(false)
  })

  it('overlaps mixed work kinds while enforcing one combined ceiling', async () => {
    let releaseDirect!: () => void
    const heldDirect = new Promise<void>((resolve) => { releaseDirect = resolve })
    const started: string[] = []
    let active = 0
    let maximum = 0
    const work = interleavePrototypeProductionWork(
      ['direct:1', 'direct:2', 'direct:3', 'direct:4'],
      ['board:1', 'board:2'],
    )
    expect(work).toEqual([
      'direct:1', 'board:1', 'direct:2', 'board:2', 'direct:3', 'direct:4',
    ])
    const pending = schedulePrototypeProductionWork({
      work,
      concurrency: 3,
      async run(item) {
        started.push(item)
        active += 1
        maximum = Math.max(maximum, active)
        if (item.startsWith('direct:')) await heldDirect
        else await Promise.resolve()
        active -= 1
      },
    })

    await vi.waitFor(() => {
      expect(started).toContain('direct:1')
      expect(started).toContain('board:1')
    })
    expect(maximum).toBeLessThanOrEqual(3)
    releaseDirect()
    await pending
    expect(started[0]).toBe('direct:1')
    expect(started[1]).toBe('board:1')
  })
})

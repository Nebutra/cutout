import { describe, expect, it } from 'vitest'
import {
  createImageRouteHealthRegistry,
  ImageRouteCircuitOpenError,
  type ImageRouteHealthKey,
} from './image-route-health'

const generationRoute: ImageRouteHealthKey = {
  providerId: 'provider-1',
  model: 'exact-image-model',
  operation: 'image-generation',
}

describe('image route health', () => {
  it('keeps bounded latency and outcome samples without retaining raw failures', async () => {
    let now = 0
    const health = createImageRouteHealthRegistry({
      now: () => now,
      sampleLimit: 2,
      maximumLatencyMs: 100,
    })

    await health.run(generationRoute, async () => {
      now = 25
    })
    await expect(health.run(generationRoute, async () => {
      now = 75
      throw new Error('HTTP 503 with secret-shaped diagnostic')
    })).rejects.toThrow('secret-shaped')
    await expect(health.run(generationRoute, async () => {
      now = 1_000
      throw new Error('native image request timed out at /private/workspace')
    })).rejects.toThrow('timed out')

    expect(health.snapshot(generationRoute)).toEqual({
      route: generationRoute,
      circuit: 'closed',
      consecutiveTimeouts: 1,
      samples: [
        { outcome: 'transient-failure', latencyMs: 50 },
        { outcome: 'timeout', latencyMs: 100 },
      ],
    })
    expect(JSON.stringify(health.snapshot(generationRoute))).not.toContain('secret-shaped')
    expect(JSON.stringify(health.snapshot(generationRoute))).not.toContain('/private/workspace')
  })

  it('opens only the repeatedly timing-out exact route operation', async () => {
    const health = createImageRouteHealthRegistry({ timeoutThreshold: 2 })
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(health.run(generationRoute, async () => {
        throw new Error('Provider request timed out')
      })).rejects.toThrow('timed out')
    }

    await expect(health.run(generationRoute, async () => undefined))
      .rejects.toBeInstanceOf(ImageRouteCircuitOpenError)
    await expect(health.run(
      { ...generationRoute, operation: 'image-edit' },
      async () => 'edit-ready',
    )).resolves.toBe('edit-ready')
    await expect(health.run(
      { ...generationRoute, model: 'another-exact-model' },
      async () => 'model-ready',
    )).resolves.toBe('model-ready')
  })

  it('permits one bounded recovery probe after cooldown', async () => {
    let now = 0
    const health = createImageRouteHealthRegistry({
      now: () => now,
      timeoutThreshold: 1,
      circuitCooldownMs: 50,
    })
    await expect(health.run(generationRoute, async () => {
      throw new Error('deadline exceeded')
    })).rejects.toThrow('deadline exceeded')
    now = 50

    let release!: () => void
    const held = new Promise<void>((resolve) => { release = resolve })
    const probe = health.run(generationRoute, async () => held)
    await expect(health.run(generationRoute, async () => undefined))
      .rejects.toBeInstanceOf(ImageRouteCircuitOpenError)
    release()
    await probe

    expect(health.snapshot(generationRoute)).toMatchObject({
      circuit: 'closed',
      consecutiveTimeouts: 0,
    })
  })

  it('bounds the number of exact routes retained in memory', async () => {
    const health = createImageRouteHealthRegistry({ maximumRoutes: 2 })
    for (const model of ['one', 'two', 'three']) {
      await health.run({ ...generationRoute, model }, async () => undefined)
    }
    expect(health.snapshots()).toHaveLength(2)
    expect(health.snapshot({ ...generationRoute, model: 'one' })).toBeUndefined()
  })

  it('prefers a healthy exact alternative without changing the requested operation', async () => {
    const health = createImageRouteHealthRegistry({ timeoutThreshold: 2 })
    await expect(health.run(generationRoute, async () => {
      throw new Error('Provider request timed out')
    })).rejects.toThrow('timed out')
    const alternative = { ...generationRoute, model: 'healthy-edit-model' }

    expect(health.prefer([generationRoute, alternative])).toEqual(alternative)
    expect(health.prefer([
      { ...generationRoute, operation: 'image-edit' },
      generationRoute,
    ])).toEqual({ ...generationRoute, operation: 'image-edit' })
  })

  it('admits one cold or pressured request before expanding a successful exact route', async () => {
    const health = createImageRouteHealthRegistry({ timeoutThreshold: 2 })
    expect(health.admissionLimit(generationRoute, 3)).toBe(1)

    await health.run(generationRoute, async () => undefined)
    expect(health.admissionLimit(generationRoute, 3)).toBe(3)

    await expect(health.run(generationRoute, async () => {
      throw new Error('HTTP 503 from provider')
    })).rejects.toThrow('HTTP 503')
    expect(health.admissionLimit(generationRoute, 3)).toBe(1)
  })

  it('lets an open circuit drain queued claims without admitting Provider work', async () => {
    const health = createImageRouteHealthRegistry({ timeoutThreshold: 1 })
    await expect(health.run(generationRoute, async () => {
      throw new Error('deadline exceeded')
    })).rejects.toThrow('deadline exceeded')

    expect(health.admissionLimit(generationRoute, 3)).toBe(3)
    await expect(health.run(generationRoute, async () => undefined))
      .rejects.toBeInstanceOf(ImageRouteCircuitOpenError)
  })

  it('retains deterministic caller order when every route is equally healthy or open', async () => {
    const health = createImageRouteHealthRegistry({ timeoutThreshold: 1 })
    const second = { ...generationRoute, model: 'second' }
    expect(health.prefer([generationRoute, second, generationRoute])).toEqual(generationRoute)

    for (const route of [generationRoute, second]) {
      await expect(health.run(route, async () => {
        throw new Error('deadline exceeded')
      })).rejects.toThrow('deadline exceeded')
    }
    expect(health.prefer([generationRoute, second])).toEqual(generationRoute)
  })
})

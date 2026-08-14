import { describe, expect, it } from 'vitest'
import {
  createTextRouteHealthRegistry,
  shouldFailOverTextRoute,
} from './text-route-health'

const primary = { providerId: 'primary', model: 'text-primary' }
const fallback = { providerId: 'fallback', model: 'text-fallback' }

describe('text route health', () => {
  it('distinguishes cold catalog candidates from successful execution health', async () => {
    let now = 0
    const health = createTextRouteHealthRegistry({ now: () => now })

    expect(health.prefer([primary, fallback])).toEqual([primary, fallback])
    expect(health.snapshot(primary)).toBeUndefined()

    await health.run(primary, async () => {
      now = 25
      return 'ready'
    })

    expect(health.snapshot(primary)).toEqual({
      route: primary,
      samples: [{ outcome: 'success', latencyMs: 25 }],
    })
    expect(health.prefer([fallback, primary])).toEqual([primary, fallback])
  })

  it('moves a rate-limited route behind a cold alternative without retaining errors', async () => {
    const health = createTextRouteHealthRegistry()
    await expect(health.run(primary, async () => {
      throw new Error('HTTP 429: quota for this API key is temporarily exhausted')
    })).rejects.toThrow('API key')

    expect(health.prefer([primary, fallback])).toEqual([fallback, primary])
    expect(JSON.stringify(health.snapshot(primary))).not.toContain('API key')
    expect(health.snapshot(primary)).toMatchObject({
      samples: [{ outcome: 'transient-failure' }],
    })
  })

  it.each([
    ['HTTP 429 too many requests', true],
    ['HTTP 503 service unavailable', true],
    ['HTTP 401 unauthorized', false],
    ['HTTP 403 forbidden', false],
    ['Structured output schema validation failed', false],
  ] as const)('allows bounded failover only for transient execution failure: %s', (message, expected) => {
    expect(shouldFailOverTextRoute(new Error(message))).toBe(expected)
  })
})

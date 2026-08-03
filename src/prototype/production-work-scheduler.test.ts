import { describe, expect, it, vi } from 'vitest'
import {
  interleavePrototypeProductionWork,
  schedulePrototypeProductionWork,
} from './production-work-scheduler'

describe('prototype production work scheduler', () => {
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

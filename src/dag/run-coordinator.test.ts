import { describe, expect, it } from 'vitest'
import { DagRunCoordinator } from './run-coordinator'

describe('DagRunCoordinator', () => {
  it('supersedes and aborts the prior run', () => {
    const coordinator = new DagRunCoordinator()
    const first = coordinator.begin()
    const second = coordinator.begin()

    expect(first.controller.signal.aborted).toBe(true)
    expect(coordinator.isActive(first)).toBe(false)
    expect(coordinator.isActive(second)).toBe(true)
  })

  it('does not let an old run finish the current lease', () => {
    const coordinator = new DagRunCoordinator()
    const first = coordinator.begin()
    const second = coordinator.begin()

    coordinator.finish(first)
    expect(coordinator.isActive(second)).toBe(true)
  })

  it('cancels only the supplied lease', () => {
    const coordinator = new DagRunCoordinator()
    const first = coordinator.begin()
    const second = coordinator.begin()

    coordinator.cancel(first)
    expect(coordinator.isActive(second)).toBe(true)

    coordinator.cancel(second)
    expect(second.controller.signal.aborted).toBe(true)
    expect(coordinator.isActive(second)).toBe(false)
  })
})

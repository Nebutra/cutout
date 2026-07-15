import { describe, expect, it, vi } from 'vitest'
import {
  AgentRunCancelledError,
  AgentRunCoordinator,
  isAgentRunCancelled,
} from './run-coordinator'

describe('AgentRunCoordinator', () => {
  it('cancels the prior lease when a new run takes ownership', () => {
    const coordinator = new AgentRunCoordinator()
    const first = coordinator.begin()
    const second = coordinator.begin()

    expect(first.controller.signal.aborted).toBe(true)
    expect(coordinator.isActive(first)).toBe(false)
    expect(coordinator.isActive(second)).toBe(true)
    expect(() => coordinator.checkpoint(first)).toThrow(AgentRunCancelledError)
  })

  it('rejects late publication after cancellation while preserving prior work', () => {
    const coordinator = new AgentRunCoordinator()
    const lease = coordinator.begin()
    const published: string[] = ['completed-page']

    expect(coordinator.cancel(lease)).toBe(true)
    expect(coordinator.publish(lease, () => published.push('late-page'))).toBe(false)
    expect(published).toEqual(['completed-page'])
  })

  it('makes cancellation idempotent for StrictMode cleanup', () => {
    const coordinator = new AgentRunCoordinator()
    const lease = coordinator.begin()

    expect(coordinator.cancel(lease)).toBe(true)
    expect(coordinator.cancel(lease)).toBe(false)
    expect(lease.controller.signal.aborted).toBe(true)
  })

  it('does not let an old run finish the newer run', () => {
    const coordinator = new AgentRunCoordinator()
    const first = coordinator.begin()
    const second = coordinator.begin()

    coordinator.finish(first)
    expect(coordinator.isActive(second)).toBe(true)
  })

  it('recognizes cooperative and platform abort errors', () => {
    expect(isAgentRunCancelled(new AgentRunCancelledError())).toBe(true)
    expect(isAgentRunCancelled(new DOMException('stopped', 'AbortError'))).toBe(true)
    expect(isAgentRunCancelled(new Error('other'))).toBe(false)
  })

  it('prevents paid work after a cancellation checkpoint', () => {
    const coordinator = new AgentRunCoordinator()
    const lease = coordinator.begin()
    const paidCall = vi.fn()
    coordinator.cancel(lease)

    expect(() => {
      coordinator.checkpoint(lease)
      paidCall()
    }).toThrow(AgentRunCancelledError)
    expect(paidCall).not.toHaveBeenCalled()
  })
})

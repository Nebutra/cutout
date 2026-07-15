export class AgentRunCancelledError extends Error {
  constructor(message = 'Agent run cancelled') {
    super(message)
    this.name = 'AgentRunCancelledError'
  }
}

export interface AgentRunLease {
  readonly id: number
  readonly controller: AbortController
}

/**
 * Owns the single active workspace run. Starting a new run cooperatively
 * cancels the previous one; callers must checkpoint after every async boundary
 * before publishing state because native IPC cannot always be interrupted.
 */
export class AgentRunCoordinator {
  private active: AgentRunLease | null = null
  private nextId = 0

  begin(): AgentRunLease {
    this.active?.controller.abort('superseded')
    const lease = {
      id: ++this.nextId,
      controller: new AbortController(),
    }
    this.active = lease
    return lease
  }

  isActive(lease: AgentRunLease): boolean {
    return this.active === lease && !lease.controller.signal.aborted
  }

  checkpoint(lease: AgentRunLease): void {
    if (!this.isActive(lease)) throw new AgentRunCancelledError()
  }

  publish(lease: AgentRunLease, publisher: () => void): boolean {
    if (!this.isActive(lease)) return false
    publisher()
    return true
  }

  cancel(lease: AgentRunLease, reason = 'user'): boolean {
    if (this.active !== lease) return false
    lease.controller.abort(reason)
    this.active = null
    return true
  }

  finish(lease: AgentRunLease): void {
    if (this.active === lease) this.active = null
  }
}

export function isAgentRunCancelled(error: unknown): boolean {
  return error instanceof AgentRunCancelledError
    || (error instanceof DOMException && error.name === 'AbortError')
    || (error instanceof Error && error.name === 'AbortError')
}

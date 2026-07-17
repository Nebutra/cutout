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
  private readonly steerInbox = new Map<number, string[]>()

  begin(): AgentRunLease {
    if (this.active) {
      this.active.controller.abort('superseded')
      this.steerInbox.delete(this.active.id)
    }
    const lease = {
      id: ++this.nextId,
      controller: new AbortController(),
    }
    this.active = lease
    this.steerInbox.set(lease.id, [])
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

  /**
   * Queues a user correction for the exact active execution lease. Steers do
   * not abort work already in flight; the owner drains them at the next safe
   * model/tool boundary.
   */
  steer(lease: AgentRunLease, instruction: string): boolean {
    const normalized = instruction.trim()
    if (!normalized || !this.isActive(lease)) return false
    const inbox = this.steerInbox.get(lease.id)
    if (!inbox) return false
    inbox.push(normalized)
    return true
  }

  /** Drains pending corrections in arrival order for the exact active lease. */
  drainSteers(lease: AgentRunLease): readonly string[] {
    if (!this.isActive(lease)) return []
    const inbox = this.steerInbox.get(lease.id)
    if (!inbox?.length) return []
    return inbox.splice(0, inbox.length)
  }

  cancel(lease: AgentRunLease, reason = 'user'): boolean {
    if (this.active !== lease) return false
    lease.controller.abort(reason)
    this.active = null
    this.steerInbox.delete(lease.id)
    return true
  }

  finish(lease: AgentRunLease): void {
    if (this.active === lease) {
      this.active = null
      this.steerInbox.delete(lease.id)
    }
  }
}

export function isAgentRunCancelled(error: unknown): boolean {
  return error instanceof AgentRunCancelledError
    || (error instanceof DOMException && error.name === 'AbortError')
    || (error instanceof Error && error.name === 'AbortError')
}

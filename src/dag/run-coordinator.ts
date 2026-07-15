/** A lease for one active DAG execution. */
export interface DagRunLease {
  readonly controller: AbortController
}

/**
 * Coordinates plan and subtree executions so a late completion from a
 * superseded run cannot publish stale state.
 */
export class DagRunCoordinator {
  private active: DagRunLease | null = null

  begin(): DagRunLease {
    this.active?.controller.abort()
    const lease: DagRunLease = { controller: new AbortController() }
    this.active = lease
    return lease
  }

  isActive(lease: DagRunLease): boolean {
    return this.active === lease && !lease.controller.signal.aborted
  }

  finish(lease: DagRunLease): void {
    if (this.active === lease) this.active = null
  }

  cancel(lease: DagRunLease): void {
    lease.controller.abort()
    this.finish(lease)
  }
}

/** Cutout currently exposes one active workspace surface. */
export const dagRunCoordinator = new DagRunCoordinator()

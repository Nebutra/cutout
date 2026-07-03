/**
 * Map a planned node's Executor run status onto the four-state {@link NodeStatus}
 * that {@link NodeShell}'s dot understands (spec §6/§E). Kept in a plain module
 * (no components) so the node card files stay fast-refresh friendly.
 */
import type { DagNodeState, NodeStatus } from '@/store/types'

/** `running` → running · `done` → ready · `error` → error · else empty. */
export function toNodeStatus(state: DagNodeState | undefined): NodeStatus {
  switch (state?.status) {
    case 'running':
      return 'running'
    case 'done':
      return 'ready'
    case 'error':
      return 'error'
    default:
      return 'empty' // idle | blocked | undefined
  }
}

/**
 * NodeShell (spec §5) — the shared chrome every pipeline node wears: a calm,
 * opaque shadcn Card with a drag-handle header (stage badge + status dot) and
 * the React Flow connection handles. Node bodies stay `nodrag nowheel` so the
 * reused controls (sliders, grid, scroll) behave exactly as in the old panes.
 *
 * Kept dumb: it renders identity + status passed in; the concrete nodes own the
 * reused content. Handles live on the outer wrapper (not the Card) so the Card's
 * `overflow-hidden` never clips them.
 */
import type { ReactNode } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { NodeStatus } from '@/store/types'

/** CSS selector used as each node's React Flow `dragHandle`. */
export const NODE_DRAG_HANDLE = 'acs-node-drag'

const STATUS_DOT: Readonly<Record<NodeStatus, string>> = {
  empty: 'bg-muted-foreground/40',
  ready: 'bg-primary',
  running: 'bg-amber-500 animate-pulse',
  error: 'bg-destructive',
}

const HANDLE_CLASS =
  '!size-2.5 !border-2 !border-background !bg-border'

export interface NodeShellProps {
  /** The stage badge label (e.g. "素材板"). */
  readonly badge: ReactNode
  readonly status: NodeStatus
  /** Accessible name for the whole node card. */
  readonly ariaLabel: string
  /** Show a left target handle (a downstream stage receives an edge). */
  readonly hasTarget?: boolean
  /** Show a right source handle (an upstream stage emits an edge). */
  readonly hasSource?: boolean
  /** Fixed card width in pixels (chain cards keep a stable footprint). */
  readonly width?: number
  readonly children: ReactNode
}

export function NodeShell({
  badge,
  status,
  ariaLabel,
  hasTarget = false,
  hasSource = false,
  width = 440,
  children,
}: NodeShellProps) {
  return (
    <div className="relative" style={{ width }}>
      {hasTarget ? (
        <Handle
          type="target"
          position={Position.Left}
          className={HANDLE_CLASS}
        />
      ) : null}

      <Card size="sm" aria-label={ariaLabel} className="gap-0 py-0">
        <div
          className={cn(
            NODE_DRAG_HANDLE,
            'flex cursor-grab items-center justify-between gap-2 border-b border-border/60 px-3 py-2 active:cursor-grabbing',
          )}
        >
          <Badge variant="secondary">{badge}</Badge>
          <span
            aria-hidden
            className={cn('size-2 rounded-full', STATUS_DOT[status])}
          />
        </div>
        <div className="nodrag nowheel">{children}</div>
      </Card>

      {hasSource ? (
        <Handle
          type="source"
          position={Position.Right}
          className={HANDLE_CLASS}
        />
      ) : null}
    </div>
  )
}

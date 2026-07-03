/**
 * TransitionEdge (spec §5 / §7) — a directed edge that visualizes a stage
 * transition's state (idle / running / done). In P1 the only edge is
 * `board→slices` (`cutout`), driven by the existing analysis status: it animates
 * while the worker runs and settles to "done" once slices land. The pixel
 * pipeline is unchanged; the edge only reflects it.
 */
import { Trans } from '@lingui/react/macro'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
} from '@xyflow/react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { TransitionStatus } from '@/store/slices/pipeline'

/** Data carried by a transition edge (op kept for P2 genericity). */
export interface TransitionEdgeData extends Record<string, unknown> {
  readonly status: TransitionStatus
}

export type TransitionEdgeType = Edge<TransitionEdgeData, 'transition'>

const STROKE: Readonly<Record<TransitionStatus, string>> = {
  idle: 'var(--border)',
  running: 'var(--primary)',
  done: 'var(--primary)',
}

export function TransitionEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps) {
  const status: TransitionStatus =
    (data as TransitionEdgeData | undefined)?.status ?? 'idle'
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })

  return (
    <>
      <BaseEdge
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: STROKE[status],
          strokeWidth: status === 'idle' ? 1.5 : 2,
          strokeDasharray: status === 'running' ? '6 4' : undefined,
        }}
        className={cn(status === 'running' && 'animate-pulse')}
      />
      <EdgeLabelRenderer>
        <div
          className="pointer-events-none absolute"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          <Badge
            variant={status === 'idle' ? 'outline' : 'secondary'}
            className="bg-background"
          >
            <Trans id="pipeline.transition_cutout">Cutout</Trans>
            {status === 'running' ? (
              <span className="text-muted-foreground">
                {' · '}
                <Trans id="pipeline.status_running">Running</Trans>
              </span>
            ) : status === 'done' ? (
              <span className="text-muted-foreground">
                {' · '}
                <Trans id="pipeline.status_done">Done</Trans>
              </span>
            ) : null}
          </Badge>
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

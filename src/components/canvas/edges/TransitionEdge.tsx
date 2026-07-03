/**
 * TransitionEdge (spec §5 / §7) — a directed edge that visualizes a stage
 * transition's state (idle / running / done). The forward chain has three:
 * `generate` (brief→mockup), `deconstruct` (mockup→board) and `cutout`
 * (board→slices). Each animates while its step runs and settles to "done" when
 * the target artifact lands. The pixel pipeline is unchanged; edges only reflect
 * the store's derived status.
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
import type { Op } from '@/store/types'
import type { TransitionStatus } from '@/store/slices/pipeline'

/** Data carried by a transition edge: its op (for the label) and live status. */
export interface TransitionEdgeData extends Record<string, unknown> {
  readonly op: Op
  readonly status: TransitionStatus
}

export type TransitionEdgeType = Edge<TransitionEdgeData, 'transition'>

const STROKE: Readonly<Record<TransitionStatus, string>> = {
  idle: 'var(--border)',
  running: 'var(--primary)',
  done: 'var(--primary)',
}

/** The op's label — explicit per-op so Lingui can extract static ids. */
function OpLabel({ op }: { readonly op: Op }) {
  switch (op) {
    case 'generate':
      return <Trans id="pipeline.transition_generate">Generate</Trans>
    case 'deconstruct':
      return <Trans id="pipeline.transition_deconstruct">Deconstruct</Trans>
    default:
      return <Trans id="pipeline.transition_cutout">Cutout</Trans>
  }
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
  const edge = data as TransitionEdgeData | undefined
  const status: TransitionStatus = edge?.status ?? 'idle'
  const op: Op = edge?.op ?? 'cutout'
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
            <OpLabel op={op} />
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

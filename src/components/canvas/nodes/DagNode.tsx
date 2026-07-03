/**
 * DagNode (spec §6/§E) — the generic planned-node card for every op that has no
 * bespoke node: `edit-image` (mockup), `deconstruct` (board), `cutout` (slices)
 * and `name` (naming). It renders the planner's label + an op badge and mirrors
 * the node's live Executor state from the store (`dagNodes[id]`). The
 * `generate-image` design-system root gets its own {@link DesignSystemNode}.
 *
 * Calm/opaque per the UI rule — a plain shadcn card via NodeShell; the body is
 * the shared {@link DagNodePreview}.
 */
import { useLingui } from '@lingui/react/macro'
import type { NodeProps } from '@xyflow/react'
import { useStore } from '@/store'
import { NodeShell } from './NodeShell'
import { DagNodePreview, OpBadge } from './dag-node-common'
import { toNodeStatus } from './dag-node-status'
import type { DagRFNode } from '../materialize'

export function DagNode({ data }: NodeProps<DagRFNode>) {
  const { t } = useLingui()
  const { node, hasSource } = data
  const state = useStore((s) => s.dagNodes[node.id])

  return (
    <NodeShell
      badge={<OpBadge op={node.op} />}
      status={toNodeStatus(state)}
      ariaLabel={t({ id: 'dag.node_aria', message: `Planned node: ${node.label}` })}
      width={280}
      hasTarget={node.inputs.length > 0}
      hasSource={hasSource}
    >
      <div className="flex flex-col gap-2 p-3">
        <p className="truncate text-sm font-medium" title={node.label}>
          {node.label}
        </p>
        <DagNodePreview state={state} />
      </div>
    </NodeShell>
  )
}

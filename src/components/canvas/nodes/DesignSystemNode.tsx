/**
 * DesignSystemNode (spec §6/§E) — the planned `generate-image` root that designs
 * the shared style reference (palette, type, components) every screen 垫图s
 * against. It is the canonical head of a planned graph, so it gets a dedicated
 * card (a style/design-system framing) while still reading its live Executor
 * state from the store like any planned node. Its prompt (the style brief) is
 * shown so the user can see what look the graph is built on.
 *
 * Calm/opaque per the UI rule — a plain shadcn card via NodeShell.
 */
import { useLingui } from '@lingui/react/macro'
import type { NodeProps } from '@xyflow/react'
import { useStore } from '@/store'
import { NodeShell } from './NodeShell'
import { DagNodePreview, OpBadge } from './dag-node-common'
import { toNodeStatus } from './dag-node-status'
import type { DagRFNode } from '../materialize'

export function DesignSystemNode({ data }: NodeProps<DagRFNode>) {
  const { t } = useLingui()
  const { node, hasSource } = data
  const state = useStore((s) => s.dagNodes[node.id])

  return (
    <NodeShell
      badge={<OpBadge op={node.op} />}
      status={toNodeStatus(state)}
      ariaLabel={t({ id: 'dag.node_design_system_aria', message: 'Design-system node' })}
      width={300}
      hasSource={hasSource}
    >
      <div className="flex flex-col gap-2 p-3">
        <p className="truncate text-sm font-medium" title={node.label}>
          {node.label}
        </p>
        {node.prompt ? (
          <p className="line-clamp-2 text-xs text-muted-foreground" title={node.prompt}>
            {node.prompt}
          </p>
        ) : null}
        <DagNodePreview state={state} />
      </div>
    </NodeShell>
  )
}

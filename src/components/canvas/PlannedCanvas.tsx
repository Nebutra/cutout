/**
 * PlannedCanvas (spec §6/§E) — renders the AI-planned {@link GraphSpec} once a
 * requirement has been planned: a layered design-system → fan-out → per-screen
 * graph of `designSystem` + `dagOp` nodes wired by dependency edges. Each node
 * reads its own live Executor state from the store, so a run streams progress
 * without re-materializing the graph. A header panel returns to the linear chain
 * (the P1 board-import path), which drops the planned graph.
 *
 * Aesthetic per the project UI rule: a flat, OPAQUE background, plain Controls +
 * MiniMap. No neon / translucency.
 */
import { useMemo } from 'react'
import { Undo2 } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { GraphSpec } from '@/dag/graph-spec'
import { useStore } from '@/store'
import { Button } from '@/components/ui/button'
import { DagNode } from './nodes/DagNode'
import { DesignSystemNode } from './nodes/DesignSystemNode'
import { materializeGraph } from './materialize'

/** Stable node-type map (must not be re-created each render). */
const nodeTypes: NodeTypes = {
  designSystem: DesignSystemNode,
  dagOp: DagNode,
}

const FIT_VIEW_OPTIONS = { padding: 0.18 } as const

export function PlannedCanvas({ graph }: { readonly graph: GraphSpec }) {
  const { t } = useLingui()
  const clearGraph = useStore((s) => s.clearGraph)

  // The node/edge SET is a pure function of the spec — stable across a run.
  const materialized = useMemo(() => materializeGraph(graph), [graph])
  const [nodes, , onNodesChange] = useNodesState(materialized.nodes)

  return (
    <ReactFlow
      nodes={nodes}
      edges={materialized.edges}
      onNodesChange={onNodesChange}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={FIT_VIEW_OPTIONS}
      minZoom={0.3}
      maxZoom={1.5}
      nodesConnectable={false}
      deleteKeyCode={null}
      aria-label={t({ id: 'dag.canvas_aria', message: 'Planned pipeline canvas' })}
      className="bg-background"
    >
      <Panel position="top-left">
        <Button variant="outline" size="sm" onClick={clearGraph}>
          <Undo2 />
          <Trans id="dag.back_to_linear">Back to the linear chain</Trans>
        </Button>
      </Panel>
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border)" />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable className="!bg-card" />
    </ReactFlow>
  )
}

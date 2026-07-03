/**
 * PipelineCanvas (spec §5) — the React Flow host that replaces WorkspaceLayout.
 *
 * Renders the store's pipeline topology as a left→right chain of custom shadcn
 * card nodes (board · slices) wired by a `TransitionEdge`. React Flow owns the
 * view (pan/zoom/positions, drag by each card's header handle); the Zustand
 * store stays the source of truth for artifacts + status, which the nodes read
 * directly. The `board→slices` edge reflects the live analysis run (§7).
 *
 * Aesthetic per the project UI rule: a flat, OPAQUE background (a subtle border
 * dot grid — not dotted-glass), plain Controls + MiniMap. No neon / translucency.
 */
import { useMemo } from 'react'
import { useLingui } from '@lingui/react/macro'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  MarkerType,
  useNodesState,
  type Edge,
  type Node,
  type NodeTypes,
  type EdgeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useStore } from '@/store'
import { selectCutoutStatus } from '@/store/slices/pipeline'
import { positionFor } from './layout'
import { NODE_DRAG_HANDLE } from './nodes/NodeShell'
import { BoardNode } from './nodes/BoardNode'
import { SlicesNode } from './nodes/SlicesNode'
import { TransitionEdge } from './edges/TransitionEdge'

/** Stable maps (spec: node/edge types must not be re-created each render). */
const nodeTypes: NodeTypes = { board: BoardNode, slices: SlicesNode }
const edgeTypes: EdgeTypes = { transition: TransitionEdge }

const FIT_VIEW_OPTIONS = { padding: 0.18 } as const

export function PipelineCanvas() {
  const { t } = useLingui()
  const topology = useStore((s) => s.pipeline)
  const cutoutStatus = useStore(selectCutoutStatus)

  // Positions are layout-driven but the cards stay draggable by their header.
  const initialNodes = useMemo<Node[]>(
    () =>
      topology.nodes.map((node) => ({
        id: node.id,
        type: node.kind,
        position: positionFor(node.id),
        dragHandle: `.${NODE_DRAG_HANDLE}`,
        data: {},
      })),
    [topology.nodes],
  )
  const [nodes, , onNodesChange] = useNodesState(initialNodes)

  // Edges are display-only in P1; status is derived from the analysis run.
  const edges = useMemo<Edge[]>(
    () =>
      topology.transitions.map((transition) => ({
        id: transition.id,
        source: transition.source,
        target: transition.target,
        type: 'transition',
        data: { status: cutoutStatus },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
          color: cutoutStatus === 'idle' ? 'var(--border)' : 'var(--primary)',
        },
      })),
    [topology.transitions, cutoutStatus],
  )

  return (
    <div className="min-h-0 flex-1 bg-background">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
        minZoom={0.4}
        maxZoom={1.5}
        nodesConnectable={false}
        deleteKeyCode={null}
        aria-label={t({ id: 'pipeline.canvas_aria', message: 'Pipeline canvas' })}
        className="bg-background"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="var(--border)"
        />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable className="!bg-card" />
      </ReactFlow>
    </div>
  )
}

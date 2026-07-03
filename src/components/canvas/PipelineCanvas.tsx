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
import {
  selectCutoutStatus,
  selectDeconstructStatus,
  selectGenerateStatus,
  type TransitionStatus,
} from '@/store/slices/pipeline'
import type { Op } from '@/store/types'
import { positionFor } from './layout'
import { NODE_DRAG_HANDLE } from './nodes/NodeShell'
import { BriefNode } from './nodes/BriefNode'
import { MockupNode } from './nodes/MockupNode'
import { BoardNode } from './nodes/BoardNode'
import { SlicesNode } from './nodes/SlicesNode'
import { TransitionEdge } from './edges/TransitionEdge'

/** Stable maps (spec: node/edge types must not be re-created each render). */
const nodeTypes: NodeTypes = {
  brief: BriefNode,
  mockup: MockupNode,
  board: BoardNode,
  slices: SlicesNode,
}
const edgeTypes: EdgeTypes = { transition: TransitionEdge }

const FIT_VIEW_OPTIONS = { padding: 0.16 } as const

export function PipelineCanvas() {
  const { t } = useLingui()
  const topology = useStore((s) => s.pipeline)
  const generateStatus = useStore(selectGenerateStatus)
  const deconstructStatus = useStore(selectDeconstructStatus)
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

  // Edges are display-only; each transition's status is derived from the store.
  const edges = useMemo<Edge[]>(() => {
    // Live status per op (single source of truth = store); non-P2 ops stay idle.
    const statusByOp: Readonly<Record<Op, TransitionStatus>> = {
      generate: generateStatus,
      deconstruct: deconstructStatus,
      cutout: cutoutStatus,
      compose: 'idle',
      name: 'idle',
    }
    return topology.transitions.map((transition) => {
      const status = statusByOp[transition.op]
      return {
        id: transition.id,
        source: transition.source,
        target: transition.target,
        type: 'transition',
        data: { op: transition.op, status },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
          color: status === 'idle' ? 'var(--border)' : 'var(--primary)',
        },
      }
    })
  }, [topology.transitions, generateStatus, deconstructStatus, cutoutStatus])

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

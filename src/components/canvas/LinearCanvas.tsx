/**
 * LinearCanvas (spec §5) — the fixed forward chain (brief · mockup · board ·
 * slices) rendered as a left→right run of custom shadcn card nodes wired by a
 * `TransitionEdge`. This is the default view (and the P1 board-import path); the
 * planned-graph view ({@link PlannedCanvas}) replaces it once a requirement is
 * planned. React Flow owns the view; the Zustand store stays the source of truth
 * for artifacts + status, which the nodes read directly.
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
import { useFlowColorMode } from './useFlowColorMode'

/** Stable maps (spec: node/edge types must not be re-created each render). */
const nodeTypes: NodeTypes = {
  brief: BriefNode,
  mockup: MockupNode,
  board: BoardNode,
  slices: SlicesNode,
}
const edgeTypes: EdgeTypes = { transition: TransitionEdge }

const FIT_VIEW_OPTIONS = { padding: 0.16 } as const

export function LinearCanvas() {
  const { t } = useLingui()
  const flowColorMode = useFlowColorMode()
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
      colorMode={flowColorMode}
      aria-label={t({ id: 'pipeline.canvas_aria', message: 'Pipeline canvas' })}
      className="bg-background"
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border)" />
      <Controls showInteractive={false} />
      <MiniMap
        pannable
        zoomable
        bgColor="var(--card)"
        maskColor="var(--background)"
        nodeColor="var(--muted-foreground)"
        nodeStrokeColor="var(--border)"
      />
    </ReactFlow>
  )
}

/**
 * Materialization (spec §6/§E) — turn a planned {@link GraphSpec} into React
 * Flow nodes + dependency edges. Node TYPE is chosen by op: the `generate-image`
 * root becomes a `designSystem` node, everything else a generic `dagOp` node.
 * Positions come from the layered {@link layoutGraph} so the graph reads
 * left→right. Edges mirror the spec's data dependencies.
 *
 * Pure + stable: the node/edge SET depends only on the spec (not on run status),
 * so a run never re-materializes — each node subscribes to its own store state.
 * The store owns artifacts/status; React Flow owns these positions.
 */
import { MarkerType, type Edge, type Node } from '@xyflow/react'
import type { GraphNodeSpec, GraphSpec } from '@/dag/graph-spec'
import { NODE_DRAG_HANDLE } from './nodes/NodeShell'
import { layoutGraph } from './dag-layout'

/** Data each planned React Flow node carries: its spec + whether it emits edges. */
export type DagRFData = {
  readonly node: GraphNodeSpec
  readonly hasSource: boolean
} & Record<string, unknown>

/** A planned React Flow node (consumed by DagNode / DesignSystemNode). */
export type DagRFNode = Node<DagRFData>

/** React Flow node-type key for a planned node, chosen by its op. */
function typeForOp(op: GraphNodeSpec['op']): 'designSystem' | 'dagOp' {
  return op === 'generate-image' ? 'designSystem' : 'dagOp'
}

/** Map a validated spec to positioned React Flow nodes + dependency edges. */
export function materializeGraph(spec: GraphSpec): {
  readonly nodes: DagRFNode[]
  readonly edges: Edge[]
} {
  const positions = layoutGraph(spec)
  const emitters = new Set(spec.edges.map((edge) => edge.from))

  const nodes: DagRFNode[] = spec.nodes.map((node) => ({
    id: node.id,
    type: typeForOp(node.op),
    position: positions.get(node.id) ?? { x: 0, y: 0 },
    dragHandle: `.${NODE_DRAG_HANDLE}`,
    data: { node, hasSource: emitters.has(node.id) },
  }))

  const edges: Edge[] = spec.edges.map((edge) => ({
    id: `${edge.from}->${edge.to}`,
    source: edge.from,
    target: edge.to,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 16,
      height: 16,
      color: 'var(--border)',
    },
  }))

  return { nodes, edges }
}

/**
 * Layered DAG layout (spec §6/§E) — deterministic left→right placement for a
 * planned {@link GraphSpec}. No dagre: a node's LAYER is the longest dependency
 * path from any root (so every edge points strictly rightward), and its row is
 * its order within that layer. This gives the canonical design-system → fan-out
 * → per-screen-chain shape a clean, readable topology.
 *
 * Pure: reads a spec, returns a position per node id. The store owns
 * artifacts/status; React Flow owns these positions.
 */
import type { GraphSpec } from '@/dag/graph-spec'
import type { NodePosition } from './layout'

/** Horizontal stride between successive layers (card width + gutter). */
export const DAG_STEP_X = 340

/** Vertical stride between rows within a layer. */
export const DAG_STEP_Y = 240

/** Top / left insets so the graph sits clear of the canvas edges. */
const ORIGIN_X = 24
const ORIGIN_Y = 24

/**
 * The layer (0-based longest path from a root) of every node. Computed over the
 * validated spec, so a simple memoized DFS terminates (the graph is acyclic).
 */
function layerOf(spec: GraphSpec): ReadonlyMap<string, number> {
  const inputs = new Map<string, readonly string[]>(
    spec.nodes.map((n) => [n.id, n.inputs]),
  )
  const memo = new Map<string, number>()

  const depth = (id: string): number => {
    const cached = memo.get(id)
    if (cached !== undefined) return cached
    const ups = inputs.get(id) ?? []
    const value =
      ups.length === 0 ? 0 : Math.max(...ups.map((u) => depth(u) + 1))
    memo.set(id, value)
    return value
  }

  return new Map(spec.nodes.map((n) => [n.id, depth(n.id)]))
}

/**
 * Position every node in the spec: `x` by layer, `y` by row within the layer.
 * Row order follows the spec's node order, keeping the layout stable across runs.
 */
export function layoutGraph(spec: GraphSpec): ReadonlyMap<string, NodePosition> {
  const layers = layerOf(spec)
  const rowByLayer = new Map<number, number>()
  const positions = new Map<string, NodePosition>()

  for (const node of spec.nodes) {
    const layer = layers.get(node.id) ?? 0
    const row = rowByLayer.get(layer) ?? 0
    rowByLayer.set(layer, row + 1)
    positions.set(node.id, {
      x: ORIGIN_X + layer * DAG_STEP_X,
      y: ORIGIN_Y + row * DAG_STEP_Y,
    })
  }

  return positions
}

/**
 * Canvas layout (spec §5) — deterministic left→right placement for the linear
 * chain. No dagre in V1: the pipeline is a fixed short chain, so a stage's x is
 * just its position in the ordered chain. The store owns artifacts/status; React
 * Flow owns these positions.
 */
import type { PipelineNode } from '@/store/types'
import {
  BRIEF_NODE_ID,
  MOCKUP_NODE_ID,
  BOARD_NODE_ID,
  SLICES_NODE_ID,
} from '@/store/slices/pipeline'

/** A view-space position for a canvas node. */
export interface NodePosition {
  readonly x: number
  readonly y: number
}

/** Horizontal stride between successive stages (card width + gutter). */
export const CHAIN_STEP_X = 560

/** Common top offset so cards sit clear of the canvas top edge. */
export const CHAIN_Y = 24

/** The forward order of the chain; a node's index drives its x. */
const CHAIN_ORDER: readonly string[] = [
  BRIEF_NODE_ID,
  MOCKUP_NODE_ID,
  BOARD_NODE_ID,
  SLICES_NODE_ID,
]

/** Deterministic position for a node id (falls back to append at the end). */
export function positionFor(id: string): NodePosition {
  const index = CHAIN_ORDER.indexOf(id)
  const slot = index === -1 ? CHAIN_ORDER.length : index
  return { x: 24 + slot * CHAIN_STEP_X, y: CHAIN_Y }
}

/** Map pipeline nodes to their laid-out positions (stable, left→right). */
export function layoutNodes(
  nodes: readonly PipelineNode[],
): ReadonlyMap<string, NodePosition> {
  return new Map(nodes.map((node) => [node.id, positionFor(node.id)]))
}

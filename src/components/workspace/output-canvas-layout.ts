import { MarkerType, Position, type Edge, type Node } from '@xyflow/react'
import type { MaterialRef } from '@/agent-runtime/material-impact'
import { derivedMaterialLinks } from './deliverable-graph'

export interface CanvasImageItem {
  readonly id: string
  readonly label: string
  readonly blob?: Blob
  readonly url?: string
  readonly material: MaterialRef
  readonly pageId?: string
  readonly evidenceMaterialId?: string
  readonly revisionId?: string
  /** A task card has no bitmap yet; a ready artifact replaces it by the same id. */
  readonly status?: 'queued' | 'generating' | 'failed'
  readonly statusDetail?: string
}

export interface CanvasLane {
  readonly key: string
  readonly title: string
  readonly items: readonly CanvasImageItem[]
  readonly perRow: number
}

const CARD_W = 208
const CARD_H = 178
const CARD_GAP = 18
const LANE_GAP = 40
const BAND_PAD_X = 16
const BAND_PAD_TOP = 42
const BAND_PAD_BOTTOM = 16

/** Build zone-band and card nodes, stacking non-empty lanes top-to-bottom. */
export function buildOutputCanvasNodes(
  lanes: readonly CanvasLane[],
  selectedMaterialId: string | null,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []
  let y = 0
  let designSystemNodeId: string | null = null
  const nodeByMaterialId = new Map<string, string>()

  for (const lane of lanes) {
    if (lane.items.length === 0) continue

    const cols = Math.min(lane.items.length, lane.perRow)
    const rows = Math.ceil(lane.items.length / lane.perRow)
    const contentW = cols * CARD_W + (cols - 1) * CARD_GAP
    const contentH = rows * CARD_H + (rows - 1) * CARD_GAP
    const bandW = contentW + BAND_PAD_X * 2
    const bandH = BAND_PAD_TOP + contentH + BAND_PAD_BOTTOM

    nodes.push({
      id: `zone-${lane.key}`,
      type: 'zoneBand',
      position: { x: 0, y },
      data: { title: lane.title, count: lane.items.length, width: bandW, height: bandH },
      draggable: false,
      selectable: false,
      className: 'pointer-events-none',
      zIndex: 0,
    })

    lane.items.forEach((item, index) => {
      const col = index % lane.perRow
      const row = Math.floor(index / lane.perRow)
      const nodeId = `${lane.key}:${item.id}`
      nodes.push({
        id: nodeId,
        type: 'outputCard',
        position: {
          x: BAND_PAD_X + col * (CARD_W + CARD_GAP),
          y: y + BAND_PAD_TOP + row * (CARD_H + CARD_GAP),
        },
        data: { item, selected: item.material.id === selectedMaterialId },
        draggable: false,
        zIndex: 1,
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
      })
      nodeByMaterialId.set(item.material.id, nodeId)
      if (lane.key === 'pages' && designSystemNodeId) {
        edges.push({
          id: `edge-${designSystemNodeId}-${nodeId}`,
          source: designSystemNodeId,
          target: nodeId,
          type: 'smoothstep',
          style: { stroke: 'var(--border)' },
          markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: 'var(--border)' },
        })
      }
    })

    if (lane.key === 'design') designSystemNodeId = `design:${lane.items[0].id}`
    y += bandH + LANE_GAP
  }

  for (const link of derivedMaterialLinks(lanes.flatMap((lane) => lane.items.map((item) => item.material)))) {
    const source = nodeByMaterialId.get(link.sourceId)
    const target = nodeByMaterialId.get(link.targetId)
    if (source && target) {
      edges.push({
        id: `edge-derived-${source}-${target}`,
        source,
        target,
        type: 'smoothstep',
        style: { stroke: 'var(--border)' },
        markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: 'var(--border)' },
      })
    }
  }

  return { nodes, edges }
}

/**
 * OutputCanvas — a CONSTRAINED infinite canvas for orchestrating results + materials.
 *
 * It feels like an infinite canvas (free pan/zoom, spatial layout) but is governed
 * by function + category: content is auto-arranged into fixed, VISIBLE semantic
 * ZONES (Design system · Prototype flow · Assets & materials) rather than freely
 * dragged, so the board never sprawls or turns chaotic. The user reads results;
 * they don't manage layout. Reuses the app's `@xyflow/react` canvas stack.
 *
 * Decoupled by design: callers map their artifacts to plain {@link CanvasImageItem}s,
 * so this component depends on no pipeline types. Nodes are non-draggable; the only
 * freedom is pan/zoom + fit, and the view auto-refits as content streams in.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  MarkerType,
  Position,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
  type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ImageOff } from 'lucide-react'
import { ImageZoom } from '@/components/canvas/nodes/ImageZoom'
import { useFlowColorMode } from '@/components/canvas/useFlowColorMode'

/** One image to place on the board (blob is decoded to a URL lazily). */
export interface CanvasImageItem {
  readonly id: string
  readonly label: string
  readonly blob?: Blob
  readonly url?: string
}

export interface OutputCanvasProps {
  readonly designSystem: CanvasImageItem | null
  readonly pages: readonly CanvasImageItem[]
  readonly assets: readonly CanvasImageItem[]
}

/* --- Layout constants (the "constraint": fixed zones + grid, not free drag) --- */
const CARD_W = 208
const CARD_H = 178
const CARD_GAP = 18
const LANE_GAP = 40
const BAND_PAD_X = 16
const BAND_PAD_TOP = 42 // room for the zone header
const BAND_PAD_BOTTOM = 16
const ASSETS_PER_ROW = 4
const PAGES_PER_ROW = 6

interface CardData {
  readonly item: CanvasImageItem
  readonly [key: string]: unknown
}
interface BandData {
  readonly title: string
  readonly count: number
  readonly width: number
  readonly height: number
  readonly [key: string]: unknown
}

/** Lazily turn an item's blob into an object URL (or use its ready url). */
function useItemUrl(item: CanvasImageItem): string | null {
  const [url, setUrl] = useState<string | null>(item.url ?? null)
  useEffect(() => {
    if (item.url) {
      setUrl(item.url)
      return
    }
    if (!item.blob) {
      setUrl(null)
      return
    }
    const next = URL.createObjectURL(item.blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [item.url, item.blob])
  return url
}

function CardNode({ data }: NodeProps) {
  const { item } = data as CardData
  const url = useItemUrl(item)
  return (
    <div
      className="flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-colors hover:border-ring/50"
      style={{ width: CARD_W }}
    >
      <div className="flex h-32 items-center justify-center overflow-hidden bg-muted/20">
        {url ? (
          <ImageZoom src={url} label={item.label} />
        ) : (
          <ImageOff className="size-5 text-muted-foreground opacity-70" />
        )}
      </div>
      <p className="truncate border-t border-border/60 px-2 py-1.5 text-[11px] text-muted-foreground">
        {item.label}
      </p>
    </div>
  )
}

/** A visible zone container — the "governance": each category sits in its band. */
function ZoneBandNode({ data }: NodeProps) {
  const { title, count, width, height } = data as BandData
  return (
    <div
      className="rounded-2xl border border-border/60 bg-muted/10"
      style={{ width, height }}
    >
      <div className="flex items-center gap-2 px-4 pt-3">
        <span className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
          {title}
        </span>
        <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground tabular-nums">
          {count}
        </span>
      </div>
    </div>
  )
}

const nodeTypes: NodeTypes = { outputCard: CardNode, zoneBand: ZoneBandNode }
const FIT_VIEW_OPTIONS = { padding: 0.16 } as const

interface Lane {
  readonly key: string
  readonly title: string
  readonly items: readonly CanvasImageItem[]
  readonly perRow: number
}

/** Build zone-band + card nodes, stacking non-empty lanes top-to-bottom. */
function buildNodes(lanes: readonly Lane[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []
  let y = 0
  let designSystemNodeId: string | null = null

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
        data: { item },
        draggable: false,
        zIndex: 1,
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
      })
      if (lane.key === 'pages' && designSystemNodeId) {
        edges.push({
          id: `edge-${designSystemNodeId}-${nodeId}`,
          source: designSystemNodeId,
          target: nodeId,
          type: 'smoothstep',
          style: { stroke: 'var(--border)' },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 12,
            height: 12,
            color: 'var(--border)',
          },
        })
      }
    })

    if (lane.key === 'design') {
      designSystemNodeId = `design:${lane.items[0].id}`
    }

    y += bandH + LANE_GAP
  }

  return { nodes, edges }
}

export function OutputCanvas({ designSystem, pages, assets }: OutputCanvasProps) {
  const colorMode = useFlowColorMode()
  const [instance, setInstance] = useState<ReactFlowInstance | null>(null)

  const { nodes, edges } = useMemo(() => {
    const lanes: Lane[] = [
      {
        key: 'design',
        title: 'Design system',
        items: designSystem ? [designSystem] : [],
        perRow: 1,
      },
      { key: 'pages', title: 'Prototype flow', items: pages, perRow: PAGES_PER_ROW },
      {
        key: 'assets',
        title: 'Assets & materials',
        items: assets,
        perRow: ASSETS_PER_ROW,
      },
    ]
    return buildNodes(lanes)
  }, [designSystem, pages, assets])

  // Keep the board framed as content streams in (fitView only fits once by itself).
  useEffect(() => {
    if (!instance) return
    const timer = setTimeout(() => instance.fitView(FIT_VIEW_OPTIONS), 0)
    return () => clearTimeout(timer)
  }, [instance, nodes.length])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onInit={setInstance}
      fitView
      fitViewOptions={FIT_VIEW_OPTIONS}
      minZoom={0.2}
      maxZoom={1.6}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      onlyRenderVisibleElements
      deleteKeyCode={null}
      proOptions={{ hideAttribution: true }}
      colorMode={colorMode}
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

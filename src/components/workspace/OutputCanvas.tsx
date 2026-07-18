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
 * freedom is pan/zoom + fit. The first result set is framed automatically;
 * streamed results preserve the user's viewport.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Handle,
  MiniMap,
  Panel,
  Position,
  type NodeProps,
  type NodeTypes,
  type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Ban, Boxes, CheckCircle2, ChevronUp, Circle, DownloadCloud, GitBranch, Heart, ImageOff, ImagePlus, LoaderCircle, Lock, Maximize, MessageSquare, Minus, MousePointer2, MoveUpRight, Pencil, Plus, Scan, Slash, Sparkles, Square, StickyNote, Type, WandSparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CreativeBranchRequest, CreativeVariantDecision } from '@/agent-runtime/creative-board-decisions'
import type { MaterialRef } from '@/agent-runtime/material-impact'
import { useFlowColorMode } from '@/components/canvas/useFlowColorMode'
import {
  createNoteAnnotation,
  createShapeAnnotation,
  createStrokeAnnotation,
  createTextAnnotation,
  type CanvasAnnotation,
  type ShapeVariant,
  type StrokeVariant,
} from './canvas-annotations'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  consumeCanvasAutoFit,
  initialCanvasViewportState,
  projectCanvasSafeArea,
  projectVisiblePanelInsets,
  visiblyOccupiesSpace,
  projectCanvasOverlayAnchor,
  shouldConsumeFocusRequest,
  transitionCanvasPanels,
  type CanvasSafeArea,
} from './output-canvas-viewport'
import { PromotionPanel } from '@/components/structured-authoring/PromotionPanel'
import type { StructuredPromotion } from '@/structured-authoring'
import { fullImageBounds, normalizeRegionBounds, regionOverlayStyle, type Point, type RegionBounds } from './output-region-selection'
import { buildOutputCanvasNodes, type CanvasImageItem, type CanvasLane } from './output-canvas-layout'

export type { CanvasImageItem } from './output-canvas-layout'

/** One image to place on the board (blob is decoded to a URL lazily). */
export interface OutputCanvasProps {
  readonly designSystem: CanvasImageItem | null
  readonly pages: readonly CanvasImageItem[]
  readonly assets: readonly CanvasImageItem[]
  readonly pendingDesignSystem?: CanvasImageItem | null
  readonly pendingPages?: readonly CanvasImageItem[]
  readonly pendingAssets?: readonly CanvasImageItem[]
  /** Artifact id requested by an external outcome/navigation surface. */
  readonly focusArtifactId?: string | null
  /** Changes for every explicit navigation request, even when the id repeats. */
  readonly focusRequestId?: number
  readonly selectedMaterialId?: string | null
  readonly onSelectMaterial?: (material: MaterialRef) => void
  readonly onRequestMaterialChanges?: (material: MaterialRef) => void
  readonly variantDecision?: CreativeVariantDecision
  readonly onVariantDecision?: (decision: 'favorite' | 'rejected') => void
  readonly onToggleReferenceLock?: () => void
  readonly onMoreLikeThis?: (material: MaterialRef) => void
  readonly branchRequestCount?: number
  readonly creativeBranches?: readonly CreativeBranchRequest[]
  readonly onPromoteRegion?: (request: RegionPromotionRequest) => void
  readonly onSaveToLibrary?: (item: CanvasImageItem) => void
  readonly showMinimap?: boolean
  readonly showGrid?: boolean
  readonly background?: string | null
  readonly emptyHint?: string
  readonly toolbar?: React.ReactNode
  readonly actions?: {
    readonly onImport?: () => void
    readonly onAskAgent?: () => void
    readonly onExportAll?: () => void
    readonly exportDisabled?: boolean
  }
  readonly annotations?: readonly CanvasAnnotation[]
  readonly onAnnotationsChange?: (annotations: readonly CanvasAnnotation[]) => void
  readonly librarySavedMaterialIds?: ReadonlySet<string>
}

export interface RegionPromotionRequest {
  readonly kind: StructuredPromotion['kind']
  readonly selection: StructuredPromotion['selection']
}

/* --- Layout constants (the "constraint": fixed zones + grid, not free drag) --- */
const CARD_W = 208
const ASSETS_PER_ROW = 4
const PAGES_PER_ROW = 6

interface CardData {
  readonly item: CanvasImageItem
  readonly selected: boolean
  readonly [key: string]: unknown
}
interface BandData {
  readonly title: string
  readonly count: number
  readonly width: number
  readonly height: number
  readonly [key: string]: unknown
}

function mergeTaskCards(
  pending: readonly CanvasImageItem[],
  ready: readonly CanvasImageItem[],
): readonly CanvasImageItem[] {
  const readyById = new Map(ready.map((item) => [item.id, item]));
  const merged = pending.map((item) => readyById.get(item.id) ?? item);
  const known = new Set(merged.map((item) => item.id));
  return [...merged, ...ready.filter((item) => !known.has(item.id))];
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
  const { item, selected } = data as CardData
  const url = useItemUrl(item)
  const taskStatus = item.status
  // A click selects the material for the Agent; double-click keeps the larger
  // visual preview available without conflating inspection with selection.
  return (
    <div
      title={item.label}
      aria-selected={selected}
      className={cn(
        'relative flex cursor-pointer flex-col overflow-visible rounded-lg border bg-card shadow-sm transition-colors hover:border-ring/60',
        selected ? 'border-ring ring-2 ring-ring/30' : 'border-border',
      )}
      style={{ width: CARD_W }}
    >
      <Handle type="target" position={Position.Top} className="!size-2 !border-background !bg-border" />
      <div className="flex h-32 items-center justify-center overflow-hidden rounded-t-lg bg-muted/20">
        {url ? (
          <img src={url} alt="" className="max-h-full max-w-full object-contain" />
        ) : taskStatus === 'generating' ? (
          <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
        ) : taskStatus === 'failed' ? (
          <Ban className="size-5 text-destructive" />
        ) : (
          <ImageOff className="size-5 text-muted-foreground opacity-70" />
        )}
      </div>
      <p className="w-full truncate border-t border-border/60 px-2 py-1.5 text-[11px] text-muted-foreground">
        {item.label}
      </p>
      <div className="flex items-center justify-between gap-2 border-t border-border/40 px-2 py-1 text-[10px] text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1"><GitBranch className="size-3" /><span className="truncate">{item.material.version}</span></span>
        {taskStatus ? <span className={cn('flex items-center gap-1', taskStatus === 'failed' ? 'text-destructive' : 'text-muted-foreground')}><Circle className={cn('size-3', taskStatus === 'generating' && 'animate-pulse')} />{item.statusDetail ?? (taskStatus === 'generating' ? 'Generating' : taskStatus === 'queued' ? 'Queued' : 'Failed')}</span> : item.healthDetail ? <span className="flex min-w-0 items-center gap-1 text-amber-600 dark:text-amber-400"><Circle className="size-3 shrink-0" /><span className="truncate">{item.healthDetail}</span></span> : <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="size-3" />Ready</span>}
      </div>
      <Handle type="source" position={Position.Bottom} className="!size-2 !border-background !bg-border" />
    </div>
  )
}

/** Enlarge preview — opened by clicking a card. Owns its own object URL. */
function CardPreviewDialog({
  item,
  onOpenChange,
  onPromoteRegion,
}: {
  readonly item: CanvasImageItem | null
  readonly onOpenChange: (open: boolean) => void
  readonly onPromoteRegion?: (request: RegionPromotionRequest) => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [selection, setSelection] = useState<StructuredPromotion['selection'] | undefined>()
  const [draftBounds, setDraftBounds] = useState<RegionBounds | null>(null)
  const [imageReady, setImageReady] = useState(false)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const dragRef = useRef<{ x: number; y: number } | null>(null)
  useEffect(() => {
    if (!item) {
      setUrl(null)
      return
    }
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
  }, [item])
  useEffect(() => { setSelecting(false); setSelection(undefined); setDraftBounds(null); setImageReady(false); dragRef.current = null }, [item])
  useEffect(() => {
    if (!item) return
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (selection || selecting) event.preventDefault()
      setSelecting(false)
      setSelection(undefined)
      setDraftBounds(null)
      dragRef.current = null
    }
    window.addEventListener('keydown', cancel)
    return () => window.removeEventListener('keydown', cancel)
  }, [item, selecting, selection])

  const boundsFor = (start: Point, end: Point) => {
    const image = imageRef.current
    if (!image) return null
    const rect = image.getBoundingClientRect()
    return normalizeRegionBounds(start, end, { left: rect.left, top: rect.top, width: rect.width, height: rect.height, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight })
  }
  const commitBounds = (start: Point, end: Point) => {
    if (!item) return
    const bounds = boundsFor(start, end)
    setDraftBounds(null)
    if (bounds) setSelection(selectionFor(item, bounds))
  }
  const selectFullImage = () => {
    const image = imageRef.current
    if (!image || !item) return
    const bounds = fullImageBounds(image.naturalWidth, image.naturalHeight)
    if (bounds) setSelection(selectionFor(item, bounds))
  }
  const hasEvidence = Boolean(item?.pageId && item.evidenceMaterialId && item.revisionId)
  const visibleBounds = selection?.bounds ?? draftBounds

  return (
    <Dialog open={item !== null} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="w-fit max-w-[94vw] gap-0 p-2">
        <DialogTitle className="sr-only">{item?.label ?? 'Preview'}</DialogTitle>
        {url ? (
          <div className="grid max-h-[92vh] gap-2 overflow-y-auto">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-1"><p className="min-w-0 flex-1 truncate text-sm font-semibold">{item?.label}</p><div className="flex flex-wrap gap-1"><Button type="button" size="sm" variant={selecting ? 'secondary' : 'outline'} aria-pressed={selecting} disabled={!imageReady || !hasEvidence} onClick={() => { setSelecting((value) => !value); setSelection(undefined); setDraftBounds(null) }}><Scan /> Select region</Button><Button type="button" size="sm" variant="outline" disabled={!imageReady || !hasEvidence} onClick={selectFullImage}>Use full image</Button></div></div>
            {!hasEvidence ? <p className="px-1 text-xs text-muted-foreground">Structured promotion requires an authoritative page and revision.</p> : null}
            <div className={cn('relative touch-none', selecting && 'cursor-crosshair')} onPointerDown={(event) => { if (!selecting) return; event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { x: event.clientX, y: event.clientY }; setSelection(undefined); setDraftBounds(null) }} onPointerMove={(event) => { if (!selecting || !dragRef.current) return; setDraftBounds(boundsFor(dragRef.current, { x: event.clientX, y: event.clientY })) }} onPointerCancel={() => { dragRef.current = null; setDraftBounds(null) }} onPointerUp={(event) => { if (!selecting || !dragRef.current) return; commitBounds(dragRef.current, { x: event.clientX, y: event.clientY }); dragRef.current = null }}>
              <img ref={imageRef} src={url} alt="" draggable={false} onLoad={() => setImageReady(true)} className="max-h-[72vh] max-w-[90vw] rounded-md object-contain" />
              {visibleBounds && imageRef.current ? <div aria-label={selection ? 'Selected image region' : 'Selecting image region'} className="pointer-events-none absolute border-2 border-ring bg-ring/10" style={regionOverlayStyle(visibleBounds, imageRef.current.naturalWidth, imageRef.current.naturalHeight)} /> : null}
            </div>
            <PromotionPanel selection={selection} onPromote={(kind) => { if (selection) onPromoteRegion?.({ kind, selection }) }} />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

/** A visible zone container — the "governance": each category sits in its band. */
function ZoneBandNode({ data }: NodeProps) {
  const { title, count, width, height } = data as BandData
  return (
    <div
      className="pointer-events-none rounded-2xl border border-border/60 bg-muted/10"
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

const FIT_VIEW_OPTIONS = { padding: 0.16 } as const

export function OutputCanvas({
  designSystem,
  pages,
  assets,
  pendingDesignSystem = null,
  pendingPages = [],
  pendingAssets = [],
  focusArtifactId,
  focusRequestId = 0,
  selectedMaterialId = null,
  onSelectMaterial,
  onRequestMaterialChanges,
  variantDecision,
  onVariantDecision,
  onToggleReferenceLock,
  onMoreLikeThis,
  branchRequestCount = 0,
  creativeBranches = [],
  onPromoteRegion,
  onSaveToLibrary,
  librarySavedMaterialIds,
  showMinimap = false,
  showGrid = true,
  background = null,
  emptyHint,
  toolbar,
  actions,
  annotations = [],
  onAnnotationsChange,
}: OutputCanvasProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const colorMode = useFlowColorMode()
  const [instance, setInstance] = useState<ReactFlowInstance | null>(null)
  const [previewItem, setPreviewItem] = useState<CanvasImageItem | null>(null)
  const [zoom, setZoom] = useState(1)
  const [tool, setTool] = useState<CanvasTool>('select')
  const [shapeVariant, setShapeVariant] = useState<ToolShapeVariant>('rect')
  const [spacePanning, setSpacePanning] = useState(false)
  const draftRef = useRef<{ readonly origin: DOMRect; readonly points: { x: number; y: number }[] } | null>(null)
  const [draftPoints, setDraftPoints] = useState<readonly { x: number; y: number }[] | null>(null)
  const viewportStateRef = useRef(initialCanvasViewportState)
  const lastFocusRequestRef = useRef(-1)
  const safeAreaRef = useRef<CanvasSafeArea | null>(null)
  const [safeArea, setSafeArea] = useState<CanvasSafeArea>(() => projectCanvasSafeArea({ viewport: { width: 0, height: 0 } }))
  const itemCount = Number(Boolean(designSystem ?? pendingDesignSystem)) + Math.max(pages.length, pendingPages.length) + Math.max(assets.length, pendingAssets.length)
  const centerOverlay = projectCanvasOverlayAnchor(safeArea, 'center')
  const bottomOverlay = projectCanvasOverlayAnchor(safeArea, 'bottom')
  const selectedItem = selectedMaterialId
    ? [designSystem, ...pages, ...assets].find((item) => item?.material.id === selectedMaterialId) ?? null
    : null
  const selectedSource = selectedItem
    ? selectedItem.material.provenance.source === 'prototype-generation'
      ? 'Generated from approved outcome'
      : `Derived from ${selectedItem.material.provenance.sourcePageId ? 'prototype page' : 'source material'}`
    : null

  const { nodes, edges } = useMemo(() => {
    const lanes: CanvasLane[] = [
      {
        key: 'design',
        title: 'Design system',
        items: designSystem ? [designSystem] : pendingDesignSystem ? [pendingDesignSystem] : [],
        perRow: 1,
      },
      { key: 'pages', title: 'Prototype flow', items: mergeTaskCards(pendingPages, pages), perRow: PAGES_PER_ROW },
      {
        key: 'assets',
        title: 'Assets & materials',
        items: mergeTaskCards(pendingAssets, assets),
        perRow: ASSETS_PER_ROW,
      },
    ]
    return buildOutputCanvasNodes(lanes, selectedMaterialId)
  }, [designSystem, pages, assets, pendingDesignSystem, pendingPages, pendingAssets, selectedMaterialId])

  const annotationNodes = useMemo(
    () =>
      annotations.map((annotation) => ({
        id: `ann:${annotation.id}`,
        type: annotationNodeType(annotation),
        position: { x: annotation.x, y: annotation.y },
        draggable: true,
        selectable: false,
        zIndex: 40,
        data: {
          annotation,
          onChange: (next: CanvasAnnotation) =>
            onAnnotationsChange?.(annotations.map((item) => (item.id === next.id ? next : item))),
          onDelete: () =>
            onAnnotationsChange?.(annotations.filter((item) => item.id !== annotation.id)),
        },
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [annotations, onAnnotationsChange],
  )
  const allNodes = useMemo(() => [...nodes, ...annotationNodes], [nodes, annotationNodes])

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const workspace = root.closest('[data-workspace-root]') ?? root.parentElement
    const measure = () => {
      const bounds = root.getBoundingClientRect()
      const toolbarBounds = toolbarRef.current?.getBoundingClientRect()
      const panels = [...(workspace?.querySelectorAll<HTMLElement>('[data-workspace-panel="agent-drawer"], [data-workspace-panel="files-drawer"], [data-workspace-panel="design-drawer"], [aria-label="Inspector"]') ?? [])]
      const occupied = projectVisiblePanelInsets(bounds, panels.map((panel) => ({ bounds: panel.getBoundingClientRect(), visible: visiblyOccupiesSpace(panel) })))
      const { left, right, bottom } = occupied
      const next = projectCanvasSafeArea({
        viewport: { width: bounds.width, height: bounds.height },
        agentDrawer: { open: left > 0, size: left },
        inspector: { open: right > 0, size: right },
        bottomOverlay: { open: bottom > 0, size: bottom },
        bottomToolbar: { width: toolbarBounds?.width ?? 0, height: (toolbarBounds?.height ?? 0) + 24, open: Boolean(toolbarBounds) },
        minimap: { width: showMinimap ? 200 : 0, height: showMinimap ? 150 : 0, open: showMinimap },
        gap: 12,
      })
      const previous = safeAreaRef.current
      safeAreaRef.current = next
      setSafeArea(next)
      if (!instance || !previous || previous.contentRect.width <= 0 || previous.contentRect.height <= 0) return
      const viewport = instance.getViewport()
      const previousCenter = { x: previous.contentRect.x + previous.contentRect.width / 2, y: previous.contentRect.y + previous.contentRect.height / 2 }
      const worldCenter = { x: (previousCenter.x - viewport.x) / viewport.zoom, y: (previousCenter.y - viewport.y) / viewport.zoom }
      const nextViewport = transitionCanvasPanels({ current: { ...viewport, worldCenter }, next })
      void instance.setViewport(nextViewport, { duration: 180 })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    if (toolbarRef.current) observer.observe(toolbarRef.current)
    workspace?.querySelectorAll<HTMLElement>('[data-workspace-panel], [aria-label="Inspector"]').forEach((element) => observer.observe(element))
    const mutationObserver = new MutationObserver(measure)
    if (workspace) mutationObserver.observe(workspace, { attributes: true, childList: true, subtree: true, attributeFilter: ['class', 'style', 'data-workspace-panel'] })
    window.addEventListener('resize', measure)
    return () => { observer.disconnect(); mutationObserver.disconnect(); window.removeEventListener('resize', measure) }
  }, [instance, showMinimap])

  const fitView = useCallback((options: { readonly nodes?: typeof nodes; readonly padding?: number; readonly maxZoom?: number; readonly duration?: number } = {}) => {
    if (!instance) return
    const root = rootRef.current
    const width = Math.max(1, safeArea.contentRect.width)
    const height = Math.max(1, safeArea.contentRect.height)
    const excludedX = Math.max(0, (root?.clientWidth ?? 0) - width)
    const excludedY = Math.max(0, (root?.clientHeight ?? 0) - height)
    const padding = Math.max(options.padding ?? FIT_VIEW_OPTIONS.padding, excludedX / width, excludedY / height)
    void instance.fitView({ ...options, padding }).then(() => {
      if (!root) return
      const viewport = instance.getViewport()
      const safeCenter = { x: safeArea.contentRect.x + width / 2, y: safeArea.contentRect.y + height / 2 }
      void instance.setViewport({ ...viewport, x: viewport.x + safeCenter.x - root.clientWidth / 2, y: viewport.y + safeCenter.y - root.clientHeight / 2 }, { duration: options.duration ?? 0 })
    })
  }, [instance, safeArea])

  useEffect(() => {
    if (!onAnnotationsChange) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, [contenteditable="true"]')) return
      const key = event.key.toLowerCase()
      if (event.key === 'Escape') { setTool('select'); return }
      if (key === 'v') setTool('select')
      else if (key === 'n') setTool('note')
      else if (key === 't') setTool('text')
      else if (key === 'p') setTool('pen')
      else if (key === 'r') { setShapeVariant('rect'); setTool('shape') }
      else if (key === 'o') { setShapeVariant('ellipse'); setTool('shape') }
      else if (key === 'l') { setShapeVariant(event.shiftKey ? 'arrow' : 'line'); setTool('shape') }
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onAnnotationsChange])

  useEffect(() => {
    const isEditable = (target: EventTarget | null) =>
      target instanceof HTMLElement && Boolean(target.closest('input, textarea, [contenteditable="true"]'))
    const startSpacePan = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || isEditable(event.target)) return
      event.preventDefault()
      setSpacePanning(true)
    }
    const stopSpacePan = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpacePanning(false)
    }
    const clearSpacePan = () => setSpacePanning(false)
    window.addEventListener('keydown', startSpacePan)
    window.addEventListener('keyup', stopSpacePan)
    window.addEventListener('blur', clearSpacePan)
    return () => {
      window.removeEventListener('keydown', startSpacePan)
      window.removeEventListener('keyup', stopSpacePan)
      window.removeEventListener('blur', clearSpacePan)
    }
  }, [])

  const commitDraft = (upPoint: { x: number; y: number }) => {
    const draft = draftRef.current
    draftRef.current = null
    setDraftPoints(null)
    if (!instance || !onAnnotationsChange) return
    const toFlow = (point: { x: number; y: number }) => instance.screenToFlowPosition(point)
    if (tool === 'note') {
      onAnnotationsChange([...annotations, createNoteAnnotation(toFlow(upPoint))])
      setTool('select')
      return
    }
    if (tool === 'text') {
      onAnnotationsChange([...annotations, createTextAnnotation(toFlow(upPoint))])
      setTool('select')
      return
    }
    if (!draft) return
    const start = draft.points[0]
    const distance = Math.hypot(upPoint.x - start.x, upPoint.y - start.y)
    if (tool === 'shape') {
      if (shapeVariant === 'rect' || shapeVariant === 'ellipse') {
        const a = toFlow(start)
        const b = distance < 4
          ? { x: a.x + 160, y: a.y + 100 }
          : toFlow(upPoint)
        onAnnotationsChange([...annotations, createShapeAnnotation(shapeVariant, a, b)])
      } else {
        const stroke = createStrokeAnnotation(
          shapeVariant === 'arrow' ? 'arrow' : 'line',
          [toFlow(start), toFlow(distance < 4 ? { x: start.x + 120, y: start.y } : upPoint)],
        )
        if (stroke) onAnnotationsChange([...annotations, stroke])
      }
      setTool('select')
      return
    }
    if (tool === 'pen') {
      const stroke = createStrokeAnnotation('ink', draft.points.map(toFlow))
      if (stroke) onAnnotationsChange([...annotations, stroke])
    }
  }

  // Frame once when the first result appears. Explicit outcome navigation below
  // and the visible fit control may still move the viewport on user request.
  useEffect(() => {
    if (!instance) return
    const decision = consumeCanvasAutoFit(viewportStateRef.current, itemCount)
    viewportStateRef.current = decision.state
    if (!decision.shouldFit) return
    const frame = requestAnimationFrame(() => fitView())
    return () => cancelAnimationFrame(frame)
  }, [instance, itemCount, fitView])

  useEffect(() => {
    if (!instance || !focusArtifactId) return
    const node = nodes.find((candidate) =>
      candidate.type === 'outputCard' &&
      (candidate.data as CardData).item.id === focusArtifactId,
    )
    if (!node) return
    if (!shouldConsumeFocusRequest(
      lastFocusRequestRef.current,
      focusRequestId,
      true,
    )) return
    lastFocusRequestRef.current = focusRequestId
    const frame = requestAnimationFrame(() => fitView({ nodes: [node], padding: 0.45, maxZoom: 1.15, duration: 260 }))
    return () => cancelAnimationFrame(frame)
  }, [focusArtifactId, focusRequestId, instance, nodes, fitView])

  return (
    <div ref={rootRef} className="relative h-full min-h-0 overflow-hidden">
      <ReactFlow
        nodes={allNodes}
        onNodeDragStop={(_, node) => {
          if (!node.id.startsWith('ann:') || !onAnnotationsChange) return
          const annotationId = node.id.slice(4)
          onAnnotationsChange(annotations.map((item) =>
            item.id === annotationId ? { ...item, x: node.position.x, y: node.position.y } : item,
          ))
        }}
        edges={edges}
        nodeTypes={nodeTypes}
        onInit={setInstance}
        onNodeClick={(_, node) => {
          if (node.type === 'outputCard') {
            onSelectMaterial?.((node.data as CardData).item.material)
          }
        }}
        onNodeDoubleClick={(_, node) => {
          if (node.type === 'outputCard') setPreviewItem((node.data as CardData).item)
        }}
        minZoom={0.2}
        maxZoom={1.6}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={spacePanning ? [0, 1, 2] : [1, 2]}
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        onlyRenderVisibleElements
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
        colorMode={colorMode}
        className="bg-background"
        style={background ? { background } : undefined}
        onMove={(_, viewport) => setZoom(viewport.zoom)}
      >
        {showGrid ? (
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border)" />
        ) : null}
        <Panel position="top-left" className="!m-0 flex items-center gap-1.5" style={{ transform: `translate(${safeArea.contentRect.x + 12}px, ${safeArea.contentRect.y + 12}px)` }}>
          {toolbar}
        </Panel>
        <Panel position="top-left" className="!m-0" style={{ transform: `translate(${safeArea.controlAnchors.bottomToolbar.x}px, ${safeArea.controlAnchors.bottomToolbar.y - 12}px) translate(-50%, -100%)` }}>
          <div
            ref={toolbarRef}
            data-slot="canvas-control-dock"
            className="pointer-events-auto w-fit max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-border bg-popover/95 text-popover-foreground shadow-[0_8px_24px_rgb(0_0_0/0.25)] backdrop-blur"
            style={selectedItem ? { width: `min(46rem, ${bottomOverlay.maxWidth}px)` } : undefined}
          >
          {selectedItem && selectedSource ? (
            <section aria-label="Selected deliverable" className="flex min-w-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2 sm:flex-nowrap">
              <div className="min-w-0 flex-1 basis-full sm:basis-auto"><p className="truncate text-sm font-medium">{selectedItem.material.label}</p><p className="truncate text-xs text-muted-foreground">Ready · {selectedItem.material.version} · {selectedSource}{variantDecision?.referenceLocked ? ` · Locked ${variantDecision.referenceGroup}` : ''}{branchRequestCount ? ` · ${branchRequestCount} branch requested` : ''}</p>{creativeBranches?.length ? <p role="status" className="truncate text-[11px] text-muted-foreground">{creativeBranches.map((branch) => branch.status === 'completed' ? `Completed → ${branch.resultMaterialId ?? 'result returned to board'}` : branch.status === 'failed' ? `Failed${branch.error ? ` · ${branch.error}` : ''}` : branch.status === 'running' ? 'Generating variant…' : 'Queued for Agent execution').join(' · ')}</p> : null}</div>
              <div className="flex shrink-0 items-center gap-1" aria-label="Variant decisions">
                <Button type="button" size="icon-sm" variant={variantDecision?.decision === 'favorite' ? 'secondary' : 'ghost'} aria-label={`Favorite ${selectedItem.material.label}`} aria-pressed={variantDecision?.decision === 'favorite'} onClick={() => onVariantDecision?.('favorite')}><Heart className="size-4" /></Button>
                <Button type="button" size="icon-sm" variant={variantDecision?.decision === 'rejected' ? 'secondary' : 'ghost'} aria-label={`Reject ${selectedItem.material.label}`} aria-pressed={variantDecision?.decision === 'rejected'} onClick={() => onVariantDecision?.('rejected')}><Ban className="size-4" /></Button>
                <Button type="button" size="icon-sm" variant={variantDecision?.referenceLocked ? 'secondary' : 'ghost'} aria-label={`Lock ${selectedItem.material.label} as reference`} aria-pressed={variantDecision?.referenceLocked ?? false} onClick={onToggleReferenceLock}><Lock className="size-4" /></Button>
                <Button type="button" size="icon-sm" variant="ghost" aria-label={`More like ${selectedItem.material.label}`} onClick={() => onMoreLikeThis?.(selectedItem.material)}><Sparkles className="size-4" /></Button>
              </div>
              {onRequestMaterialChanges ? <Button type="button" size="sm" variant="outline" onClick={() => onRequestMaterialChanges(selectedItem.material)} aria-label={`Request changes to ${selectedItem.material.label}`}><MessageSquare className="size-4" /><span className="hidden sm:inline">Request changes</span></Button> : null}
              {onSaveToLibrary && selectedItem.evidenceMaterialId ? <Button type="button" size="sm" variant="outline" disabled={librarySavedMaterialIds?.has(selectedItem.evidenceMaterialId)} onClick={() => onSaveToLibrary(selectedItem)} aria-label={`Save ${selectedItem.material.label} to library`}><Boxes className="size-4" /><span className="hidden sm:inline">{librarySavedMaterialIds?.has(selectedItem.evidenceMaterialId) ? 'In library' : 'Save to library'}</span></Button> : null}
            </section>
          ) : null}
          <div role="toolbar" aria-label="Canvas controls" className="max-w-full overflow-x-auto">
          <div className={cn('flex w-max items-center gap-0.5 p-1', selectedItem && 'min-w-full justify-center')}>
            {actions?.onImport ? (
              <span className="hidden sm:contents">
                <CanvasToolButton label="Import image" onClick={actions.onImport}>
                  <ImagePlus className="size-4" />
                </CanvasToolButton>
              </span>
            ) : null}
            {actions?.onAskAgent ? (
              <span className="hidden sm:contents">
                <CanvasToolButton label="Ask the Agent" onClick={actions.onAskAgent}>
                  <WandSparkles className="size-4" />
                </CanvasToolButton>
              </span>
            ) : null}
            {onAnnotationsChange ? (
              <>
                <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
                <CanvasToolButton label="Select (V)" active={tool === 'select'} onClick={() => setTool('select')}>
                  <MousePointer2 className="size-4" />
                </CanvasToolButton>
                <CanvasToolButton label="Note (N)" active={tool === 'note'} onClick={() => setTool('note')}>
                  <StickyNote className="size-4" />
                </CanvasToolButton>
                <CanvasToolButton label="Text (T)" active={tool === 'text'} onClick={() => setTool('text')}>
                  <Type className="size-4" />
                </CanvasToolButton>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label="Shape tools"
                      title="Shapes"
                      className={cn(
                        'flex h-8 items-center justify-center gap-0.5 rounded-lg px-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
                        tool === 'shape' && 'bg-accent text-accent-foreground',
                      )}
                    >
                      <ShapeVariantIcon variant={shapeVariant} />
                      <ChevronUp className="size-3 opacity-60" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="top" align="center" className="w-44">
                    <DropdownMenuItem onSelect={() => { setShapeVariant('rect'); setTool('shape') }}>
                      <Square className="size-4" /> Rectangle
                      <DropdownMenuShortcut>R</DropdownMenuShortcut>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => { setShapeVariant('ellipse'); setTool('shape') }}>
                      <Circle className="size-4" /> Ellipse
                      <DropdownMenuShortcut>O</DropdownMenuShortcut>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => { setShapeVariant('line'); setTool('shape') }}>
                      <Slash className="size-4" /> Line
                      <DropdownMenuShortcut>L</DropdownMenuShortcut>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => { setShapeVariant('arrow'); setTool('shape') }}>
                      <MoveUpRight className="size-4" /> Arrow
                      <DropdownMenuShortcut>⇧L</DropdownMenuShortcut>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <CanvasToolButton label="Pen (P)" active={tool === 'pen'} onClick={() => setTool('pen')}>
                  <Pencil className="size-4" />
                </CanvasToolButton>
              </>
            ) : null}
            <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
            <CanvasToolButton label="Zoom out" onClick={() => void instance?.zoomOut({ duration: 150 })}>
              <Minus className="size-4" />
            </CanvasToolButton>
            <button
              type="button"
              aria-label="Zoom to 100%"
              title="Zoom to 100%"
              className="flex h-8 min-w-12 items-center justify-center rounded-lg px-1.5 font-mono text-[11px] tabular-nums text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              onClick={() => void instance?.zoomTo(1, { duration: 200 })}
            >
              {Math.round(zoom * 100)}%
            </button>
            <CanvasToolButton label="Zoom in" onClick={() => void instance?.zoomIn({ duration: 150 })}>
              <Plus className="size-4" />
            </CanvasToolButton>
            <CanvasToolButton label="Fit view" onClick={() => fitView({ duration: 200 })}>
              <Maximize className="size-4" />
            </CanvasToolButton>
            {actions?.onExportAll ? (
              <span className="hidden sm:contents">
                <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
                <CanvasToolButton
                  label="Export all"
                  disabled={actions.exportDisabled}
                  onClick={actions.onExportAll}
                >
                  <DownloadCloud className="size-4" />
                </CanvasToolButton>
              </span>
            ) : null}
          </div>
          </div>
          </div>
        </Panel>
        {showMinimap ? (
          <MiniMap
            className="!m-0"
            pannable
            zoomable
            bgColor="var(--card)"
            maskColor="var(--background)"
            nodeColor="var(--muted-foreground)"
            nodeStrokeColor="var(--border)"
            position="top-left"
            style={{ transform: `translate(${safeArea.controlAnchors.minimap.x}px, ${safeArea.controlAnchors.minimap.y}px)` }}
          />
        ) : null}
      </ReactFlow>
      {itemCount === 0 && emptyHint ? (
        <div
          data-slot="canvas-empty-hint"
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 px-3 text-center"
          style={{ left: centerOverlay.x, top: centerOverlay.y, width: `min(32rem, ${centerOverlay.maxWidth}px)` }}
        >
          <p className="text-balance text-base leading-relaxed text-muted-foreground">{emptyHint}</p>
        </div>
      ) : null}
      {tool !== 'select' && onAnnotationsChange ? (
        <div
          aria-label="Annotation layer"
          className={cn('absolute inset-0 z-20 touch-none', tool === 'pen' ? 'cursor-crosshair' : tool === 'shape' ? 'cursor-crosshair' : 'cursor-copy')}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            draftRef.current = {
              origin: event.currentTarget.getBoundingClientRect(),
              points: [{ x: event.clientX, y: event.clientY }],
            }
            setDraftPoints(null)
          }}
          onPointerMove={(event) => {
            const draft = draftRef.current
            if (!draft || !(event.buttons & 1)) return
            const point = { x: event.clientX, y: event.clientY }
            if (tool === 'pen') {
              const last = draft.points[draft.points.length - 1]
              if (Math.hypot(point.x - last.x, point.y - last.y) > 2) draft.points.push(point)
            } else if (tool === 'shape') {
              draft.points.splice(1, draft.points.length - 1, point)
            } else {
              return
            }
            setDraftPoints([...draft.points])
          }}
          onPointerUp={(event) => {
            commitDraft({ x: event.clientX, y: event.clientY })
          }}
          onPointerCancel={() => {
            draftRef.current = null
            setDraftPoints(null)
          }}
        >
          {draftPoints && draftRef.current && draftPoints.length > 1 ? (
            <DraftPreview
              origin={draftRef.current.origin}
              points={draftPoints}
              tool={tool}
              shapeVariant={shapeVariant}
            />
          ) : null}
        </div>
      ) : null}
      <CardPreviewDialog
        item={previewItem}
        onPromoteRegion={onPromoteRegion}
        onOpenChange={(open) => {
          if (!open) setPreviewItem(null)
        }}
      />
    </div>
  )
}

function selectionFor(item: CanvasImageItem, bounds: StructuredPromotion['selection']['bounds']): StructuredPromotion['selection'] {
  if (!item.revisionId || !item.pageId) throw new Error('Region promotion requires authoritative page and revision evidence.')
  if (!item.evidenceMaterialId) throw new Error('Region promotion requires authoritative material evidence.')
  return { materialId: item.evidenceMaterialId, revisionId: item.revisionId, pageId: item.pageId, bounds, selectedBy: 'user', selectedAt: new Date().toISOString() }
}

function CanvasToolButton({
  label,
  disabled = false,
  active = false,
  onClick,
  children,
}: {
  readonly label: string
  readonly disabled?: boolean
  readonly active?: boolean
  readonly onClick: () => void
  readonly children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      aria-pressed={active || undefined}
      className={cn(
        'flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40',
        active && 'bg-accent text-accent-foreground',
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function NoteNode({ data }: NodeProps) {
  const { annotation, onChange, onDelete } = data as unknown as AnnotationNodeData
  if (annotation.kind !== 'note') return null
  const note = annotation
  const onTextChange = (text: string) => onChange({ ...note, text })
  return (
    <div className="group/note w-52 rounded-md border border-amber-300/70 bg-amber-100 p-2 shadow-[0_6px_16px_rgb(0_0_0/0.14)] dark:border-amber-500/40 dark:bg-amber-950">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
          Note
        </span>
        <button
          type="button"
          aria-label="Delete note"
          className="nodrag rounded p-0.5 text-amber-700/60 opacity-0 transition-opacity hover:bg-amber-200/70 hover:text-amber-900 group-hover/note:opacity-100 dark:text-amber-400/70 dark:hover:bg-amber-900"
          onClick={onDelete}
        >
          <X className="size-3" />
        </button>
      </div>
      <textarea
        value={note.text}
        placeholder="Add context for the Agent..."
        aria-label="Canvas note"
        className="nodrag nowheel mt-1 h-20 w-full resize-none bg-transparent text-xs leading-5 text-amber-950 outline-none placeholder:text-amber-700/50 dark:text-amber-100 dark:placeholder:text-amber-500/60"
        onChange={(event) => onTextChange(event.target.value)}
      />
    </div>
  )
}

type CanvasTool = 'select' | 'note' | 'text' | 'shape' | 'pen'
type ToolShapeVariant = ShapeVariant | Extract<StrokeVariant, 'line' | 'arrow'>

interface AnnotationNodeData {
  readonly annotation: CanvasAnnotation
  readonly onChange: (annotation: CanvasAnnotation) => void
  readonly onDelete: () => void
}

const ANNOTATION_COLOR = '#8b5cf6'

function annotationNodeType(annotation: CanvasAnnotation) {
  switch (annotation.kind) {
    case 'note': return 'canvasNote' as const
    case 'text': return 'canvasText' as const
    case 'shape': return 'canvasShape' as const
    case 'stroke': return 'canvasStroke' as const
  }
}

function ShapeVariantIcon({ variant }: { readonly variant: ToolShapeVariant }) {
  if (variant === 'ellipse') return <Circle className="size-4" />
  if (variant === 'line') return <Slash className="size-4" />
  if (variant === 'arrow') return <MoveUpRight className="size-4" />
  return <Square className="size-4" />
}

function AnnotationDeleteButton({ onDelete, className }: { readonly onDelete: () => void; readonly className?: string }) {
  return (
    <button
      type="button"
      aria-label="Delete annotation"
      className={cn(
        'nodrag absolute -right-2.5 -top-2.5 flex size-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground',
        className,
      )}
      onClick={onDelete}
    >
      <X className="size-3" />
    </button>
  )
}

function TextNode({ data }: NodeProps) {
  const { annotation, onChange, onDelete } = data as unknown as AnnotationNodeData
  if (annotation.kind !== 'text') return null
  return (
    <div className="group/ann relative">
      <AnnotationDeleteButton onDelete={onDelete} className="group-hover/ann:opacity-100" />
      <input
        value={annotation.text}
        placeholder="Text"
        aria-label="Canvas text"
        className="nodrag w-44 border-b border-dashed border-violet-400/50 bg-transparent pb-0.5 text-sm font-medium text-violet-600 outline-none placeholder:text-violet-400/60 dark:text-violet-300"
        onChange={(event) => onChange({ ...annotation, text: event.target.value })}
      />
    </div>
  )
}

function ShapeNode({ data }: NodeProps) {
  const { annotation, onDelete } = data as unknown as AnnotationNodeData
  if (annotation.kind !== 'shape') return null
  const { width, height } = annotation
  return (
    <div className="group/ann relative" style={{ width, height }}>
      <AnnotationDeleteButton onDelete={onDelete} className="group-hover/ann:opacity-100" />
      <svg width={width} height={height} className="overflow-visible">
        {annotation.shape === 'ellipse' ? (
          <ellipse
            cx={width / 2}
            cy={height / 2}
            rx={Math.max(2, width / 2 - 1.5)}
            ry={Math.max(2, height / 2 - 1.5)}
            fill="rgb(139 92 246 / 0.08)"
            stroke={ANNOTATION_COLOR}
            strokeWidth={2}
          />
        ) : (
          <rect
            x={1.5}
            y={1.5}
            width={Math.max(2, width - 3)}
            height={Math.max(2, height - 3)}
            rx={4}
            fill="rgb(139 92 246 / 0.08)"
            stroke={ANNOTATION_COLOR}
            strokeWidth={2}
          />
        )}
      </svg>
    </div>
  )
}

function StrokeNode({ data }: NodeProps) {
  const { annotation, onDelete } = data as unknown as AnnotationNodeData
  if (annotation.kind !== 'stroke') return null
  const { width, height, points, variant, id } = annotation
  const path = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x},${y}`).join(' ')
  return (
    <div className="group/ann relative" style={{ width: Math.max(width, 12), height: Math.max(height, 12) }}>
      <AnnotationDeleteButton onDelete={onDelete} className="group-hover/ann:opacity-100" />
      <svg width={Math.max(width, 12)} height={Math.max(height, 12)} className="overflow-visible">
        {variant === 'arrow' ? (
          <defs>
            <marker id={`arrow-${id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={ANNOTATION_COLOR} />
            </marker>
          </defs>
        ) : null}
        <path
          d={path}
          fill="none"
          stroke={ANNOTATION_COLOR}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          markerEnd={variant === 'arrow' ? `url(#arrow-${id})` : undefined}
        />
      </svg>
    </div>
  )
}

// Keep registry initialization after every concrete node implementation. This
// also makes hot replacement safe while annotation modules are being updated.
const nodeTypes: NodeTypes = {
  outputCard: CardNode,
  zoneBand: ZoneBandNode,
  canvasNote: NoteNode,
  canvasText: TextNode,
  canvasShape: ShapeNode,
  canvasStroke: StrokeNode,
}

function DraftPreview({
  origin,
  points,
  tool,
  shapeVariant,
}: {
  readonly origin: DOMRect
  readonly points: readonly { x: number; y: number }[]
  readonly tool: CanvasTool
  readonly shapeVariant: ToolShapeVariant
}) {
  const local = points.map((point) => ({ x: point.x - origin.left, y: point.y - origin.top }))
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full">
      {tool === 'pen' || shapeVariant === 'line' || shapeVariant === 'arrow' ? (
        <path
          d={local.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ')}
          fill="none"
          stroke={ANNOTATION_COLOR}
          strokeWidth={2}
          strokeDasharray={tool === 'pen' ? undefined : '4 3'}
          strokeLinecap="round"
        />
      ) : (
        (() => {
          const [a, b] = [local[0], local[local.length - 1]]
          const x = Math.min(a.x, b.x)
          const y = Math.min(a.y, b.y)
          const w = Math.abs(a.x - b.x)
          const h = Math.abs(a.y - b.y)
          return shapeVariant === 'ellipse' ? (
            <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill="none" stroke={ANNOTATION_COLOR} strokeWidth={2} strokeDasharray="4 3" />
          ) : (
            <rect x={x} y={y} width={w} height={h} rx={4} fill="none" stroke={ANNOTATION_COLOR} strokeWidth={2} strokeDasharray="4 3" />
          )
        })()
      )}
    </svg>
  )
}

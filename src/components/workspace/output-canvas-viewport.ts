export interface CanvasViewportState {
  readonly hasFramedContent: boolean
}

export const initialCanvasViewportState: CanvasViewportState = {
  hasFramedContent: false,
}

/** Auto-frame only the first non-empty result set. */
export function consumeCanvasAutoFit(
  state: CanvasViewportState,
  itemCount: number,
): { readonly shouldFit: boolean; readonly state: CanvasViewportState } {
  if (state.hasFramedContent || itemCount <= 0) {
    return { shouldFit: false, state }
  }

  return {
    shouldFit: true,
    state: { hasFramedContent: true },
  }
}

export function shouldConsumeFocusRequest(
  lastConsumedRequestId: number,
  requestId: number,
  hasTarget: boolean,
): boolean {
  return hasTarget && requestId !== lastConsumedRequestId
}

export interface CanvasSize { readonly width: number; readonly height: number }
export interface CanvasInsets { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number }
export interface CanvasPanel { readonly open: boolean; readonly size: number }
export interface CanvasRect extends CanvasSize { readonly x: number; readonly y: number }
export interface CanvasPoint { readonly x: number; readonly y: number }
export interface CanvasBounds { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number; readonly width: number; readonly height: number }
export interface CanvasPanelBounds { readonly bounds: CanvasBounds; readonly visible: boolean }

export interface CanvasSafeAreaInput {
  readonly viewport: CanvasSize
  readonly rail?: CanvasPanel
  readonly agentDrawer?: CanvasPanel
  readonly inspector?: CanvasPanel
  readonly topOverlay?: CanvasPanel
  readonly bottomOverlay?: CanvasPanel
  readonly bottomToolbar?: CanvasSize & { readonly open?: boolean }
  readonly minimap?: CanvasSize & { readonly open?: boolean }
  readonly centeredOverlay?: { readonly maxWidth: number; readonly margin?: number }
  readonly insets?: Partial<CanvasInsets>
  readonly gap?: number
}

export interface CanvasSafeArea {
  readonly contentRect: CanvasRect
  readonly contentCenter: CanvasPoint
  readonly emptyStateAnchor: CanvasPoint
  readonly centeredOverlay: { readonly anchor: CanvasPoint; readonly maxWidth: number }
  readonly controlAnchors: { readonly bottomToolbar: CanvasPoint; readonly minimap: CanvasPoint }
  readonly fitPadding: CanvasInsets
}

const zeroInsets: CanvasInsets = { top: 0, right: 0, bottom: 0, left: 0 }
const finite = (value: number | undefined) => Number.isFinite(value) ? Math.max(0, value ?? 0) : 0
const panelSize = (panel: CanvasPanel | undefined) => panel?.open ? finite(panel.size) : 0
const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), Math.max(low, high))

/** Measures only panels that visibly overlap and touch a viewport edge. */
export function projectVisiblePanelInsets(viewport: CanvasBounds, panels: readonly CanvasPanelBounds[]): { readonly left: number; readonly right: number; readonly bottom: number } {
  let left = 0, right = 0, bottom = 0
  for (const panel of panels) {
    const rect = panel.bounds
    if (!panel.visible || rect.width <= 0 || rect.height <= 0) continue
    const overlapX = Math.max(0, Math.min(viewport.right, rect.right) - Math.max(viewport.left, rect.left))
    const overlapY = Math.max(0, Math.min(viewport.bottom, rect.bottom) - Math.max(viewport.top, rect.top))
    if (overlapX <= 0 || overlapY <= 0) continue
    if (rect.width >= viewport.width * 0.8 && rect.top > viewport.top && rect.bottom >= viewport.bottom - 2) bottom = Math.max(bottom, overlapY)
    else if (rect.left <= viewport.left + 2 && rect.right > viewport.left) left = Math.max(left, overlapX)
    else if (rect.right >= viewport.right - 2 && rect.left < viewport.right) right = Math.max(right, overlapX)
  }
  return { left, right, bottom }
}

export function visiblyOccupiesSpace(element: HTMLElement): boolean {
  if (element.hidden || element.getAttribute('aria-hidden') === 'true' || element.offsetParent === null) return false
  const style = element.ownerDocument.defaultView?.getComputedStyle(element)
  if (style && (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0)) return false
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

/** Pure viewport contract. It always returns finite, non-negative geometry. */
export function projectCanvasSafeArea(input: CanvasSafeAreaInput): CanvasSafeArea {
  const viewport = { width: finite(input.viewport.width), height: finite(input.viewport.height) }
  const insets = { ...zeroInsets, ...Object.fromEntries(Object.entries(input.insets ?? {}).map(([key, value]) => [key, finite(value)])) } as CanvasInsets
  const gap = finite(input.gap ?? 12)
  const left = clamp(insets.left + panelSize(input.rail) + panelSize(input.agentDrawer), 0, viewport.width)
  const right = clamp(viewport.width - insets.right - panelSize(input.inspector), left, viewport.width)
  const toolbarHeight = input.bottomToolbar?.open === false ? 0 : finite(input.bottomToolbar?.height)
  const top = clamp(insets.top + panelSize(input.topOverlay), 0, viewport.height)
  const bottom = clamp(viewport.height - insets.bottom - toolbarHeight - panelSize(input.bottomOverlay), top, viewport.height)
  const contentRect: CanvasRect = { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
  const contentCenter = { x: left + contentRect.width / 2, y: top + contentRect.height / 2 }
  const overlayMargin = Math.min(finite(input.centeredOverlay?.margin ?? gap), contentRect.width / 2)
  const overlayMaxWidth = Math.min(finite(input.centeredOverlay?.maxWidth), Math.max(0, contentRect.width - overlayMargin * 2))
  const toolbarWidth = Math.min(finite(input.bottomToolbar?.width), contentRect.width)
  const minimapWidth = Math.min(finite(input.minimap?.width), contentRect.width)
  const minimapHeight = Math.min(finite(input.minimap?.height), contentRect.height)
  const toolbarY = clamp(bottom + toolbarHeight / 2, top, viewport.height - insets.bottom)
  const minimapX = clamp(right - minimapWidth, left, right)
  const minimapY = clamp(top + gap, top, Math.max(top, bottom - minimapHeight))
  return {
    contentRect,
    contentCenter,
    emptyStateAnchor: contentCenter,
    centeredOverlay: { anchor: contentCenter, maxWidth: overlayMaxWidth },
    controlAnchors: {
      bottomToolbar: { x: clamp(left + (contentRect.width - toolbarWidth) / 2 + toolbarWidth / 2, left, right), y: toolbarY },
      minimap: input.minimap?.open === false ? { x: right, y: bottom } : { x: minimapX, y: minimapY },
    },
    fitPadding: {
      top: gap,
      right: Math.min(contentRect.width / 2, gap + minimapWidth),
      bottom: Math.min(contentRect.height / 2, gap),
      left: Math.min(contentRect.width / 2, gap),
    },
  }
}

export interface CanvasViewTransform { readonly x: number; readonly y: number; readonly zoom: number; readonly worldCenter: CanvasPoint }

export interface CanvasOverlayAnchor extends CanvasPoint { readonly maxWidth: number }

/** Anchors transient UI inside the same unobscured rectangle used by canvas framing. */
export function projectCanvasOverlayAnchor(area: CanvasSafeArea, placement: 'center' | 'bottom'): CanvasOverlayAnchor {
  const usableLeft = area.contentRect.x + area.fitPadding.left
  const usableRight = area.contentRect.x + area.contentRect.width - area.fitPadding.right
  const maxWidth = Math.max(0, usableRight - usableLeft)
  return {
    x: usableLeft + maxWidth / 2,
    y: placement === 'center'
      ? area.contentRect.y + area.contentRect.height / 2
      : area.contentRect.y + area.contentRect.height - area.fitPadding.bottom,
    maxWidth,
  }
}

/** Panel changes preserve the visible world center and zoom unless refit is explicitly requested. */
export function transitionCanvasPanels(input: {
  readonly current: CanvasViewTransform
  readonly next: CanvasSafeArea
  readonly zoomStrategy?: 'preserve' | 'refit'
  readonly worldBounds?: CanvasRect
  readonly minZoom?: number
  readonly maxZoom?: number
}): CanvasViewTransform {
  const center = input.current.worldCenter
  let zoom = Math.max(0.0001, finite(input.current.zoom))
  if (input.zoomStrategy === 'refit' && input.worldBounds && input.worldBounds.width > 0 && input.worldBounds.height > 0) {
    const availableWidth = Math.max(0, input.next.contentRect.width - input.next.fitPadding.left - input.next.fitPadding.right)
    const availableHeight = Math.max(0, input.next.contentRect.height - input.next.fitPadding.top - input.next.fitPadding.bottom)
    const fitted = Math.min(availableWidth / input.worldBounds.width, availableHeight / input.worldBounds.height)
    zoom = clamp(fitted, finite(input.minZoom ?? 0.05), finite(input.maxZoom ?? 4))
  }
  const screenCenter = { x: input.next.contentRect.x + input.next.contentRect.width / 2, y: input.next.contentRect.y + input.next.contentRect.height / 2 }
  return { x: screenCenter.x - center.x * zoom, y: screenCenter.y - center.y * zoom, zoom, worldCenter: center }
}

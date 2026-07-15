import { describe, expect, it } from 'vitest'
import {
  consumeCanvasAutoFit,
  initialCanvasViewportState,
  shouldConsumeFocusRequest,
  projectCanvasSafeArea,
  projectCanvasOverlayAnchor,
  transitionCanvasPanels,
  projectVisiblePanelInsets,
} from './output-canvas-viewport'

describe('canvas viewport policy', () => {
  it('waits for the first material before framing', () => {
    const empty = consumeCanvasAutoFit(initialCanvasViewportState, 0)

    expect(empty.shouldFit).toBe(false)
    expect(empty.state).toBe(initialCanvasViewportState)

    const firstResult = consumeCanvasAutoFit(empty.state, 1)
    expect(firstResult.shouldFit).toBe(true)
    expect(firstResult.state.hasFramedContent).toBe(true)
  })

  it('preserves the user viewport as more materials stream in', () => {
    const firstResult = consumeCanvasAutoFit(initialCanvasViewportState, 1)
    const streamedResults = consumeCanvasAutoFit(firstResult.state, 12)

    expect(streamedResults.shouldFit).toBe(false)
    expect(streamedResults.state).toBe(firstResult.state)
  })

  it('allows explicit repeated navigation to the same artifact', () => {
    expect(shouldConsumeFocusRequest(3, 3, true)).toBe(false)
    expect(shouldConsumeFocusRequest(3, 4, true)).toBe(true)
    expect(shouldConsumeFocusRequest(3, 4, false)).toBe(false)
  })

  it('projects non-overlapping desktop content and control anchors', () => {
    const result = projectCanvasSafeArea({ viewport: { width: 1440, height: 900 }, rail: { open: true, size: 72 }, agentDrawer: { open: true, size: 320 }, inspector: { open: true, size: 280 }, bottomToolbar: { width: 520, height: 64 }, minimap: { width: 180, height: 120 }, insets: { top: 48, right: 16, bottom: 16, left: 16 } })
    expect(result.contentRect).toEqual({ x: 408, y: 48, width: 736, height: 772 })
    expect(result.controlAnchors.bottomToolbar.x).toBeGreaterThanOrEqual(result.contentRect.x)
    expect(result.controlAnchors.minimap.x).toBeGreaterThanOrEqual(result.contentRect.x)
    expect(result.controlAnchors.minimap.y).toBeGreaterThanOrEqual(result.contentRect.y)
  })

  it('clamps mobile and extreme panel geometry without negative dimensions', () => {
    const mobile = projectCanvasSafeArea({ viewport: { width: 390, height: 844 }, rail: { open: false, size: 80 }, agentDrawer: { open: true, size: 300 }, inspector: { open: false, size: 300 }, bottomToolbar: { width: 600, height: 72 }, minimap: { width: 180, height: 120 }, insets: { top: 59, bottom: 34, left: 0, right: 0 } })
    expect(mobile.contentRect).toEqual({ x: 300, y: 59, width: 90, height: 679 })
    const extreme = projectCanvasSafeArea({ viewport: { width: 200, height: 100 }, rail: { open: true, size: 500 }, inspector: { open: true, size: 500 }, bottomToolbar: { width: 500, height: 500 }, minimap: { width: 500, height: 500 }, insets: { top: 999, left: 999, right: 999, bottom: 999 } })
    expect(extreme.contentRect.width).toBe(0)
    expect(extreme.contentRect.height).toBe(0)
    expect(Object.values(extreme.controlAnchors).flatMap((point) => [point.x, point.y]).every(Number.isFinite)).toBe(true)
  })

  it('preserves world center and zoom across panel open/close, refitting only explicitly', () => {
    const next = projectCanvasSafeArea({ viewport: { width: 1200, height: 800 }, agentDrawer: { open: true, size: 300 }, inspector: { open: true, size: 240 } })
    const current = { x: 0, y: 0, zoom: 1.5, worldCenter: { x: 200, y: 100 } }
    const preserved = transitionCanvasPanels({ current, next })
    expect(preserved).toMatchObject({ zoom: 1.5, worldCenter: current.worldCenter })
    expect({ x: (next.contentRect.x + next.contentRect.width / 2 - preserved.x) / preserved.zoom, y: (next.contentRect.y + next.contentRect.height / 2 - preserved.y) / preserved.zoom }).toEqual(current.worldCenter)
    const refit = transitionCanvasPanels({ current, next, zoomStrategy: 'refit', worldBounds: { x: 0, y: 0, width: 1000, height: 500 } })
    expect(refit.zoom).not.toBe(current.zoom)
    expect(refit.worldCenter).toBe(current.worldCenter)
  })

  it('centers empty and bounded overlays inside the safe content rather than the viewport', () => {
    const result = projectCanvasSafeArea({ viewport: { width: 1440, height: 900 }, rail: { open: true, size: 72 }, agentDrawer: { open: true, size: 320 }, inspector: { open: true, size: 280 }, topOverlay: { open: true, size: 56 }, bottomOverlay: { open: true, size: 48 }, bottomToolbar: { width: 520, height: 64 }, centeredOverlay: { maxWidth: 720, margin: 24 }, insets: { top: 24, right: 16, bottom: 16, left: 16 } })
    expect(result.contentRect).toEqual({ x: 408, y: 80, width: 736, height: 692 })
    expect(result.contentCenter).toEqual({ x: 776, y: 426 })
    expect(result.emptyStateAnchor).toBe(result.contentCenter)
    expect(result.centeredOverlay).toEqual({ anchor: result.contentCenter, maxWidth: 688 })
  })

  it('clamps centered overlay width on mobile and collapsed extreme content', () => {
    const mobile = projectCanvasSafeArea({ viewport: { width: 390, height: 844 }, agentDrawer: { open: true, size: 260 }, inspector: { open: false, size: 0 }, topOverlay: { open: true, size: 48 }, bottomOverlay: { open: true, size: 80 }, centeredOverlay: { maxWidth: 640, margin: 16 } })
    expect(mobile.centeredOverlay.maxWidth).toBe(98)
    expect(mobile.centeredOverlay.anchor).toEqual(mobile.contentCenter)
    const extreme = projectCanvasSafeArea({ viewport: { width: 100, height: 100 }, rail: { open: true, size: 1000 }, topOverlay: { open: true, size: 1000 }, centeredOverlay: { maxWidth: 500, margin: 20 } })
    expect(extreme.contentRect).toMatchObject({ width: 0, height: 0 })
    expect(extreme.centeredOverlay.maxWidth).toBe(0)
    expect(Object.values(extreme.contentCenter).every(Number.isFinite)).toBe(true)
  })

  it('anchors center and selection overlays inside unobscured content', () => {
    const area = projectCanvasSafeArea({ viewport: { width: 1200, height: 800 }, agentDrawer: { open: true, size: 320 }, inspector: { open: true, size: 240 }, bottomToolbar: { width: 480, height: 64 }, minimap: { width: 180, height: 120 } })
    const center = projectCanvasOverlayAnchor(area, 'center')
    const bottom = projectCanvasOverlayAnchor(area, 'bottom')
    expect(center.x).toBeGreaterThan(area.contentRect.x)
    expect(center.x).toBeLessThan(area.contentRect.x + area.contentRect.width)
    expect(center.y).toBe(area.contentRect.y + area.contentRect.height / 2)
    expect(bottom.y).toBeLessThan(area.contentRect.y + area.contentRect.height)
    expect(bottom.maxWidth).toBeLessThanOrEqual(area.contentRect.width)
  })

  it('centers from only truly visible edge overlays across rail, drawers, inspectors, and resize', () => {
    const viewport = (width:number,height=800) => ({ left:0, top:0, right:width, bottom:height, width, height })
    const rect = (left:number,right:number,height=800) => ({ left, top:0, right, bottom:height, width:right-left, height })
    const center = (width:number, panels:Parameters<typeof projectVisiblePanelInsets>[1]) => {
      const occupied = projectVisiblePanelInsets(viewport(width), panels)
      return projectCanvasSafeArea({ viewport:{width,height:800}, agentDrawer:{open:occupied.left>0,size:occupied.left}, inspector:{open:occupied.right>0,size:occupied.right} }).contentCenter.x
    }
    expect(Math.abs(center(1200,[{bounds:rect(-72,0),visible:true}])-600)).toBeLessThanOrEqual(2) // rail already outside canvas
    expect(Math.abs(center(1200,[{bounds:rect(0,320),visible:true}])-760)).toBeLessThanOrEqual(2)
    expect(Math.abs(center(1200,[{bounds:rect(960,1200),visible:true}])-480)).toBeLessThanOrEqual(2)
    expect(Math.abs(center(1200,[{bounds:rect(0,320),visible:false},{bounds:rect(960,1200),visible:false}])-600)).toBeLessThanOrEqual(2)
    expect(Math.abs(center(800,[{bounds:rect(0,240),visible:true},{bounds:rect(640,800),visible:true}])-440)).toBeLessThanOrEqual(2)
  })

  it('ignores hidden, zero-size, detached, and non-overlapping panel geometry', () => {
    const viewport={left:0,top:0,right:1000,bottom:700,width:1000,height:700}
    expect(projectVisiblePanelInsets(viewport,[
      {bounds:{left:0,top:0,right:240,bottom:700,width:240,height:700},visible:false},
      {bounds:{left:760,top:0,right:1000,bottom:700,width:240,height:700},visible:false},
      {bounds:{left:1000,top:0,right:1240,bottom:700,width:240,height:700},visible:true},
      {bounds:{left:0,top:0,right:0,bottom:700,width:0,height:700},visible:true},
    ])).toEqual({left:0,right:0,bottom:0})
  })
})

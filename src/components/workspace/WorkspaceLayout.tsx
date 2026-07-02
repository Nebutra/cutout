/**
 * WorkspaceLayout (spec §4c) — the 3-pane split view.
 *
 *   Source 26% (min 20)  |  Preview 44% (min 30, grows)  |  RightRail 30% (min 26, max 40)
 *
 * react-resizable-panels v4 dropped `autoSaveId`; we reproduce it with a
 * `defaultLayout` read from localStorage + an `onLayoutChanged` writer, keyed by
 * `WORKSPACE_LAYOUT_KEY`. Below `STACK_BREAKPOINT` the panes stack vertically
 * (spec §4c) — a plain scroll column, no resizing, since vertical dragging on a
 * short window fights the content.
 */
import { useCallback, useMemo } from 'react'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'
import type { Layout } from 'react-resizable-panels'
import { useElementSize } from '@/hooks/useElementSize'
import { WORKSPACE_LAYOUT_KEY, STACK_BREAKPOINT } from '@/lib/constants'
import { SourcePanel } from '@/components/source/SourcePanel'
import { PreviewPanel } from '@/components/preview/PreviewPanel'
import { RightRail } from '@/components/slices/RightRail'

const PANEL_IDS = {
  source: 'acs-source',
  preview: 'acs-preview',
  rail: 'acs-rail',
} as const

/** Read a persisted layout (percentages by panel id) from localStorage. */
function loadLayout(): Layout | undefined {
  try {
    const raw = localStorage.getItem(WORKSPACE_LAYOUT_KEY)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object') return parsed as Layout
  } catch {
    // Corrupt / unavailable storage → fall back to the coded defaults.
  }
  return undefined
}

function persistLayout(layout: Layout): void {
  try {
    localStorage.setItem(WORKSPACE_LAYOUT_KEY, JSON.stringify(layout))
  } catch {
    // Ignore write failures (private mode, quota) — layout is a nicety.
  }
}

export function WorkspaceLayout() {
  const { ref, size } = useElementSize<HTMLDivElement>()
  const stacked = size.width > 0 && size.width < STACK_BREAKPOINT
  const defaultLayout = useMemo(loadLayout, [])

  const onLayoutChanged = useCallback((layout: Layout): void => {
    persistLayout(layout)
  }, [])

  return (
    <div ref={ref} className="min-h-0 flex-1">
      {stacked ? (
        <div className="flex h-full min-h-0 flex-col divide-y divide-border overflow-y-auto">
          <div className="min-h-80 shrink-0">
            <SourcePanel />
          </div>
          <div className="min-h-80 shrink-0">
            <PreviewPanel />
          </div>
          <div className="min-h-96 shrink-0">
            <RightRail />
          </div>
        </div>
      ) : (
        <ResizablePanelGroup
          orientation="horizontal"
          id={WORKSPACE_LAYOUT_KEY}
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
          className="h-full"
        >
          <ResizablePanel id={PANEL_IDS.source} defaultSize="26%" minSize="20%">
            <SourcePanel />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel id={PANEL_IDS.preview} defaultSize="44%" minSize="30%">
            <PreviewPanel />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel
            id={PANEL_IDS.rail}
            defaultSize="30%"
            minSize="26%"
            maxSize="40%"
          >
            <RightRail />
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
    </div>
  )
}

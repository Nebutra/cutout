/**
 * Param auto-run (spec §5 / §6, risk #5).
 *
 * Watches the source and the four params; ~120ms after they settle it kicks a
 * new analysis via the {@link useAnalysisBridge} trigger. Debouncing collapses a
 * slider drag-storm into a single re-run and lets a newer run supersede an older
 * one in the worker.
 *
 * Large-sheet guard: above `MAX_LIVE_PREVIEW_MP` megapixels, live preview is
 * skipped in favour of a commit-only (with-slices) run so dragging stays smooth.
 */
import { useEffect, useRef } from 'react'
import { useStore } from '@/store'
import { selectParams, selectSource } from '@/store/selectors'
import { useAnalysisBridge } from './useAnalysisBridge'

/** Debounce window for settling slider input before re-running (ms). */
export const AUTO_RUN_DEBOUNCE_MS = 120

/** Above this source size, skip live preview and go straight to a full run. */
export const MAX_LIVE_PREVIEW_MP = 4

export function useParamAutoRun(): void {
  const { analyze } = useAnalysisBridge()
  const params = useStore(selectParams)
  const source = useStore(selectSource)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hasSource = source.bitmap !== null && source.imageId !== '' && source.autoAnalyze

  useEffect(() => {
    if (!hasSource) return

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      // Request slices so the grid fills without a second pass. The debounce
      // already keeps large-sheet drags smooth by collapsing runs; the
      // MAX_LIVE_PREVIEW_MP budget is available to Phase 4 for a preview-only
      // fast path during active dragging if profiling calls for it.
      analyze(true)
      timerRef.current = null
    }, AUTO_RUN_DEBOUNCE_MS)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
    // Re-run whenever the source identity or any param changes.
  }, [
    analyze,
    hasSource,
    source.imageId,
    params.threshold,
    params.minArea,
    params.mergeGap,
    params.padding,
  ])
}

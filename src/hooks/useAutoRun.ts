/**
 * Debounced auto-run over an injected analyze trigger.
 *
 * This is the Phase-4 shell's counterpart to `useParamAutoRun`: same ~120ms
 * settle-then-analyze behaviour, but it takes the `analyze` function from a
 * bridge the SHELL already owns. That lets AppShell hold a SINGLE
 * `useAnalysisBridge` (one Worker) and drive both the param-change auto-run AND
 * the manual "Rerun" button from it — avoiding a second worker that calling
 * `useParamAutoRun` (which mounts its own bridge) would create.
 *
 * Behaviour matches spec §5/§6: collapse a slider drag-storm into one run and
 * let a newer runId supersede an older one in the worker.
 */
import { useEffect, useRef } from 'react'
import { useStore } from '@/store'
import { selectParams, selectSlices, selectSource } from '@/store/selectors'
import { AUTO_RUN_DEBOUNCE_MS } from './useParamAutoRun'

export function useAutoRun(analyze: (wantSlices: boolean) => void): void {
  const params = useStore(selectParams)
  const source = useStore(selectSource)
  const slices = useStore(selectSlices)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastImageIdRef = useRef('')
  const lastParamsKeyRef = useRef('')

  const hasSource = source.bitmap !== null && source.imageId !== ''
  const paramsKey = `${params.threshold}:${params.minArea}:${params.mergeGap}:${params.padding}`

  useEffect(() => {
    if (!hasSource) {
      lastImageIdRef.current = ''
      lastParamsKeyRef.current = ''
      return
    }

    // Agent-managed tool loops publish their own cutout result atomically.
    // Loading their board must not schedule the legacy worker a second time.
    if (!source.autoAnalyze) {
      lastImageIdRef.current = source.imageId
      lastParamsKeyRef.current = paramsKey
      return
    }

    if (timerRef.current) clearTimeout(timerRef.current)

    if (lastImageIdRef.current !== source.imageId) {
      lastImageIdRef.current = source.imageId
      lastParamsKeyRef.current = paramsKey
      if (slices.length > 0) return
      analyze(true)
      return
    }

    if (lastParamsKeyRef.current === paramsKey) return
    lastParamsKeyRef.current = paramsKey

    timerRef.current = setTimeout(() => {
      analyze(true)
      timerRef.current = null
    }, AUTO_RUN_DEBOUNCE_MS)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [
    analyze,
    hasSource,
    source.imageId,
    source.autoAnalyze,
    paramsKey,
    slices.length,
  ])
}

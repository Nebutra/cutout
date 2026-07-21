/** Automatically analyze each newly loaded product-managed source once. */
import { useEffect, useRef } from 'react'
import { useStore } from '@/store'
import { selectSliceCount, selectSource } from '@/store/selectors'

export function useAutoRun(analyze: (wantSlices: boolean) => void): void {
  const source = useStore(selectSource)
  const sliceCount = useStore(selectSliceCount)
  const lastImageIdRef = useRef('')
  const hasSource = source.bitmap !== null && source.imageId !== ''

  useEffect(() => {
    if (!hasSource) {
      lastImageIdRef.current = ''
      return
    }

    if (lastImageIdRef.current === source.imageId) return
    lastImageIdRef.current = source.imageId

    // Agent-managed loops publish their own result. Restored sources with
    // slices also keep their persisted result instead of running again.
    if (!source.autoAnalyze || sliceCount > 0) return
    analyze(true)
  }, [
    analyze,
    hasSource,
    source.imageId,
    source.autoAnalyze,
    sliceCount,
  ])
}

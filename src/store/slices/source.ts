/**
 * Source slice (spec §5 / §6).
 *
 * Owns the loaded sheet. `loadImage` is the reset pivot of the whole app: it
 * closes the previous source bitmap, disposes the previous analysis (preview
 * bitmap + slice objectUrls), installs the new bitmap under a fresh `imageId`,
 * and returns state to `idle`. The worker upload + first `beginAnalysis` are
 * driven by `useAutoRun` reacting to the new `imageId`.
 */
import type { StateCreator } from 'zustand'
import type { SourceState, Store } from '@/store/types'
import { INITIAL_ANALYSIS, disposeAnalysis } from './analysis'
import { supersedeActiveProduction } from '@/asset-production'

/** The empty source (nothing dropped yet). */
export const INITIAL_SOURCE: SourceState = {
  bitmap: null,
  encodedImage: null,
  name: '',
  width: 0,
  height: 0,
  imageId: '',
  autoAnalyze: true,
}

export interface SourceSlice {
  source: SourceState
  loadImage(input: {
    bitmap: ImageBitmap
    name: string
    encodedImage?: Blob
    autoAnalyze?: boolean
  }): void
}

export const createSourceSlice: StateCreator<Store, [], [], SourceSlice> = (
  set,
  get,
) => ({
  source: INITIAL_SOURCE,

  loadImage: ({ bitmap, name, encodedImage, autoAnalyze = true }) => {
    const { source, analysis, assetProduction } = get()
    // Release the outgoing source + all analysis resources before replacing.
    source.bitmap?.close()
    disposeAnalysis(analysis)

    set({
      source: {
        bitmap,
        encodedImage: encodedImage ?? null,
        name,
        width: bitmap.width,
        height: bitmap.height,
        imageId: crypto.randomUUID(),
        autoAnalyze,
      },
      analysis: INITIAL_ANALYSIS,
      assetProduction: supersedeActiveProduction(assetProduction),
    })
  },
})

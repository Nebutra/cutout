/**
 * Analysis slice (spec §5 / §6).
 *
 * Owns the analysis lifecycle: monotonic `runId`, status, error, the center
 * preview bitmap, and the committed slices. The core correctness rules:
 *
 *  - `beginAnalysis` bumps `runId` and marks `running`, returning the new id so
 *    the caller can tag the worker request.
 *  - Every apply/fail is guarded by `runId`: a reply for a superseded run is
 *    dropped and its GPU/URL resources released (`bitmap.close()`,
 *    `URL.revokeObjectURL`) — a real leak guard, not optional.
 */
import type { StateCreator } from 'zustand'
import { defaultSliceName } from '@/lib/filename'
import type {
  AnalysisResult,
  AnalysisState,
  Slice,
  SliceInput,
  Store,
} from '@/store/types'

/** The pristine analysis state (no run has happened yet). */
export const INITIAL_ANALYSIS: AnalysisState = {
  status: 'idle',
  runId: 0,
  error: null,
  previewBitmap: null,
  slices: [],
}

/** Close the preview bitmap and revoke every slice objectUrl in a state. */
export function disposeAnalysis(analysis: AnalysisState): void {
  analysis.previewBitmap?.close()
  for (const slice of analysis.slices) URL.revokeObjectURL(slice.objectUrl)
}

/** Build a store {@link Slice} from a raw {@link SliceInput} at a global index. */
function toSlice(input: SliceInput, base: string, index: number): Slice {
  return {
    id: input.id,
    index,
    name: defaultSliceName(base, index),
    box: input.box,
    blob: input.blob,
    objectUrl: URL.createObjectURL(input.blob),
    width: input.width,
    height: input.height,
    selected: false,
    regionId: input.regionId ?? null,
    pageId: input.pageId ?? null,
  }
}

export interface AnalysisSlice {
  analysis: AnalysisState
  beginAnalysis(): number
  applyPreview(runId: number, previewBitmap: ImageBitmap): void
  applyAnalysisResult(runId: number, result: AnalysisResult): void
  commitCutoutResult(result: AnalysisResult): void
  failAnalysis(runId: number, message: string): void
  /**
   * Start a per-region breakdown run: clear prior slices, bump `runId`, mark
   * running. Returns the run id so appends for a superseded run can be dropped.
   */
  beginRegionSlices(): number
  /**
   * Append one region's freshly-cut slices to the running list (does NOT
   * replace) so the UI streams them in as each region finishes. Global
   * `index` is reassigned so it stays unique/monotonic across regions.
   */
  appendRegionSlices(runId: number, result: AnalysisResult): void
  /** Mark a per-region run done (no-op if superseded). */
  finishRegionSlices(runId: number): void
}

export const createAnalysisSlice: StateCreator<Store, [], [], AnalysisSlice> = (
  set,
  get,
) => ({
  analysis: INITIAL_ANALYSIS,

  beginAnalysis: () => {
    const runId = get().analysis.runId + 1
    set((state) => ({
      analysis: {
        ...state.analysis,
        runId,
        status: 'running',
        error: null,
      },
    }))
    return runId
  },

  applyPreview: (runId, previewBitmap) => {
    const { analysis } = get()
    // Stale reply: a newer run superseded this one. Drop + release GPU memory.
    if (runId !== analysis.runId) {
      previewBitmap.close()
      return
    }
    analysis.previewBitmap?.close()
    set((state) => ({ analysis: { ...state.analysis, previewBitmap } }))
  },

  applyAnalysisResult: (runId, result) => {
    const { analysis, source } = get()
    // Stale: the incoming blobs never had objectUrls created, so just drop.
    if (runId !== analysis.runId) return

    // Replace any slices already committed for this run; revoke their URLs.
    for (const prev of analysis.slices) URL.revokeObjectURL(prev.objectUrl)

    const base = source.name || 'asset'
    const slices: Slice[] = result.slices.map((s) => toSlice(s, base, s.index))

    set((state) => ({ analysis: { ...state.analysis, status: 'done', slices } }))
  },

  commitCutoutResult: (result) => {
    const { analysis, source } = get()
    if (!source.bitmap || !source.imageId) {
      throw new Error('The cutout source changed before its result could be published.')
    }
    const base = source.name || 'asset'
    const slices: Slice[] = result.slices.map((slice) => toSlice(slice, base, slice.index))
    for (const previous of analysis.slices) URL.revokeObjectURL(previous.objectUrl)
    analysis.previewBitmap?.close()
    set({
      analysis: {
        ...INITIAL_ANALYSIS,
        runId: analysis.runId + 1,
        status: 'done',
        slices,
      },
    })
  },

  failAnalysis: (runId, message) => {
    if (runId !== get().analysis.runId) return
    set((state) => ({
      analysis: { ...state.analysis, status: 'error', error: message },
    }))
  },

  beginRegionSlices: () => {
    const { analysis } = get()
    for (const previous of analysis.slices) URL.revokeObjectURL(previous.objectUrl)
    analysis.previewBitmap?.close()
    const runId = analysis.runId + 1
    set({
      analysis: {
        ...INITIAL_ANALYSIS,
        runId,
        status: 'running',
      },
    })
    return runId
  },

  appendRegionSlices: (runId, result) => {
    const { analysis, source } = get()
    // Stale: a newer run superseded this one. The blobs never got objectUrls,
    // so dropping them is enough (no leak).
    if (runId !== analysis.runId) return
    const base = source.name || 'asset'
    const offset = analysis.slices.length
    const appended = result.slices.map((slice, i) => toSlice(slice, base, offset + i))
    set((state) => ({
      analysis: {
        ...state.analysis,
        status: 'running',
        slices: [...state.analysis.slices, ...appended],
      },
    }))
  },

  finishRegionSlices: (runId) => {
    if (runId !== get().analysis.runId) return
    set((state) => ({ analysis: { ...state.analysis, status: 'done' } }))
  },
})

/**
 * The single Zustand store (spec §5), composed from five slices:
 *   source · params · analysis · selection · pipeline
 *
 * A single store keeps cross-slice actions (e.g. `loadImage` resetting analysis)
 * trivially consistent while selectors keep components subscribed to the minimum
 * they need. `useShallow` (see `selectors.ts`) guards array selectors. The
 * `pipeline` slice adds the canvas graph topology; its node/edge status is
 * derived from `source`/`analysis`, not stored (see `slices/pipeline.ts`).
 */
import { create } from 'zustand'
import type { Slice, Store } from './types'
import { createSourceSlice, INITIAL_SOURCE } from './slices/source'
import { createParamsSlice, DEFAULT_PARAMS } from './slices/params'
import { createAnalysisSlice, INITIAL_ANALYSIS, disposeAnalysis } from './slices/analysis'
import { createSelectionSlice } from './slices/selection'
import { createPipelineSlice, INITIAL_PIPELINE } from './slices/pipeline'

export const useStore = create<Store>()((set, get, api) => ({
  ...createSourceSlice(set, get, api),
  ...createParamsSlice(set, get, api),
  ...createAnalysisSlice(set, get, api),
  ...createSelectionSlice(set, get, api),
  ...createPipelineSlice(set, get, api),
  resetProject: () => {
    const state = get()
    state.source.bitmap?.close()
    state.mockup?.bitmap.close()
    disposeAnalysis(state.analysis)
    set({
      source: INITIAL_SOURCE,
      params: DEFAULT_PARAMS,
      analysis: INITIAL_ANALYSIS,
      pipeline: INITIAL_PIPELINE,
      brief: '',
      intent: null,
      mockup: null,
      designMarkdown: null,
      workspaceSnapshot: null,
      pendingAgentRun: null,
      genPhase: 'idle',
      genError: null,
      graph: null,
      dagNodes: {},
    })
  },
  restoreProject: (input) => {
    const state = get()
    state.source.bitmap?.close()
    if (state.mockup && state.mockup !== input.mockup) state.mockup.bitmap.close()
    disposeAnalysis(state.analysis)

    const slices: Slice[] = (input.slices ?? []).map((slice) => ({
      id: slice.id,
      index: slice.index,
      name: slice.name,
      box: slice.box,
      blob: slice.blob,
      objectUrl: URL.createObjectURL(slice.blob),
      width: slice.width,
      height: slice.height,
      selected: false,
      regionId: slice.regionId ?? null,
      pageId: slice.pageId ?? null,
    }))

    set({
      source: input.source
        ? {
            bitmap: input.source.bitmap,
            name: input.source.name,
            width: input.source.bitmap.width,
            height: input.source.bitmap.height,
            imageId: crypto.randomUUID(),
            autoAnalyze: (input.source as { autoAnalyze?: boolean }).autoAnalyze ?? true,
          }
        : INITIAL_SOURCE,
      params: input.params ?? DEFAULT_PARAMS,
      analysis: {
        ...INITIAL_ANALYSIS,
        runId: state.analysis.runId + 1,
        status: slices.length > 0 ? 'done' : 'idle',
        slices,
      },
      pipeline: INITIAL_PIPELINE,
      brief: input.brief,
      intent: input.intent ?? null,
      mockup: input.mockup ?? null,
      designMarkdown: input.designMarkdown ?? null,
      workspaceSnapshot: input.workspace ?? null,
      pendingAgentRun: null,
      genPhase: 'idle',
      genError: null,
      graph: null,
      dagNodes: {},
    })
  },
  setWorkspaceSnapshot: (snapshot) => set({ workspaceSnapshot: snapshot }),
}))

/** Non-reactive snapshot accessor (for mutation payloads / worker glue). */
export const getStoreState = useStore.getState

export type { Store } from './types'

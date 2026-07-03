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
import type { Store } from './types'
import { createSourceSlice } from './slices/source'
import { createParamsSlice } from './slices/params'
import { createAnalysisSlice } from './slices/analysis'
import { createSelectionSlice } from './slices/selection'
import { createPipelineSlice } from './slices/pipeline'

export const useStore = create<Store>()((...a) => ({
  ...createSourceSlice(...a),
  ...createParamsSlice(...a),
  ...createAnalysisSlice(...a),
  ...createSelectionSlice(...a),
  ...createPipelineSlice(...a),
}))

/** Non-reactive snapshot accessor (for mutation payloads / worker glue). */
export const getStoreState = useStore.getState

export type { Store } from './types'

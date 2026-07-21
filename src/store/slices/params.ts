/** Internal product-owned cutout configuration. */
import type { StateCreator } from 'zustand'
import type { Params, Store } from '@/store/types'

export const DEFAULT_PARAMS: Params = Object.freeze({
  threshold: 246,
  minArea: 900,
  mergeGap: 18,
  padding: 10,
})

export interface ParamsSlice {
  readonly params: Params
}

export const createParamsSlice: StateCreator<Store, [], [], ParamsSlice> = () => ({
  params: DEFAULT_PARAMS,
})

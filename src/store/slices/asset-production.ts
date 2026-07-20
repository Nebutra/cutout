import type { StateCreator } from 'zustand'
import {
  assetProductionSnapshotSchema,
  emptyAssetProductionSnapshot,
  type AssetProductionSnapshot,
} from '@/asset-production'
import type { Store } from '@/store/types'

export interface AssetProductionStoreSlice {
  assetProduction: AssetProductionSnapshot
  setAssetProduction(snapshot: AssetProductionSnapshot): void
  commitAssetProduction(expectedRevision: number, snapshot: AssetProductionSnapshot): boolean
}

export const INITIAL_ASSET_PRODUCTION = emptyAssetProductionSnapshot()

export const createAssetProductionStoreSlice: StateCreator<
  Store,
  [],
  [],
  AssetProductionStoreSlice
> = (set) => ({
  assetProduction: INITIAL_ASSET_PRODUCTION,
  setAssetProduction: (snapshot) => set({
    assetProduction: assetProductionSnapshotSchema.parse(snapshot),
  }),
  commitAssetProduction: (expectedRevision, snapshot) => {
    const parsed = assetProductionSnapshotSchema.parse(snapshot)
    let committed = false
    set((state) => {
      if (state.assetProduction.revision !== expectedRevision) return state
      committed = true
      return { assetProduction: parsed }
    })
    return committed
  },
})

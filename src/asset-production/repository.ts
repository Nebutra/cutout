import {
  assetProductionSnapshotSchema,
  emptyAssetProductionSnapshot,
  type AssetProductionSnapshot,
} from './contracts'

export interface AssetProductionRepository {
  load(): Promise<AssetProductionSnapshot>
  save(snapshot: AssetProductionSnapshot): Promise<void>
}

export function createMemoryAssetProductionRepository(
  initial: AssetProductionSnapshot = emptyAssetProductionSnapshot(),
): AssetProductionRepository {
  let stored = assetProductionSnapshotSchema.parse(initial)
  return {
    async load() {
      return structuredClone(stored)
    },
    async save(snapshot) {
      if (snapshot.revision < stored.revision) {
        throw new Error('Asset production snapshot revision cannot move backwards.')
      }
      stored = structuredClone(assetProductionSnapshotSchema.parse(snapshot))
    },
  }
}


import { beforeEach, describe, expect, it } from 'vitest'
import { emptyAssetProductionSnapshot } from '@/asset-production'
import { getStoreState } from '@/store'

describe('asset production store publication', () => {
  beforeEach(() => getStoreState().resetProject())

  it('rejects a stale producer instead of overwriting a newer snapshot', () => {
    const first = { ...emptyAssetProductionSnapshot(), revision: 1 }
    expect(getStoreState().commitAssetProduction(0, first)).toBe(true)

    const stale = { ...emptyAssetProductionSnapshot(), revision: 2 }
    expect(getStoreState().commitAssetProduction(0, stale)).toBe(false)
    expect(getStoreState().assetProduction).toEqual(first)
  })
})

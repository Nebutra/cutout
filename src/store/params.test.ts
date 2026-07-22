import { afterEach, describe, expect, it } from 'vitest'
import { getStoreState } from '@/store'
import { DEFAULT_PARAMS } from './slices/params'

describe('internal cutout params', () => {
  afterEach(() => getStoreState().resetProject())

  it('exposes no mutation API and keeps the defaults immutable', () => {
    const state = getStoreState()
    expect(state).not.toHaveProperty('setParam')
    expect(state).not.toHaveProperty('resetParams')
    expect(state.params).toBe(DEFAULT_PARAMS)
    expect(Object.isFrozen(state.params)).toBe(true)
  })

  it('normalizes legacy restored params to current defaults', () => {
    getStoreState().restoreProject({
      brief: 'legacy project',
      params: {
        threshold: 220,
        minArea: 80,
        mergeGap: 80,
        padding: 40,
      },
    })

    expect(getStoreState().params).toBe(DEFAULT_PARAMS)
  })
})

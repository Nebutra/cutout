import { beforeEach, describe, expect, it } from 'vitest'
import { getStoreState } from './index'

describe('pipeline error lifecycle', () => {
  beforeEach(() => getStoreState().resetProject())

  it('clears a superseded generation error without changing the current phase', () => {
    getStoreState().failGen('generate', 'Provider timed out')
    expect(getStoreState()).toMatchObject({
      genPhase: 'idle',
      genError: { op: 'generate', message: 'Provider timed out' },
    })

    getStoreState().clearGenError()

    expect(getStoreState().genPhase).toBe('idle')
    expect(getStoreState().genError).toBeNull()
  })
})

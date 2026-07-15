import { beforeEach, describe, expect, it } from 'vitest'
import { getStoreState } from './index'

describe('agent run request handoff', () => {
  beforeEach(() => getStoreState().resetProject())

  it('can be consumed exactly once', () => {
    const request = getStoreState().requestAgentRun('create-assets')

    expect(getStoreState().pendingAgentRun).toEqual(request)
    expect(getStoreState().consumeAgentRun()).toEqual(request)
    expect(getStoreState().consumeAgentRun()).toBeNull()
    expect(getStoreState().pendingAgentRun).toBeNull()
  })

  it('replaces an unconsumed request with the latest explicit intent', () => {
    const first = getStoreState().requestAgentRun('create-assets')
    const second = getStoreState().requestAgentRun('create-assets')

    expect(second.id).not.toBe(first.id)
    expect(getStoreState().consumeAgentRun()).toEqual(second)
  })

  it('does not carry a paid action request across project reset', () => {
    getStoreState().requestAgentRun('create-assets')
    getStoreState().resetProject()

    expect(getStoreState().consumeAgentRun()).toBeNull()
  })

  it('does not carry a paid action request into a restored project', () => {
    getStoreState().requestAgentRun('create-assets')
    getStoreState().restoreProject({ brief: 'Restored project' })

    expect(getStoreState().consumeAgentRun()).toBeNull()
  })
})

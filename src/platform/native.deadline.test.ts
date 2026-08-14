import { beforeEach, describe, expect, it, vi } from 'vitest'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))

vi.mock('@tauri-apps/api/core', () => ({ invoke }))

import { tauriBridge } from './native'

describe('native monotonic deadline bridge', () => {
  beforeEach(() => invoke.mockReset())

  it('passes only an opaque handle and reviewed duration to fixed native commands', async () => {
    invoke.mockResolvedValue(undefined)

    await tauriBridge.waitForMonotonicDeadline?.('deadline-id', 300_000)
    await tauriBridge.cancelMonotonicDeadline?.('deadline-id')

    expect(invoke).toHaveBeenCalledWith('wait_for_monotonic_deadline', {
      deadlineId: 'deadline-id',
      timeoutMs: 300_000,
    })
    expect(invoke).toHaveBeenCalledWith('cancel_monotonic_deadline', {
      deadlineId: 'deadline-id',
    })
  })

  it('keeps the renderer contract limited to the fixed native deadline commands', () => {
    expect(tauriBridge.waitForMonotonicDeadline).toBeTypeOf('function')
    expect(tauriBridge.cancelMonotonicDeadline).toBeTypeOf('function')
  })
})

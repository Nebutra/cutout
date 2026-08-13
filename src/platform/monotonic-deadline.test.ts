import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMonotonicDeadline } from './monotonic-deadline'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('monotonic deadline', () => {
  it('uses the native waiter when renderer timers are disabled', async () => {
    let settleNative!: () => void
    const native = new Promise<void>((resolve) => {
      settleNative = resolve
    })
    const waitForMonotonicDeadline = vi.fn(
      (_deadlineId: string, _timeoutMs: number) => native,
    )
    const cancelMonotonicDeadline = vi.fn(async (_deadlineId: string) => undefined)
    vi.stubGlobal('__TAURI_INTERNALS__', { invoke: vi.fn() })
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(() => 0 as never)

    const deadline = createMonotonicDeadline(300_000, {
      waitForMonotonicDeadline,
      cancelMonotonicDeadline,
    })
    settleNative()

    await expect(deadline.elapsed).resolves.toBe(true)
    expect(waitForMonotonicDeadline).toHaveBeenCalledWith(
      expect.stringMatching(/^[0-9a-f-]{36}$/),
      300_000,
    )
    expect(cancelMonotonicDeadline).not.toHaveBeenCalled()
    expect(globalThis.setTimeout).not.toHaveBeenCalled()
  })

  it('cancels an outstanding native sleep by its opaque handle', async () => {
    const waitForMonotonicDeadline = vi.fn(
      (_deadlineId: string, _timeoutMs: number) => new Promise<void>(() => undefined),
    )
    const cancelMonotonicDeadline = vi.fn(async (_deadlineId: string) => undefined)
    vi.stubGlobal('__TAURI_INTERNALS__', { invoke: vi.fn() })

    const deadline = createMonotonicDeadline(300_000, {
      waitForMonotonicDeadline,
      cancelMonotonicDeadline,
    })
    deadline.cancel()

    await expect(deadline.elapsed).resolves.toBe(false)
    expect(cancelMonotonicDeadline).toHaveBeenCalledWith(
      waitForMonotonicDeadline.mock.calls[0]![0],
    )
  })

  it('fails closed when the native waiter is unavailable', async () => {
    const waitForMonotonicDeadline = vi.fn(async (
      _deadlineId: string,
      _timeoutMs: number,
    ) => {
      throw new Error('command not allowed')
    })
    const cancelMonotonicDeadline = vi.fn(async (_deadlineId: string) => undefined)
    vi.stubGlobal('__TAURI_INTERNALS__', { invoke: vi.fn() })
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(() => 0 as never)

    const deadline = createMonotonicDeadline(300_000, {
      waitForMonotonicDeadline,
      cancelMonotonicDeadline,
    })

    await expect(deadline.elapsed).resolves.toBe(true)
    expect(globalThis.setTimeout).not.toHaveBeenCalled()
  })

  it('cancels the browser fallback without reporting elapsed', async () => {
    vi.useFakeTimers()
    try {
      const deadline = createMonotonicDeadline(300_000, {})
      deadline.cancel()
      await expect(deadline.elapsed).resolves.toBe(false)
      await vi.advanceTimersByTimeAsync(300_000)
      await expect(deadline.elapsed).resolves.toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})

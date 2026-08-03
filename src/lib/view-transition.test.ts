import { afterEach, describe, expect, it, vi } from 'vitest'
import { withViewTransitionApplied } from './view-transition'

describe('withViewTransitionApplied', () => {
  const originalStartViewTransition = document.startViewTransition

  afterEach(() => {
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: originalStartViewTransition,
    })
  })

  it('resolves after a deferred native transition applies the update', async () => {
    let apply: (() => void) | undefined
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: vi.fn((callback: () => void) => {
        apply = callback
        return { finished: Promise.resolve() }
      }),
    })
    const update = vi.fn()
    let settled = false
    const completion = withViewTransitionApplied(update).then(() => {
      settled = true
    })

    await Promise.resolve()
    expect(update).not.toHaveBeenCalled()
    expect(settled).toBe(false)

    apply?.()
    await completion
    expect(update).toHaveBeenCalledOnce()
    expect(settled).toBe(true)
  })

  it('applies synchronously when native transitions are unavailable', async () => {
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: undefined,
    })
    const update = vi.fn()

    const completion = withViewTransitionApplied(update)

    expect(update).toHaveBeenCalledOnce()
    await expect(completion).resolves.toBeUndefined()
  })

  it('ignores visual transition rejection after the state update applies', async () => {
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: vi.fn((callback: () => void) => {
        callback()
        return {
          ready: Promise.reject(new DOMException('Transition skipped', 'InvalidStateError')),
          updateCallbackDone: Promise.resolve(),
          finished: Promise.resolve(),
        }
      }),
    })
    const update = vi.fn()

    await expect(withViewTransitionApplied(update)).resolves.toBeUndefined()
    expect(update).toHaveBeenCalledOnce()
  })
})

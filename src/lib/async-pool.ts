export async function forEachConcurrent<T>(
  items: readonly T[],
  concurrency: number,
  run: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return
  const requested = Number.isFinite(concurrency) ? Math.floor(concurrency) : 1
  const limit = Math.max(1, Math.min(requested, items.length))
  let nextIndex = 0
  let failed = false
  let failure: unknown

  async function worker(): Promise<void> {
    for (;;) {
      if (failed) return
      const index = nextIndex
      nextIndex += 1
      if (index >= items.length) return
      try {
        await run(items[index]!, index)
      } catch (error) {
        if (!failed) {
          failed = true
          failure = error
        }
        return
      }
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()))
  if (failed) throw failure
}

export type AsyncLimiter = <T>(run: () => Promise<T>) => Promise<T>

/**
 * Create a reusable bounded lane for promise-producing work.
 *
 * A released slot transfers directly to the oldest waiter before new callers
 * can claim it, so queued work cannot be starved or briefly exceed the limit.
 */
export function createAsyncLimiter(concurrency: number): AsyncLimiter {
  const requested = Number.isFinite(concurrency) ? Math.floor(concurrency) : 1
  const limit = Math.max(1, requested)
  const waiters: Array<() => void> = []
  let active = 0

  const acquire = async (): Promise<void> => {
    if (active < limit) {
      active += 1
      return
    }
    await new Promise<void>((resolve) => waiters.push(resolve))
  }

  const release = (): void => {
    const next = waiters.shift()
    if (next) {
      next()
      return
    }
    active -= 1
  }

  return async <T>(run: () => Promise<T>): Promise<T> => {
    await acquire()
    try {
      return await run()
    } finally {
      release()
    }
  }
}

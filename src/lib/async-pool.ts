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

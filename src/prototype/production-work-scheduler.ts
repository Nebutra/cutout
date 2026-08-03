import { forEachConcurrent } from '@/lib/async-pool'

/** One deterministic bounded owner for every image-producing production item. */
export async function schedulePrototypeProductionWork<Work>(input: {
  readonly work: readonly Work[]
  readonly concurrency: number
  readonly run: (work: Work, index: number) => Promise<void>
}): Promise<void> {
  await forEachConcurrent(input.work, input.concurrency, input.run)
}

/** Stable round-robin lane merge prevents either work class from sitting behind a full phase. */
export function interleavePrototypeProductionWork<Work>(
  ...lanes: readonly (readonly Work[])[]
): Work[] {
  const work: Work[] = []
  const maximum = Math.max(0, ...lanes.map((lane) => lane.length))
  for (let index = 0; index < maximum; index += 1) {
    for (const lane of lanes) {
      const item = lane[index]
      if (item !== undefined) work.push(item)
    }
  }
  return work
}

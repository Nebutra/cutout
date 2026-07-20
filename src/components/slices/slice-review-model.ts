import type { Slice } from '@/store/types'
import type { ProductionReviewProjection } from '@/asset-production'

export const needsSliceReview = (slice: Slice) =>
  slice.readiness === 'needs-review'
  || slice.readiness === 'failed'
  || slice.reviewIssues.length > 0
  || (slice.confidence !== null && slice.confidence < 0.75)

export function unprojectedProductionBlockers(
  queue: readonly ProductionReviewProjection[],
  slices: readonly Slice[],
): readonly ProductionReviewProjection[] {
  const visibleTaskIds = new Set(
    slices.flatMap((slice) => slice.productionTaskId ? [slice.productionTaskId] : []),
  )
  return queue.filter((item) => !visibleTaskIds.has(item.taskId))
}

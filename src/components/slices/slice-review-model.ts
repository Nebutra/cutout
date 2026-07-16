import type { Slice } from '@/store/types'

export const needsSliceReview = (slice: Slice) =>
  slice.reviewIssues.length > 0 || (slice.confidence !== null && slice.confidence < 0.75)

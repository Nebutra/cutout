import { describe, expect, it } from 'vitest'
import {
  prototypePageReviewRecordSchema,
  prototypeResourceReviewRecordSchema,
} from './review-evidence'

const digest = 'a'.repeat(64)
const reviewedAt = '2026-08-04T00:00:00.000Z'
const reviewer = { providerId: 'provider', model: 'vision-model' }

describe('prototype review evidence authority', () => {
  it('requires a real reviewer for completed visual QA', () => {
    expect(prototypePageReviewRecordSchema.safeParse({
      version: 'prototype-page-review.v1',
      artifactSha256: digest,
      reviewer,
      verdict: { pass: true, failures: [] },
      reviewedAt,
    }).success).toBe(true)
    expect(prototypePageReviewRecordSchema.safeParse({
      version: 'prototype-page-review.v1',
      artifactSha256: digest,
      reviewer: null,
      verdict: { pass: true, failures: [] },
      reviewedAt,
    }).success).toBe(false)
  })

  it('does not invent a reviewer when visual QA is unavailable', () => {
    const unavailable = {
      verdict: {
        pass: false,
        failures: ['Visual QA evidence is unavailable.'],
        unavailable: true,
      },
      reviewedAt,
    }
    expect(prototypeResourceReviewRecordSchema.safeParse({
      version: 'prototype-resource-review.v1',
      artifactId: 'artifact.1',
      reviewer: null,
      observationalIssues: [],
      ...unavailable,
    }).success).toBe(true)
    expect(prototypeResourceReviewRecordSchema.safeParse({
      version: 'prototype-resource-review.v1',
      artifactId: 'artifact.1',
      reviewer,
      observationalIssues: [],
      ...unavailable,
    }).success).toBe(false)
  })
})

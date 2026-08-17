import { z } from 'zod'
import {
  commerceProjectProductionResultSchema,
  type CommerceProjectProductionResult,
} from './project-production'

export const COMMERCE_PROJECT_LIFECYCLE_SCHEMA = 'commerce.project-lifecycle.v1' as const

const artifactHashesSchema = z.array(z.string().regex(/^[a-f0-9]{64}$/)).min(1).max(64)

export const commerceProjectLifecycleRecordSchema = z.object({
  schema: z.literal(COMMERCE_PROJECT_LIFECYCLE_SCHEMA),
  designRevisionId: z.string().min(1).max(240),
  result: commerceProjectProductionResultSchema,
  review: z.object({
    status: z.literal('accepted'),
    reviewedAt: z.string().datetime(),
    artifactHashes: artifactHashesSchema,
  }).strict().optional(),
  delivery: z.object({
    status: z.literal('download-requested'),
    requestedAt: z.string().datetime(),
    artifactHashes: artifactHashesSchema,
  }).strict().optional(),
}).strict().superRefine((record, context) => {
  const expected = record.result.deliverables.map((deliverable) => deliverable.sha256)
  const exact = (actual: readonly string[]) => (
    actual.length === expected.length
    && actual.every((value, index) => value === expected[index])
  )
  if (record.review && !exact(record.review.artifactHashes)) {
    context.addIssue({
      code: 'custom',
      path: ['review', 'artifactHashes'],
      message: 'Commerce review must bind the exact ordered production artifacts.',
    })
  }
  if (record.delivery && !record.review) {
    context.addIssue({
      code: 'custom',
      path: ['delivery'],
      message: 'Commerce delivery requires an accepted review.',
    })
  }
  if (record.delivery && !exact(record.delivery.artifactHashes)) {
    context.addIssue({
      code: 'custom',
      path: ['delivery', 'artifactHashes'],
      message: 'Commerce delivery must bind the exact ordered reviewed artifacts.',
    })
  }
})

export type CommerceProjectLifecycleRecord = z.infer<typeof commerceProjectLifecycleRecordSchema>

function artifactHashes(result: CommerceProjectProductionResult): readonly string[] {
  return result.deliverables.map((deliverable) => deliverable.sha256)
}

export function createCommerceProjectLifecycleRecord(input: {
  readonly designRevisionId: string
  readonly result: CommerceProjectProductionResult
}): CommerceProjectLifecycleRecord {
  return commerceProjectLifecycleRecordSchema.parse({
    schema: COMMERCE_PROJECT_LIFECYCLE_SCHEMA,
    designRevisionId: input.designRevisionId,
    result: input.result,
  })
}

export function acceptCommerceProjectLifecycleRecord(
  record: CommerceProjectLifecycleRecord,
  reviewedAt = new Date().toISOString(),
): CommerceProjectLifecycleRecord {
  return commerceProjectLifecycleRecordSchema.parse({
    ...record,
    review: {
      status: 'accepted',
      reviewedAt,
      artifactHashes: artifactHashes(record.result),
    },
    delivery: undefined,
  })
}

export function requestCommerceProjectDownload(
  record: CommerceProjectLifecycleRecord,
  requestedAt = new Date().toISOString(),
): CommerceProjectLifecycleRecord {
  if (!record.review) throw new Error('Review the Commerce set before requesting delivery.')
  return commerceProjectLifecycleRecordSchema.parse({
    ...record,
    delivery: {
      status: 'download-requested',
      requestedAt,
      artifactHashes: artifactHashes(record.result),
    },
  })
}

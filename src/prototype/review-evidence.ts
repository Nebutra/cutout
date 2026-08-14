import { z } from 'zod'
import type { ProductionTaskState } from '@/asset-production/contracts'

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const routeSchema = z.object({
  providerId: z.string().min(1).max(160),
  model: z.string().min(1).max(300),
}).strict()

export const prototypeReviewVerdictSchema = z.object({
  pass: z.boolean(),
  failures: z.array(z.string().min(1).max(500)).max(8),
  unavailable: z.boolean().optional(),
}).strict()

export const prototypePageReviewRecordSchema = z.object({
  version: z.literal('prototype-page-review.v1'),
  artifactSha256: sha256Schema,
  reviewer: routeSchema.nullable(),
  verdict: prototypeReviewVerdictSchema,
  reviewedAt: z.string().datetime(),
}).strict().superRefine((record, context) => {
  if ((record.verdict.unavailable === true) !== (record.reviewer === null)) {
    context.addIssue({
      code: 'custom',
      path: ['reviewer'],
      message: record.verdict.unavailable === true
        ? 'Unavailable visual QA cannot claim a reviewer.'
        : 'Completed visual QA requires its reviewer route.',
    })
  }
})
export type PrototypePageReviewRecord = z.infer<typeof prototypePageReviewRecordSchema>

export function isPassingPrototypePageReview(
  input: unknown,
): input is PrototypePageReviewRecord {
  const parsed = prototypePageReviewRecordSchema.safeParse(input)
  return parsed.success
    && parsed.data.verdict.pass
    && parsed.data.verdict.unavailable !== true
}

export function countPassingPrototypePageReviews(
  artifacts: readonly { readonly review?: unknown }[],
): number {
  return artifacts.filter((artifact) =>
    isPassingPrototypePageReview(artifact.review)
  ).length
}

export const prototypeResourceReviewRecordSchema = z.object({
  version: z.literal('prototype-resource-review.v1'),
  artifactId: z.string().min(1).max(240),
  reviewer: routeSchema.nullable(),
  verdict: prototypeReviewVerdictSchema,
  observationalIssues: z.array(z.object({
    code: z.string().min(1).max(120),
    message: z.string().min(1).max(2_000),
  }).strict()),
  reviewedAt: z.string().datetime(),
}).strict().superRefine((record, context) => {
  if ((record.verdict.unavailable === true) !== (record.reviewer === null)) {
    context.addIssue({
      code: 'custom',
      path: ['reviewer'],
      message: record.verdict.unavailable === true
        ? 'Unavailable visual QA cannot claim a reviewer.'
        : 'Completed visual QA requires its reviewer route.',
    })
  }
})
export type PrototypeResourceReviewRecord = z.infer<typeof prototypeResourceReviewRecordSchema>

export function projectPrototypeResourceReviewRecord(input: {
  readonly artifactId: string
  readonly task: ProductionTaskState
  readonly reviewer: { readonly providerId: string; readonly model: string } | null
}): PrototypeResourceReviewRecord {
  const verdict = input.task.evidence?.qaVerdict ?? {
    pass: false,
    failures: ['Visual QA evidence is unavailable.'],
    unavailable: true,
  }
  return prototypeResourceReviewRecordSchema.parse({
    version: 'prototype-resource-review.v1',
    artifactId: input.artifactId,
    reviewer: verdict.unavailable === true ? null : input.reviewer,
    verdict,
    observationalIssues: input.task.issues
      .filter((issue) => issue.kind !== 'integrity')
      .map((issue) => ({ code: issue.code, message: issue.message })),
    reviewedAt: new Date(input.task.updatedAt).toISOString(),
  })
}

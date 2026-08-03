import { z } from 'zod'
import type { ProductionTaskState } from '@/asset-production/contracts'

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const routeSchema = z.object({
  providerId: z.string().min(1).max(160),
  model: z.string().min(1).max(300),
}).strict()

export const prototypeReviewVerdictSchema = z.object({
  pass: z.boolean(),
  failures: z.array(z.string().min(1).max(2_000)),
  unavailable: z.boolean().optional(),
}).strict()

export const prototypePageReviewRecordSchema = z.object({
  version: z.literal('prototype-page-review.v1'),
  artifactSha256: sha256Schema,
  reviewer: routeSchema,
  verdict: prototypeReviewVerdictSchema,
  reviewedAt: z.string().datetime(),
}).strict()
export type PrototypePageReviewRecord = z.infer<typeof prototypePageReviewRecordSchema>

export const prototypeResourceReviewRecordSchema = z.object({
  version: z.literal('prototype-resource-review.v1'),
  artifactId: z.string().min(1).max(240),
  reviewer: routeSchema,
  verdict: prototypeReviewVerdictSchema,
  observationalIssues: z.array(z.object({
    code: z.string().min(1).max(120),
    message: z.string().min(1).max(2_000),
  }).strict()),
  reviewedAt: z.string().datetime(),
}).strict()
export type PrototypeResourceReviewRecord = z.infer<typeof prototypeResourceReviewRecordSchema>

export function projectPrototypeResourceReviewRecord(input: {
  readonly artifactId: string
  readonly task: ProductionTaskState
  readonly reviewer: { readonly providerId: string; readonly model: string }
}): PrototypeResourceReviewRecord {
  const verdict = input.task.evidence?.qaVerdict ?? {
    pass: false,
    failures: ['Visual QA evidence is unavailable.'],
    unavailable: true,
  }
  return prototypeResourceReviewRecordSchema.parse({
    version: 'prototype-resource-review.v1',
    artifactId: input.artifactId,
    reviewer: input.reviewer,
    verdict,
    observationalIssues: input.task.issues
      .filter((issue) => issue.kind !== 'integrity')
      .map((issue) => ({ code: issue.code, message: issue.message })),
    reviewedAt: new Date(input.task.updatedAt).toISOString(),
  })
}

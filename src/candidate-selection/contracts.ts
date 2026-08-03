import { z } from 'zod'
import { moneyEstimateSchema } from '@/control-protocol/paid-tool-contract'
import { err, ok, type Result } from '@/services/types'

const candidateIdSchema = z.string().min(1).max(160)
const candidateTextSchema = z.string().trim().min(1).max(2_000)
const candidateAxisSchema = z.string().trim().min(1).max(160)

export const candidateSetKindSchema = z.enum([
  'design-system',
  'prototype-plan',
  'prototype-suite',
])

export const candidateDirectionSchema = z.object({
  id: candidateIdSchema,
  label: z.string().trim().min(1).max(160),
  thesis: candidateTextSchema,
  vary: z.array(candidateAxisSchema).min(1).max(32),
  preserve: z.array(candidateAxisSchema).min(1).max(32),
}).strict().superRefine((direction, context) => {
  addDuplicateIssues(direction.vary, context, ['vary'], 'varied axis')
  addDuplicateIssues(direction.preserve, context, ['preserve'], 'preserved constraint')
  const preserved = new Set(direction.preserve.map(normalizeText))
  for (const [index, axis] of direction.vary.entries()) {
    if (preserved.has(normalizeText(axis))) {
      context.addIssue({
        code: 'custom',
        path: ['vary', index],
        message: `Direction axis "${axis}" cannot be both varied and preserved.`,
      })
    }
  }
})

export const candidateExplorationBoundsSchema = z.object({
  maxCandidates: z.number().int().positive(),
  maxParallelism: z.number().int().positive(),
}).strict()

export const candidateExplorationDecisionSchema = z.object({
  mode: z.enum(['auto', 'fixed']),
  decidedBy: z.enum(['user', 'agent', 'fallback']),
  count: z.number().int().positive(),
  rationale: candidateTextSchema,
  directions: z.array(candidateDirectionSchema).min(1),
  bounds: candidateExplorationBoundsSchema,
  estimate: moneyEstimateSchema.optional(),
}).strict().superRefine((decision, context) => {
  if (decision.count > decision.bounds.maxCandidates) {
    context.addIssue({
      code: 'custom',
      path: ['count'],
      message: `Candidate count ${decision.count} exceeds the runtime maximum ${decision.bounds.maxCandidates}.`,
    })
  }
  if (decision.directions.length !== decision.count) {
    context.addIssue({
      code: 'custom',
      path: ['directions'],
      message: `Candidate direction count ${decision.directions.length} must equal resolved count ${decision.count}.`,
    })
  }
  if (decision.decidedBy === 'fallback' && decision.count !== 1) {
    context.addIssue({
      code: 'custom',
      path: ['count'],
      message: 'A fallback exploration decision must use one conservative direction.',
    })
  }
  addDuplicateIssues(decision.directions.map(({ id }) => id), context, ['directions'], 'direction id')
  addDuplicateIssues(decision.directions.map(({ thesis }) => thesis), context, ['directions'], 'direction thesis')
})

export const candidateOutputSchema = z.object({
  role: z.string().trim().min(1).max(160),
  materialId: candidateIdSchema,
}).strict()

export const candidateSchema = z.object({
  id: candidateIdSchema,
  directionId: candidateIdSchema,
  status: z.enum(['planned', 'generating', 'ready', 'failed', 'cancelled']),
  outputs: z.array(candidateOutputSchema).default([]),
  provenanceIds: z.array(candidateIdSchema).default([]),
  error: z.string().trim().min(1).max(4_000).optional(),
}).strict().superRefine((candidate, context) => {
  addDuplicateIssues(candidate.outputs.map(({ role }) => role), context, ['outputs'], 'output role')
  addDuplicateIssues(candidate.outputs.map(({ materialId }) => materialId), context, ['outputs'], 'output material')
  addDuplicateIssues(candidate.provenanceIds, context, ['provenanceIds'], 'provenance id')
  if (candidate.status === 'ready' && candidate.outputs.length === 0) {
    context.addIssue({ code: 'custom', path: ['outputs'], message: 'A ready candidate requires at least one output material.' })
  }
  if (candidate.status === 'ready' && candidate.provenanceIds.length === 0) {
    context.addIssue({ code: 'custom', path: ['provenanceIds'], message: 'A ready candidate requires provenance.' })
  }
  if (candidate.status === 'failed' && !candidate.error) {
    context.addIssue({ code: 'custom', path: ['error'], message: 'A failed candidate requires an error.' })
  }
})

export const candidateSelectionSchema = z.object({
  candidateId: candidateIdSchema,
  selectedAt: z.iso.datetime({ offset: true }),
  actor: z.object({
    kind: z.enum(['human', 'agent']),
    id: candidateIdSchema,
  }).strict(),
  baseRevisionId: candidateIdSchema,
  provenanceId: candidateIdSchema,
}).strict()

export const candidateSetSchema = z.object({
  id: candidateIdSchema,
  kind: candidateSetKindSchema,
  baseRevisionId: candidateIdSchema,
  proposal: candidateExplorationDecisionSchema,
  candidates: z.array(candidateSchema).min(1),
  selection: candidateSelectionSchema.optional(),
}).strict().superRefine((candidateSet, context) => {
  if (candidateSet.candidates.length !== candidateSet.proposal.count) {
    context.addIssue({
      code: 'custom',
      path: ['candidates'],
      message: `Candidate count ${candidateSet.candidates.length} must equal proposal count ${candidateSet.proposal.count}.`,
    })
  }
  addDuplicateIssues(candidateSet.candidates.map(({ id }) => id), context, ['candidates'], 'candidate id')
  addDuplicateIssues(candidateSet.candidates.map(({ directionId }) => directionId), context, ['candidates'], 'candidate direction')

  const directionIds = new Set(candidateSet.proposal.directions.map(({ id }) => id))
  for (const [index, candidate] of candidateSet.candidates.entries()) {
    if (!directionIds.has(candidate.directionId)) {
      context.addIssue({
        code: 'custom',
        path: ['candidates', index, 'directionId'],
        message: `Candidate "${candidate.id}" references unknown direction "${candidate.directionId}".`,
      })
    }
  }

  if (!candidateSet.selection) return
  if (candidateSet.selection.baseRevisionId !== candidateSet.baseRevisionId) {
    context.addIssue({
      code: 'custom',
      path: ['selection', 'baseRevisionId'],
      message: 'Candidate selection is bound to a stale base revision.',
    })
  }
  const selected = candidateSet.candidates.find(({ id }) => id === candidateSet.selection?.candidateId)
  if (!selected) {
    context.addIssue({
      code: 'custom',
      path: ['selection', 'candidateId'],
      message: `Candidate selection references unknown candidate "${candidateSet.selection.candidateId}".`,
    })
    return
  }
  if (selected.status !== 'ready') {
    context.addIssue({
      code: 'custom',
      path: ['selection', 'candidateId'],
      message: `Candidate "${selected.id}" is not ready and cannot be selected.`,
    })
  }
  const readyCount = candidateSet.candidates.filter(({ status }) => status === 'ready').length
  if (readyCount > 1 && candidateSet.selection.actor.kind !== 'human') {
    context.addIssue({
      code: 'custom',
      path: ['selection', 'actor', 'kind'],
      message: 'Selecting among multiple ready candidates requires a human actor.',
    })
  }
})

export type CandidateSetKind = z.infer<typeof candidateSetKindSchema>
export type CandidateDirection = z.infer<typeof candidateDirectionSchema>
export type CandidateExplorationBounds = z.infer<typeof candidateExplorationBoundsSchema>
export type CandidateExplorationDecision = z.infer<typeof candidateExplorationDecisionSchema>
export type CandidateOutput = z.infer<typeof candidateOutputSchema>
export type Candidate = z.infer<typeof candidateSchema>
export type CandidateSelection = z.infer<typeof candidateSelectionSchema>
export type CandidateSet = z.infer<typeof candidateSetSchema>

export function validateCandidateExplorationDecision(input: unknown): Result<CandidateExplorationDecision> {
  const parsed = candidateExplorationDecisionSchema.safeParse(input)
  return parsed.success ? ok(parsed.data) : err(parsed.error.issues[0]?.message ?? 'Invalid candidate exploration decision.')
}

export function validateCandidateSet(input: unknown): Result<CandidateSet> {
  const parsed = candidateSetSchema.safeParse(input)
  return parsed.success ? ok(parsed.data) : err(parsed.error.issues[0]?.message ?? 'Invalid candidate set.')
}

function addDuplicateIssues(
  values: readonly string[],
  context: z.RefinementCtx,
  path: PropertyKey[],
  label: string,
): void {
  const seen = new Set<string>()
  for (const [index, value] of values.entries()) {
    const normalized = normalizeText(value)
    if (seen.has(normalized)) {
      context.addIssue({ code: 'custom', path: [...path, index], message: `Duplicate ${label} "${value}".` })
    }
    seen.add(normalized)
  }
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
}

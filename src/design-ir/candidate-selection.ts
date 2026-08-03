import { z } from 'zod'
import { err, ok, type Result } from '@/services/types'
import {
  candidateSelectionSchema,
  candidateSetSchema,
  type CandidateSelection,
} from '@/candidate-selection/contracts'
import type { DesignDocument, NormalizedDesignDocument, Provenance } from './schema'
import { validateDesignDocument } from './validate'

const selectionIdSchema = z.string().min(1).max(160)

export const candidateSelectionRequestSchema = z.object({
  candidateSetId: selectionIdSchema,
  candidateId: selectionIdSchema,
  baseRevisionId: selectionIdSchema,
  selectedAt: z.iso.datetime({ offset: true }),
  actor: candidateSelectionSchema.shape.actor,
  provenanceId: selectionIdSchema,
}).strict()

export type CandidateSelectionRequest = z.infer<typeof candidateSelectionRequestSchema>

export interface CandidateSelectionRevisionGuard {
  readonly documentId: string
  readonly revisionId: string
  readonly revisionNumber: number
}

export interface CandidateSelectionPreview {
  readonly kind: 'candidate-selection-preview'
  readonly base: CandidateSelectionRevisionGuard
  readonly candidateSetId: string
  readonly selection: CandidateSelection
  readonly provenance: Provenance
  readonly impact: {
    readonly previousCandidateId?: string
    readonly nextRevisionNumber: number
    readonly noChanges: boolean
  }
}

export interface ApplyCandidateSelectionOptions {
  readonly revisionId: string
}

/** Build a revision-bound selection preview without mutating Design IR. */
export function prepareCandidateSelection(
  input: DesignDocument,
  requestInput: unknown,
): Result<CandidateSelectionPreview> {
  const validation = validateDesignDocument(input)
  if (!validation.ok) return err(`Invalid DesignDocument: ${validation.error}`)
  const document = validation.data.document
  const request = candidateSelectionRequestSchema.safeParse(requestInput)
  if (!request.success) return err(request.error.issues[0]?.message ?? 'Invalid candidate selection request.')

  const candidateSet = document.candidateSets.find(({ id }) => id === request.data.candidateSetId)
  if (!candidateSet) return err(`Unknown candidate set "${request.data.candidateSetId}".`)
  if (candidateSet.baseRevisionId !== request.data.baseRevisionId) {
    return err(
      `Stale candidate selection: set "${candidateSet.id}" targets ${candidateSet.baseRevisionId}, `
      + `but the request targets ${request.data.baseRevisionId}.`,
    )
  }

  const selected = candidateSet.candidates.find(({ id }) => id === request.data.candidateId)
  if (!selected) return err(`Candidate set "${candidateSet.id}" has no candidate "${request.data.candidateId}".`)
  if (selected.status !== 'ready') return err(`Candidate "${selected.id}" is not ready and cannot be selected.`)
  const readyCount = candidateSet.candidates.filter(({ status }) => status === 'ready').length
  if (readyCount > 1 && request.data.actor.kind !== 'human') {
    return err('Selecting among multiple ready candidates requires a human actor.')
  }

  if (
    candidateSet.selection?.candidateId === selected.id
    && candidateSet.selection.baseRevisionId === candidateSet.baseRevisionId
  ) {
    const existingProvenance = document.provenance.find(({ id }) => id === candidateSet.selection?.provenanceId)
    if (!existingProvenance) return err(`Selection provenance "${candidateSet.selection.provenanceId}" is missing.`)
    return ok({
      kind: 'candidate-selection-preview',
      base: revisionGuard(document),
      candidateSetId: candidateSet.id,
      selection: candidateSet.selection,
      provenance: existingProvenance,
      impact: {
        previousCandidateId: candidateSet.selection.candidateId,
        nextRevisionNumber: document.revision.number,
        noChanges: true,
      },
    })
  }

  if (document.provenance.some(({ id }) => id === request.data.provenanceId)) {
    return err(`Candidate selection provenance id "${request.data.provenanceId}" already exists.`)
  }
  const candidateProvenance = selected.provenanceIds.map((id) =>
    document.provenance.find((record) => record.id === id),
  )
  if (candidateProvenance.some((record) => !record)) {
    return err(`Candidate "${selected.id}" has missing provenance.`)
  }
  const sourceIds = [...new Set(candidateProvenance.flatMap((record) => record?.sourceIds ?? []))].sort()
  if (sourceIds.length === 0) return err(`Candidate "${selected.id}" has no source-bound provenance.`)

  const selection: CandidateSelection = {
    candidateId: selected.id,
    selectedAt: request.data.selectedAt,
    actor: request.data.actor,
    baseRevisionId: candidateSet.baseRevisionId,
    provenanceId: request.data.provenanceId,
  }
  const selectedSet = candidateSetSchema.safeParse({ ...candidateSet, selection })
  if (!selectedSet.success) return err(selectedSet.error.issues[0]?.message ?? 'Invalid candidate selection.')

  return ok({
    kind: 'candidate-selection-preview',
    base: revisionGuard(document),
    candidateSetId: candidateSet.id,
    selection,
    provenance: {
      id: request.data.provenanceId,
      operation: request.data.actor.kind === 'human' ? 'manual' : 'derive',
      sourceIds,
      actor: request.data.actor,
      recordedAt: request.data.selectedAt,
      tool: 'cutout.candidate-selection.v1',
    },
    impact: {
      ...(candidateSet.selection ? { previousCandidateId: candidateSet.selection.candidateId } : {}),
      nextRevisionNumber: document.revision.number + 1,
      noChanges: false,
    },
  })
}

/** Apply only the exact reviewed selection preview against its current revision. */
export function applyCandidateSelection(
  input: DesignDocument,
  preview: CandidateSelectionPreview,
  options: ApplyCandidateSelectionOptions,
): Result<DesignDocument> {
  const validation = validateDesignDocument(input)
  if (!validation.ok) return err(`Invalid DesignDocument: ${validation.error}`)
  const document = validation.data.document
  if (preview.base.documentId !== document.meta.id) {
    return err('Candidate selection preview belongs to another DesignDocument.')
  }
  if (selectionAlreadyApplied(document, preview)) return ok(document)
  if (
    preview.base.revisionId !== document.revision.id
    || preview.base.revisionNumber !== document.revision.number
  ) {
    return err(
      `Revision conflict: preview targets ${preview.base.revisionId} (#${preview.base.revisionNumber}), `
      + `but current document is ${document.revision.id} (#${document.revision.number}).`,
    )
  }
  if (!options.revisionId.trim() || options.revisionId === document.revision.id) {
    return err('Candidate selection apply requires a new revision id.')
  }
  if (document.provenance.some(({ id }) => id === preview.provenance.id)) {
    return err(`Candidate selection provenance id "${preview.provenance.id}" already exists.`)
  }

  const candidateSetIndex = document.candidateSets.findIndex(({ id }) => id === preview.candidateSetId)
  if (candidateSetIndex < 0) return err(`Unknown candidate set "${preview.candidateSetId}".`)
  const selectedSet = candidateSetSchema.safeParse({
    ...document.candidateSets[candidateSetIndex],
    selection: preview.selection,
  })
  if (!selectedSet.success) return err(selectedSet.error.issues[0]?.message ?? 'Invalid candidate selection.')

  const candidateSets = [...document.candidateSets]
  candidateSets[candidateSetIndex] = selectedSet.data
  const next: DesignDocument = {
    ...document,
    meta: { ...document.meta, updatedAt: preview.selection.selectedAt },
    revision: {
      id: options.revisionId,
      number: document.revision.number + 1,
      createdAt: preview.selection.selectedAt,
      author: preview.selection.actor,
    },
    candidateSets,
    provenance: [...document.provenance, preview.provenance],
  }
  const nextValidation = validateDesignDocument(next)
  return nextValidation.ok ? ok(nextValidation.data.document) : nextValidation
}

function selectionAlreadyApplied(document: NormalizedDesignDocument, preview: CandidateSelectionPreview): boolean {
  const candidateSet = document.candidateSets.find(({ id }) => id === preview.candidateSetId)
  return candidateSet?.selection?.candidateId === preview.selection.candidateId
    && candidateSet.selection.baseRevisionId === preview.selection.baseRevisionId
    && document.provenance.some(({ id }) => id === candidateSet.selection?.provenanceId)
}

function revisionGuard(document: DesignDocument): CandidateSelectionRevisionGuard {
  return {
    documentId: document.meta.id,
    revisionId: document.revision.id,
    revisionNumber: document.revision.number,
  }
}

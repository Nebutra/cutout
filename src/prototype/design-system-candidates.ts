import {
  candidateSetSchema,
  type CandidateDirection,
  type CandidateExplorationDecision,
  type CandidateSet,
} from '@/candidate-selection/contracts'
import { bytesToBlob } from '@/lib/image'
import type {
  PersistedPrototypeDesignSystem,
  PersistedPrototypeDesignSystemCandidateSet,
} from '@/workspace/workspace-snapshot'
import type { PrototypeDesignSystemArtifact } from './prototype-artifact-recovery'
import type { PrototypePlan } from './prototype-plan'
import type { DesignDocument } from '@/design-ir'
import type { WorkspaceSnapshot } from '@/workspace/workspace-snapshot'

export interface PrototypeDesignSystemCandidateSet {
  readonly set: CandidateSet
  readonly artifacts: Readonly<Record<string, PrototypeDesignSystemArtifact>>
}

export interface SelectedDesignMarkdownBinding {
  readonly candidateSetId: string
  readonly candidateId: string
  readonly materialId: string
  readonly revisionId: string
  readonly provenanceId: string
  readonly content: string
}

export function selectedDesignMarkdownBinding(
  snapshot: WorkspaceSnapshot | null | undefined,
  document: DesignDocument,
): SelectedDesignMarkdownBinding | undefined {
  const persisted = snapshot?.prototypeDesignSystemCandidates
  if (!persisted?.set.selection) return undefined
  const set = document.candidateSets?.find((candidate) => candidate.id === persisted.set.id)
  const selected = set?.candidates.find((candidate) => candidate.id === set.selection?.candidateId)
  const materialId = selected?.outputs.find((output) => output.role === 'design-markdown')?.materialId
  const material = materialId
    ? document.materials.find((candidate) => candidate.id === materialId)
    : undefined
  const artifact = persisted.artifacts[persisted.set.selection.candidateId]
  if (!set?.selection || !selected || !materialId || !material || !artifact) return undefined
  return {
    candidateSetId: set.id,
    candidateId: selected.id,
    materialId,
    revisionId: material.currentRevisionId,
    provenanceId: set.selection.provenanceId,
    content: artifact.designMarkdown,
  }
}

export function designSystemExplorationForPlan(
  plan: PrototypePlan,
): CandidateExplorationDecision {
  return plan.designSystem.exploration ?? {
    mode: 'auto',
    decidedBy: 'fallback',
    count: 1,
    rationale: 'This historical plan has no exploration proposal, so Cutout uses one conservative direction.',
    directions: [{
      id: 'direction:default',
      label: 'Primary direction',
      thesis: plan.designSystem.styleSummary,
      vary: ['visual treatment'],
      preserve: ['product intent', 'audience', 'platform contract'],
    }],
    bounds: { maxCandidates: 8, maxParallelism: 2 },
  }
}

export function createPrototypeDesignSystemCandidateSet(input: {
  readonly plan: PrototypePlan
  readonly baseRevisionId: string
  readonly id?: string
}): PrototypeDesignSystemCandidateSet {
  const proposal = designSystemExplorationForPlan(input.plan)
  const set = candidateSetSchema.parse({
    id: input.id ?? `candidate-set:design-system:${crypto.randomUUID()}`,
    kind: 'design-system',
    baseRevisionId: input.baseRevisionId,
    proposal,
    candidates: proposal.directions.map((direction) => ({
      id: candidateId(direction),
      directionId: direction.id,
      status: 'planned',
      outputs: [],
      provenanceIds: [],
    })),
  })
  return { set, artifacts: {} }
}

export function updatePrototypeDesignSystemCandidate(
  candidateSet: PrototypeDesignSystemCandidateSet,
  candidateId: string,
  update:
    | { readonly status: 'generating' | 'cancelled' }
    | { readonly status: 'failed'; readonly error: string }
    | { readonly status: 'ready'; readonly artifact: PrototypeDesignSystemArtifact },
): PrototypeDesignSystemCandidateSet {
  const current = candidateSet.set.candidates.find((candidate) => candidate.id === candidateId)
  if (!current) throw new Error(`Unknown Design System candidate "${candidateId}".`)
  const artifacts = { ...candidateSet.artifacts }
  if (update.status === 'ready') artifacts[candidateId] = update.artifact

  const candidates = candidateSet.set.candidates.map((candidate) => {
    if (candidate.id !== candidateId) return candidate
    if (update.status === 'ready') {
      return {
        ...candidate,
        status: 'ready' as const,
        outputs: [
          { role: 'design-system', materialId: candidateMaterialId(candidate.id, 'visual') },
          { role: 'design-markdown', materialId: candidateMaterialId(candidate.id, 'markdown') },
        ],
        provenanceIds: [candidateProvenanceId(candidate.id)],
      }
    }
    if (update.status === 'failed') {
      return { ...candidate, status: 'failed' as const, outputs: [], provenanceIds: [], error: update.error }
    }
    return { ...candidate, status: update.status, outputs: [], provenanceIds: [] }
  })
  return {
    set: candidateSetSchema.parse({ ...candidateSet.set, candidates }),
    artifacts,
  }
}

export function selectPrototypeDesignSystemCandidate(
  candidateSet: PrototypeDesignSystemCandidateSet,
  candidateId: string,
  actor: { readonly kind: 'human' | 'agent'; readonly id: string },
  selectedAt = new Date().toISOString(),
): PrototypeDesignSystemCandidateSet {
  const candidate = candidateSet.set.candidates.find((item) => item.id === candidateId)
  if (!candidate || candidate.status !== 'ready' || !candidateSet.artifacts[candidateId]) {
    throw new Error('Only a ready Design System candidate can be selected.')
  }
  return {
    ...candidateSet,
    set: candidateSetSchema.parse({
      ...candidateSet.set,
      selection: {
        candidateId,
        selectedAt,
        actor,
        baseRevisionId: candidateSet.set.baseRevisionId,
        provenanceId: `provenance:design-system-selection:${crypto.randomUUID()}`,
      },
    }),
  }
}

export function selectedPrototypeDesignSystem(
  candidateSet: PrototypeDesignSystemCandidateSet | null,
): PrototypeDesignSystemArtifact | null {
  const selectedId = candidateSet?.set.selection?.candidateId
  return selectedId ? candidateSet?.artifacts[selectedId] ?? null : null
}

export function readyPrototypeDesignSystemCandidates(
  candidateSet: PrototypeDesignSystemCandidateSet,
): readonly string[] {
  return candidateSet.set.candidates
    .filter((candidate) => candidate.status === 'ready' && candidateSet.artifacts[candidate.id])
    .map((candidate) => candidate.id)
}

export function persistPrototypeDesignSystemCandidateSet(
  candidateSet: PrototypeDesignSystemCandidateSet,
): PersistedPrototypeDesignSystemCandidateSet {
  return {
    set: candidateSet.set,
    artifacts: Object.fromEntries(
      Object.entries(candidateSet.artifacts).map(([id, artifact]) => [id, persistArtifact(artifact)]),
    ),
  }
}

export function recoverPrototypeDesignSystemCandidateSet(
  persisted: PersistedPrototypeDesignSystemCandidateSet | null | undefined,
  legacySelected?: PersistedPrototypeDesignSystem | null,
): PrototypeDesignSystemCandidateSet | null {
  if (persisted) {
    const parsed = candidateSetSchema.safeParse(persisted.set)
    if (!parsed.success) return null
    const artifacts = Object.fromEntries(
      Object.entries(persisted.artifacts ?? {}).map(([id, artifact]) => [id, restoreArtifact(artifact)]),
    )
    return { set: parsed.data, artifacts }
  }
  if (!legacySelected) return null
  const candidateId = 'candidate:legacy-selected'
  const baseRevisionId = 'workspace.v1:legacy-selected'
  return {
    set: candidateSetSchema.parse({
      id: 'candidate-set:design-system:legacy-selected',
      kind: 'design-system',
      baseRevisionId,
      proposal: {
        mode: 'auto',
        decidedBy: 'fallback',
        count: 1,
        rationale: 'Recovered the historical selected Design System as a single candidate.',
        directions: [{
          id: 'direction:legacy-selected',
          label: 'Selected direction',
          thesis: 'The previously generated and selected Design System.',
          vary: ['historical visual treatment'],
          preserve: ['existing prototype compatibility'],
        }],
        bounds: { maxCandidates: 8, maxParallelism: 2 },
      },
      candidates: [{
        id: candidateId,
        directionId: 'direction:legacy-selected',
        status: 'ready',
        outputs: [
          { role: 'design-system', materialId: 'material:design-system' },
          { role: 'design-markdown', materialId: 'material:design-markdown' },
        ],
        provenanceIds: ['provenance:workspace-legacy'],
      }],
      selection: {
        candidateId,
        selectedAt: new Date(0).toISOString(),
        actor: { kind: 'agent', id: 'workspace-legacy-recovery' },
        baseRevisionId,
        provenanceId: 'provenance:workspace-legacy-selection',
      },
    }),
    artifacts: { [candidateId]: restoreArtifact(legacySelected) },
  }
}

export function directionForCandidate(
  candidateSet: PrototypeDesignSystemCandidateSet,
  candidateId: string,
): CandidateDirection {
  const candidate = candidateSet.set.candidates.find((item) => item.id === candidateId)
  const direction = candidateSet.set.proposal.directions.find((item) => item.id === candidate?.directionId)
  if (!candidate || !direction) throw new Error(`Candidate "${candidateId}" has no declared direction.`)
  return direction
}

function candidateId(direction: CandidateDirection): string {
  return `candidate:${direction.id}`
}

export function candidateMaterialId(candidateId: string, role: 'visual' | 'markdown'): string {
  return `material:design-system-candidate:${candidateId}:${role}`
}

export function candidateProvenanceId(candidateId: string): string {
  return `provenance:design-system-candidate:${candidateId}`
}

function persistArtifact(artifact: PrototypeDesignSystemArtifact): PersistedPrototypeDesignSystem {
  return {
    bytes: artifact.bytes,
    mediaType: artifact.mediaType,
    width: artifact.width,
    height: artifact.height,
    name: artifact.name,
    designMarkdown: artifact.designMarkdown,
  }
}

function restoreArtifact(artifact: PersistedPrototypeDesignSystem): PrototypeDesignSystemArtifact {
  return { ...artifact, blob: bytesToBlob(artifact.bytes, artifact.mediaType) }
}

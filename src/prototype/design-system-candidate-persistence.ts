import { candidateSetSchema } from '@/candidate-selection/contracts'
import type { PersistedPrototypeDesignSystemCandidateSet } from '@/workspace/workspace-snapshot'

export function candidateMaterialId(
  candidateId: string,
  role: 'visual' | 'markdown',
): string {
  return `material:design-system-candidate:${candidateId}:${role}`
}

export function migratePersistedPrototypeDesignSystemCandidateSet(
  persisted: PersistedPrototypeDesignSystemCandidateSet,
): PersistedPrototypeDesignSystemCandidateSet {
  const parsed = candidateSetSchema.safeParse(persisted.set)
  if (!parsed.success) return persisted
  const set = parsed.data
  const candidate = set.candidates[0]
  const isLegacyCanonicalAlias =
    set.id === 'candidate-set:design-system:legacy-selected' &&
    set.baseRevisionId === 'workspace.v1:legacy-selected' &&
    set.candidates.length === 1 &&
    candidate?.id === 'candidate:legacy-selected' &&
    set.selection?.candidateId === candidate.id &&
    candidate.outputs.length === 2 &&
    candidate.outputs.some(
      (output) => output.role === 'design-system' && output.materialId === 'material:design-system',
    ) &&
    candidate.outputs.some(
      (output) => output.role === 'design-markdown' && output.materialId === 'material:design-markdown',
    )
  if (!isLegacyCanonicalAlias || !candidate) return { ...persisted, set }
  return {
    ...persisted,
    set: candidateSetSchema.parse({
      ...set,
      candidates: [{
        ...candidate,
        outputs: [
          { role: 'design-system', materialId: candidateMaterialId(candidate.id, 'visual') },
          { role: 'design-markdown', materialId: candidateMaterialId(candidate.id, 'markdown') },
        ],
      }],
    }),
  }
}

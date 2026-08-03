import { describe, expect, it } from 'vitest'
import {
  candidateExplorationDecisionSchema,
  candidateSetSchema,
  validateCandidateExplorationDecision,
} from './contracts'

function decision(count = 2, maxCandidates = 8) {
  return {
    mode: 'auto' as const,
    decidedBy: 'agent' as const,
    count,
    rationale: `${count} distinct directions provide useful comparison value.`,
    directions: Array.from({ length: count }, (_, index) => ({
      id: `direction:${index + 1}`,
      label: `Direction ${index + 1}`,
      thesis: `Distinct visual thesis ${index + 1}`,
      vary: [`visual-axis-${index + 1}`],
      preserve: ['product brief', 'platform constraints'],
    })),
    bounds: { maxCandidates, maxParallelism: 3 },
    estimate: { currency: 'USD', amount: count * 0.08, credits: count * 8 },
  }
}

function candidates(count = 2) {
  return Array.from({ length: count }, (_, index) => ({
    id: `candidate:${index + 1}`,
    directionId: `direction:${index + 1}`,
    status: 'ready' as const,
    outputs: [{ role: 'visual-reference', materialId: `material:${index + 1}` }],
    provenanceIds: [`provenance:${index + 1}`],
  }))
}

describe('candidate exploration contracts', () => {
  it('accepts a runtime-bounded dynamic count with one deliberate direction per candidate', () => {
    const parsed = candidateExplorationDecisionSchema.parse(decision(7, 9))
    expect(parsed.count).toBe(7)
    expect(parsed.directions).toHaveLength(7)
    expect(parsed.bounds).toEqual({ maxCandidates: 9, maxParallelism: 3 })
  })

  it('rejects malformed, unsupported, mismatched, and duplicated direction plans', () => {
    expect(validateCandidateExplorationDecision({ ...decision(), count: 0 }).ok).toBe(false)
    expect(validateCandidateExplorationDecision(decision(4, 3))).toMatchObject({
      ok: false,
      error: expect.stringContaining('exceeds the runtime maximum'),
    })
    expect(validateCandidateExplorationDecision({ ...decision(2), directions: decision(1).directions })).toMatchObject({
      ok: false,
      error: expect.stringContaining('must equal resolved count'),
    })
    const duplicated = decision(2)
    duplicated.directions[1] = { ...duplicated.directions[1]!, thesis: duplicated.directions[0]!.thesis }
    expect(validateCandidateExplorationDecision(duplicated)).toMatchObject({
      ok: false,
      error: expect.stringContaining('Duplicate direction thesis'),
    })
    const contradictory = decision(1)
    contradictory.directions[0] = {
      ...contradictory.directions[0]!,
      vary: ['product brief'],
    }
    expect(validateCandidateExplorationDecision(contradictory)).toMatchObject({
      ok: false,
      error: expect.stringContaining('both varied and preserved'),
    })
  })

  it('permits selection only for a ready candidate on the same base revision', () => {
    const base = {
      id: 'candidate-set:1',
      kind: 'design-system' as const,
      baseRevisionId: 'revision:1',
      proposal: decision(),
      candidates: candidates(),
    }
    expect(candidateSetSchema.safeParse({
      ...base,
      selection: {
        candidateId: 'candidate:1',
        selectedAt: '2026-07-23T04:00:00.000Z',
        actor: { kind: 'human', id: 'user:1' },
        baseRevisionId: 'revision:1',
        provenanceId: 'provenance:selection',
      },
    }).success).toBe(true)
    expect(candidateSetSchema.safeParse({
      ...base,
      candidates: [{ ...base.candidates[0], status: 'generating' }, base.candidates[1]],
      selection: {
        candidateId: 'candidate:1',
        selectedAt: '2026-07-23T04:00:00.000Z',
        actor: { kind: 'human', id: 'user:1' },
        baseRevisionId: 'revision:1',
        provenanceId: 'provenance:selection',
      },
    }).success).toBe(false)
    expect(candidateSetSchema.safeParse({
      ...base,
      selection: {
        candidateId: 'candidate:1',
        selectedAt: '2026-07-23T04:00:00.000Z',
        actor: { kind: 'human', id: 'user:1' },
        baseRevisionId: 'revision:stale',
        provenanceId: 'provenance:selection',
      },
    }).success).toBe(false)
  })

  it('requires human selection when multiple ready alternatives exist', () => {
    const parsed = candidateSetSchema.safeParse({
      id: 'candidate-set:1',
      kind: 'design-system',
      baseRevisionId: 'revision:1',
      proposal: decision(),
      candidates: candidates(),
      selection: {
        candidateId: 'candidate:1',
        selectedAt: '2026-07-23T04:00:00.000Z',
        actor: { kind: 'agent', id: 'agent:1' },
        baseRevisionId: 'revision:1',
        provenanceId: 'provenance:selection',
      },
    })
    expect(parsed.success).toBe(false)
    if (!parsed.success) expect(parsed.error.issues[0]?.message).toContain('requires a human actor')
  })
})

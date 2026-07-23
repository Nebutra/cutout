import { describe, expect, it } from 'vitest'
import {
  applyCandidateSelection,
  designDocumentSchema,
  prepareCandidateSelection,
  validateDesignDocument,
  type CandidateSet,
  type DesignDocument,
} from './index'

const timestamp = '2026-07-23T04:00:00.000Z'

function material(id: string, provenanceId: string) {
  return {
    id,
    kind: id.includes('markdown') ? 'design-markdown' as const : 'design-system' as const,
    name: id,
    currentRevisionId: `revision:${id}`,
    revisions: [{
      id: `revision:${id}`,
      ordinal: 1,
      createdAt: timestamp,
      content: { id: `content:${id}`, uri: `sha256:${id}` },
      provenanceId,
    }],
  }
}

function candidateSet(): CandidateSet {
  return {
    id: 'candidate-set:design-system:1',
    kind: 'design-system',
    baseRevisionId: 'revision:1',
    proposal: {
      mode: 'auto',
      decidedBy: 'agent',
      count: 2,
      rationale: 'Two directions are meaningfully distinct.',
      directions: [
        { id: 'direction:quiet', label: 'Quiet utility', thesis: 'Dense and restrained', vary: ['density'], preserve: ['brief'] },
        { id: 'direction:vivid', label: 'Vivid editorial', thesis: 'Expressive and spacious', vary: ['visual tone'], preserve: ['brief'] },
      ],
      bounds: { maxCandidates: 6, maxParallelism: 2 },
    },
    candidates: [
      {
        id: 'candidate:quiet',
        directionId: 'direction:quiet',
        status: 'ready',
        outputs: [
          { role: 'visual-reference', materialId: 'material:quiet:visual' },
          { role: 'design-markdown', materialId: 'material:quiet:markdown' },
        ],
        provenanceIds: ['provenance:quiet'],
      },
      {
        id: 'candidate:vivid',
        directionId: 'direction:vivid',
        status: 'ready',
        outputs: [
          { role: 'visual-reference', materialId: 'material:vivid:visual' },
          { role: 'design-markdown', materialId: 'material:vivid:markdown' },
        ],
        provenanceIds: ['provenance:vivid'],
      },
    ],
  }
}

function document(): DesignDocument {
  return {
    version: 'design-ir.v1',
    meta: { id: 'project:1', title: 'Candidate project', createdAt: timestamp, updatedAt: timestamp },
    revision: { id: 'revision:1', number: 1, createdAt: timestamp, author: { kind: 'human', id: 'user:1' } },
    needs: [],
    sources: [{
      id: 'source:brief',
      kind: 'document',
      role: 'requirement',
      title: 'Brief',
      license: { kind: 'proprietary', holder: 'Cutout' },
      content: [{ id: 'content:brief', uri: 'cutout://brief' }],
    }],
    brands: [],
    tokens: [],
    components: [],
    materials: [
      material('material:quiet:visual', 'provenance:quiet'),
      material('material:quiet:markdown', 'provenance:quiet'),
      material('material:vivid:visual', 'provenance:vivid'),
      material('material:vivid:markdown', 'provenance:vivid'),
    ],
    candidateSets: [candidateSet()],
    provenance: [
      { id: 'provenance:quiet', operation: 'generate', sourceIds: ['source:brief'], actor: { kind: 'agent', id: 'agent:1' }, recordedAt: timestamp },
      { id: 'provenance:vivid', operation: 'generate', sourceIds: ['source:brief'], actor: { kind: 'agent', id: 'agent:1' }, recordedAt: timestamp },
    ],
    relations: [],
  }
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    candidateSetId: 'candidate-set:design-system:1',
    candidateId: 'candidate:quiet',
    baseRevisionId: 'revision:1',
    selectedAt: '2026-07-23T05:00:00.000Z',
    actor: { kind: 'human', id: 'user:1' },
    provenanceId: 'provenance:selection:1',
    ...overrides,
  }
}

describe('Design IR candidate selection', () => {
  it('defaults legacy documents to an empty candidate-set collection', () => {
    const legacy = { ...document() }
    delete legacy.candidateSets
    expect(designDocumentSchema.parse(legacy).candidateSets).toBeUndefined()
    expect(validateDesignDocument(legacy)).toMatchObject({
      ok: true,
      data: { document: { candidateSets: [] } },
    })
  })

  it('validates candidate material and provenance references across Design IR', () => {
    const missingMaterial = document()
    missingMaterial.candidateSets = [{
      ...candidateSet(),
      candidates: [
        { ...candidateSet().candidates[0]!, outputs: [{ role: 'visual-reference', materialId: 'material:missing' }] },
        candidateSet().candidates[1]!,
      ],
    }]
    expect(validateDesignDocument(missingMaterial)).toMatchObject({
      ok: false,
      error: expect.stringContaining('unknown material'),
    })

    const missingProvenance = document()
    missingProvenance.candidateSets = [{
      ...candidateSet(),
      candidates: [
        { ...candidateSet().candidates[0]!, provenanceIds: ['provenance:missing'] },
        candidateSet().candidates[1]!,
      ],
    }]
    expect(validateDesignDocument(missingProvenance)).toMatchObject({
      ok: false,
      error: expect.stringContaining('unknown provenance'),
    })
  })

  it('previews and applies a ready human selection with a new revision and receipt provenance', () => {
    const preview = prepareCandidateSelection(document(), request())
    expect(preview).toMatchObject({
      ok: true,
      data: {
        selection: { candidateId: 'candidate:quiet', baseRevisionId: 'revision:1' },
        impact: { nextRevisionNumber: 2, noChanges: false },
      },
    })
    if (!preview.ok) return

    const applied = applyCandidateSelection(document(), preview.data, { revisionId: 'revision:2' })
    expect(applied).toMatchObject({
      ok: true,
      data: {
        revision: { id: 'revision:2', number: 2 },
        candidateSets: [{ selection: { candidateId: 'candidate:quiet', provenanceId: 'provenance:selection:1' } }],
      },
    })
    if (!applied.ok) return
    expect(applied.data.provenance.at(-1)).toMatchObject({
      id: 'provenance:selection:1',
      sourceIds: ['source:brief'],
      actor: { kind: 'human', id: 'user:1' },
    })
    expect(applyCandidateSelection(applied.data, preview.data, { revisionId: 'revision:3' })).toEqual(applied)
  })

  it('rejects stale, non-ready, and non-human multi-candidate selection', () => {
    expect(prepareCandidateSelection(document(), request({ baseRevisionId: 'revision:stale' }))).toMatchObject({
      ok: false,
      error: expect.stringContaining('Stale candidate selection'),
    })
    expect(prepareCandidateSelection(document(), request({ actor: { kind: 'agent', id: 'agent:1' } }))).toMatchObject({
      ok: false,
      error: expect.stringContaining('requires a human actor'),
    })

    const pending = document()
    pending.candidateSets = [{
      ...candidateSet(),
      candidates: [{ ...candidateSet().candidates[0]!, status: 'generating' }, candidateSet().candidates[1]!],
    }]
    expect(prepareCandidateSelection(pending, request())).toMatchObject({
      ok: false,
      error: expect.stringContaining('not ready'),
    })

    const preview = prepareCandidateSelection(document(), request())
    if (!preview.ok) return
    const advanced = {
      ...document(),
      revision: { ...document().revision, id: 'revision:advanced', number: 2 },
    }
    expect(applyCandidateSelection(advanced, preview.data, { revisionId: 'revision:3' })).toMatchObject({
      ok: false,
      error: expect.stringContaining('Revision conflict'),
    })
  })
})

import { describe, expect, it } from 'vitest'
import {
  canonicalJson,
  designDocumentSchema,
  fingerprint,
  sourceSchema,
  tokenUsageGraph,
  validateDesignDocument,
  validateMaterialRevisionsImmutable,
  type DesignDocument,
  type Material,
} from './index'

const timestamp = '2026-07-10T10:00:00.000Z'

function document(): DesignDocument {
  return {
    version: 'design-ir.v1',
    meta: {
      id: 'project:cutout',
      title: 'Cutout',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    revision: {
      id: 'revision:1',
      number: 1,
      createdAt: timestamp,
      author: { kind: 'human', id: 'user:tseka' },
    },
    needs: [{
      id: 'need:landing',
      title: 'Landing page',
      statement: 'Create a responsive landing page.',
      priority: 'high',
      status: 'accepted',
      acceptanceCriteria: ['Has a primary action.'],
    }],
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
    materials: [],
    provenance: [{
      id: 'provenance:import',
      operation: 'import',
      sourceIds: ['source:brief'],
      actor: { kind: 'human', id: 'user:tseka' },
      recordedAt: timestamp,
    }],
    relations: [],
  }
}

function material(revisions: Material['revisions']): Material {
  return {
    id: 'material:hero',
    kind: 'image',
    name: 'Hero image',
    revisions,
    currentRevisionId: revisions.at(-1)?.id ?? '',
  }
}

const firstRevision: Material['revisions'][number] = {
  id: 'revision:hero:1',
  ordinal: 1,
  createdAt: timestamp,
  content: { id: 'content:hero:1', uri: 'cutout://hero/1' },
}

describe('Design IR v1', () => {
  it('materializes token usage relations and preserves missing legacy evidence explicitly', () => {
    const candidate = document()
    candidate.tokens = [
      { id: 'token.primary', name: 'Primary', kind: 'color', value: '#000' },
      { id: 'token.orphan', name: 'Orphan', kind: 'color', value: '#fff' },
    ]
    candidate.components = [{ id: 'component.button', name: 'Button', status: 'ready', tokenIds: ['token.primary'] }]
    const result = validateDesignDocument(candidate)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.document.relations).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'component-uses-token', from: { kind: 'component', id: 'component.button' }, to: { kind: 'token', id: 'token.primary' } })]))
    expect(tokenUsageGraph(result.data.document)).toEqual(expect.arrayContaining([expect.objectContaining({tokenId:'token.primary',status:'verified',componentIds:['component.button']}),expect.objectContaining({tokenId:'token.orphan',status:'evidence-missing'})]))
  })
  it('accepts a canonical minimal document', () => {
    const parsed = designDocumentSchema.parse(document())
    expect(validateDesignDocument(parsed)).toEqual({ ok: true, data: { document: parsed } })
  })

  it('persists a versioned Brand VI selection without treating unselected work as approved', () => {
    const candidate = document()
    candidate.brands[0] = {
      id: 'brand:cutout',
      name: 'Cutout',
      status: 'active',
      viSelection: {
        catalogVersion: 'brand-vi-catalog.v1',
        profile: 'custom',
        selectedItemIds: ['a1.logo.standard', 'b2.app-icon'],
        approvedItemIds: ['a1.logo.standard'],
      },
    }
    expect(validateDesignDocument(candidate).ok).toBe(true)

    candidate.brands[0]!.viSelection!.approvedItemIds = ['b13.mascot.3d-render']
    expect(designDocumentSchema.safeParse(candidate).success).toBe(false)
  })

  it('rejects invalid source role and license contracts at the schema boundary', () => {
    const invalidRole = sourceSchema.safeParse({
      ...document().sources[0],
      role: 'inspiration',
    })
    const invalidLicense = sourceSchema.safeParse({
      ...document().sources[0],
      license: { kind: 'open-source' },
    })
    expect(invalidRole.success).toBe(false)
    expect(invalidLicense.success).toBe(false)
  })

  it('rejects dangling source, token, and provenance references', () => {
    const danglingSource = document()
    danglingSource.provenance[0] = {
      ...danglingSource.provenance[0],
      sourceIds: ['source:missing'],
    }
    expect(validateDesignDocument(danglingSource)).toMatchObject({
      ok: false,
      error: expect.stringContaining('unknown source'),
    })

    const danglingToken = document()
    danglingToken.components = [{
      id: 'component:button',
      name: 'Button',
      status: 'draft',
      tokenIds: ['token:missing'],
    }]
    expect(validateDesignDocument(danglingToken)).toMatchObject({
      ok: false,
      error: expect.stringContaining('unknown token'),
    })
  })

  it('rejects relations whose typed endpoint does not exist', () => {
    const candidate = document()
    candidate.components = [{
      id: 'component:button',
      name: 'Button',
      status: 'draft',
      tokenIds: [],
    }]
    candidate.relations = [{
      id: 'relation:button-need',
      kind: 'component-implements-need',
      from: { kind: 'component', id: 'component:button' },
      to: { kind: 'need', id: 'need:missing' },
    }]
    expect(validateDesignDocument(candidate)).toMatchObject({
      ok: false,
      error: expect.stringContaining('unknown need'),
    })
  })

  it('rejects malformed material history and immutable revision rewrites', () => {
    const malformed = document()
    malformed.materials = [{
      ...material([firstRevision]),
      currentRevisionId: 'revision:missing',
    }]
    expect(validateDesignDocument(malformed)).toMatchObject({
      ok: false,
      error: expect.stringContaining('unknown current revision'),
    })

    const rewritten = material([{
      ...firstRevision,
      content: { id: 'content:hero:1', uri: 'cutout://hero/replaced' },
    }])
    expect(validateMaterialRevisionsImmutable(material([firstRevision]), rewritten)).toMatchObject({
      ok: false,
      error: expect.stringContaining('rewrote immutable revision'),
    })

    const appended = material([
      firstRevision,
      {
        id: 'revision:hero:2',
        ordinal: 2,
        createdAt: timestamp,
        content: { id: 'content:hero:2', uri: 'cutout://hero/2' },
      },
    ])
    expect(validateMaterialRevisionsImmutable(material([firstRevision]), appended)).toEqual({ ok: true, data: undefined })
  })

  it('uses canonical key ordering for stable fingerprints while preserving array order', async () => {
    expect(canonicalJson({ b: 2, a: { y: true, x: 1 } })).toBe('{"a":{"x":1,"y":true},"b":2}')
    await expect(fingerprint({ b: 2, a: [1, 2] })).resolves.toBe(await fingerprint({ a: [1, 2], b: 2 }))
    await expect(fingerprint({ a: [2, 1], b: 2 })).resolves.not.toBe(await fingerprint({ a: [1, 2], b: 2 }))
  })
})

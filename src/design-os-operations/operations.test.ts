import { describe, expect, it, vi } from 'vitest'
import type { DesignDocument } from '@/design-ir'
import {
  applyPreparedSourceIngest,
  buildDesignOsReadiness,
  compileBrandKitOperation,
  compileComponentsOperation,
  compileDesignKitOperation,
  compileStarterOperation,
  exportCompiledBundle,
  prepareSourceIngest,
  prepareSourceIngestBatch,
} from './operations'
import type { BundleRepository } from '@/services/types'

const timestamp = '2026-07-11T12:00:00.000Z'
const license = { kind: 'proprietary', holder: 'Cutout' } as const

function document(overrides: Partial<DesignDocument> = {}): DesignDocument {
  return {
    version: 'design-ir.v1',
    meta: { id: 'project:operations', title: 'Operations', createdAt: timestamp, updatedAt: timestamp },
    revision: { id: 'revision:1', number: 1, createdAt: timestamp, author: { kind: 'human', id: 'user:1' } },
    needs: [], sources: [], brands: [], tokens: [], components: [], materials: [], provenance: [], relations: [],
    ...overrides,
  }
}

describe('Design OS operations', () => {
  it('builds honest document-derived readiness with actionable blocked reasons', () => {
    const empty = buildDesignOsReadiness(document())
    expect(empty.operations['source-ingest']).toMatchObject({ state: 'ready', reasons: [] })
    expect(empty.operations['design-kit']).toMatchObject({
      state: 'needs-input', reasons: [{ code: 'missing-token' }],
    })
    expect(empty.operations['brand-kit'].reasons.map((entry) => entry.code)).toEqual([
      'missing-brand', 'missing-source',
    ])
    expect(empty.operations.components.reasons.map((entry) => entry.code)).toEqual([
      'missing-prototype', 'missing-component',
    ])
    expect(empty.operations.starter.reasons.map((entry) => entry.code)).toEqual([
      'missing-prototype', 'missing-token', 'missing-component',
    ])

    const invalid = document({ revision: { ...document().revision, number: 0 } })
    expect(buildDesignOsReadiness(invalid).operations['source-ingest']).toMatchObject({
      state: 'blocked', reasons: [{ code: 'invalid-document' }],
    })
  })

  it('previews source impact, applies against the reviewed revision, and rejects stale revisions', async () => {
    const base = document()
    const prepared = await prepareSourceIngest(base, {
      type: 'inline-text', sourceKind: 'idea', title: 'Agent-native canvas',
      text: 'Everything becomes a traceable design input.', role: 'requirement', license,
    }, { capturedAt: timestamp, actorId: 'user:1' })
    expect(prepared.ok).toBe(true)
    if (!prepared.ok) throw new Error(prepared.error)
    expect(prepared.data.impact).toEqual({
      sourcesAdded: 1, provenanceAdded: 1, nextRevisionNumber: 2, noChanges: false,
    })

    const applied = applyPreparedSourceIngest(base, prepared.data, {
      revisionId: 'revision:2', createdAt: timestamp, actorId: 'user:1',
    })
    expect(applied.ok).toBe(true)
    if (!applied.ok) throw new Error(applied.error)
    expect(applied.data).toMatchObject({ revision: { id: 'revision:2', number: 2 } })

    const unrelated = document({
      revision: { ...base.revision, id: 'revision:other', number: 2 },
      meta: { ...base.meta, updatedAt: timestamp },
    })
    expect(applyPreparedSourceIngest(unrelated, prepared.data, {
      revisionId: 'revision:3', createdAt: timestamp,
    })).toMatchObject({ ok: false, error: expect.stringContaining('Revision conflict') })
  })

  it('treats an already applied reviewed patch as idempotent without creating another revision', async () => {
    const base = document()
    const prepared = await prepareSourceIngest(base, {
      type: 'url-descriptor', url: 'https://styles.refero.design/', title: 'Refero styles',
      role: 'reference', license,
    }, { capturedAt: timestamp, actorId: 'user:1' })
    if (!prepared.ok) throw new Error(prepared.error)
    const first = applyPreparedSourceIngest(base, prepared.data, {
      revisionId: 'revision:2', createdAt: timestamp,
    })
    if (!first.ok) throw new Error(first.error)
    const second = applyPreparedSourceIngest(first.data, prepared.data, {
      revisionId: 'revision:3', createdAt: timestamp,
    })
    expect(second).toEqual({ ok: true, data: first.data })
  })

  it('previews a batch as one guarded patch and deduplicates within the queue', async () => {
    const input = { type: 'inline-text', sourceKind: 'need', title: 'Checkout', text: 'Guest checkout is required.', role: 'requirement', license } as const
    const prepared = await prepareSourceIngestBatch(document(), [input, input], { capturedAt: timestamp, actorId: 'user:1' })
    expect(prepared).toMatchObject({ ok: true, data: { impact: { sourcesAdded: 1, provenanceAdded: 1 }, skipped: [{ reason: 'duplicate-content' }] } })
  })

  it('never infers compiler declarations when explicit inputs are absent', async () => {
    await expect(compileDesignKitOperation(document())).resolves.toMatchObject({
      ok: false, error: expect.stringContaining('explicit token'),
    })
    await expect(compileBrandKitOperation(document())).resolves.toMatchObject({
      ok: false, error: expect.stringContaining('explicit'),
    })
    await expect(compileComponentsOperation(document())).resolves.toMatchObject({
      ok: false, error: expect.stringContaining('explicit candidate'),
    })
    await expect(compileStarterOperation(document(), { framework: 'vite-react' })).resolves.toMatchObject({
      ok: false, error: expect.stringContaining('Design Kit'),
    })
  })

  it('guards export against stale bundles and delegates matching bundles once', async () => {
    const current = document({
      tokens: [{ id: 'token:primary', name: 'Primary', kind: 'color', value: '#00875a' }],
    })
    const compiled = await compileDesignKitOperation(current, [{
      tokenId: 'token:primary', status: 'verified', category: 'color', cssName: 'primary',
    }])
    if (!compiled.ok) throw new Error(compiled.error)
    const save = vi.fn<BundleRepository['save']>().mockResolvedValue({
      ok: true,
      data: {
        canceled: false, outputDir: '/chosen', bundleDir: '/chosen/design-kit',
        fileCount: 6, totalBytes: 100, files: [],
      },
    })
    const repository: BundleRepository = { save }
    await expect(exportCompiledBundle(current, repository, {
      kind: 'design-kit', bundle: compiled.data, name: 'design-kit',
    })).resolves.toMatchObject({ ok: true, data: { fileCount: 6 } })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      name: 'design-kit', files: expect.arrayContaining([expect.objectContaining({ path: 'DESIGN.md' })]),
    }))

    const advanced = { ...current, revision: { ...current.revision, id: 'revision:2', number: 2 } }
    await expect(exportCompiledBundle(advanced, repository, {
      kind: 'design-kit', bundle: compiled.data, name: 'design-kit',
    })).resolves.toMatchObject({ ok: false, error: expect.stringContaining('current DesignDocument revision') })
    expect(save).toHaveBeenCalledTimes(1)
  })
})

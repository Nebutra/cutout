import { describe, expect, it, vi } from 'vitest'
import type { DesignDocument } from '@/design-ir'
import type { BundleRepository } from '@/services/types'
import { applyFigmaSnapshot, exportFigmaVariables, prepareFigmaSnapshot } from './figma-snapshot'

const now = '2026-07-11T08:00:00.000Z'
const snapshot = {
  schemaVersion: 'figma.snapshot.v1', file: { key: 'File123', name: 'Product UI' },
  collections: [{ id: 'collection:1', name: 'Theme', defaultModeId: 'mode:1', modes: [{ id: 'mode:1', name: 'Default' }] }],
  variables: [{ id: 'variable:1', name: 'color/action', collectionId: 'collection:1', resolvedType: 'STRING', valuesByMode: { 'mode:1': '#0055ff' } }],
  components: [{ id: 'component:1', key: 'key:1', name: 'Button', variableIds: ['variable:1'] }],
  componentSets: [], nodeRefs: [],
  codeConnectHints: [{ componentId: 'component:1', source: 'src/Button.tsx', framework: 'react', exportName: 'Button' }],
} as const

function document(): DesignDocument {
  return {
    version: 'design-ir.v1', meta: { id: 'project:1', title: 'Product', createdAt: now, updatedAt: now },
    revision: { id: 'revision:1', number: 1, createdAt: now, author: { kind: 'human', id: 'user:1' } },
    needs: [], sources: [], brands: [], tokens: [], components: [], materials: [], provenance: [], relations: [],
  }
}

describe('Figma Snapshot Design OS operations', () => {
  it('previews counts and only mutates after an explicit guarded apply', async () => {
    const base = document()
    const prepared = await prepareFigmaSnapshot(base, snapshot)
    expect(prepared).toMatchObject({ ok: true, data: { tokenCount: 1, componentCount: 1, codeConnectCount: 1, collectionCount: 1 } })
    expect(base.tokens).toHaveLength(0)
    if (!prepared.ok) throw new Error(prepared.error)
    const applied = await applyFigmaSnapshot(base, prepared.data, { revisionId: 'revision:2', createdAt: now })
    expect(applied).toMatchObject({ ok: true, data: { revision: { id: 'revision:2', number: 2 } } })
    if (!applied.ok) throw new Error(applied.error)
    expect(applied.data.tokens).toHaveLength(1)
    expect(applied.data.components).toHaveLength(1)
    expect(applied.data.sources[0]?.content[0]?.uri).toBe('figma://file/File123')
  })

  it('rejects stale previews and malformed or secret-bearing snapshots', async () => {
    const prepared = await prepareFigmaSnapshot(document(), snapshot)
    if (!prepared.ok) throw new Error(prepared.error)
    const stale = { ...document(), revision: { ...document().revision, id: 'revision:other', number: 2 } }
    await expect(applyFigmaSnapshot(stale, prepared.data, { revisionId: 'revision:3', createdAt: now })).resolves.toMatchObject({ ok: false, error: expect.stringContaining('stale') })
    await expect(prepareFigmaSnapshot(document(), { ...snapshot, accessToken: 'secret' })).resolves.toMatchObject({ ok: false })
  })

  it('exports only the adapter-authored Variables and binding files through BundleRepository', async () => {
    const prepared = await prepareFigmaSnapshot(document(), snapshot)
    if (!prepared.ok) throw new Error(prepared.error)
    const applied = await applyFigmaSnapshot(document(), prepared.data, { revisionId: 'revision:2', createdAt: now })
    if (!applied.ok) throw new Error(applied.error)
    const save = vi.fn<BundleRepository['save']>().mockResolvedValue({ ok: true, data: { canceled: false, outputDir: '/tmp', bundleDir: '/tmp/figma', fileCount: 2, totalBytes: 10, files: [] } })
    const result = await exportFigmaVariables(applied.data, prepared.data.bindings, { save })
    expect(result).toMatchObject({ ok: true, data: { fileCount: 2 } })
    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      name: 'figma-File123', files: [expect.objectContaining({ path: 'figma-variables.json' }), expect.objectContaining({ path: 'figma-component-bindings.json' })],
    }))
  })
})

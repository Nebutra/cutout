import { describe, expect, it, vi } from 'vitest'
import type { ConnectorContext, ConnectorInput } from '@/connectors'
import { validateDesignDocument, type DesignDocument } from '@/design-ir'
import { createFigmaConnector } from './figma-connector'

const now = '2026-07-11T12:00:00.000Z'
const base = { documentId: 'project:figma', revisionId: 'revision:7', revisionNumber: 7 }

function context(overrides: Partial<ConnectorContext> = {}): ConnectorContext {
  return {
    base,
    now: () => now,
    signal: new AbortController().signal,
    auth: { accessToken: 'must-never-leave-context' },
    ...overrides,
  }
}

function snapshot() {
  return {
    schemaVersion: 'figma.snapshot.v1',
    file: { key: 'AbC123', name: 'Checkout', version: '42', lastModified: now },
    collections: [{
      id: 'VariableCollectionId:1:2', name: 'Theme', defaultModeId: '1:0',
      modes: [{ id: '1:0', name: 'Light' }, { id: '1:1', name: 'Dark' }],
    }],
    variables: [
      {
        id: 'VariableID:1:3', name: 'color/brand', collectionId: 'VariableCollectionId:1:2', resolvedType: 'COLOR',
        valuesByMode: {
          '1:0': { r: 0, g: 0.5, b: 1, a: 1 },
          '1:1': { r: 0.2, g: 0.65, b: 1, a: 1 },
        },
      },
      {
        id: 'VariableID:1:4', name: 'color/action', collectionId: 'VariableCollectionId:1:2', resolvedType: 'COLOR',
        valuesByMode: {
          '1:0': { type: 'VARIABLE_ALIAS', id: 'VariableID:1:3' },
          '1:1': { type: 'VARIABLE_ALIAS', id: 'VariableID:1:3' },
        },
      },
    ],
    componentSets: [{ id: '10:1', key: 'set-key', name: 'Button', componentIds: ['10:2'] }],
    components: [{
      id: '10:2', key: 'component-key', name: 'Button/Primary', componentSetId: '10:1',
      description: 'Primary action', variableIds: ['VariableID:1:4'],
    }],
    nodeRefs: [{ id: '20:1', name: 'Checkout CTA', type: 'INSTANCE', componentId: '10:2' }],
    codeConnectHints: [{ componentId: '10:2', source: 'src/components/Button.tsx', framework: 'react', exportName: 'Button' }],
  } as const
}

function importInput(value: unknown = snapshot()): ConnectorInput {
  return { sourceKind: 'figma', locator: 'figma://file/AbC123', title: 'Checkout', metadata: { snapshot: value } }
}

describe('Figma connector v1', () => {
  it('previews an exact structured mapping without guessing layout or code', async () => {
    const connector = createFigmaConnector()
    const result = await connector.preview?.(importInput(), context())
    expect(result).toMatchObject({
      ok: true,
      data: {
        kind: 'connector-preview', connectorId: 'figma.snapshot', sourceKind: 'figma', base,
        details: {
          sourceId: 'figma:file:AbC123', tokenCount: 4, componentCount: 2,
          warnings: expect.arrayContaining([expect.stringContaining('Node references are preserved')]),
        },
      },
    })
    expect(JSON.stringify(result)).not.toContain('must-never-leave-context')
  })

  it('imports modes, aliases, component refs, relations, and provenance with stable Figma identity', async () => {
    const connector = createFigmaConnector()
    if (!connector.import) throw new Error('Import capability missing')
    const result = await connector.import(importInput(), context())
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error.message)
    const patch = result.data.designPatch
    if (!patch?.tokens || !patch.components || !patch.relations) throw new Error('Incomplete design patch')
    expect(result.data.sourcePatch?.sources[0]).toMatchObject({
      id: 'figma:file:AbC123', kind: 'figma', content: [{ uri: 'figma://file/AbC123?version=42' }],
    })
    expect(patch.tokens).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'figma:variable:VariableID:1:3:mode:1:0', mode: 'Light', value: '#0080ffff' }),
      expect.objectContaining({
        id: 'figma:variable:VariableID:1:4:mode:1:0', mode: 'Light',
        value: 'alias:figma:variable:VariableID:1:3:mode:1:0',
      }),
    ]))
    expect(patch.components).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'figma:component-set:10:1', name: 'Button' }),
      expect.objectContaining({
        id: 'figma:component:10:2', name: 'Button/Primary',
        tokenIds: ['figma:variable:VariableID:1:4:mode:1:0', 'figma:variable:VariableID:1:4:mode:1:1'],
      }),
    ]))
    expect(patch.relations).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'source-evidence', from: expect.objectContaining({ id: 'figma:file:AbC123' }) }),
      expect.objectContaining({
        kind: 'component-uses-token', from: expect.objectContaining({ id: 'figma:component:10:2' }),
        to: expect.objectContaining({ id: 'figma:variable:VariableID:1:4:mode:1:0' }),
      }),
    ]))
    expect(result.data.receipt.provenance).toMatchObject({ externalRef: 'figma://file/AbC123?version=42' })
    expect(JSON.stringify(result)).not.toContain('must-never-leave-context')

    const merged: DesignDocument = {
      version: 'design-ir.v1',
      meta: { id: base.documentId, title: 'Figma import', createdAt: now, updatedAt: now },
      revision: { id: base.revisionId, number: base.revisionNumber, createdAt: now, author: { kind: 'import', id: 'figma' } },
      needs: [],
      sources: [...(result.data.sourcePatch?.sources ?? [])],
      brands: [],
      tokens: [...patch.tokens],
      components: [...patch.components],
      materials: [],
      provenance: [...(result.data.sourcePatch?.provenance ?? [])],
      relations: [...patch.relations],
    }
    expect(validateDesignDocument(merged)).toMatchObject({ ok: true })
  })

  it('round-trips imported variable identity, modes, aliases, and component bindings', async () => {
    const connector = createFigmaConnector()
    const imported = await connector.import?.(importInput(), context())
    if (!imported?.ok) throw new Error('Import failed')
    const details = (imported.data as typeof imported.data & { details: unknown }).details
    const designPatch = imported.data.designPatch as { tokens: unknown[]; components: unknown[] }
    const exported = await connector.export?.({
      sourceKind: 'figma', locator: 'figma://file/AbC123', metadata: {
        exportRequest: {
          document: base,
          tokens: designPatch.tokens,
          components: designPatch.components,
          verifiedTokenIds: designPatch.tokens.map((token) => (token as { id: string }).id),
          bindings: details,
        },
      },
    }, context())
    expect(exported?.ok).toBe(true)
    if (!exported?.ok) throw new Error(exported?.error.message)
    const variablesFile = exported.data.plan.files.find((file) => file.path === 'figma-variables.json')
    const bindingsFile = exported.data.plan.files.find((file) => file.path === 'figma-component-bindings.json')
    expect(JSON.parse(variablesFile?.content ?? '{}')).toEqual({
      fileKey: 'AbC123', collections: snapshot().collections, variables: snapshot().variables,
    })
    expect(JSON.parse(bindingsFile?.content ?? '{}')).toMatchObject({
      fileKey: 'AbC123',
      componentSets: snapshot().componentSets,
      components: snapshot().components,
      nodeRefs: snapshot().nodeRefs,
      codeConnectHints: snapshot().codeConnectHints,
    })
  })

  it('rejects unsupported variable types, conflicts, and stale export revisions', async () => {
    const connector = createFigmaConnector()
    const unsupported = snapshot() as unknown as Record<string, unknown>
    unsupported.variables = [{
      id: 'bad', name: 'gradient', collectionId: 'VariableCollectionId:1:2', resolvedType: 'GRADIENT',
      valuesByMode: { '1:0': 'x', '1:1': 'y' },
    }]
    await expect(connector.import?.(importInput(unsupported), context())).resolves.toMatchObject({
      ok: false, error: { code: 'invalid-result', message: expect.stringContaining('expected one of') },
    })

    const duplicate = snapshot() as unknown as Record<string, unknown>
    duplicate.variables = [snapshot().variables[0], snapshot().variables[0]]
    await expect(connector.import?.(importInput(duplicate), context())).resolves.toMatchObject({
      ok: false, error: { code: 'invalid-result', message: expect.stringContaining('Duplicate Figma variable') },
    })

    await expect(connector.export?.({
      sourceKind: 'figma', locator: 'figma://file/AbC123', metadata: {
        exportRequest: { document: { ...base, revisionNumber: 6 }, tokens: [], components: [], verifiedTokenIds: [], bindings: {} },
      },
    }, context())).resolves.toMatchObject({
      ok: false, error: { code: 'stale-revision' },
    })
  })

  it('performs no network I/O and rejects snapshot secrets instead of persisting them', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network forbidden'))
    const connector = createFigmaConnector()
    const withSecret = { ...snapshot(), accessToken: 'secret' }
    await expect(connector.import?.(importInput(withSecret), context())).resolves.toMatchObject({
      ok: false, error: { code: 'invalid-result' },
    })
    await connector.preview?.(importInput(), context())
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('honors cancellation before transforming the supplied snapshot', async () => {
    const controller = new AbortController()
    controller.abort()
    const connector = createFigmaConnector()
    await expect(connector.import?.(importInput(), context({ signal: controller.signal }))).resolves.toEqual({
      ok: false, error: { code: 'aborted', message: 'Figma connector operation was aborted.' },
    })
  })
})

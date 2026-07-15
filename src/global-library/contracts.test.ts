import { describe, expect, it } from 'vitest'
import { GLOBAL_LIBRARY_PROTOCOL, globalLibraryCatalogSchema, globalLibraryItemSchema, projectLibraryReferenceSchema } from './contracts'

const sha = (character: string) => character.repeat(64)
const timestamp = '2026-07-12T00:00:00.000Z'

function item(overrides: Record<string, unknown> = {}) {
  return {
    protocol: GLOBAL_LIBRARY_PROTOCOL,
    id: 'design-system.core', version: '1.0.0', kind: 'design-system-kit', name: 'Core system', description: 'Reusable product system.',
    contentSha256: sha('a'), content: { manifestPath: 'manifest.json', manifestSha256: sha('b'), artifacts: [{ path: 'tokens/tokens.json', sha256: sha('c'), mediaType: 'application/json', size: 42 }] },
    origin: { kind: 'generated', producer: 'cutout', projectId: 'project.one', runId: 'run.one', sourceRevision: 'revision.one' },
    license: { kind: 'spdx', identifier: 'Apache-2.0' }, tags: ['product'], collections: [], favorite: false, pinned: true,
    dependencies: [], compatibility: [{ target: 'react', versionRange: '^19', role: 'runtime', status: 'verified', evidenceIds: ['receipt.react'] }],
    qualityReceipts: [{ id: 'quality.one', gate: 'schema', status: 'passed', checkedAt: timestamp, tool: 'zod', evidence: [] }],
    lineage: { root: { itemId: 'design-system.core', version: '1.0.0', contentSha256: sha('a') }, depth: 0 }, createdAt: timestamp, updatedAt: timestamp,
    ...overrides,
  }
}

describe('global library contracts', () => {
  it.each(['brand-kit', 'design-system-kit', 'component-library-item', 'visual-asset'])('accepts the %s item kind', (kind) => {
    expect(globalLibraryItemSchema.parse(item({ kind })).kind).toBe(kind)
  })

  it('rejects unknown fields, unsafe paths, embedded credentials, duplicate artifacts, and self dependencies', () => {
    expect(globalLibraryItemSchema.safeParse({ ...item(), surprise: true }).success).toBe(false)
    expect(globalLibraryItemSchema.safeParse(item({ content: { manifestPath: '../manifest.json', manifestSha256: sha('b'), artifacts: [{ path: '/tmp/a', sha256: sha('c'), mediaType: 'text/plain', size: 1 }] } })).success).toBe(false)
    expect(globalLibraryItemSchema.safeParse(item({ description: 'authorization=Bearer abcdefghijklmnop' })).success).toBe(false)
    expect(globalLibraryItemSchema.safeParse(item({ content: { manifestPath: 'manifest.json', manifestSha256: sha('b'), artifacts: [{ path: 'a', sha256: sha('c'), mediaType: 'text/plain', size: 1 }, { path: 'a', sha256: sha('d'), mediaType: 'text/plain', size: 2 }] } })).success).toBe(false)
    expect(globalLibraryItemSchema.safeParse(item({ dependencies: [{ itemId: 'design-system.core', version: '1.0.0', contentSha256: sha('a'), optional: false }] })).success).toBe(false)
  })

  it('requires fork origin and lineage parent to identify the same immutable content', () => {
    const forked = item({ id: 'design-system.acme', contentSha256: sha('d'), origin: { kind: 'forked', itemId: 'design-system.core', version: '1.0.0', contentSha256: sha('a') }, lineage: { parent: { itemId: 'design-system.core', version: '1.0.0', contentSha256: sha('a') }, root: { itemId: 'design-system.core', version: '1.0.0', contentSha256: sha('a') }, depth: 1 } })
    expect(globalLibraryItemSchema.safeParse(forked).success).toBe(true)
    expect(globalLibraryItemSchema.safeParse({ ...forked, origin: { kind: 'forked', itemId: 'other', version: '1.0.0', contentSha256: sha('a') } }).success).toBe(false)
  })

  it('models locked project references, updates, and fork lineage without silently changing the lock', () => {
    const reference = { protocol: GLOBAL_LIBRARY_PROTOCOL, id: 'ref.one', projectId: 'project.one', itemId: 'design-system.core', kind: 'design-system-kit', locked: { version: '1.0.0', contentSha256: sha('a') }, updatePolicy: 'notify', status: 'update-available', availableUpdate: { version: '1.1.0', contentSha256: sha('d'), compatibility: 'compatible' }, fork: { itemId: 'design-system.acme', version: '1.0.0', contentSha256: sha('e'), parentContentSha256: sha('a') }, attachedAt: timestamp, updatedAt: timestamp }
    expect(projectLibraryReferenceSchema.parse(reference).locked.version).toBe('1.0.0')
    expect(projectLibraryReferenceSchema.safeParse({ ...reference, availableUpdate: undefined }).success).toBe(false)
    expect(projectLibraryReferenceSchema.safeParse({ ...reference, fork: { ...reference.fork, parentContentSha256: sha('f') } }).success).toBe(false)
  })

  it('validates catalog identity and collection cross references', () => {
    const collection = { protocol: GLOBAL_LIBRARY_PROTOCOL, id: 'favorites', name: 'Favorites', itemIds: ['design-system.core'], pinned: true, createdAt: timestamp, updatedAt: timestamp }
    expect(globalLibraryCatalogSchema.safeParse({ protocol: GLOBAL_LIBRARY_PROTOCOL, revision: 1, items: [item({ collections: ['favorites'] })], collections: [collection], projectReferences: [], updatedAt: timestamp }).success).toBe(true)
    expect(globalLibraryCatalogSchema.safeParse({ protocol: GLOBAL_LIBRARY_PROTOCOL, revision: 1, items: [item({ collections: ['missing'] })], collections: [], projectReferences: [], updatedAt: timestamp }).success).toBe(false)
    expect(globalLibraryCatalogSchema.safeParse({ protocol: GLOBAL_LIBRARY_PROTOCOL, revision: 1, items: [item(), item()], collections: [], projectReferences: [], updatedAt: timestamp }).success).toBe(false)
    expect(globalLibraryCatalogSchema.safeParse({ protocol: GLOBAL_LIBRARY_PROTOCOL, revision: 1, items: [item()], collections: [{ ...collection, itemIds: ['missing'] }], projectReferences: [], updatedAt: timestamp }).success).toBe(false)
    expect(globalLibraryCatalogSchema.safeParse({ protocol: GLOBAL_LIBRARY_PROTOCOL, revision: 1, items: [item({ dependencies: [{ itemId: 'missing', version: '1.0.0', contentSha256: sha('d'), optional: false }] })], collections: [], projectReferences: [], updatedAt: timestamp }).success).toBe(false)
  })
})

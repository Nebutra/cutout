import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { fingerprint } from '@/design-ir/fingerprint'
import { evidenceGraphSchema, provenanceReferenceSchema } from './contracts'
import { createKernelRegistry, SchemaRegistry, registerDomainSchema } from './registry'
import { fixtureEvidenceGraph } from './test-fixture'

describe('Design OS schema registry and migrations (K8)', () => {
  it('parses current records strictly and rejects unknown newer records without mutation', async () => {
    const registry = createKernelRegistry()
    const current = fixtureEvidenceGraph()
    const newer = structuredClone(current) as unknown as Record<string, unknown>
    newer.schema = { id: 'design-os.evidence-graph', version: 2 }
    const before = structuredClone(newer)

    await expect(registry.migrateToLatest(newer)).rejects.toThrow(/Unsupported newer schema/)
    expect(newer).toEqual(before)
    expect(() => evidenceGraphSchema.parse({ ...current, extra: true })).toThrow()
  })

  it('runs pure idempotent migrations with identity, provenance and hash receipts intact', async () => {
    const registry = new SchemaRegistry()
    const migratableV2Schema = z.object({
      protocol: z.literal('design-os.protocol.v1'),
      kind: z.literal('fixture-migratable'),
      schema: z.object({ id: z.literal('fixture.migratable'), version: z.literal(2) }).strict(),
      identity: z.object({ id: z.string().min(1), revision: z.string().min(1) }).strict(),
      provenance: z.array(provenanceReferenceSchema),
      body: z.object({ value: z.string().min(1) }).strict(),
    }).strict()
    registerDomainSchema(registry, {
      reference: { id: 'fixture.migratable', version: 2 },
      category: 'outcome',
      canonicalOwner: 'fixtures/migratable.ts',
      schema: migratableV2Schema,
    })
    registry.registerMigration({
      schemaId: 'fixture.migratable',
      fromVersion: 1,
      toVersion: 2,
      migrate: (document) => {
        if (!document || Array.isArray(document) || typeof document !== 'object') throw new Error('Expected envelope.')
        return { ...document, schema: { id: 'fixture.migratable', version: 2 } }
      },
    })
    const current = {
      protocol: 'design-os.protocol.v1' as const,
      kind: 'fixture-migratable' as const,
      schema: { id: 'fixture.migratable' as const, version: 2 as const },
      identity: { id: 'fixture:record', revision: 'fixture:revision:1' },
      provenance: [{ sourceId: 'source:fixture', revision: 'source:1', relation: 'normalized-from' }],
      body: { value: 'preserved' },
    }
    const legacy = {
      ...current,
      schema: { id: 'fixture.migratable' as const, version: 1 as const },
    }
    const predecessorHash = await fingerprint(legacy)
    const first = await registry.migrateToLatest(legacy)
    const second = await registry.migrateToLatest(first.document)

    expect(first.receipts).toEqual([expect.objectContaining({
      predecessorHash,
      preservedIdentity: current.identity,
      preservedProvenance: current.provenance,
    })])
    expect(second.receipts).toEqual([])
    expect(second.document).toEqual(first.document)
    expect(legacy.schema.version).toBe(1)
  })

  it('rejects a migration that mutates the clone passed to it', async () => {
    const registry = new SchemaRegistry()
    const schema = z.object({
      protocol: z.literal('design-os.protocol.v1'), kind: z.literal('fixture-mutating'),
      schema: z.object({ id: z.literal('fixture.mutating'), version: z.literal(2) }).strict(),
      identity: z.object({ id: z.string(), revision: z.string() }).strict(),
      provenance: z.array(provenanceReferenceSchema),
      body: z.object({ value: z.string() }).strict(),
    }).strict()
    registerDomainSchema(registry, {
      reference: { id: 'fixture.mutating', version: 2 }, category: 'outcome',
      canonicalOwner: 'fixture', schema,
    })
    registry.registerMigration({
      schemaId: 'fixture.mutating', fromVersion: 1, toVersion: 2,
      migrate: (document) => {
        const mutable = document as { schema: { version: number } }
        mutable.schema.version = 2
        return mutable
      },
    })
    await expect(registry.migrateToLatest({
      protocol: 'design-os.protocol.v1', kind: 'fixture-mutating',
      schema: { id: 'fixture.mutating', version: 1 },
      identity: { id: 'fixture', revision: '1' }, provenance: [], body: { value: 'value' },
    })).rejects.toThrow(/mutated its input/)
  })
})

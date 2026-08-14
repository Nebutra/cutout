import { z } from 'zod'
import { canonicalJson, fingerprint } from '@/design-ir/fingerprint'
import {
  jsonValueSchema,
  kernelRecordSchemas,
  KERNEL_PROTOCOL,
  provenanceReferenceSchema,
  recordIdSchema,
  schemaReferenceSchema,
  sha256Schema,
  type JsonValue,
  type KernelRecordSchemaId,
  type SchemaReference,
} from './contracts'

export type RegistryCategory = 'record' | 'outcome' | 'recipe' | 'evaluator' | 'presentation'

export interface SchemaRegistration<Output = unknown> {
  readonly reference: SchemaReference
  readonly category: RegistryCategory
  readonly schema: z.ZodType<Output>
  readonly canonicalOwner: string
}

export interface MigrationRegistration {
  readonly schemaId: string
  readonly fromVersion: number
  readonly toVersion: number
  readonly migrate: (document: JsonValue) => JsonValue
}

export const migrationReceiptSchema = z.object({
  protocol: z.literal(KERNEL_PROTOCOL),
  kind: z.literal('migration-receipt'),
  id: recordIdSchema,
  schemaId: recordIdSchema,
  fromVersion: z.number().int().positive(),
  toVersion: z.number().int().positive(),
  predecessorHash: sha256Schema,
  migratedHash: sha256Schema,
  preservedIdentity: z.object({ id: recordIdSchema, revision: recordIdSchema }).strict(),
  preservedProvenance: z.array(provenanceReferenceSchema).max(20_000),
}).strict()
export type MigrationReceipt = z.infer<typeof migrationReceiptSchema>

export interface MigrationResult<Output> {
  readonly document: Output
  readonly receipts: readonly MigrationReceipt[]
}

const migratableEnvelopeSchema = z.object({
  protocol: z.literal(KERNEL_PROTOCOL),
  kind: recordIdSchema,
  schema: schemaReferenceSchema,
  identity: z.object({ id: recordIdSchema, revision: recordIdSchema }).strict(),
  provenance: z.array(provenanceReferenceSchema).max(20_000),
}).passthrough()

export class SchemaRegistry {
  readonly #schemas = new Map<string, Map<number, SchemaRegistration>>()
  readonly #migrations = new Map<string, Map<number, MigrationRegistration>>()

  register<Output>(registration: SchemaRegistration<Output>): this {
    const reference = schemaReferenceSchema.parse(registration.reference)
    const canonicalOwner = z.string().min(1).max(1_000).parse(registration.canonicalOwner)
    const versions = this.#schemas.get(reference.id) ?? new Map()
    if (versions.has(reference.version)) {
      throw new Error(`Schema is already registered: ${reference.id}@${reference.version}`)
    }
    versions.set(reference.version, { ...registration, reference, canonicalOwner } as SchemaRegistration)
    this.#schemas.set(reference.id, versions)
    return this
  }

  registerMigration(migration: MigrationRegistration): this {
    const schemaId = recordIdSchema.parse(migration.schemaId)
    const fromVersion = z.number().int().positive().parse(migration.fromVersion)
    const toVersion = z.number().int().positive().parse(migration.toVersion)
    if (toVersion !== fromVersion + 1) {
      throw new Error('Migrations must advance exactly one schema version.')
    }
    const versions = this.#migrations.get(schemaId) ?? new Map()
    if (versions.has(fromVersion)) {
      throw new Error(`Migration is already registered: ${schemaId}@${fromVersion}`)
    }
    versions.set(fromVersion, { ...migration, schemaId, fromVersion, toVersion })
    this.#migrations.set(schemaId, versions)
    return this
  }

  registration(reference: SchemaReference): SchemaRegistration | undefined {
    return this.#schemas.get(reference.id)?.get(reference.version)
  }

  registrations(): readonly SchemaRegistration[] {
    return [...this.#schemas.values()]
      .flatMap((versions) => [...versions.values()])
      .sort((left, right) => left.reference.id.localeCompare(right.reference.id)
        || left.reference.version - right.reference.version)
  }

  latestVersion(schemaId: string): number | undefined {
    const versions = this.#schemas.get(schemaId)
    return versions ? Math.max(...versions.keys()) : undefined
  }

  parse<Output>(reference: SchemaReference, input: unknown): Output {
    const registration = this.registration(reference)
    if (!registration) throw new Error(`Unsupported schema: ${reference.id}@${reference.version}`)
    return registration.schema.parse(input) as Output
  }

  async migrateToLatest(input: unknown): Promise<MigrationResult<unknown>> {
    const original = structuredClone(input)
    const envelope = migratableEnvelopeSchema.parse(input)
    const latestVersion = this.latestVersion(envelope.schema.id)
    if (latestVersion === undefined || envelope.schema.version > latestVersion) {
      throw new Error(`Unsupported newer schema: ${envelope.schema.id}@${envelope.schema.version}`)
    }
    let current = jsonValueSchema.parse(structuredClone(input))
    const receipts: MigrationReceipt[] = []
    for (let version = envelope.schema.version; version < latestVersion; version += 1) {
      const migration = this.#migrations.get(envelope.schema.id)?.get(version)
      if (!migration) throw new Error(`Missing migration: ${envelope.schema.id}@${version}`)
      const before = migratableEnvelopeSchema.parse(current)
      const predecessorHash = await fingerprint(current)
      const migrationInput = structuredClone(current)
      const migrated = jsonValueSchema.parse(migration.migrate(migrationInput))
      if (canonicalJson(migrationInput) !== canonicalJson(current)) {
        throw new Error(`Migration ${envelope.schema.id}@${version} mutated its input.`)
      }
      const after = migratableEnvelopeSchema.parse(migrated)
      if (after.schema.id !== before.schema.id || after.schema.version !== version + 1) {
        throw new Error(`Migration ${envelope.schema.id}@${version} returned the wrong schema identity.`)
      }
      if (after.identity.id !== before.identity.id || after.identity.revision !== before.identity.revision) {
        throw new Error(`Migration ${envelope.schema.id}@${version} changed record identity.`)
      }
      if (JSON.stringify(after.provenance) !== JSON.stringify(before.provenance)) {
        throw new Error(`Migration ${envelope.schema.id}@${version} changed provenance.`)
      }
      current = migrated
      const migratedHash = await fingerprint(current)
      receipts.push(migrationReceiptSchema.parse({
        protocol: KERNEL_PROTOCOL,
        kind: 'migration-receipt',
        id: `migration:${predecessorHash}`,
        schemaId: envelope.schema.id,
        fromVersion: version,
        toVersion: version + 1,
        predecessorHash,
        migratedHash,
        preservedIdentity: before.identity,
        preservedProvenance: before.provenance,
      }))
    }
    const finalEnvelope = migratableEnvelopeSchema.parse(current)
    const document = this.parse(finalEnvelope.schema, current)
    if (envelope.schema.version === latestVersion && await fingerprint(original) !== await fingerprint(document)) {
      throw new Error('Current schema parsing must not mutate the document.')
    }
    return { document, receipts }
  }
}

export function createKernelRegistry(): SchemaRegistry {
  const registry = new SchemaRegistry()
  for (const [id, schema] of Object.entries(kernelRecordSchemas) as [KernelRecordSchemaId, z.ZodType][]) {
    registry.register({
      reference: { id, version: 1 },
      category: 'record',
      schema,
      canonicalOwner: 'src/design-os-kernel/contracts.ts',
    })
  }
  return registry
}

export function registerDomainSchema<Output>(
  registry: SchemaRegistry,
  registration: Omit<SchemaRegistration<Output>, 'category'> & { readonly category: Exclude<RegistryCategory, 'record'> },
): SchemaRegistry {
  return registry.register(registration)
}

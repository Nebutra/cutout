import { z } from 'zod'

export const GLOBAL_LIBRARY_PROTOCOL = 'cutout.global-library.v1' as const

const secretPattern = /(?:\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b|\bBearer\s+[A-Za-z0-9._~+/-]+\b|(?:api[-_]?key|token|secret|authorization)\s*[:=]\s*[^\s,;]+)/i
const safeText = (maximum: number) => z.string().min(1).max(maximum).refine((value) => !secretPattern.test(value), 'Secret-shaped values are forbidden.')
const safeIdSchema = safeText(160).regex(/^[a-z0-9][a-z0-9._-]*$/)
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const versionSchema = safeText(80).regex(/^[0-9A-Za-z][0-9A-Za-z.+_-]*$/)
const safeRelativePathSchema = z.string().min(1).max(512).refine((path) => {
  if (path.includes('\\') || path.startsWith('/') || /^[A-Za-z]:/.test(path)) return false
  return path.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
}, 'Library paths must be normalized relative paths without traversal.')
const safeUrlSchema = z.string().url().max(2_048).refine((value) => {
  try {
    const url = new URL(value)
    return !url.username && !url.password && !secretPattern.test(value) && ['https:', 'http:'].includes(url.protocol)
  } catch { return false }
}, 'URLs must be HTTP(S), credential-free, and contain no secrets.')

function unique<T>(values: readonly T[], key: (value: T) => string): boolean {
  return new Set(values.map(key)).size === values.length
}

export const libraryItemKindSchema = z.enum(['brand-kit', 'design-system-kit', 'component-library-item', 'starter-kit', 'visual-asset'])

export const libraryOriginSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('generated'), producer: safeIdSchema, projectId: safeIdSchema, runId: safeIdSchema, sourceRevision: safeIdSchema }).strict(),
  z.object({ kind: z.literal('imported'), provider: safeIdSchema, externalId: safeText(240), sourceUrl: safeUrlSchema.optional(), capturedAt: z.string().datetime() }).strict(),
  z.object({ kind: z.literal('forked'), itemId: safeIdSchema, version: versionSchema, contentSha256: sha256Schema }).strict(),
  z.object({ kind: z.literal('updated'), itemId: safeIdSchema, version: versionSchema, contentSha256: sha256Schema }).strict(),
  z.object({ kind: z.literal('bundled'), producer: safeIdSchema }).strict(),
])

export const libraryLicenseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('spdx'), identifier: safeText(80), holder: safeText(240).optional() }).strict(),
  z.object({ kind: z.literal('proprietary'), holder: safeText(240), usage: safeText(1_000) }).strict(),
  z.object({ kind: z.literal('public-domain'), evidenceRef: safeIdSchema.optional() }).strict(),
  z.object({ kind: z.literal('unknown'), rationale: safeText(1_000) }).strict(),
])

export const libraryCompatibilitySchema = z.object({
  target: safeIdSchema,
  versionRange: safeText(120),
  role: z.enum(['runtime', 'framework', 'design-tool', 'agent', 'platform']),
  status: z.enum(['verified', 'declared', 'incompatible']),
  evidenceIds: z.array(safeIdSchema).max(50).default([]),
}).strict()

export const libraryQualityReceiptSchema = z.object({
  id: safeIdSchema,
  gate: z.enum(['schema', 'typecheck', 'lint', 'unit-test', 'integration-test', 'build', 'accessibility', 'visual-regression', 'responsive', 'provenance', 'license', 'security', 'package-consumer']),
  status: z.enum(['passed', 'failed', 'skipped']),
  checkedAt: z.string().datetime(),
  tool: safeText(160),
  evidence: z.array(z.object({ id: safeIdSchema, sha256: sha256Schema, path: safeRelativePathSchema.optional() }).strict()).max(100).default([]),
  summary: safeText(1_000).optional(),
}).strict()

export const libraryDependencySchema = z.object({
  itemId: safeIdSchema,
  version: versionSchema,
  contentSha256: sha256Schema,
  optional: z.boolean().default(false),
}).strict()

export const libraryLineageSchema = z.object({
  parent: z.object({ itemId: safeIdSchema, version: versionSchema, contentSha256: sha256Schema }).strict().optional(),
  root: z.object({ itemId: safeIdSchema, version: versionSchema, contentSha256: sha256Schema }).strict(),
  depth: z.number().int().nonnegative().max(1_000),
}).strict().superRefine((lineage, context) => {
  if ((lineage.depth === 0) !== !lineage.parent) context.addIssue({ code: 'custom', message: 'Only root lineage may omit a parent.' })
  if (lineage.depth === 0 && lineage.parent) context.addIssue({ code: 'custom', message: 'Root lineage cannot have a parent.' })
})

export const globalLibraryItemSchema = z.object({
  protocol: z.literal(GLOBAL_LIBRARY_PROTOCOL),
  id: safeIdSchema,
  version: versionSchema,
  kind: libraryItemKindSchema,
  name: safeText(160),
  description: safeText(2_000),
  contentSha256: sha256Schema,
  content: z.object({
    manifestPath: safeRelativePathSchema,
    manifestSha256: sha256Schema,
    artifacts: z.array(z.object({ path: safeRelativePathSchema, sha256: sha256Schema, mediaType: safeText(160), size: z.number().int().nonnegative() }).strict()).min(1).max(5_000),
  }).strict(),
  origin: libraryOriginSchema,
  license: libraryLicenseSchema,
  tags: z.array(safeIdSchema).max(60).default([]),
  collections: z.array(safeIdSchema).max(100).default([]),
  favorite: z.boolean().default(false),
  pinned: z.boolean().default(false),
  archivedAt: z.string().datetime().optional(),
  dependencies: z.array(libraryDependencySchema).max(500).default([]),
  compatibility: z.array(libraryCompatibilitySchema).max(200).default([]),
  qualityReceipts: z.array(libraryQualityReceiptSchema).max(200).default([]),
  lineage: libraryLineageSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict().superRefine((item, context) => {
  if (!unique(item.content.artifacts, (artifact) => artifact.path)) context.addIssue({ code: 'custom', path: ['content', 'artifacts'], message: 'Artifact paths must be unique.' })
  if (!unique(item.dependencies, (dependency) => dependency.itemId)) context.addIssue({ code: 'custom', path: ['dependencies'], message: 'Dependencies must be unique.' })
  if (!unique(item.compatibility, (entry) => `${entry.target}:${entry.role}`)) context.addIssue({ code: 'custom', path: ['compatibility'], message: 'Compatibility targets and roles must be unique.' })
  if (!unique(item.qualityReceipts, (receipt) => receipt.id)) context.addIssue({ code: 'custom', path: ['qualityReceipts'], message: 'Quality receipt ids must be unique.' })
  if (item.dependencies.some((dependency) => dependency.itemId === item.id)) context.addIssue({ code: 'custom', path: ['dependencies'], message: 'A library item cannot depend on itself.' })
  if (item.lineage.depth === 0 && (item.lineage.root.itemId !== item.id || item.lineage.root.version !== item.version || item.lineage.root.contentSha256 !== item.contentSha256)) context.addIssue({ code: 'custom', path: ['lineage'], message: 'Root lineage must identify the item itself.' })
  if ((item.origin.kind === 'forked' || item.origin.kind === 'updated') && (!item.lineage.parent || item.origin.itemId !== item.lineage.parent.itemId || item.origin.version !== item.lineage.parent.version || item.origin.contentSha256 !== item.lineage.parent.contentSha256)) context.addIssue({ code: 'custom', path: ['origin'], message: 'Derived origin must match lineage parent.' })
  if (item.origin.kind !== 'forked' && item.origin.kind !== 'updated' && item.lineage.depth > 0) context.addIssue({ code: 'custom', path: ['origin'], message: 'Non-root lineage requires a derived origin.' })
  if (new Date(item.updatedAt).getTime() < new Date(item.createdAt).getTime()) context.addIssue({ code: 'custom', path: ['updatedAt'], message: 'updatedAt cannot precede createdAt.' })
  if (secretPattern.test(JSON.stringify(item))) context.addIssue({ code: 'custom', message: 'Library item contains credential-shaped data.' })
})

export const libraryCollectionSchema = z.object({
  protocol: z.literal(GLOBAL_LIBRARY_PROTOCOL),
  id: safeIdSchema,
  name: safeText(160),
  description: safeText(1_000).optional(),
  itemIds: z.array(safeIdSchema).max(10_000).default([]),
  pinned: z.boolean().default(false),
  archivedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict().superRefine((collection, context) => {
  if (!unique(collection.itemIds, (value) => value)) context.addIssue({ code: 'custom', path: ['itemIds'], message: 'Collection item ids must be unique.' })
  if (new Date(collection.updatedAt).getTime() < new Date(collection.createdAt).getTime()) context.addIssue({ code: 'custom', path: ['updatedAt'], message: 'updatedAt cannot precede createdAt.' })
})

export const projectLibraryReferenceSchema = z.object({
  protocol: z.literal(GLOBAL_LIBRARY_PROTOCOL),
  id: safeIdSchema,
  projectId: safeIdSchema,
  itemId: safeIdSchema,
  kind: libraryItemKindSchema,
  locked: z.object({ version: versionSchema, contentSha256: sha256Schema }).strict(),
  updatePolicy: z.enum(['locked', 'notify', 'auto-compatible']),
  status: z.enum(['current', 'update-available', 'diverged', 'missing']),
  availableUpdate: z.object({ version: versionSchema, contentSha256: sha256Schema, compatibility: z.enum(['compatible', 'breaking', 'unknown']) }).strict().optional(),
  fork: z.object({ itemId: safeIdSchema, version: versionSchema, contentSha256: sha256Schema, parentContentSha256: sha256Schema }).strict().optional(),
  attachedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict().superRefine((reference, context) => {
  if ((reference.status === 'update-available') !== Boolean(reference.availableUpdate)) context.addIssue({ code: 'custom', path: ['availableUpdate'], message: 'Update availability and status must agree.' })
  if (reference.updatePolicy === 'locked' && reference.availableUpdate?.compatibility === 'compatible') {
    // Locked references may report updates, but never imply automatic mutation.
  }
  if (reference.fork && reference.fork.parentContentSha256 !== reference.locked.contentSha256) context.addIssue({ code: 'custom', path: ['fork'], message: 'Fork parent must match the locked content hash.' })
  if (new Date(reference.updatedAt).getTime() < new Date(reference.attachedAt).getTime()) context.addIssue({ code: 'custom', path: ['updatedAt'], message: 'updatedAt cannot precede attachedAt.' })
  if (secretPattern.test(JSON.stringify(reference))) context.addIssue({ code: 'custom', message: 'Project reference contains credential-shaped data.' })
})

export const globalLibraryCatalogSchema = z.object({
  protocol: z.literal(GLOBAL_LIBRARY_PROTOCOL),
  revision: z.number().int().nonnegative(),
  items: z.array(globalLibraryItemSchema).max(100_000),
  collections: z.array(libraryCollectionSchema).max(10_000),
  projectReferences: z.array(projectLibraryReferenceSchema).max(100_000),
  updatedAt: z.string().datetime(),
}).strict().superRefine((catalog, context) => {
  if (!unique(catalog.items, (item) => `${item.id}@${item.version}`)) context.addIssue({ code: 'custom', path: ['items'], message: 'Item id and version pairs must be unique.' })
  if (!unique(catalog.collections, (collection) => collection.id)) context.addIssue({ code: 'custom', path: ['collections'], message: 'Collection ids must be unique.' })
  if (!unique(catalog.projectReferences, (reference) => reference.id)) context.addIssue({ code: 'custom', path: ['projectReferences'], message: 'Project reference ids must be unique.' })
  const collectionIds = new Set(catalog.collections.map((collection) => collection.id))
  for (const item of catalog.items) for (const collectionId of item.collections) if (!collectionIds.has(collectionId)) context.addIssue({ code: 'custom', path: ['items'], message: `Unknown collection ${collectionId}.` })
  const itemIds = new Set(catalog.items.map((item) => item.id))
  const immutableItems = new Set(catalog.items.map((item) => `${item.id}@${item.version}#${item.contentSha256}`))
  for (const collection of catalog.collections) for (const itemId of collection.itemIds) if (!itemIds.has(itemId)) context.addIssue({ code: 'custom', path: ['collections'], message: `Collection ${collection.id} references unknown item ${itemId}.` })
  for (const item of catalog.items) for (const dependency of item.dependencies) if (!dependency.optional && !immutableItems.has(`${dependency.itemId}@${dependency.version}#${dependency.contentSha256}`)) context.addIssue({ code: 'custom', path: ['items'], message: `Required dependency ${dependency.itemId}@${dependency.version} is unavailable or has a different hash.` })
  for (const reference of catalog.projectReferences) if (!immutableItems.has(`${reference.itemId}@${reference.locked.version}#${reference.locked.contentSha256}`)) context.addIssue({ code: 'custom', path: ['projectReferences'], message: `Project reference ${reference.id} has an unavailable lock.` })
})

export type LibraryItemKind = z.infer<typeof libraryItemKindSchema>
export type LibraryOrigin = z.infer<typeof libraryOriginSchema>
export type LibraryLicense = z.infer<typeof libraryLicenseSchema>
export type LibraryCompatibility = z.infer<typeof libraryCompatibilitySchema>
export type LibraryQualityReceipt = z.infer<typeof libraryQualityReceiptSchema>
export type LibraryDependency = z.infer<typeof libraryDependencySchema>
export type LibraryLineage = z.infer<typeof libraryLineageSchema>
export type GlobalLibraryItem = z.infer<typeof globalLibraryItemSchema>
export type LibraryCollection = z.infer<typeof libraryCollectionSchema>
export type ProjectLibraryReference = z.infer<typeof projectLibraryReferenceSchema>
export type GlobalLibraryCatalog = z.infer<typeof globalLibraryCatalogSchema>

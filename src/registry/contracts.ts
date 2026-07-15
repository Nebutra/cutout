import { z } from 'zod'

export const REGISTRY_ITEM_VERSION = 'cutout.registry-item.v1' as const

const identifierSchema = z.string().min(1).max(160).regex(/^[a-z0-9][a-z0-9._-]*$/)
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const safePathSchema = z.string().min(1).max(512).refine((path) => {
  if (path.includes('\\') || path.startsWith('/') || /^[A-Za-z]:/.test(path)) return false
  const segments = path.split('/')
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
}, 'Registry paths must be normalized relative paths without traversal.')

function uniqueBy<T>(values: readonly T[], key: (value: T) => string): boolean {
  return new Set(values.map(key)).size === values.length
}

export const RegistryItemKindSchema = z.enum([
  'component',
  'pattern',
  'template',
  'starter',
  'skill',
  'integration-adapter',
])

export const RegistryFileSchema = z.object({
  path: safePathSchema,
  mediaType: z.string().min(1).max(160),
  size: z.number().int().nonnegative(),
  sha256: sha256Schema,
  role: z.enum(['source', 'asset', 'contract', 'documentation', 'configuration', 'test']),
  executable: z.boolean().optional(),
}).strict()

export const RegistryDependencySchema = z.object({
  id: identifierSchema,
  version: z.string().min(1).max(80),
  kind: RegistryItemKindSchema.optional(),
  optional: z.boolean().default(false),
}).strict()

export const RegistryFrameworkSchema = z.object({
  id: identifierSchema,
  version: z.string().min(1).max(80).optional(),
  role: z.enum(['runtime', 'peer', 'development', 'target']),
}).strict()

export const RegistryProvenanceSchema = z.object({
  id: identifierSchema,
  source: z.enum(['bundled', 'local', 'integration', 'generated', 'imported']),
  sourceUri: z.string().url().optional(),
  capturedAt: z.string().datetime(),
  actor: z.enum(['user', 'agent', 'system', 'external']),
  contentSha256: sha256Schema.optional(),
}).strict()

export const RegistryLicenseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('spdx'), identifier: z.string().min(1), holder: z.string().min(1).optional() }).strict(),
  z.object({ kind: z.literal('proprietary'), holder: z.string().min(1), rationale: z.string().min(1).optional() }).strict(),
  z.object({ kind: z.literal('public-domain'), rationale: z.string().min(1).optional() }).strict(),
  z.object({ kind: z.literal('unknown'), rationale: z.string().min(1) }).strict(),
])

export const RegistryQualityReceiptSchema = z.object({
  gate: z.enum([
    'schema', 'typecheck', 'lint', 'unit-test', 'integration-test', 'build',
    'accessibility', 'visual-regression', 'responsive', 'package-consumer',
    'provenance', 'license', 'security',
  ]),
  status: z.enum(['passed', 'failed', 'skipped']),
  checkedAt: z.string().datetime(),
  tool: z.string().min(1).max(160).optional(),
  evidence: z.array(z.object({
    sha256: sha256Schema,
    path: safePathSchema.optional(),
    mediaType: z.string().min(1).optional(),
  }).strict()).default([]),
  summary: z.string().min(1).max(1000).optional(),
}).strict()

export const RegistryPreviewAssetSchema = z.object({
  path: safePathSchema,
  mediaType: z.string().regex(/^(image|video)\//),
  sha256: sha256Schema,
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  alt: z.string().min(1).max(500),
}).strict()

export const RegistryItemSchema = z.object({
  schemaVersion: z.literal(REGISTRY_ITEM_VERSION),
  id: identifierSchema,
  version: z.string().min(1).max(80),
  kind: RegistryItemKindSchema,
  metadata: z.object({
    name: z.string().min(1).max(160),
    description: z.string().min(1).max(2000),
    tags: z.array(identifierSchema).max(40).default([]),
    homepage: z.string().url().optional(),
    deprecated: z.boolean().optional(),
  }).strict(),
  files: z.array(RegistryFileSchema).min(1).max(2000),
  designIrRefs: z.array(z.string().min(1).max(240)).max(1000).default([]),
  tokenRefs: z.array(z.string().min(1).max(240)).max(5000).default([]),
  dependencies: z.array(RegistryDependencySchema).max(500).default([]),
  frameworks: z.array(RegistryFrameworkSchema).max(100).default([]),
  provenance: z.array(RegistryProvenanceSchema).min(1).max(100),
  license: RegistryLicenseSchema,
  qualityReceipts: z.array(RegistryQualityReceiptSchema).max(100).default([]),
  previewAssets: z.array(RegistryPreviewAssetSchema).max(100).default([]),
}).strict().superRefine((item, context) => {
  if (!uniqueBy(item.files, (file) => file.path)) context.addIssue({ code: 'custom', path: ['files'], message: 'Registry file paths must be unique.' })
  if (!uniqueBy(item.dependencies, (dependency) => dependency.id)) context.addIssue({ code: 'custom', path: ['dependencies'], message: 'Registry dependencies must be unique.' })
  if (!uniqueBy(item.frameworks, (framework) => `${framework.id}:${framework.role}`)) context.addIssue({ code: 'custom', path: ['frameworks'], message: 'Registry framework roles must be unique.' })
  if (!uniqueBy(item.previewAssets, (asset) => asset.path)) context.addIssue({ code: 'custom', path: ['previewAssets'], message: 'Registry preview paths must be unique.' })
})

export type RegistryItemKind = z.infer<typeof RegistryItemKindSchema>
export type RegistryFile = z.infer<typeof RegistryFileSchema>
export type RegistryDependency = z.infer<typeof RegistryDependencySchema>
export type RegistryFramework = z.infer<typeof RegistryFrameworkSchema>
export type RegistryProvenance = z.infer<typeof RegistryProvenanceSchema>
export type RegistryLicense = z.infer<typeof RegistryLicenseSchema>
export type RegistryQualityReceipt = z.infer<typeof RegistryQualityReceiptSchema>
export type RegistryPreviewAsset = z.infer<typeof RegistryPreviewAssetSchema>
export type RegistryItem = z.infer<typeof RegistryItemSchema>

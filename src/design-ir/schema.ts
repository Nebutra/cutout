/**
 * Canonical, framework-neutral Design IR v1 contract.
 *
 * This module intentionally owns only portable product/design data. Adapters for
 * Figma, source repositories, UI frameworks, and the workspace persistence layer
 * are consumers of this contract, never alternative sources of truth.
 */
import { z } from 'zod'
import { prototypePlanSchema } from '@/prototype/prototype-plan'

const idSchema = z.string().min(1).max(160)
const isoDateTimeSchema = z.iso.datetime({ offset: true })
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i, 'Expected a SHA-256 hex digest.')

export const designIrVersionSchema = z.literal('design-ir.v1')

export const designDocumentMetaSchema = z.object({
  id: idSchema,
  title: z.string().min(1).max(200),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
}).strict()

export const designDocumentRevisionSchema = z.object({
  id: idSchema,
  number: z.number().int().positive(),
  createdAt: isoDateTimeSchema,
  author: z.object({
    kind: z.enum(['human', 'agent', 'import']),
    id: idSchema,
  }).strict(),
  parentFingerprint: z.string().min(1).optional(),
}).strict()

export const needSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  statement: z.string().min(1),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  status: z.enum(['draft', 'accepted', 'satisfied', 'rejected']).default('draft'),
  acceptanceCriteria: z.array(z.string().min(1)).default([]),
}).strict()

export const sourceKindSchema = z.enum([
  'repository',
  'need',
  'story',
  'idea',
  'code',
  'url',
  'screenshot',
  'photo',
  'video',
  'figma',
  'document',
])

export const sourceRoleSchema = z.enum([
  'requirement',
  'reference',
  'constraint',
  'implementation',
  'brand-asset',
  'evidence',
])

export const sourceLicenseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('spdx'), identifier: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('proprietary'), holder: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('public-domain') }).strict(),
  z.object({ kind: z.literal('unknown'), rationale: z.string().min(1) }).strict(),
])

export const contentReferenceSchema = z.object({
  id: idSchema,
  /** A URL, repo-relative path, or content-addressed URI. */
  uri: z.string().min(1),
  mediaType: z.string().min(1).optional(),
  sha256: sha256Schema.optional(),
  /** Intrinsic raster size; avoids re-decoding or manufacturing 0x0 on restore. */
  pixelSize: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }).strict().optional(),
}).strict()

/**
 * Facts captured by a local, non-network ingestion adapter. This records where
 * the source descriptor came from without pretending that a URL, Figma file,
 * or repository has been fetched or semantically understood.
 */
export const sourceIngestionSchema = z.object({
  origin: z.enum(['local-file', 'inline-text', 'url-descriptor', 'repository-snapshot']),
  capturedAt: isoDateTimeSchema,
  prompt: z.string().min(1).max(20_000).optional(),
  /** A sanitized, relative display path. Absolute host paths are never stored. */
  relativePath: z.string().min(1).max(4_000).optional(),
  url: z.string().url().max(4_000).optional(),
  mediaType: z.string().min(1).max(255).optional(),
  bytes: z.number().int().nonnegative().optional(),
  descriptor: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('url'),
      url: z.string().url().max(4_000),
      title: z.string().min(1).max(200).optional(),
      capturedMediaType: z.string().min(1).max(255).optional(),
    }).strict(),
    z.object({
      kind: z.literal('repository'),
      label: z.string().min(1).max(200),
      includedPaths: z.array(z.string().min(1).max(4_000)).max(10_000),
      excludedCount: z.number().int().nonnegative(),
      /** Safe file metadata captured by a trusted local inventory adapter. */
      entries: z.array(z.object({
        path: z.string().min(1).max(4_000),
        bytes: z.number().int().nonnegative(),
        mediaType: z.string().min(1).max(255).optional(),
        sha256: sha256Schema.optional(),
      }).strict()).max(10_000).optional(),
    }).strict(),
  ]).optional(),
}).strict()

export const sourceSchema = z.object({
  id: idSchema,
  kind: sourceKindSchema,
  role: sourceRoleSchema,
  title: z.string().min(1),
  license: sourceLicenseSchema,
  content: z.array(contentReferenceSchema).min(1),
  ingestion: sourceIngestionSchema.optional(),
}).strict()

/** Persisted selection only; executable catalog metadata remains compiler-owned and versioned. */
export const brandViSelectionSchema = z.object({
  catalogVersion: z.literal('brand-vi-catalog.v1'),
  profile: z.enum(['minimum', 'core', 'full', 'custom']),
  selectedItemIds: z.array(idSchema).default([]),
  approvedItemIds: z.array(idSchema).default([]),
}).strict().superRefine((selection, context) => {
  if (selection.profile === 'custom' && selection.selectedItemIds.length === 0) {
    context.addIssue({ code: 'custom', message: 'A custom Brand VI selection requires at least one item.' })
  }
  const selected = new Set(selection.selectedItemIds)
  for (const approved of selection.approvedItemIds) {
    if (!selected.has(approved)) context.addIssue({ code: 'custom', message: `Approved Brand VI item "${approved}" is not selected.` })
  }
})

/** Typed brand declaration with an optional, reviewable VI generation selection. */
export const brandSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  status: z.enum(['placeholder', 'active', 'deprecated']).default('placeholder'),
  summary: z.string().min(1).optional(),
  provenanceId: idSchema.optional(),
  viSelection: brandViSelectionSchema.optional(),
}).strict()

export const designTokenSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  kind: z.enum(['color', 'spacing', 'typography', 'radius', 'shadow', 'motion', 'other']),
  value: z.string().min(1),
  mode: z.string().min(1).optional(),
  provenanceId: idSchema.optional(),
  /** Absent means "flat", the historical default — a specimen view groups only when present. */
  tier: z.enum(['primitive', 'semantic', 'alias']).optional(),
  /** Must reference another token id in the same document; validated, not enforced by the schema itself. */
  aliasOf: idSchema.optional(),
}).strict()

export const componentSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  status: z.enum(['placeholder', 'draft', 'ready', 'deprecated']).default('placeholder'),
  description: z.string().min(1).optional(),
  tokenIds: z.array(idSchema).default([]),
  provenanceId: idSchema.optional(),
}).strict()

export const materialKindSchema = z.enum([
  'design-system',
  'prototype-page',
  'cutout-slice',
  'design-markdown',
  'image',
  'video',
  'motion',
  'code',
  'other',
  /** A generated design-system.html specimen sheet — palette, type scale, source browser. */
  'design-specimen',
  /** A generated demo.html mockup rendering current tokens in a realistic screen. */
  'design-demo',
])

/**
 * Material revisions are append-only values. There is no mutable content field
 * on a material; a changed artifact is always a newly identified revision.
 */
export const materialRevisionSchema = z.object({
  id: idSchema,
  ordinal: z.number().int().positive(),
  createdAt: isoDateTimeSchema,
  content: contentReferenceSchema,
  provenanceId: idSchema.optional(),
}).strict()

export const materialSchema = z.object({
  id: idSchema,
  kind: materialKindSchema,
  name: z.string().min(1),
  revisions: z.array(materialRevisionSchema).min(1),
  currentRevisionId: idSchema,
}).strict()

export const provenanceSchema = z.object({
  id: idSchema,
  operation: z.enum(['import', 'derive', 'generate', 'edit', 'validate', 'manual']),
  sourceIds: z.array(idSchema).min(1),
  actor: z.object({
    kind: z.enum(['human', 'agent', 'system']),
    id: idSchema,
  }).strict(),
  recordedAt: isoDateTimeSchema,
  tool: z.string().min(1).optional(),
}).strict()

export const entityKindSchema = z.enum([
  'need',
  'source',
  'brand',
  'token',
  'component',
  'material',
  'prototype',
])

export const entityReferenceSchema = z.object({
  kind: entityKindSchema,
  id: idSchema,
}).strict()

const nonSourceEntityReferenceSchema = z.union([
  z.object({ kind: z.literal('need'), id: idSchema }).strict(),
  z.object({ kind: z.literal('brand'), id: idSchema }).strict(),
  z.object({ kind: z.literal('token'), id: idSchema }).strict(),
  z.object({ kind: z.literal('component'), id: idSchema }).strict(),
  z.object({ kind: z.literal('material'), id: idSchema }).strict(),
  z.object({ kind: z.literal('prototype'), id: idSchema }).strict(),
])

const relationBaseSchema = z.object({
  id: idSchema,
  provenanceId: idSchema.optional(),
}).strict()

/**
 * Relations deliberately encode endpoint kinds, so an adapter cannot claim a
 * component uses a source, for example. Endpoint existence remains validator
 * work because it crosses entity collections.
 */
export const relationSchema = z.discriminatedUnion('kind', [
  relationBaseSchema.extend({
    kind: z.literal('source-evidence'),
    from: z.object({ kind: z.literal('source'), id: idSchema }).strict(),
    to: nonSourceEntityReferenceSchema,
  }),
  relationBaseSchema.extend({
    kind: z.literal('material-derived-from'),
    from: z.object({ kind: z.literal('material'), id: idSchema }).strict(),
    to: z.union([
      z.object({ kind: z.literal('source'), id: idSchema }).strict(),
      z.object({ kind: z.literal('material'), id: idSchema }).strict(),
      z.object({ kind: z.literal('prototype'), id: idSchema }).strict(),
    ]),
  }),
  relationBaseSchema.extend({
    kind: z.literal('component-implements-need'),
    from: z.object({ kind: z.literal('component'), id: idSchema }).strict(),
    to: z.object({ kind: z.literal('need'), id: idSchema }).strict(),
  }),
  relationBaseSchema.extend({
    kind: z.literal('component-uses-token'),
    from: z.object({ kind: z.literal('component'), id: idSchema }).strict(),
    to: z.object({ kind: z.literal('token'), id: idSchema }).strict(),
  }),
  relationBaseSchema.extend({
    kind: z.literal('prototype-implements-need'),
    from: z.object({ kind: z.literal('prototype'), id: idSchema }).strict(),
    to: z.object({ kind: z.literal('need'), id: idSchema }).strict(),
  }),
  relationBaseSchema.extend({
    kind: z.literal('prototype-uses-component'),
    from: z.object({ kind: z.literal('prototype'), id: idSchema }).strict(),
    to: z.object({ kind: z.literal('component'), id: idSchema }).strict(),
  }),
  relationBaseSchema.extend({
    kind: z.literal('brand-defines-token'),
    from: z.object({ kind: z.literal('brand'), id: idSchema }).strict(),
    to: z.object({ kind: z.literal('token'), id: idSchema }).strict(),
  }),
])

/** Uses the existing PrototypePlan contract directly; no forked plan schema. */
export const prototypeSubtreeSchema = z.object({
  id: idSchema,
  plan: prototypePlanSchema,
  provenanceId: idSchema.optional(),
}).strict()

export const designDocumentSchema = z.object({
  version: designIrVersionSchema,
  meta: designDocumentMetaSchema,
  revision: designDocumentRevisionSchema,
  needs: z.array(needSchema).default([]),
  sources: z.array(sourceSchema).default([]),
  brands: z.array(brandSchema).default([]),
  tokens: z.array(designTokenSchema).default([]),
  components: z.array(componentSchema).default([]),
  prototype: prototypeSubtreeSchema.optional(),
  materials: z.array(materialSchema).default([]),
  provenance: z.array(provenanceSchema).default([]),
  relations: z.array(relationSchema).default([]),
}).strict()

export type DesignDocument = z.infer<typeof designDocumentSchema>
export type DesignDocumentMeta = z.infer<typeof designDocumentMetaSchema>
export type DesignDocumentRevision = z.infer<typeof designDocumentRevisionSchema>
export type DesignNeed = z.infer<typeof needSchema>
export type DesignSource = z.infer<typeof sourceSchema>
export type SourceKind = z.infer<typeof sourceKindSchema>
export type SourceRole = z.infer<typeof sourceRoleSchema>
export type SourceLicense = z.infer<typeof sourceLicenseSchema>
export type ContentReference = z.infer<typeof contentReferenceSchema>
export type SourceIngestion = z.infer<typeof sourceIngestionSchema>
export type Brand = z.infer<typeof brandSchema>
export type BrandViSelection = z.infer<typeof brandViSelectionSchema>
export type DesignToken = z.infer<typeof designTokenSchema>
export type DesignComponent = z.infer<typeof componentSchema>
export type Material = z.infer<typeof materialSchema>
export type MaterialRevision = z.infer<typeof materialRevisionSchema>
export type Provenance = z.infer<typeof provenanceSchema>
export type DesignRelation = z.infer<typeof relationSchema>
export type PrototypeSubtree = z.infer<typeof prototypeSubtreeSchema>

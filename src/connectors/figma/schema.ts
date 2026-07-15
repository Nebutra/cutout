import { z } from 'zod'
import { componentSchema, designTokenSchema } from '@/design-ir'

const figmaId = z.string().min(1).max(50)
const fileKey = z.string().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/)

export const figmaColorSchema = z.object({
  r: z.number().min(0).max(1),
  g: z.number().min(0).max(1),
  b: z.number().min(0).max(1),
  a: z.number().min(0).max(1),
}).strict()

export const figmaAliasSchema = z.object({
  type: z.literal('VARIABLE_ALIAS'),
  id: figmaId,
}).strict()

export const figmaVariableValueSchema = z.union([
  z.string().max(20_000),
  z.number().finite(),
  z.boolean(),
  figmaColorSchema,
  figmaAliasSchema,
])

export const figmaCollectionSchema = z.object({
  id: figmaId,
  name: z.string().min(1).max(240),
  defaultModeId: figmaId,
  modes: z.array(z.object({ id: figmaId, name: z.string().min(1).max(240) }).strict()).min(1).max(100),
}).strict()

export const figmaVariableSchema = z.object({
  id: figmaId,
  name: z.string().min(1).max(240),
  collectionId: figmaId,
  resolvedType: z.enum(['COLOR', 'FLOAT', 'STRING', 'BOOLEAN']),
  description: z.string().max(20_000).optional(),
  scopes: z.array(z.string().min(1).max(100)).max(100).optional(),
  valuesByMode: z.record(figmaId, figmaVariableValueSchema),
}).strict()

export const figmaComponentSetSchema = z.object({
  id: figmaId,
  key: z.string().min(1).max(160).optional(),
  name: z.string().min(1).max(240),
  componentIds: z.array(figmaId).max(10_000),
}).strict()

export const figmaComponentSchema = z.object({
  id: figmaId,
  key: z.string().min(1).max(160).optional(),
  name: z.string().min(1).max(240),
  componentSetId: figmaId.optional(),
  description: z.string().max(20_000).optional(),
  variableIds: z.array(figmaId).max(10_000).optional(),
}).strict()

export const figmaNodeRefSchema = z.object({
  id: figmaId,
  name: z.string().min(1).max(240),
  type: z.enum(['COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'FRAME', 'SECTION']),
  componentId: figmaId.optional(),
  componentSetId: figmaId.optional(),
}).strict()

export const figmaCodeConnectHintSchema = z.object({
  componentId: figmaId,
  source: z.string().min(1).max(4_000),
  framework: z.string().min(1).max(100).optional(),
  exportName: z.string().min(1).max(240).optional(),
}).strict()

export const figmaSnapshotSchema = z.object({
  schemaVersion: z.literal('figma.snapshot.v1'),
  file: z.object({
    key: fileKey,
    name: z.string().min(1).max(240),
    version: z.string().min(1).max(160).optional(),
    lastModified: z.iso.datetime({ offset: true }).optional(),
  }).strict(),
  collections: z.array(figmaCollectionSchema).max(10_000),
  variables: z.array(figmaVariableSchema).max(100_000),
  components: z.array(figmaComponentSchema).max(100_000),
  componentSets: z.array(figmaComponentSetSchema).max(100_000),
  nodeRefs: z.array(figmaNodeRefSchema).max(100_000),
  codeConnectHints: z.array(figmaCodeConnectHintSchema).max(100_000),
}).strict()

export const figmaVariableBindingSchema = z.object({
  tokenId: z.string().min(1).max(160),
  variableId: figmaId,
  collectionId: figmaId,
  modeId: figmaId,
  resolvedType: z.enum(['COLOR', 'FLOAT', 'STRING', 'BOOLEAN']),
  importedValue: z.string(),
  originalValue: figmaVariableValueSchema,
}).strict()

export const figmaComponentBindingSchema = z.object({
  componentId: figmaId,
  irComponentId: z.string().min(1).max(160),
  componentSetId: figmaId.optional(),
}).strict()

export const figmaBindingManifestSchema = z.object({
  schemaVersion: z.literal('figma.bindings.v1'),
  fileKey,
  sourceId: z.string().min(1).max(160),
  collections: z.array(figmaCollectionSchema),
  variables: z.array(figmaVariableSchema),
  variableBindings: z.array(figmaVariableBindingSchema),
  componentBindings: z.array(figmaComponentBindingSchema),
  componentSets: z.array(figmaComponentSetSchema),
  components: z.array(figmaComponentSchema),
  nodeRefs: z.array(figmaNodeRefSchema),
  codeConnectHints: z.array(figmaCodeConnectHintSchema),
}).strict()

export const figmaExportRequestSchema = z.object({
  document: z.object({
    documentId: z.string().min(1).max(160),
    revisionId: z.string().min(1).max(160),
    revisionNumber: z.number().int().positive(),
  }).strict(),
  tokens: z.array(designTokenSchema),
  components: z.array(componentSchema),
  verifiedTokenIds: z.array(z.string().min(1).max(160)),
  bindings: figmaBindingManifestSchema,
}).strict()

export type FigmaSnapshot = z.infer<typeof figmaSnapshotSchema>
export type FigmaVariableValue = z.infer<typeof figmaVariableValueSchema>
export type FigmaBindingManifest = z.infer<typeof figmaBindingManifestSchema>
export type FigmaExportRequest = z.infer<typeof figmaExportRequestSchema>

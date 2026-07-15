import { z } from 'zod'
import { designDocumentSchema } from '@/design-ir'
import { agentRunEventStoreSchema } from '@/agent-runtime/run-events'
import { controlLedgerSchema } from './storage'

export const HEADLESS_MANIFEST_VERSION = 'cutout.manifest.v1' as const
export const ARTIFACT_INDEX_VERSION = 'cutout.artifacts.v1' as const
export const HEADLESS_POLICY_VERSION = 'cutout.policy.v1' as const

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i, 'Expected a SHA-256 hex digest.')
const controlledFileNameSchema = z.string()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'Expected a safe .cutout file name.')
  .refine((fileName) => !fileName.includes('..'), 'Expected a safe .cutout file name.')

export const runtimeFilesSchema = z.object({
  designIr: controlledFileNameSchema,
  designMarkdown: controlledFileNameSchema,
  artifactIndex: controlledFileNameSchema,
  policy: controlledFileNameSchema,
  controlLedger: controlledFileNameSchema,
}).strict()

export const headlessManifestSchema = z.object({
  version: z.literal(HEADLESS_MANIFEST_VERSION),
  project: z.object({
    id: z.string().min(1).max(160),
    name: z.string().min(1).max(200),
  }).strict(),
  files: runtimeFilesSchema,
}).strict()

export const artifactRecordSchema = z.object({
  sha256: sha256Schema,
  mediaType: z.string().min(1).max(200),
  byteLength: z.number().int().nonnegative(),
}).strict()

/**
 * Index only: binary objects deliberately live outside the JSON graph. Their
 * address is the digest, never a caller-supplied filesystem path.
 */
export const artifactIndexSchema = z.object({
  version: z.literal(ARTIFACT_INDEX_VERSION),
  artifacts: z.array(artifactRecordSchema).max(100_000),
}).strict().superRefine((index, context) => {
  const seen = new Set<string>()
  for (const [position, artifact] of index.artifacts.entries()) {
    if (seen.has(artifact.sha256)) {
      context.addIssue({ code: 'custom', path: ['artifacts', position, 'sha256'], message: `Duplicate artifact digest: ${artifact.sha256}` })
    }
    seen.add(artifact.sha256)
  }
})

const headlessOperationSchema = z.enum([
  'project.context',
  'material.list',
  'validate',
  'governance.preview',
  'governance.validate',
  'governance.report',
  'design.patch',
  'tokens.patch',
  'source.ingest',
  'run.start',
  'run.get',
  'run.cancel',
  'run.events',
  'export.design-kit',
  'export.brand-kit',
  'export.starter',
  'coding.execute',
  'coding.review',
  'coding.repair',
  'tool.invoke',
])

/**
 * The host owns every mutable permission. Export has no caller-controlled
 * destination: when enabled it can only write below `.cutout/exports`.
 */
export const headlessPolicySchema = z.object({
  version: z.literal(HEADLESS_POLICY_VERSION),
  allowApply: z.boolean(),
  allowedOperations: z.array(headlessOperationSchema).min(1).max(21),
  requireApprovalForExternal: z.boolean().optional().default(true),
}).strict().superRefine((policy, context) => {
  if (new Set(policy.allowedOperations).size !== policy.allowedOperations.length) {
    context.addIssue({ code: 'custom', path: ['allowedOperations'], message: 'Duplicate allowed operation.' })
  }
})

export const headlessProjectStateSchema = z.object({
  manifest: headlessManifestSchema,
  design: designDocumentSchema,
  designMarkdown: z.string().max(500_000),
  artifactIndex: artifactIndexSchema,
  policy: headlessPolicySchema,
  ledger: controlLedgerSchema.optional(),
  runEvents: agentRunEventStoreSchema.optional(),
}).strict().superRefine((state, context) => {
  if (state.manifest.project.id !== state.design.meta.id) {
    context.addIssue({ code: 'custom', path: ['manifest', 'project', 'id'], message: 'Manifest and Design IR project ids must match.' })
  }
})

export type HeadlessManifest = z.infer<typeof headlessManifestSchema>
export type ArtifactIndex = z.infer<typeof artifactIndexSchema>
export type ArtifactRecord = z.infer<typeof artifactRecordSchema>
export type HeadlessPolicy = z.infer<typeof headlessPolicySchema>
export type HeadlessProjectState = z.infer<typeof headlessProjectStateSchema>

import { z } from 'zod'
import { recordIdSchema, schemaReferenceSchema, sha256Schema } from '@/design-os-kernel/contracts'

export const GAME_ASSET_PROFILE_ID = 'profile:game-asset-production' as const
export const GAME_ASSET_PROFILE_VERSION = '1.0.0' as const

export const gameAssetKindSchema = z.enum([
  'player', 'npc', 'creature', 'prop', 'fx', 'projectile', 'impact', 'layered-map',
])
export const gameAssetViewSchema = z.enum(['topdown', 'side', 'three-quarter'])
export const gameAssetAnchorSchema = z.enum(['center', 'bottom', 'feet', 'ignition-baseline'])
export const gameAssetActionSchema = z.enum([
  'single', 'idle', 'walk', 'run', 'attack', 'cast', 'shoot', 'jump', 'hurt',
  'death', 'hover', 'charge', 'projectile', 'impact', 'explode',
])
export const gameAssetDirectionSchema = z.enum(['none', 'down', 'left', 'right', 'up'])

export const gameAssetEvidenceReferenceSchema = z.object({
  id: recordIdSchema,
  revision: recordIdSchema,
  contentHash: sha256Schema,
}).strict()
export type GameAssetEvidenceReference = z.infer<typeof gameAssetEvidenceReferenceSchema>

export const gameAssetRoleSchema = z.object({
  id: recordIdSchema,
  assetId: recordIdSchema,
  action: gameAssetActionSchema,
  direction: gameAssetDirectionSchema,
  frameIndex: z.number().int().nonnegative().max(10_000),
  outputSchema: schemaReferenceSchema,
  identityLock: gameAssetEvidenceReferenceSchema,
  scaleLock: gameAssetEvidenceReferenceSchema,
  expectedAlphaSize: z.object({
    width: z.number().int().positive().max(16_384),
    height: z.number().int().positive().max(16_384),
  }).strict(),
  anchorLock: gameAssetEvidenceReferenceSchema,
  anchor: gameAssetAnchorSchema,
  expectedAnchor: z.object({ x: z.number().finite(), y: z.number().finite() }).strict(),
}).strict()
export type GameAssetRole = z.infer<typeof gameAssetRoleSchema>

export const gameAssetPlanSchema = z.object({
  version: z.literal('game-asset.plan.v1'),
  id: recordIdSchema,
  assetId: recordIdSchema,
  kind: gameAssetKindSchema,
  view: gameAssetViewSchema,
  artDirectionEvidence: z.array(gameAssetEvidenceReferenceSchema).min(1).max(1_000),
  referenceArtifacts: z.array(gameAssetEvidenceReferenceSchema).min(1).max(100),
  roles: z.array(gameAssetRoleSchema).min(1).max(20_000),
  delivery: z.object({
    formatId: recordIdSchema,
    frameWidth: z.number().int().positive().max(16_384),
    frameHeight: z.number().int().positive().max(16_384),
    columns: z.number().int().positive().max(1_000),
    rows: z.number().int().positive().max(1_000),
  }).strict(),
}).strict().superRefine((plan, context) => {
  if (new Set(plan.artDirectionEvidence.map(({ id }) => id)).size !== plan.artDirectionEvidence.length) {
    context.addIssue({ code: 'custom', message: 'Art direction evidence references must be unique.' })
  }
  if (new Set(plan.referenceArtifacts.map(({ id }) => id)).size !== plan.referenceArtifacts.length) {
    context.addIssue({ code: 'custom', message: 'Reference artifact references must be unique.' })
  }
  if (new Set(plan.roles.map(({ id }) => id)).size !== plan.roles.length) {
    context.addIssue({ code: 'custom', message: 'Game Asset role ids must be unique.' })
  }
  if (plan.roles.some(({ assetId }) => assetId !== plan.assetId)) {
    context.addIssue({ code: 'custom', message: 'Game Asset roles must belong to the planned asset identity.' })
  }
  const semanticCells = plan.roles.map(({ action, direction, frameIndex }) => `${action}:${direction}:${frameIndex}`)
  if (new Set(semanticCells).size !== semanticCells.length) {
    context.addIssue({ code: 'custom', message: 'Game Asset action, direction, and frame tuples must be unique.' })
  }
  const cells = plan.delivery.columns * plan.delivery.rows
  if (cells < plan.roles.length) context.addIssue({ code: 'custom', message: 'Delivery atlas cannot hold every declared role.' })
})
export type GameAssetPlan = z.infer<typeof gameAssetPlanSchema>

export const observedGameAssetFrameSchema = z.object({
  roleId: recordIdSchema,
  artifactId: recordIdSchema,
  artifactRevision: recordIdSchema,
  contentHash: sha256Schema,
  decodedWidth: z.number().int().positive().max(16_384),
  decodedHeight: z.number().int().positive().max(16_384),
  alphaBounds: z.object({
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }).strict(),
  edgeContact: z.boolean(),
  anchor: z.object({ x: z.number().finite(), y: z.number().finite() }).strict(),
  identityLock: gameAssetEvidenceReferenceSchema,
  scaleLock: gameAssetEvidenceReferenceSchema,
  anchorLock: gameAssetEvidenceReferenceSchema,
  sourceArtifacts: z.array(gameAssetEvidenceReferenceSchema).min(1).max(100),
}).strict().superRefine((frame, context) => {
  if (new Set(frame.sourceArtifacts.map(({ id }) => id)).size !== frame.sourceArtifacts.length) {
    context.addIssue({ code: 'custom', message: 'Observed Game Asset source artifact references must be unique.' })
  }
  if (frame.alphaBounds.x + frame.alphaBounds.width > frame.decodedWidth
    || frame.alphaBounds.y + frame.alphaBounds.height > frame.decodedHeight) {
    context.addIssue({ code: 'custom', message: 'Observed Game Asset alpha bounds exceed decoded dimensions.' })
  }
  if (frame.anchor.x < 0 || frame.anchor.x > frame.decodedWidth
    || frame.anchor.y < 0 || frame.anchor.y > frame.decodedHeight) {
    context.addIssue({ code: 'custom', message: 'Observed Game Asset anchor lies outside decoded dimensions.' })
  }
})
export type ObservedGameAssetFrame = z.infer<typeof observedGameAssetFrameSchema>

export const gameAssetEvaluationInputSchema = z.object({
  plan: gameAssetPlanSchema,
  frames: z.array(observedGameAssetFrameSchema).max(20_000),
}).strict()
export type GameAssetEvaluationInput = z.infer<typeof gameAssetEvaluationInputSchema>

export const acceptedGameAssetArtifactSchema = z.object({
  roleId: recordIdSchema,
  artifactId: recordIdSchema,
  artifactRevision: recordIdSchema,
  contentHash: sha256Schema,
}).strict()

export const gameAssetEvaluationSchema = z.object({
  version: z.literal('game-asset.evaluation.v1'),
  profileId: z.literal(GAME_ASSET_PROFILE_ID),
  planId: recordIdSchema,
  status: z.enum(['passed', 'needs-repair', 'blocked']),
  acceptedArtifacts: z.array(acceptedGameAssetArtifactSchema).max(20_000),
  failedRoleIds: z.array(recordIdSchema).max(20_000),
  findings: z.array(z.object({
    code: z.enum([
      'missing-role', 'duplicate-role', 'dimension-mismatch', 'edge-contact',
      'identity-lock-mismatch', 'scale-lock-mismatch', 'anchor-lock-mismatch',
      'scale-geometry-mismatch', 'anchor-position-mismatch', 'reference-lineage-mismatch',
      'unknown-role', 'reused-artifact',
    ]),
    roleId: recordIdSchema,
    message: z.string().min(1).max(2_000),
  }).strict()).max(100_000),
}).strict()
export type GameAssetEvaluation = z.infer<typeof gameAssetEvaluationSchema>

export const gameAssetMaturityEvidenceSchema = z.object({
  version: z.literal('game-asset.maturity-evidence.v1'),
  profileId: z.literal(GAME_ASSET_PROFILE_ID),
  reportId: recordIdSchema,
}).strict()
export type GameAssetMaturityEvidence = z.infer<typeof gameAssetMaturityEvidenceSchema>

export const gameMapLayerSchema = z.enum(['base', 'props', 'actors', 'foreground', 'collision', 'zones', 'preview'])
export const layeredGameMapManifestSchema = z.object({
  version: z.literal('game-asset.layered-map.v1'),
  id: recordIdSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  layers: z.array(z.object({
    kind: gameMapLayerSchema,
    artifactId: recordIdSchema,
    authoritative: z.boolean(),
  }).strict()).min(1).max(1_000),
}).strict().superRefine((map, context) => {
  if (new Set(map.layers.map(({ kind }) => kind)).size !== map.layers.length) {
    context.addIssue({ code: 'custom', message: 'Layered map kinds must be unique.' })
  }
  const byKind = new Map(map.layers.map((layer) => [layer.kind, layer]))
  for (const required of ['base', 'collision', 'zones', 'preview'] as const) {
    if (!byKind.has(required)) context.addIssue({ code: 'custom', message: `Layered map is missing ${required}.` })
  }
  if (byKind.get('preview')?.authoritative) {
    context.addIssue({ code: 'custom', message: 'Flattened map preview cannot be authoritative.' })
  }
})

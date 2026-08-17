import { invoke } from '@tauri-apps/api/core'
import { z } from 'zod'
import { sha256Bytes } from '@/asset-production/hash'
import { canonicalJson } from '@/design-ir/fingerprint'
import { base64ToBytes } from '@/lib/image'
import { recordIdSchema, sha256Schema } from '@/design-os-kernel/contracts'
import {
  gameAssetAnchorPointSchema,
  gameAssetAnchorSchema,
  gameAssetEvidenceReferenceSchema,
} from './contracts'
import {
  ADAPTIVE_BOARD_GAME_ASSET_RASTER_PROCESSOR,
  CHROMA_ML_GAME_ASSET_RASTER_PROCESSOR,
  GAME_ASSET_GROUNDED_NORMALIZATION_PROCESSOR,
  GAME_ASSET_GROUNDED_NORMALIZATION_SCALE_POLICY,
  GAME_ASSET_RASTER_PROCESSOR,
  GAME_ASSET_RASTER_SCALE_POLICY,
  LEGACY_GAME_ASSET_RASTER_PROCESSOR,
  V5_GAME_ASSET_RASTER_PROCESSOR,
  V6_GAME_ASSET_RASTER_PROCESSOR,
  WHITE_BOARD_GAME_ASSET_RASTER_PROCESSOR,
  gameAssetGenerationAuthorizationSchema,
  retainedGameAssetRoleOutputSchema,
} from './generation'
import {
  GAME_ASSET_FAMILY_ACCEPTANCE_PROTOCOL,
  GAME_ASSET_FAMILY_ATLAS_COMPILER,
  GAME_ASSET_FAMILY_BUNDLE_PROTOCOL,
  GAME_ASSET_SCALE_PROFILE_PROTOCOL,
  gameAssetActionSheetAuthorizationSchema,
  gameAssetActionSheetPartialAuthorizationSchema,
  gameAssetActionSheetPartialReprocessAuthorizationSchema,
  gameAssetActionSheetPartialRepairAuthorizationSchema,
  gameAssetActionSheetPartialSchema,
  gameAssetActionSheetRepairAuthorizationSchema,
  gameAssetActionClipSchema,
  gameAssetActionSourceSchema,
  gameAssetFamilyPlanSchema,
} from './family'

export const GAME_ASSET_FAMILY_ACCEPTANCE_PREVIEW_PROTOCOL = 'cutout.game-asset-family-acceptance-preview.v1' as const
export const GAME_ASSET_FAMILY_VERIFIER = 'cutout-game-asset-family-native-replay-rust-image-0.23-v1' as const
export const GAME_ASSET_FAMILY_TIMING_POLICY = 'game-asset-family-observed-timing.v1' as const

const artifactIdSchema = z.string().regex(/^artifact:sha256:[a-f0-9]{64}$/)
const retainedBase64Schema = z.string().min(4).max(512 * 1024 * 1024)
const pixelSizeSchema = z.object({
  width: z.number().int().positive().max(16_384),
  height: z.number().int().positive().max(16_384),
}).strict()

const normalizedProcessorSchema = z.enum([
  LEGACY_GAME_ASSET_RASTER_PROCESSOR,
  WHITE_BOARD_GAME_ASSET_RASTER_PROCESSOR,
  ADAPTIVE_BOARD_GAME_ASSET_RASTER_PROCESSOR,
  CHROMA_ML_GAME_ASSET_RASTER_PROCESSOR,
  V5_GAME_ASSET_RASTER_PROCESSOR,
  V6_GAME_ASSET_RASTER_PROCESSOR,
  GAME_ASSET_RASTER_PROCESSOR,
  GAME_ASSET_GROUNDED_NORMALIZATION_PROCESSOR,
])

const retainedRepairOutputSchema = retainedGameAssetRoleOutputSchema

export const gameAssetFamilyOriginalRetainedEvidenceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('coherent-sheet'),
    evidence: z.object({
      authorization: gameAssetActionSheetAuthorizationSchema,
      source: gameAssetActionSourceSchema,
      clip: gameAssetActionClipSchema,
    }).strict(),
  }).strict(),
  z.object({
    kind: z.literal('complete-sheet-repair'),
    evidence: z.object({
      parentAuthorization: gameAssetActionSheetAuthorizationSchema,
      parentSource: gameAssetActionSourceSchema,
      parentClip: gameAssetActionClipSchema,
      repairAuthorization: gameAssetActionSheetRepairAuthorizationSchema,
      outputs: z.array(retainedRepairOutputSchema).min(1).max(15),
    }).strict(),
  }).strict(),
  z.object({
    kind: z.literal('partial-sheet-repair'),
    evidence: z.object({
      parentAuthorization: gameAssetActionSheetPartialAuthorizationSchema,
      parentSource: gameAssetActionSourceSchema,
      parentPartial: gameAssetActionSheetPartialSchema,
      repairAuthorization: gameAssetActionSheetPartialRepairAuthorizationSchema,
      outputs: z.array(retainedRepairOutputSchema).min(1).max(15),
    }).strict(),
  }).strict(),
  z.object({
    kind: z.literal('role-isolated-atomic-generation'),
    evidence: z.object({
      authorization: gameAssetGenerationAuthorizationSchema,
      outputs: z.array(retainedGameAssetRoleOutputSchema).min(1).max(16),
    }).strict(),
  }).strict(),
])
export type GameAssetFamilyOriginalRetainedEvidence = z.infer<typeof gameAssetFamilyOriginalRetainedEvidenceSchema>

export const GAME_ASSET_GROUNDED_NORMALIZATION_PREVIEW_PROTOCOL = 'cutout.game-asset-grounded-normalization-preview.v1' as const
export const GAME_ASSET_GROUNDED_NORMALIZATION_AUTHORIZATION_PROTOCOL = 'cutout.game-asset-grounded-normalization-authorization.v1' as const

const groundedNormalizationFrameLineageSchema = z.object({
  parentRoleId: recordIdSchema,
  successorRoleId: recordIdSchema,
  sourceArtifactId: artifactIdSchema,
  sourceArtifactSha256: sha256Schema,
  outputArtifactId: artifactIdSchema,
  outputArtifactSha256: sha256Schema,
}).strict().superRefine((frame, context) => {
  if (frame.sourceArtifactId !== `artifact:sha256:${frame.sourceArtifactSha256}`
    || frame.outputArtifactId !== `artifact:sha256:${frame.outputArtifactSha256}`) {
    context.addIssue({ code: 'custom', message: 'Grounded normalization frame identities must equal their exact byte digests.' })
  }
})

export const gameAssetGroundedNormalizationPreviewInputSchema = z.object({
  parentFamilyPlan: gameAssetFamilyPlanSchema,
  successorFamilyPlan: gameAssetFamilyPlanSchema,
  parentEvidence: gameAssetFamilyOriginalRetainedEvidenceSchema,
}).strict()
export type GameAssetGroundedNormalizationPreviewInput = z.infer<typeof gameAssetGroundedNormalizationPreviewInputSchema>

export const gameAssetGroundedNormalizationPreviewSchema = z.object({
  protocol: z.literal(GAME_ASSET_GROUNDED_NORMALIZATION_PREVIEW_PROTOCOL),
  planId: z.string().regex(/^game-asset-grounded-normalization-preview:sha256:[a-f0-9]{64}$/),
  requestDigest: sha256Schema,
  parentFamilyPlanId: recordIdSchema,
  parentFamilyPlanHash: sha256Schema,
  successorFamilyPlanId: recordIdSchema,
  successorFamilyPlanHash: sha256Schema,
  parentGroupId: recordIdSchema,
  successorGroupId: recordIdSchema,
  parentClipId: recordIdSchema,
  successorClipId: recordIdSchema,
  roleIds: z.array(recordIdSchema).min(1).max(16),
  sourceArtifactIds: z.array(artifactIdSchema).min(1).max(16),
  outputArtifactIds: z.array(artifactIdSchema).min(1).max(16),
  processorImplementation: z.literal(GAME_ASSET_GROUNDED_NORMALIZATION_PROCESSOR),
  scalePolicy: z.literal(GAME_ASSET_GROUNDED_NORMALIZATION_SCALE_POLICY),
  executionMode: z.literal('deterministic-local-derivation'),
  providerCalls: z.literal(0),
  expiresAt: z.number().int().positive(),
}).strict().superRefine((preview, context) => {
  if (preview.planId !== `game-asset-grounded-normalization-preview:sha256:${preview.requestDigest}`
    || preview.roleIds.length !== preview.sourceArtifactIds.length
    || preview.roleIds.length !== preview.outputArtifactIds.length
    || new Set(preview.roleIds).size !== preview.roleIds.length) {
    context.addIssue({ code: 'custom', message: 'Grounded normalization preview closure is inconsistent.' })
  }
})
export type GameAssetGroundedNormalizationPreview = z.infer<typeof gameAssetGroundedNormalizationPreviewSchema>

export const gameAssetGroundedNormalizationAuthorizationSchema = z.object({
  protocol: z.literal(GAME_ASSET_GROUNDED_NORMALIZATION_AUTHORIZATION_PROTOCOL),
  receiptId: recordIdSchema,
  receiptHash: sha256Schema,
  previewId: z.string().regex(/^game-asset-grounded-normalization-preview:sha256:[a-f0-9]{64}$/),
  requestDigest: sha256Schema,
  parentFamilyPlanId: recordIdSchema,
  parentFamilyPlanHash: sha256Schema,
  successorFamilyPlanId: recordIdSchema,
  successorFamilyPlanHash: sha256Schema,
  parentGroupId: recordIdSchema,
  successorGroupId: recordIdSchema,
  parentAtomicPlanId: recordIdSchema,
  parentAtomicPlanHash: sha256Schema,
  successorAtomicPlanId: recordIdSchema,
  successorAtomicPlanHash: sha256Schema,
  parentAuthorityReceiptId: recordIdSchema,
  parentAuthorityReceiptHash: sha256Schema,
  parentClipId: recordIdSchema,
  parentClipHash: sha256Schema,
  successorClipId: recordIdSchema,
  successorClipHash: sha256Schema,
  processorImplementation: z.literal(GAME_ASSET_GROUNDED_NORMALIZATION_PROCESSOR),
  scalePolicy: z.literal(GAME_ASSET_GROUNDED_NORMALIZATION_SCALE_POLICY),
  frameLineage: z.array(groundedNormalizationFrameLineageSchema).min(1).max(16),
  executionMode: z.literal('deterministic-local-derivation'),
  providerCalls: z.literal(0),
  startedAt: z.number().int().nonnegative(),
  completedAt: z.number().int().nonnegative(),
  signature: sha256Schema,
}).strict().superRefine((authorization, context) => {
  if (authorization.previewId !== `game-asset-grounded-normalization-preview:sha256:${authorization.requestDigest}`
    || authorization.completedAt < authorization.startedAt
    || new Set(authorization.frameLineage.map(({ successorRoleId }) => successorRoleId)).size !== authorization.frameLineage.length) {
    context.addIssue({ code: 'custom', message: 'Grounded normalization authorization closure is inconsistent.' })
  }
})
export type GameAssetGroundedNormalizationAuthorization = z.infer<typeof gameAssetGroundedNormalizationAuthorizationSchema>

export const appliedGameAssetGroundedNormalizationSchema = z.object({
  authorization: gameAssetGroundedNormalizationAuthorizationSchema,
  clip: gameAssetActionClipSchema,
}).strict().superRefine((applied, context) => {
  if (applied.clip.id !== applied.authorization.successorClipId
    || applied.clip.familyPlanId !== applied.authorization.successorFamilyPlanId
    || applied.clip.groupId !== applied.authorization.successorGroupId
    || applied.clip.atomicPlanId !== applied.authorization.successorAtomicPlanId
    || applied.clip.atomicPlanHash !== applied.authorization.successorAtomicPlanHash) {
    context.addIssue({ code: 'custom', message: 'Applied grounded normalization clip drifted from its signed successor authority.' })
  }
})
export type AppliedGameAssetGroundedNormalization = z.infer<typeof appliedGameAssetGroundedNormalizationSchema>

const groundedNormalizationMigrationEvidenceSchema = z.object({
  kind: z.literal('grounded-normalization-migration'),
  evidence: z.object({
    parentFamilyPlan: gameAssetFamilyPlanSchema,
    parentEvidence: gameAssetFamilyOriginalRetainedEvidenceSchema,
    authorization: gameAssetGroundedNormalizationAuthorizationSchema,
    clip: gameAssetActionClipSchema,
  }).strict(),
}).strict()

const localPartialReprocessEvidenceSchema = z.object({
  kind: z.literal('local-partial-reprocess'),
  evidence: z.object({
    parentAuthorization: gameAssetActionSheetPartialAuthorizationSchema,
    parentSource: gameAssetActionSourceSchema,
    parentPartial: gameAssetActionSheetPartialSchema,
    reprocessAuthorization: gameAssetActionSheetPartialReprocessAuthorizationSchema,
    clip: gameAssetActionClipSchema,
  }).strict(),
}).strict()

export const gameAssetFamilyRetainedEvidenceSchema = z.union([
  gameAssetFamilyOriginalRetainedEvidenceSchema,
  groundedNormalizationMigrationEvidenceSchema,
  localPartialReprocessEvidenceSchema,
])
export type GameAssetFamilyRetainedEvidence = z.infer<typeof gameAssetFamilyRetainedEvidenceSchema>

export const gameAssetFamilySemanticDecisionSchema = z.object({
  groupId: recordIdSchema,
  roleId: recordIdSchema,
  referenceContinuity: z.literal('accepted'),
  roleReadability: z.literal('accepted'),
  styleConsistency: z.literal('accepted'),
}).strict()
export type GameAssetFamilySemanticDecision = z.infer<typeof gameAssetFamilySemanticDecisionSchema>

export const gameAssetNormalizationContractSchema = z.object({
  processorImplementation: normalizedProcessorSchema,
  frameSize: pixelSizeSchema,
  alphaTarget: pixelSizeSchema,
  expectedAnchor: gameAssetAnchorPointSchema,
  anchorPolicy: gameAssetAnchorSchema,
  identityLock: gameAssetEvidenceReferenceSchema,
  scaleLock: gameAssetEvidenceReferenceSchema,
  scalePolicy: z.enum([
    GAME_ASSET_RASTER_SCALE_POLICY,
    GAME_ASSET_GROUNDED_NORMALIZATION_SCALE_POLICY,
  ]),
}).strict().superRefine((contract, context) => {
  const groundedMigration = contract.processorImplementation === GAME_ASSET_GROUNDED_NORMALIZATION_PROCESSOR
  if (groundedMigration !== (contract.scalePolicy === GAME_ASSET_GROUNDED_NORMALIZATION_SCALE_POLICY)) {
    context.addIssue({ code: 'custom', message: 'Game Asset normalization processor and scale policy must identify one exact algorithm.' })
  }
})
export type GameAssetNormalizationContract = z.infer<typeof gameAssetNormalizationContractSchema>

const adoptedScaleProfileSchema = z.object({
  profileId: z.string().regex(/^scale-profile:[a-f0-9]{64}$/),
  profileHash: sha256Schema,
}).strict()

export const nativeGameAssetScaleProfileSchema = z.object({
  version: z.literal(GAME_ASSET_SCALE_PROFILE_PROTOCOL),
  id: z.string().regex(/^scale-profile:[a-f0-9]{64}$/),
  familyPlanId: recordIdSchema,
  masterClipId: recordIdSchema,
  masterClipHash: sha256Schema,
  compatibleClasses: z.tuple([z.literal('grounded-body')]),
  canvas: pixelSizeSchema,
  measuredAlphaSize: pixelSizeSchema,
  anchorPolicy: gameAssetAnchorSchema,
  measuredAnchor: gameAssetAnchorPointSchema,
  identityLock: gameAssetEvidenceReferenceSchema,
  measurementImplementation: z.literal('rgba-alpha-bounds-v1'),
  normalizationContract: gameAssetNormalizationContractSchema,
  adoptedFrom: adoptedScaleProfileSchema.optional(),
}).strict().superRefine((profile, context) => {
  if (profile.canvas.width !== profile.normalizationContract.frameSize.width
    || profile.canvas.height !== profile.normalizationContract.frameSize.height
    || profile.anchorPolicy !== profile.normalizationContract.anchorPolicy
    || canonicalJson(profile.identityLock) !== canonicalJson(profile.normalizationContract.identityLock)
    || profile.measuredAlphaSize.width > profile.canvas.width
    || profile.measuredAlphaSize.height > profile.canvas.height) {
    context.addIssue({ code: 'custom', message: 'Native Game Asset scale profile mirrors an inconsistent normalization contract.' })
  }
})
export type NativeGameAssetScaleProfile = z.infer<typeof nativeGameAssetScaleProfileSchema>

export const gameAssetFamilyProductionInputSchema = z.object({
  familyPlan: gameAssetFamilyPlanSchema,
  retainedEvidence: z.array(gameAssetFamilyRetainedEvidenceSchema).min(1).max(32),
  decisions: z.array(gameAssetFamilySemanticDecisionSchema).min(1).max(512),
  historicalScaleProfile: nativeGameAssetScaleProfileSchema.optional(),
}).strict().superRefine((input, context) => {
  const groupsById = new Map(input.familyPlan.groups.map((group) => [group.id, group]))
  const groupsByPlanId = new Map(input.familyPlan.groups.map((group) => [group.plan.id, group]))
  const evidenceGroupIds = input.retainedEvidence.map((retained) => {
    switch (retained.kind) {
      case 'coherent-sheet':
        return retained.evidence.authorization.groupId
      case 'complete-sheet-repair':
      case 'partial-sheet-repair':
        return retained.evidence.repairAuthorization.groupId
      case 'local-partial-reprocess':
        return retained.evidence.reprocessAuthorization.groupId
      case 'role-isolated-atomic-generation':
        return groupsByPlanId.get(retained.evidence.authorization.gamePlanId)?.id ?? ''
      case 'grounded-normalization-migration':
        return retained.evidence.authorization.successorGroupId
    }
  })
  const expectedDecisions = input.familyPlan.groups.flatMap((group) => (
    group.plan.roles.map((role) => ({ groupId: group.id, roleId: role.id }))
  ))
  if (input.retainedEvidence.length !== input.familyPlan.groups.length
    || new Set(evidenceGroupIds).size !== evidenceGroupIds.length
    || evidenceGroupIds.some((groupId) => !groupsById.has(groupId))
    || input.decisions.length !== expectedDecisions.length
    || input.decisions.some((decision, index) => (
      decision.groupId !== expectedDecisions[index]?.groupId
      || decision.roleId !== expectedDecisions[index]?.roleId
    ))) {
    context.addIssue({ code: 'custom', message: 'Game Asset family production must close every group and role in canonical order.' })
  }
  input.retainedEvidence.forEach((retained) => {
    const group = retained.kind === 'role-isolated-atomic-generation'
      ? groupsByPlanId.get(retained.evidence.authorization.gamePlanId)
      : retained.kind === 'grounded-normalization-migration'
        ? groupsById.get(retained.evidence.authorization.successorGroupId)
        : retained.kind === 'coherent-sheet'
          ? groupsById.get(retained.evidence.authorization.groupId)
          : retained.kind === 'local-partial-reprocess'
            ? groupsById.get(retained.evidence.reprocessAuthorization.groupId)
            : groupsById.get(retained.evidence.repairAuthorization.groupId)
    if (!group) return
    if (retained.kind === 'grounded-normalization-migration') {
      if (group.compatibilityClass !== 'grounded-body') {
        context.addIssue({ code: 'custom', message: `Only grounded body group ${group.id} may use normalization migration evidence.` })
      }
      return
    }
    const expectsIsolated = group.source.strategy === 'role-isolated'
    if (expectsIsolated !== (retained.kind === 'role-isolated-atomic-generation')) {
      context.addIssue({ code: 'custom', message: `Game Asset family evidence for ${group.id} disagrees with its source strategy.` })
    }
  })
})
export type GameAssetFamilyProductionInput = z.infer<typeof gameAssetFamilyProductionInputSchema>

const acceptedClipReferenceSchema = z.object({
  groupId: recordIdSchema,
  clipId: recordIdSchema,
  clipHash: sha256Schema,
  sourceKind: z.enum([
    'coherent-sheet',
    'complete-sheet-repair',
    'partial-sheet-repair',
    'role-isolated-atomic-generation',
    'grounded-normalization-migration',
    'local-partial-reprocess',
  ]),
  authorityReceiptId: recordIdSchema,
  authorityReceiptHash: sha256Schema,
  status: z.literal('accepted'),
}).strict()

const familyRelationshipSchema = z.object({
  bodyGroupId: recordIdSchema,
  fxGroupId: recordIdSchema,
  origin: gameAssetAnchorPointSchema,
}).strict()

export const gameAssetFamilyAcceptancePreviewSchema = z.object({
  protocol: z.literal(GAME_ASSET_FAMILY_ACCEPTANCE_PREVIEW_PROTOCOL),
  previewId: z.string().regex(/^game-asset-family-acceptance-preview:sha256:[a-f0-9]{64}$/),
  reviewDigest: sha256Schema,
  familyPlanId: recordIdSchema,
  familyPlanHash: sha256Schema,
  scaleProfile: nativeGameAssetScaleProfileSchema,
  scaleProfileHash: sha256Schema,
  clips: z.array(acceptedClipReferenceSchema).min(1).max(32),
  synchronizedRelationships: z.array(familyRelationshipSchema).max(32),
  roleIds: z.array(recordIdSchema).min(1).max(512),
  artifactIds: z.array(artifactIdSchema).min(1).max(512),
  expiresAt: z.number().int().positive(),
  requiresApproval: z.literal(true),
}).strict().superRefine((preview, context) => {
  if (preview.previewId !== `game-asset-family-acceptance-preview:sha256:${preview.reviewDigest}`
    || preview.scaleProfile.familyPlanId !== preview.familyPlanId
    || new Set(preview.clips.map(({ groupId }) => groupId)).size !== preview.clips.length
    || new Set(preview.roleIds).size !== preview.roleIds.length
    || preview.roleIds.length !== preview.artifactIds.length) {
    context.addIssue({ code: 'custom', message: 'Game Asset family acceptance preview closure is inconsistent.' })
  }
})
export type GameAssetFamilyAcceptancePreview = z.infer<typeof gameAssetFamilyAcceptancePreviewSchema>

export const nativeGameAssetFamilyAcceptanceSchema = z.object({
  version: z.literal(GAME_ASSET_FAMILY_ACCEPTANCE_PROTOCOL),
  receiptId: recordIdSchema,
  receiptHash: sha256Schema,
  familyPlanId: recordIdSchema,
  familyPlanHash: sha256Schema,
  scaleProfileId: z.string().regex(/^scale-profile:[a-f0-9]{64}$/),
  scaleProfileHash: sha256Schema,
  acceptedClips: z.array(acceptedClipReferenceSchema).min(1).max(32),
  synchronizedRelationships: z.array(familyRelationshipSchema).max(32),
  decisions: z.array(gameAssetFamilySemanticDecisionSchema).min(1).max(512),
  verifierImplementationHash: sha256Schema,
  reviewerKind: z.literal('native-local-human'),
  approvalId: recordIdSchema,
  acceptedAt: z.number().int().positive(),
  signature: sha256Schema,
}).strict().superRefine((acceptance, context) => {
  if (acceptance.scaleProfileId !== `scale-profile:${acceptance.scaleProfileHash}`
    || new Set(acceptance.acceptedClips.map(({ groupId }) => groupId)).size !== acceptance.acceptedClips.length) {
    context.addIssue({ code: 'custom', message: 'Native Game Asset family acceptance identity is inconsistent.' })
  }
})
export type NativeGameAssetFamilyAcceptance = z.infer<typeof nativeGameAssetFamilyAcceptanceSchema>

const atlasCellSchema = z.object({
  x: z.number().int().nonnegative().max(16_384),
  y: z.number().int().nonnegative().max(16_384),
  width: z.number().int().positive().max(16_384),
  height: z.number().int().positive().max(16_384),
}).strict()

const familyAtlasManifestSchema = z.object({
  logicalPath: z.string().regex(/^atlases\/atlas-\d{3}\.png$/),
  artifactId: artifactIdSchema,
  sha256: sha256Schema,
  mediaType: z.literal('image/png'),
  byteLength: z.number().int().positive().max(384 * 1024 * 1024),
  width: z.number().int().positive().max(16_384),
  height: z.number().int().positive().max(16_384),
  columns: z.number().int().positive().max(16_384),
  rows: z.number().int().positive().max(16_384),
  cellWidth: z.number().int().positive().max(16_384),
  cellHeight: z.number().int().positive().max(16_384),
}).strict().superRefine((atlas, context) => {
  if (atlas.artifactId !== `artifact:sha256:${atlas.sha256}`
    || atlas.columns * atlas.cellWidth !== atlas.width
    || atlas.rows * atlas.cellHeight !== atlas.height) {
    context.addIssue({ code: 'custom', message: 'Game Asset family atlas geometry or identity is inconsistent.' })
  }
})

export const gameAssetFamilyBundleManifestSchema = z.object({
  version: z.literal(GAME_ASSET_FAMILY_BUNDLE_PROTOCOL),
  deliveryStatus: z.literal('accepted'),
  compilerImplementation: z.literal(GAME_ASSET_FAMILY_ATLAS_COMPILER),
  timingPolicy: z.literal(GAME_ASSET_FAMILY_TIMING_POLICY),
  familyPlanId: recordIdSchema,
  familyPlanHash: sha256Schema,
  scaleProfile: nativeGameAssetScaleProfileSchema,
  scaleProfileHash: sha256Schema,
  acceptance: z.object({ receiptId: recordIdSchema, receiptHash: sha256Schema }).strict(),
  clips: z.array(acceptedClipReferenceSchema).min(1).max(32),
  synchronizedRelationships: z.array(familyRelationshipSchema).max(32),
  atlases: z.array(familyAtlasManifestSchema).min(1).max(32),
  frames: z.array(z.object({
    groupId: recordIdSchema,
    clipId: recordIdSchema,
    roleId: recordIdSchema,
    action: z.string().min(1).max(120),
    direction: z.string().min(1).max(120),
    frameIndex: z.number().int().nonnegative().max(10_000),
    durationMs: z.number().int().positive().max(10_000),
    anchor: gameAssetAnchorPointSchema,
    artifactId: artifactIdSchema,
    artifactSha256: sha256Schema,
    atlasLogicalPath: z.string().regex(/^atlases\/atlas-\d{3}\.png$/),
    cell: atlasCellSchema,
    status: z.literal('accepted'),
  }).strict()).min(1).max(512),
  animations: z.array(z.object({
    groupId: recordIdSchema,
    clipId: recordIdSchema,
    action: z.string().min(1).max(120),
    direction: z.string().min(1).max(120),
    component: z.enum(['body', 'detached-fx', 'projectile', 'impact']),
    looping: z.boolean(),
    frameDurationMs: z.number().int().positive().max(10_000),
    roleIds: z.array(recordIdSchema).min(1).max(16),
    status: z.literal('accepted'),
  }).strict()).min(1).max(32),
}).strict().superRefine((manifest, context) => {
  const atlasByPath = new Map(manifest.atlases.map((atlas) => [atlas.logicalPath, atlas]))
  const clipByGroup = new Map(manifest.clips.map((clip) => [clip.groupId, clip]))
  if (manifest.scaleProfile.familyPlanId !== manifest.familyPlanId
    || manifest.scaleProfile.id !== `scale-profile:${manifest.scaleProfileHash}`
    || manifest.animations.length !== manifest.clips.length
    || manifest.frames.some((frame) => {
      const atlas = atlasByPath.get(frame.atlasLogicalPath)
      const clip = clipByGroup.get(frame.groupId)
      return !atlas || !clip || clip.clipId !== frame.clipId
        || frame.artifactId !== `artifact:sha256:${frame.artifactSha256}`
        || frame.cell.x + frame.cell.width > atlas.width
        || frame.cell.y + frame.cell.height > atlas.height
    })) {
    context.addIssue({ code: 'custom', message: 'Game Asset family bundle manifest closure is inconsistent.' })
  }
})
export type GameAssetFamilyBundleManifest = z.infer<typeof gameAssetFamilyBundleManifestSchema>

const compiledFamilyAtlasSchema = z.object({
  logicalPath: z.string().regex(/^atlases\/atlas-\d{3}\.png$/),
  artifactId: artifactIdSchema,
  sha256: sha256Schema,
  mediaType: z.literal('image/png'),
  byteLength: z.number().int().positive().max(384 * 1024 * 1024),
  width: z.number().int().positive().max(16_384),
  height: z.number().int().positive().max(16_384),
  bytesBase64: retainedBase64Schema,
}).strict()

export const compiledGameAssetFamilyBundleSchema = z.object({
  protocol: z.literal(GAME_ASSET_FAMILY_BUNDLE_PROTOCOL),
  bundleId: z.string().regex(/^game-asset-family-bundle:sha256:[a-f0-9]{64}$/),
  bundleHash: sha256Schema,
  deliveryStatus: z.literal('accepted'),
  manifestLogicalPath: z.literal('manifest.json'),
  manifestMediaType: z.literal('application/json'),
  manifestByteLength: z.number().int().positive().max(16 * 1024 * 1024),
  manifestBytesBase64: retainedBase64Schema,
  atlases: z.array(compiledFamilyAtlasSchema).min(1).max(32),
  manifest: gameAssetFamilyBundleManifestSchema,
}).strict().superRefine((bundle, context) => {
  if (bundle.bundleId !== `game-asset-family-bundle:sha256:${bundle.bundleHash}`
    || bundle.atlases.length !== bundle.manifest.atlases.length
    || bundle.atlases.some((atlas, index) => (
      atlas.logicalPath !== bundle.manifest.atlases[index]?.logicalPath
      || atlas.sha256 !== bundle.manifest.atlases[index]?.sha256
    ))) {
    context.addIssue({ code: 'custom', message: 'Compiled Game Asset family bundle identity is inconsistent.' })
  }
})
export type CompiledGameAssetFamilyBundle = z.infer<typeof compiledGameAssetFamilyBundleSchema>

export interface GameAssetGroundedNormalizationDesktopRunner {
  preview(input: GameAssetGroundedNormalizationPreviewInput): Promise<GameAssetGroundedNormalizationPreview>
  apply(planId: string): Promise<AppliedGameAssetGroundedNormalization>
  verify(
    authorization: GameAssetGroundedNormalizationAuthorization,
    input: GameAssetGroundedNormalizationPreviewInput,
    clip: z.infer<typeof gameAssetActionClipSchema>,
  ): Promise<GameAssetGroundedNormalizationAuthorization>
}

export function createGameAssetGroundedNormalizationDesktopRunner(): GameAssetGroundedNormalizationDesktopRunner {
  return {
    async preview(value) {
      const input = gameAssetGroundedNormalizationPreviewInputSchema.parse(value)
      return gameAssetGroundedNormalizationPreviewSchema.parse(await invoke(
        'preview_game_asset_grounded_normalization',
        { input },
      ))
    },
    async apply(planId) {
      return appliedGameAssetGroundedNormalizationSchema.parse(await invoke(
        'apply_game_asset_grounded_normalization',
        { planId: gameAssetGroundedNormalizationPreviewSchema.shape.planId.parse(planId) },
      ))
    },
    async verify(authorizationValue, inputValue, clipValue) {
      const authorization = gameAssetGroundedNormalizationAuthorizationSchema.parse(authorizationValue)
      const input = gameAssetGroundedNormalizationPreviewInputSchema.parse(inputValue)
      const clip = gameAssetActionClipSchema.parse(clipValue)
      return gameAssetGroundedNormalizationAuthorizationSchema.parse(await invoke(
        'verify_game_asset_grounded_normalization_authorization',
        { authorization, input, clip },
      ))
    },
  }
}

export interface GameAssetFamilyProductionDesktopRunner {
  preview(input: GameAssetFamilyProductionInput): Promise<GameAssetFamilyAcceptancePreview>
  apply(previewId: string): Promise<NativeGameAssetFamilyAcceptance>
  verify(
    acceptance: NativeGameAssetFamilyAcceptance,
    input: GameAssetFamilyProductionInput,
  ): Promise<NativeGameAssetFamilyAcceptance>
  compile(
    acceptance: NativeGameAssetFamilyAcceptance,
    input: GameAssetFamilyProductionInput,
  ): Promise<CompiledGameAssetFamilyBundle>
}

export function createGameAssetFamilyProductionDesktopRunner(): GameAssetFamilyProductionDesktopRunner {
  return {
    async preview(value) {
      const input = gameAssetFamilyProductionInputSchema.parse(value)
      return gameAssetFamilyAcceptancePreviewSchema.parse(await invoke(
        'preview_game_asset_family_acceptance',
        { input },
      ))
    },
    async apply(previewId) {
      return nativeGameAssetFamilyAcceptanceSchema.parse(await invoke(
        'apply_game_asset_family_acceptance',
        { previewId: recordIdSchema.parse(previewId) },
      ))
    },
    async verify(acceptanceValue, inputValue) {
      const acceptance = nativeGameAssetFamilyAcceptanceSchema.parse(acceptanceValue)
      const input = gameAssetFamilyProductionInputSchema.parse(inputValue)
      return nativeGameAssetFamilyAcceptanceSchema.parse(await invoke(
        'verify_game_asset_family_acceptance',
        { acceptance, input },
      ))
    },
    async compile(acceptanceValue, inputValue) {
      const acceptance = nativeGameAssetFamilyAcceptanceSchema.parse(acceptanceValue)
      const input = gameAssetFamilyProductionInputSchema.parse(inputValue)
      return verifyCompiledGameAssetFamilyBundleBytes(await invoke(
        'compile_game_asset_family_bundle',
        { acceptance, input },
      ))
    },
  }
}

export async function verifyCompiledGameAssetFamilyBundleBytes(
  value: unknown,
): Promise<CompiledGameAssetFamilyBundle> {
  const bundle = compiledGameAssetFamilyBundleSchema.parse(value)
  const manifestBytes = base64ToBytes(bundle.manifestBytesBase64)
  const manifestText = new TextDecoder().decode(manifestBytes)
  let retainedManifest: unknown
  try {
    retainedManifest = JSON.parse(manifestText)
  } catch {
    throw new Error('Native Game Asset family manifest bytes are not JSON.')
  }
  if (manifestBytes.byteLength !== bundle.manifestByteLength
    || await sha256Bytes(manifestBytes) !== bundle.bundleHash
    || manifestText !== canonicalJson(bundle.manifest)
    || canonicalJson(retainedManifest) !== canonicalJson(bundle.manifest)) {
    throw new Error('Native Game Asset family manifest bytes drifted from their canonical identity.')
  }
  for (const [index, atlas] of bundle.atlases.entries()) {
    const bytes = base64ToBytes(atlas.bytesBase64)
    const manifestAtlas = bundle.manifest.atlases[index]
    if (!manifestAtlas
      || bytes.byteLength !== atlas.byteLength
      || atlas.byteLength !== manifestAtlas.byteLength
      || await sha256Bytes(bytes) !== atlas.sha256
      || atlas.artifactId !== `artifact:sha256:${atlas.sha256}`) {
      throw new Error(`Native Game Asset family atlas ${atlas.logicalPath} drifted from its retained bytes.`)
    }
  }
  return bundle
}

import { invoke } from '@tauri-apps/api/core'
import { z } from 'zod'
import { fingerprint } from '@/design-ir/fingerprint'
import { multimodalHostReceiptSchema } from '@/multimodal-host/contracts'
import { recordIdSchema, sha256Schema } from '@/design-os-kernel/contracts'
import { invokeCancellableProxy } from '@/services/ai/tauri-fetch'
import {
  compareGameAssetEvidenceIdentity,
  gameAssetActionSchema,
  gameAssetAnchorPointSchema,
  gameAssetAnchorSchema,
  gameAssetDirectionSchema,
  gameAssetEvidenceReferenceSchema,
  gameAssetKindSchema,
  gameAssetPlanSchema,
  gameAssetViewSchema,
  type GameAssetEvidenceReference,
  type GameAssetPlan,
} from './contracts'
import {
  authorizedGameAssetRoleRequestSchema,
  authorizedGameAssetRoleOutputSchema,
  GAME_ASSET_GROUNDED_NORMALIZATION_PROCESSOR,
  GAME_ASSET_GROUNDED_NORMALIZATION_SCALE_POLICY,
  GAME_ASSET_RASTER_PROCESSOR,
  GAME_ASSET_SPATIAL_BOARD_RASTER_PROCESSOR,
  V9_GAME_ASSET_SPATIAL_BOARD_RASTER_PROCESSOR,
  V10_GAME_ASSET_SPATIAL_BOARD_RASTER_PROCESSOR,
  gameAssetPixelEvidenceSchema,
  gameAssetRasterProcessingEvidenceSchema,
  retainedGameAssetEvidenceInputSchema,
  retainedGameAssetRoleOutputSchema,
  type RetainedGameAssetRoleOutput,
} from './generation'

export const GAME_ASSET_FAMILY_PLAN_PROTOCOL = 'game-asset.family-plan.v1' as const
export const GAME_ASSET_ACTION_SOURCE_PROTOCOL = 'game-asset.action-source.v1' as const
export const GAME_ASSET_ACTION_CLIP_PROTOCOL = 'game-asset.action-clip.v1' as const
export const GAME_ASSET_SCALE_PROFILE_PROTOCOL = 'game-asset.scale-profile.v1' as const
export const GAME_ASSET_FAMILY_ACCEPTANCE_PROTOCOL = 'game-asset.family-acceptance.v1' as const
export const GAME_ASSET_FAMILY_BUNDLE_PROTOCOL = 'game-asset.family-bundle.v1' as const
export const GAME_ASSET_GRID_SPLITTER = 'cutout-game-asset-grid-split-rust-image-0.23-v1' as const
export const GAME_ASSET_FAMILY_ATLAS_COMPILER = 'cutout-game-asset-family-atlas-rust-image-0.23-v1' as const
export const GAME_ASSET_ACTION_SHEET_PREVIEW_PROTOCOL = 'cutout.game-asset-action-sheet-preview.v1' as const
export const GAME_ASSET_ACTION_SHEET_AUTHORIZATION_PROTOCOL = 'cutout.game-asset-action-sheet-authorization.v1' as const
export const GAME_ASSET_ACTION_SHEET_PARTIAL_PROTOCOL = 'game-asset.action-sheet-partial.v1' as const
export const GAME_ASSET_ACTION_SHEET_PARTIAL_AUTHORIZATION_PROTOCOL = 'cutout.game-asset-action-sheet-partial-authorization.v1' as const
export const GAME_ASSET_ACTION_SHEET_REPAIR_PREVIEW_PROTOCOL = 'cutout.game-asset-action-sheet-repair-preview.v1' as const
export const GAME_ASSET_ACTION_SHEET_REPAIR_AUTHORIZATION_PROTOCOL = 'cutout.game-asset-action-sheet-repair-authorization.v1' as const
export const GAME_ASSET_ACTION_SHEET_PARTIAL_REPAIR_PREVIEW_PROTOCOL = 'cutout.game-asset-action-sheet-partial-repair-preview.v1' as const
export const GAME_ASSET_ACTION_SHEET_PARTIAL_REPAIR_AUTHORIZATION_PROTOCOL = 'cutout.game-asset-action-sheet-partial-repair-authorization.v1' as const
export const GAME_ASSET_ACTION_SHEET_PARTIAL_REPROCESS_PREVIEW_PROTOCOL = 'cutout.game-asset-action-sheet-partial-reprocess-preview.v1' as const
export const GAME_ASSET_ACTION_SHEET_PARTIAL_REPROCESS_AUTHORIZATION_PROTOCOL = 'cutout.game-asset-action-sheet-partial-reprocess-authorization.v1' as const

const artifactIdSchema = z.string().regex(/^artifact:sha256:[a-f0-9]{64}$/)
const retainedBase64Schema = z.string().min(4).max(512 * 1024 * 1024)
const safeBriefSchema = z.string().trim().min(1).max(20_000).refine(
  (value) => !/(?:\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b|\bBearer\s+[A-Za-z0-9._~+/-]+\b)/i.test(value)
    && !value.split('').some((character) => /\p{Cc}/u.test(character) && character !== '\n' && character !== '\t'),
  'Game Asset family briefs cannot contain credentials or unsafe control characters.',
)

const pixelSizeSchema = z.object({
  width: z.number().int().positive().max(16_384),
  height: z.number().int().positive().max(16_384),
}).strict()

const sourceRectangleSchema = z.object({
  x: z.number().int().nonnegative().max(16_384),
  y: z.number().int().nonnegative().max(16_384),
  width: z.number().int().positive().max(16_384),
  height: z.number().int().positive().max(16_384),
}).strict()

export const gameAssetFamilyComponentSchema = z.enum([
  'body', 'detached-fx', 'projectile', 'impact',
])
export const gameAssetCompatibilityClassSchema = z.enum([
  'grounded-body', 'airborne-body', 'detached-fx', 'projectile', 'impact',
])

export const gameAssetActionSourcePlanSchema = z.discriminatedUnion('strategy', [
  z.object({
    strategy: z.literal('coherent-grid'),
    rows: z.number().int().positive().max(16),
    columns: z.number().int().positive().max(16),
    initialProviderCallBudget: z.literal(1),
  }).strict(),
  z.object({
    strategy: z.literal('role-isolated'),
    roleIds: z.array(recordIdSchema).min(1).max(16),
    initialProviderCallBudget: z.number().int().positive().max(16),
  }).strict(),
])

export const gameAssetFamilyActionGroupSchema = z.object({
  id: recordIdSchema,
  label: z.string().trim().min(1).max(120),
  component: gameAssetFamilyComponentSchema,
  compatibilityClass: gameAssetCompatibilityClassSchema,
  action: gameAssetActionSchema,
  direction: gameAssetDirectionSchema,
  dependencies: z.array(recordIdSchema).max(32),
  synchronizedBodyGroupId: recordIdSchema.optional(),
  timing: z.object({
    frameDurationMs: z.number().int().positive().max(10_000),
    looping: z.boolean(),
  }).strict(),
  source: gameAssetActionSourcePlanSchema,
  sourceBrief: safeBriefSchema,
  plan: gameAssetPlanSchema,
}).strict().superRefine((group, context) => {
  const roles = group.plan.roles
  const roleIds = new Set(roles.map(({ id }) => id))
  const expectedKind = group.component === 'body'
    ? undefined
    : group.component === 'detached-fx' ? 'fx' : group.component
  if (expectedKind && group.plan.kind !== expectedKind) {
    context.addIssue({ code: 'custom', message: 'Non-body action groups must use their exact atomic Game Asset kind.' })
  }
  if (roles.some(({ action, direction }) => action !== group.action || direction !== group.direction)) {
    context.addIssue({ code: 'custom', message: 'Action group roles must match the declared action and direction.' })
  }
  if (group.source.strategy === 'coherent-grid'
    && group.source.rows * group.source.columns !== roles.length) {
    context.addIssue({ code: 'custom', message: 'A coherent action grid must contain exactly one cell per atomic role.' })
  }
  if (group.source.strategy === 'role-isolated'
    && (group.source.initialProviderCallBudget !== roles.length
      || group.source.roleIds.length !== roles.length
      || group.source.roleIds.some((roleId) => !roleIds.has(roleId)))) {
    context.addIssue({ code: 'custom', message: 'Role-isolated action sources must close the exact atomic role set.' })
  }
  if ((group.component === 'detached-fx') !== Boolean(group.synchronizedBodyGroupId)) {
    context.addIssue({ code: 'custom', message: 'Detached FX must identify exactly one synchronized body action.' })
  }
  if (group.component === 'body'
    && group.compatibilityClass !== 'grounded-body'
    && group.compatibilityClass !== 'airborne-body') {
    context.addIssue({ code: 'custom', message: 'Body actions require a body compatibility class.' })
  }
  if (group.component !== 'body' && group.compatibilityClass !== group.component) {
    context.addIssue({ code: 'custom', message: 'Detached action components require their matching compatibility class.' })
  }
})
export type GameAssetFamilyActionGroup = z.infer<typeof gameAssetFamilyActionGroupSchema>

function addDependencyCycleIssues(
  groups: readonly GameAssetFamilyActionGroup[],
  context: z.RefinementCtx,
): void {
  const byId = new Map(groups.map((group) => [group.id, group]))
  const state = new Map<string, 'visiting' | 'visited'>()
  const visit = (groupId: string): boolean => {
    if (state.get(groupId) === 'visiting') return false
    if (state.get(groupId) === 'visited') return true
    state.set(groupId, 'visiting')
    const group = byId.get(groupId)
    if (group && group.dependencies.some((dependencyId) => !visit(dependencyId))) return false
    state.set(groupId, 'visited')
    return true
  }
  if (groups.some(({ id }) => !visit(id))) {
    context.addIssue({ code: 'custom', message: 'Game Asset family dependencies must be acyclic.' })
  }
}

export const gameAssetFamilyPlanSchema = z.object({
  version: z.literal(GAME_ASSET_FAMILY_PLAN_PROTOCOL),
  id: recordIdSchema,
  assetId: recordIdSchema,
  kind: gameAssetKindSchema.exclude(['fx', 'projectile', 'impact', 'layered-map']),
  view: gameAssetViewSchema,
  identityReference: gameAssetEvidenceReferenceSchema,
  artDirectionEvidence: gameAssetEvidenceReferenceSchema,
  groups: z.array(gameAssetFamilyActionGroupSchema).min(1).max(32),
  masterSelection: z.object({
    policy: z.literal('first-accepted-grounded-body'),
    priorityGroupIds: z.array(recordIdSchema).min(1).max(32),
  }).strict(),
  delivery: z.object({
    formatId: z.literal(GAME_ASSET_FAMILY_BUNDLE_PROTOCOL),
    atlasPolicy: z.literal('canonical-action-direction-frame'),
    bodyFxPolicy: z.literal('detached-origin-synchronized'),
  }).strict(),
}).strict().superRefine((family, context) => {
  const groupIds = family.groups.map(({ id }) => id)
  const planIds = family.groups.map(({ plan }) => plan.id)
  const groupIdSet = new Set(groupIds)
  if (groupIdSet.size !== groupIds.length || new Set(planIds).size !== planIds.length) {
    context.addIssue({ code: 'custom', message: 'Game Asset family group and atomic plan ids must be unique.' })
  }
  for (const group of family.groups) {
    if (group.plan.assetId !== family.assetId || group.plan.view !== family.view) {
      context.addIssue({ code: 'custom', message: 'Every atomic action plan must retain the exact family identity and view.' })
    }
    if (group.component === 'body' && group.plan.kind !== family.kind) {
      context.addIssue({ code: 'custom', message: 'Body action plans must retain the family subject kind.' })
    }
    if (group.plan.artDirectionEvidence.length !== 1
      || !sameEvidence(group.plan.artDirectionEvidence[0]!, family.artDirectionEvidence)
      || !group.plan.referenceArtifacts.some((reference) => sameEvidence(reference, family.identityReference))) {
      context.addIssue({ code: 'custom', message: 'Every action plan must retain the exact family identity and art direction evidence.' })
    }
    if (new Set(group.dependencies).size !== group.dependencies.length
      || group.dependencies.some((dependencyId) => dependencyId === group.id || !groupIdSet.has(dependencyId))) {
      context.addIssue({ code: 'custom', message: 'Game Asset family dependencies must be unique, external-to-self, and closed.' })
    }
    if (group.synchronizedBodyGroupId
      && (!groupIdSet.has(group.synchronizedBodyGroupId)
        || !group.dependencies.includes(group.synchronizedBodyGroupId))) {
      context.addIssue({ code: 'custom', message: 'Detached FX synchronization must also be an explicit dependency.' })
    }
  }
  if (new Set(family.masterSelection.priorityGroupIds).size !== family.masterSelection.priorityGroupIds.length
    || family.masterSelection.priorityGroupIds.some((groupId) => (
      !groupIdSet.has(groupId)
      || family.groups.find((group) => group.id === groupId)?.compatibilityClass !== 'grounded-body'
    ))) {
    context.addIssue({ code: 'custom', message: 'Master selection may reference only unique grounded body actions.' })
  }
  addDependencyCycleIssues(family.groups, context)
})
export type GameAssetFamilyPlan = z.infer<typeof gameAssetFamilyPlanSchema>

const actionSheetGridInputSchema = z.object({
  rows: z.number().int().positive().max(16),
  columns: z.number().int().positive().max(16),
}).strict()

export const gameAssetActionSheetPreviewInputSchema = z.object({
  identity: z.object({
    id: recordIdSchema,
    revision: recordIdSchema,
  }).strict(),
  runId: recordIdSchema,
  providerId: recordIdSchema,
  model: z.enum(['qwen-image-3.0', 'qwen-image-3.0-pro']),
  familyPlanId: recordIdSchema,
  familyPlanHash: sha256Schema,
  groupId: recordIdSchema,
  plan: gameAssetPlanSchema,
  retainedEvidence: z.array(retainedGameAssetEvidenceInputSchema).min(1).max(128),
  sourceBrief: safeBriefSchema,
  grid: actionSheetGridInputSchema,
  frameDurationMs: z.number().int().positive().max(10_000),
  looping: z.boolean(),
}).strict().superRefine((input, context) => {
  if (input.grid.rows * input.grid.columns !== input.plan.roles.length) {
    context.addIssue({ code: 'custom', message: 'Action-sheet preview grid must close the exact atomic role set.' })
  }
})
export type GameAssetActionSheetPreviewInput = z.infer<typeof gameAssetActionSheetPreviewInputSchema>

const actionSheetRepairRolePromptSchema = z.object({
  roleId: recordIdSchema,
  prompt: safeBriefSchema,
}).strict()

export const gameAssetActionSheetRepairPreviewInputSchema = z.object({
  parentAuthorization: z.lazy(() => gameAssetActionSheetAuthorizationSchema),
  parentSource: z.lazy(() => gameAssetActionSourceSchema),
  parentClip: z.lazy(() => gameAssetActionClipSchema),
  runId: recordIdSchema,
  plan: gameAssetPlanSchema,
  roles: z.array(actionSheetRepairRolePromptSchema).min(1).max(15),
}).strict().superRefine((input, context) => {
  const planRoleIds = input.plan.roles.map(({ id }) => id)
  const replacementRoleIds = input.roles.map(({ roleId }) => roleId)
  const parentRoleIds = input.parentAuthorization.sourceRequest.roleIds
  if (input.parentAuthorization.gamePlanId !== input.plan.id
    || input.parentAuthorization.sourceId !== input.parentSource.id
    || input.parentAuthorization.clipId !== input.parentClip.id
    || input.parentSource.familyPlanId !== input.parentAuthorization.familyPlanId
    || input.parentSource.groupId !== input.parentAuthorization.groupId
    || input.parentClip.familyPlanId !== input.parentAuthorization.familyPlanId
    || input.parentClip.groupId !== input.parentAuthorization.groupId
    || parentRoleIds.length !== planRoleIds.length
    || parentRoleIds.some((roleId, index) => roleId !== planRoleIds[index])
    || input.parentSource.cells.length !== planRoleIds.length
    || input.parentClip.frames.length !== planRoleIds.length
    || new Set(replacementRoleIds).size !== replacementRoleIds.length
    || replacementRoleIds.length >= planRoleIds.length
    || replacementRoleIds.some((roleId) => !planRoleIds.includes(roleId))) {
    context.addIssue({ code: 'custom', message: 'Action-sheet repair input must close a strict subset of its verified parent.' })
  }
})
export type GameAssetActionSheetRepairPreviewInput = z.infer<typeof gameAssetActionSheetRepairPreviewInputSchema>

export const gameAssetActionSheetPartialRepairPreviewInputSchema = z.object({
  parentAuthorization: z.lazy(() => gameAssetActionSheetPartialAuthorizationSchema),
  parentSource: z.lazy(() => gameAssetActionSourceSchema),
  parentPartial: z.lazy(() => gameAssetActionSheetPartialSchema),
  runId: recordIdSchema,
  plan: gameAssetPlanSchema,
  roles: z.array(actionSheetRepairRolePromptSchema).min(1).max(15),
}).strict().superRefine((input, context) => {
  const planRoleIds = input.plan.roles.map(({ id }) => id)
  const replacementRoleIds = input.roles.map(({ roleId }) => roleId)
  const failedRoleIds = input.parentPartial.failures.map(({ roleId }) => roleId)
  if (input.parentAuthorization.gamePlanId !== input.plan.id
    || input.parentAuthorization.sourceId !== input.parentSource.id
    || input.parentAuthorization.partialId !== input.parentPartial.id
    || input.parentSource.familyPlanId !== input.parentAuthorization.familyPlanId
    || input.parentSource.groupId !== input.parentAuthorization.groupId
    || input.parentPartial.familyPlanId !== input.parentAuthorization.familyPlanId
    || input.parentPartial.groupId !== input.parentAuthorization.groupId
    || input.parentPartial.sourceId !== input.parentSource.id
    || input.parentSource.cells.length !== planRoleIds.length
    || input.parentPartial.frames.length === 0
    || replacementRoleIds.length >= planRoleIds.length
    || replacementRoleIds.some((roleId, index) => roleId !== failedRoleIds[index])) {
    context.addIssue({ code: 'custom', message: 'Partial action-sheet repair must close the exact failed roles of its verified parent.' })
  }
})
export type GameAssetActionSheetPartialRepairPreviewInput = z.infer<typeof gameAssetActionSheetPartialRepairPreviewInputSchema>

export const gameAssetActionSheetPartialReprocessPreviewInputSchema = z.object({
  parentAuthorization: z.lazy(() => gameAssetActionSheetPartialAuthorizationSchema),
  parentSource: z.lazy(() => gameAssetActionSourceSchema),
  parentPartial: z.lazy(() => gameAssetActionSheetPartialSchema),
  plan: gameAssetPlanSchema,
}).strict().superRefine((input, context) => {
  const failedRoleIds = input.parentPartial.failures.map(({ roleId }) => roleId)
  if (input.parentAuthorization.gamePlanId !== input.plan.id
    || input.parentAuthorization.sourceId !== input.parentSource.id
    || input.parentAuthorization.partialId !== input.parentPartial.id
    || input.parentPartial.sourceId !== input.parentSource.id
    || failedRoleIds.length === 0
    || failedRoleIds.some((roleId, index) => roleId !== input.parentAuthorization.failedRoleIds[index])) {
    context.addIssue({ code: 'custom', message: 'Local partial reprocess must consume the exact signed partial failure closure.' })
  }
})
export type GameAssetActionSheetPartialReprocessPreviewInput = z.infer<typeof gameAssetActionSheetPartialReprocessPreviewInputSchema>

export const gameAssetActionSheetPreviewSchema = z.object({
  protocol: z.literal(GAME_ASSET_ACTION_SHEET_PREVIEW_PROTOCOL),
  planId: z.string().regex(/^game-asset-action-sheet-preview:sha256:[a-f0-9]{64}$/),
  requestDigest: sha256Schema,
  runId: recordIdSchema,
  familyPlanId: recordIdSchema,
  familyPlanHash: sha256Schema,
  groupId: recordIdSchema,
  gamePlanId: recordIdSchema,
  providerId: recordIdSchema,
  model: z.enum(['qwen-image-3.0', 'qwen-image-3.0-pro']),
  roleIds: z.array(recordIdSchema).min(1).max(16),
  referenceArtifactIds: z.array(artifactIdSchema).min(1).max(3),
  grid: actionSheetGridInputSchema,
  outputSize: z.string().regex(/^\d+x\d+$/),
  splitterImplementation: z.literal(GAME_ASSET_GRID_SPLITTER),
  processorImplementation: z.literal(GAME_ASSET_RASTER_PROCESSOR),
  frameDurationMs: z.number().int().positive().max(10_000),
  looping: z.boolean(),
  expiresAt: z.number().int().positive(),
  executionMode: z.literal('byok-direct'),
}).strict().superRefine((preview, context) => {
  if (preview.planId !== `game-asset-action-sheet-preview:sha256:${preview.requestDigest}`
    || preview.roleIds.length !== preview.grid.rows * preview.grid.columns
    || new Set(preview.roleIds).size !== preview.roleIds.length
    || new Set(preview.referenceArtifactIds).size !== preview.referenceArtifactIds.length) {
    context.addIssue({ code: 'custom', message: 'Action-sheet preview identity and role closure are inconsistent.' })
  }
})
export type GameAssetActionSheetPreview = z.infer<typeof gameAssetActionSheetPreviewSchema>

export const gameAssetActionSheetRepairPreviewSchema = z.object({
  protocol: z.literal(GAME_ASSET_ACTION_SHEET_REPAIR_PREVIEW_PROTOCOL),
  planId: z.string().regex(/^game-asset-action-sheet-repair-preview:sha256:[a-f0-9]{64}$/),
  requestDigest: sha256Schema,
  runId: recordIdSchema,
  parentAuthorizationReceiptId: recordIdSchema,
  parentAuthorizationReceiptHash: sha256Schema,
  parentSourceId: recordIdSchema,
  parentClipId: recordIdSchema,
  familyPlanId: recordIdSchema,
  familyPlanHash: sha256Schema,
  groupId: recordIdSchema,
  gamePlanId: recordIdSchema,
  providerId: recordIdSchema,
  model: z.enum(['qwen-image-3.0', 'qwen-image-3.0-pro']),
  roleIds: z.array(recordIdSchema).min(1).max(16),
  replacementRoleIds: z.array(recordIdSchema).min(1).max(15),
  outputSize: z.string().regex(/^\d+x\d+$/),
  processorImplementation: z.literal(GAME_ASSET_RASTER_PROCESSOR),
  expiresAt: z.number().int().positive(),
  executionMode: z.literal('byok-direct'),
}).strict().superRefine((preview, context) => {
  if (preview.planId !== `game-asset-action-sheet-repair-preview:sha256:${preview.requestDigest}`
    || new Set(preview.roleIds).size !== preview.roleIds.length
    || new Set(preview.replacementRoleIds).size !== preview.replacementRoleIds.length
    || preview.replacementRoleIds.some((roleId) => !preview.roleIds.includes(roleId))) {
    context.addIssue({ code: 'custom', message: 'Action-sheet repair preview identity and role closure are inconsistent.' })
  }
})
export type GameAssetActionSheetRepairPreview = z.infer<typeof gameAssetActionSheetRepairPreviewSchema>

export const gameAssetActionSheetPartialRepairPreviewSchema = z.object({
  protocol: z.literal(GAME_ASSET_ACTION_SHEET_PARTIAL_REPAIR_PREVIEW_PROTOCOL),
  planId: z.string().regex(/^game-asset-action-sheet-partial-repair-preview:sha256:[a-f0-9]{64}$/),
  requestDigest: sha256Schema,
  runId: recordIdSchema,
  parentAuthorizationReceiptId: recordIdSchema,
  parentAuthorizationReceiptHash: sha256Schema,
  parentSourceId: recordIdSchema,
  parentPartialId: z.string().regex(/^action-sheet-partial:sha256:[a-f0-9]{64}$/),
  familyPlanId: recordIdSchema,
  familyPlanHash: sha256Schema,
  groupId: recordIdSchema,
  gamePlanId: recordIdSchema,
  providerId: recordIdSchema,
  model: z.enum(['qwen-image-3.0', 'qwen-image-3.0-pro']),
  roleIds: z.array(recordIdSchema).min(1).max(16),
  replacementRoleIds: z.array(recordIdSchema).min(1).max(15),
  outputSize: z.string().regex(/^\d+x\d+$/),
  processorImplementation: z.literal(GAME_ASSET_RASTER_PROCESSOR),
  expiresAt: z.number().int().positive(),
  executionMode: z.literal('byok-direct'),
}).strict().superRefine((preview, context) => {
  if (preview.planId !== `game-asset-action-sheet-partial-repair-preview:sha256:${preview.requestDigest}`
    || new Set(preview.roleIds).size !== preview.roleIds.length
    || new Set(preview.replacementRoleIds).size !== preview.replacementRoleIds.length
    || preview.replacementRoleIds.some((roleId) => !preview.roleIds.includes(roleId))) {
    context.addIssue({ code: 'custom', message: 'Partial action-sheet repair preview identity and role closure are inconsistent.' })
  }
})
export type GameAssetActionSheetPartialRepairPreview = z.infer<typeof gameAssetActionSheetPartialRepairPreviewSchema>

export const gameAssetActionSheetPartialReprocessPreviewSchema = z.object({
  protocol: z.literal(GAME_ASSET_ACTION_SHEET_PARTIAL_REPROCESS_PREVIEW_PROTOCOL),
  planId: z.string().regex(/^game-asset-action-sheet-partial-reprocess-preview:sha256:[a-f0-9]{64}$/),
  requestDigest: sha256Schema,
  runId: recordIdSchema,
  parentAuthorizationReceiptId: recordIdSchema,
  parentAuthorizationReceiptHash: sha256Schema,
  parentSourceId: recordIdSchema,
  parentPartialId: z.string().regex(/^action-sheet-partial:sha256:[a-f0-9]{64}$/),
  familyPlanId: recordIdSchema,
  familyPlanHash: sha256Schema,
  groupId: recordIdSchema,
  gamePlanId: recordIdSchema,
  roleIds: z.array(recordIdSchema).min(1).max(16),
  reprocessedRoleIds: z.array(recordIdSchema).min(1).max(15),
  processorImplementation: z.literal(GAME_ASSET_SPATIAL_BOARD_RASTER_PROCESSOR),
  providerCalls: z.literal(0),
  expiresAt: z.number().int().positive(),
  executionMode: z.literal('local-deterministic'),
}).strict().superRefine((preview, context) => {
  if (preview.planId !== `game-asset-action-sheet-partial-reprocess-preview:sha256:${preview.requestDigest}`
    || new Set(preview.roleIds).size !== preview.roleIds.length
    || new Set(preview.reprocessedRoleIds).size !== preview.reprocessedRoleIds.length
    || preview.reprocessedRoleIds.some((roleId) => !preview.roleIds.includes(roleId))) {
    context.addIssue({ code: 'custom', message: 'Local partial reprocess preview identity and role closure are inconsistent.' })
  }
})
export type GameAssetActionSheetPartialReprocessPreview = z.infer<typeof gameAssetActionSheetPartialReprocessPreviewSchema>

const retainedArtifactSchema = z.object({
  artifactId: artifactIdSchema,
  sha256: sha256Schema,
  mediaType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  byteLength: z.number().int().positive().max(384 * 1024 * 1024),
  bytesBase64: retainedBase64Schema,
  decodedWidth: z.number().int().positive().max(16_384),
  decodedHeight: z.number().int().positive().max(16_384),
}).strict().superRefine((artifact, context) => {
  if (artifact.artifactId !== `artifact:sha256:${artifact.sha256}`) {
    context.addIssue({ code: 'custom', message: 'Retained action-source artifact identity must equal its byte digest.' })
  }
})

export const gameAssetActionSourceSchema = z.object({
  version: z.literal(GAME_ASSET_ACTION_SOURCE_PROTOCOL),
  id: recordIdSchema,
  familyPlanId: recordIdSchema,
  groupId: recordIdSchema,
  strategy: z.literal('coherent-grid'),
  splitterImplementation: z.literal(GAME_ASSET_GRID_SPLITTER),
  receipt: multimodalHostReceiptSchema,
  source: retainedArtifactSchema,
  grid: z.object({
    rows: z.number().int().positive().max(16),
    columns: z.number().int().positive().max(16),
    cellWidth: z.number().int().positive().max(16_384),
    cellHeight: z.number().int().positive().max(16_384),
  }).strict(),
  cells: z.array(z.object({
    roleId: recordIdSchema,
    row: z.number().int().nonnegative().max(15),
    column: z.number().int().nonnegative().max(15),
    sourceRectangle: sourceRectangleSchema,
    artifact: retainedArtifactSchema,
  }).strict()).min(1).max(16),
}).strict().superRefine((source, context) => {
  const { grid } = source
  const roleIds = source.cells.map(({ roleId }) => roleId)
  const coordinates = source.cells.map(({ row, column }) => `${row}:${column}`)
  if (source.receipt.artifact.artifactId !== source.source.artifactId
    || source.receipt.artifact.sha256 !== source.source.sha256
    || source.receipt.artifact.mediaType !== source.source.mediaType
    || source.receipt.artifact.byteLength !== source.source.byteLength
    || source.receipt.artifact.width !== source.source.decodedWidth
    || source.receipt.artifact.height !== source.source.decodedHeight
    || grid.columns * grid.cellWidth !== source.source.decodedWidth
    || grid.rows * grid.cellHeight !== source.source.decodedHeight
    || source.cells.length !== grid.rows * grid.columns
    || new Set(roleIds).size !== roleIds.length
    || new Set(coordinates).size !== coordinates.length) {
    context.addIssue({ code: 'custom', message: 'Coherent action-source receipt, bytes, grid, and role closure are inconsistent.' })
  }
  for (const cell of source.cells) {
    if (cell.row >= grid.rows || cell.column >= grid.columns
      || cell.sourceRectangle.x !== cell.column * grid.cellWidth
      || cell.sourceRectangle.y !== cell.row * grid.cellHeight
      || cell.sourceRectangle.width !== grid.cellWidth
      || cell.sourceRectangle.height !== grid.cellHeight
      || cell.artifact.mediaType !== 'image/png'
      || cell.artifact.decodedWidth !== grid.cellWidth
      || cell.artifact.decodedHeight !== grid.cellHeight) {
      context.addIssue({ code: 'custom', message: 'Derived action cells must be the exact deterministic grid partition.' })
    }
  }
})
export type GameAssetActionSource = z.infer<typeof gameAssetActionSourceSchema>

export const gameAssetActionClipFrameSchema = z.object({
  roleId: recordIdSchema,
  sourceArtifactId: artifactIdSchema,
  artifactId: artifactIdSchema,
  artifactSha256: sha256Schema,
  artifactBytesBase64: retainedBase64Schema,
  durationMs: z.number().int().positive().max(10_000),
  anchor: gameAssetAnchorPointSchema,
  processingEvidence: gameAssetRasterProcessingEvidenceSchema,
  pixelEvidence: gameAssetPixelEvidenceSchema,
}).strict()
export type GameAssetActionClipFrame = z.infer<typeof gameAssetActionClipFrameSchema>

export const gameAssetActionClipSchema = z.object({
  version: z.literal(GAME_ASSET_ACTION_CLIP_PROTOCOL),
  id: recordIdSchema,
  familyPlanId: recordIdSchema,
  groupId: recordIdSchema,
  atomicPlanId: recordIdSchema,
  atomicPlanHash: sha256Schema,
  sourceId: recordIdSchema,
  frames: z.array(gameAssetActionClipFrameSchema).min(1).max(16),
}).strict().superRefine((clip, context) => {
  const inconsistentFrame = clip.frames.some((frame) => {
    const frameSize = 'frameSize' in frame.processingEvidence
      ? frame.processingEvidence.frameSize
      : undefined
    return frame.artifactId !== `artifact:sha256:${frame.artifactSha256}`
      || frame.processingEvidence.sourceArtifactId !== frame.sourceArtifactId
      || frame.processingEvidence.outputArtifactId !== frame.artifactId
      || frame.processingEvidence.outputArtifactSha256 !== frame.artifactSha256
      || (frameSize !== undefined && (
        frame.pixelEvidence.decodedWidth !== frameSize.width
        || frame.pixelEvidence.decodedHeight !== frameSize.height
      ))
  })
  if (new Set(clip.frames.map(({ roleId }) => roleId)).size !== clip.frames.length
    || inconsistentFrame) {
    context.addIssue({ code: 'custom', message: 'Action clip frame identities and deterministic processing evidence are inconsistent.' })
  }
})
export type GameAssetActionClip = z.infer<typeof gameAssetActionClipSchema>

export const gameAssetActionSheetCellFailureSchema = z.object({
  roleId: recordIdSchema,
  sourceArtifactId: artifactIdSchema,
  code: z.enum(['deterministic-cutout-rejected', 'pixel-inspection-rejected']),
  message: z.string().min(1).max(2_000),
}).strict()
export type GameAssetActionSheetCellFailure = z.infer<typeof gameAssetActionSheetCellFailureSchema>

export const gameAssetActionSheetPartialSchema = z.object({
  version: z.literal(GAME_ASSET_ACTION_SHEET_PARTIAL_PROTOCOL),
  id: z.string().regex(/^action-sheet-partial:sha256:[a-f0-9]{64}$/),
  familyPlanId: recordIdSchema,
  groupId: recordIdSchema,
  atomicPlanId: recordIdSchema,
  atomicPlanHash: sha256Schema,
  sourceId: recordIdSchema,
  frameDurationMs: z.number().int().positive().max(10_000),
  looping: z.boolean(),
  frames: z.array(gameAssetActionClipFrameSchema).max(15),
  failures: z.array(gameAssetActionSheetCellFailureSchema).min(1).max(16),
}).strict().superRefine((partial, context) => {
  const successfulRoleIds = partial.frames.map(({ roleId }) => roleId)
  const failedRoleIds = partial.failures.map(({ roleId }) => roleId)
  const successful = new Set(successfulRoleIds)
  if (successful.size !== successfulRoleIds.length
    || new Set(failedRoleIds).size !== failedRoleIds.length
    || failedRoleIds.some((roleId) => successful.has(roleId))) {
    context.addIssue({ code: 'custom', message: 'Partial action-sheet success and failure roles must be unique and disjoint.' })
  }
})
export type GameAssetActionSheetPartial = z.infer<typeof gameAssetActionSheetPartialSchema>

const authorizedActionSheetRequestSchema = z.object({
  requestId: recordIdSchema,
  prompt: safeBriefSchema,
  promptHash: sha256Schema,
  semanticRole: recordIdSchema,
  nodeId: recordIdSchema,
  capabilityId: z.literal('capability:image-generation'),
  acceptedReferenceArtifactIds: z.array(artifactIdSchema).min(1).max(3),
  lockIds: z.array(recordIdSchema).min(1).max(256),
  roleIds: z.array(recordIdSchema).min(1).max(16),
  grid: actionSheetGridInputSchema,
  outputSize: z.string().regex(/^\d+x\d+$/),
  frameDurationMs: z.number().int().positive().max(10_000),
  looping: z.boolean(),
}).strict()

const authorizedActionSheetCellSchema = z.object({
  roleId: recordIdSchema,
  row: z.number().int().nonnegative().max(15),
  column: z.number().int().nonnegative().max(15),
  sourceRectangle: sourceRectangleSchema,
  sourceArtifactId: artifactIdSchema,
  sourceArtifactSha256: sha256Schema,
  artifactId: artifactIdSchema,
  artifactSha256: sha256Schema,
  processingEvidence: gameAssetRasterProcessingEvidenceSchema,
  pixelEvidence: gameAssetPixelEvidenceSchema,
}).strict().superRefine((cell, context) => {
  if (cell.sourceArtifactId !== `artifact:sha256:${cell.sourceArtifactSha256}`
    || cell.artifactId !== `artifact:sha256:${cell.artifactSha256}`
    || cell.processingEvidence.sourceArtifactId !== cell.sourceArtifactId
    || cell.processingEvidence.outputArtifactId !== cell.artifactId) {
    context.addIssue({ code: 'custom', message: 'Authorized action-sheet cell identities are inconsistent.' })
  }
})

export const gameAssetActionSheetAuthorizationSchema = z.object({
  protocol: z.literal(GAME_ASSET_ACTION_SHEET_AUTHORIZATION_PROTOCOL),
  receiptId: recordIdSchema,
  receiptHash: sha256Schema,
  planId: z.string().regex(/^game-asset-action-sheet-preview:sha256:[a-f0-9]{64}$/),
  requestDigest: sha256Schema,
  executionId: recordIdSchema,
  executionMode: z.literal('byok-direct'),
  identity: z.object({ id: recordIdSchema, revision: recordIdSchema }).strict(),
  runId: recordIdSchema,
  providerId: recordIdSchema,
  model: z.enum(['qwen-image-3.0', 'qwen-image-3.0-pro']),
  familyPlanId: recordIdSchema,
  familyPlanHash: sha256Schema,
  groupId: recordIdSchema,
  gamePlanId: recordIdSchema,
  gamePlanHash: sha256Schema,
  sourceRequest: authorizedActionSheetRequestSchema,
  sourceReceiptId: recordIdSchema,
  sourceReceiptHash: sha256Schema,
  sourceId: recordIdSchema,
  clipId: recordIdSchema,
  cells: z.array(authorizedActionSheetCellSchema).min(1).max(16),
  status: z.literal('succeeded'),
  startedAt: z.number().int().nonnegative(),
  completedAt: z.number().int().nonnegative(),
  signature: sha256Schema,
}).strict().superRefine((authorization, context) => {
  if (authorization.planId !== `game-asset-action-sheet-preview:sha256:${authorization.requestDigest}`
    || authorization.completedAt < authorization.startedAt
    || authorization.groupId !== authorization.sourceRequest.semanticRole
    || authorization.cells.length !== authorization.sourceRequest.roleIds.length
    || new Set(authorization.cells.map(({ roleId }) => roleId)).size !== authorization.cells.length
    || authorization.cells.some((cell, index) => (
      cell.roleId !== authorization.sourceRequest.roleIds[index]
    ))) {
    context.addIssue({ code: 'custom', message: 'Action-sheet authorization identity and role closure are inconsistent.' })
  }
})
export type GameAssetActionSheetAuthorization = z.infer<typeof gameAssetActionSheetAuthorizationSchema>

export const gameAssetActionSheetPartialAuthorizationSchema = z.object({
  protocol: z.literal(GAME_ASSET_ACTION_SHEET_PARTIAL_AUTHORIZATION_PROTOCOL),
  receiptId: recordIdSchema,
  receiptHash: sha256Schema,
  planId: z.string().regex(/^game-asset-action-sheet-preview:sha256:[a-f0-9]{64}$/),
  requestDigest: sha256Schema,
  executionId: recordIdSchema,
  executionMode: z.literal('byok-direct'),
  identity: z.object({ id: recordIdSchema, revision: recordIdSchema }).strict(),
  runId: recordIdSchema,
  providerId: recordIdSchema,
  model: z.enum(['qwen-image-3.0', 'qwen-image-3.0-pro']),
  familyPlanId: recordIdSchema,
  familyPlanHash: sha256Schema,
  groupId: recordIdSchema,
  gamePlanId: recordIdSchema,
  gamePlanHash: sha256Schema,
  sourceRequest: authorizedActionSheetRequestSchema,
  sourceReceiptId: recordIdSchema,
  sourceReceiptHash: sha256Schema,
  sourceId: recordIdSchema,
  partialId: z.string().regex(/^action-sheet-partial:sha256:[a-f0-9]{64}$/),
  successfulRoleIds: z.array(recordIdSchema).max(15),
  failedRoleIds: z.array(recordIdSchema).min(1).max(16),
  status: z.literal('partial'),
  startedAt: z.number().int().nonnegative(),
  completedAt: z.number().int().nonnegative(),
  signature: sha256Schema,
}).strict().superRefine((authorization, context) => {
  const successful = new Set(authorization.successfulRoleIds)
  if (authorization.planId !== `game-asset-action-sheet-preview:sha256:${authorization.requestDigest}`
    || authorization.completedAt < authorization.startedAt
    || authorization.groupId !== authorization.sourceRequest.semanticRole
    || successful.size !== authorization.successfulRoleIds.length
    || new Set(authorization.failedRoleIds).size !== authorization.failedRoleIds.length
    || authorization.failedRoleIds.some((roleId) => successful.has(roleId))
    || authorization.successfulRoleIds.length + authorization.failedRoleIds.length !== authorization.sourceRequest.roleIds.length) {
    context.addIssue({ code: 'custom', message: 'Partial action-sheet authorization identity and role settlement are inconsistent.' })
  }
})
export type GameAssetActionSheetPartialAuthorization = z.infer<typeof gameAssetActionSheetPartialAuthorizationSchema>

const preservedActionSheetCellLineageSchema = z.object({
  roleId: recordIdSchema,
  sourceArtifactId: artifactIdSchema,
  artifactId: artifactIdSchema,
}).strict()

export const gameAssetActionSheetRepairAuthorizationSchema = z.object({
  protocol: z.literal(GAME_ASSET_ACTION_SHEET_REPAIR_AUTHORIZATION_PROTOCOL),
  receiptId: recordIdSchema,
  receiptHash: sha256Schema,
  planId: z.string().regex(/^game-asset-action-sheet-repair-preview:sha256:[a-f0-9]{64}$/),
  requestDigest: sha256Schema,
  executionId: recordIdSchema,
  executionMode: z.literal('byok-direct'),
  identity: z.object({ id: recordIdSchema, revision: recordIdSchema }).strict(),
  runId: recordIdSchema,
  providerId: recordIdSchema,
  model: z.enum(['qwen-image-3.0', 'qwen-image-3.0-pro']),
  familyPlanId: recordIdSchema,
  familyPlanHash: sha256Schema,
  groupId: recordIdSchema,
  gamePlanId: recordIdSchema,
  gamePlanHash: sha256Schema,
  parentAuthorizationReceiptId: recordIdSchema,
  parentAuthorizationReceiptHash: sha256Schema,
  parentSourceId: recordIdSchema,
  parentClipId: recordIdSchema,
  roleRequests: z.array(authorizedGameAssetRoleRequestSchema).min(1).max(15),
  replacementRoleIds: z.array(recordIdSchema).min(1).max(15),
  preservedCells: z.array(preservedActionSheetCellLineageSchema).min(1).max(15),
  outputs: z.array(authorizedGameAssetRoleOutputSchema).min(1).max(15),
  status: z.literal('succeeded'),
  startedAt: z.number().int().nonnegative(),
  completedAt: z.number().int().nonnegative(),
  signature: sha256Schema,
}).strict().superRefine((authorization, context) => {
  const replacementIds = new Set(authorization.replacementRoleIds)
  const outputIds = authorization.outputs.map(({ roleId }) => roleId)
  if (authorization.planId !== `game-asset-action-sheet-repair-preview:sha256:${authorization.requestDigest}`
    || authorization.completedAt < authorization.startedAt
    || authorization.roleRequests.length !== authorization.replacementRoleIds.length
    || authorization.outputs.length !== authorization.replacementRoleIds.length
    || authorization.roleRequests.some((request, index) => request.roleId !== authorization.replacementRoleIds[index])
    || new Set(authorization.replacementRoleIds).size !== authorization.replacementRoleIds.length
    || new Set(outputIds).size !== outputIds.length
    || outputIds.some((roleId, index) => roleId !== authorization.replacementRoleIds[index])
    || new Set(authorization.preservedCells.map(({ roleId }) => roleId)).size !== authorization.preservedCells.length
    || authorization.preservedCells.some(({ roleId }) => replacementIds.has(roleId))) {
    context.addIssue({ code: 'custom', message: 'Action-sheet repair authorization lineage and output closure are inconsistent.' })
  }
})
export type GameAssetActionSheetRepairAuthorization = z.infer<typeof gameAssetActionSheetRepairAuthorizationSchema>

export const gameAssetActionSheetPartialRepairAuthorizationSchema = z.object({
  protocol: z.literal(GAME_ASSET_ACTION_SHEET_PARTIAL_REPAIR_AUTHORIZATION_PROTOCOL),
  receiptId: recordIdSchema,
  receiptHash: sha256Schema,
  planId: z.string().regex(/^game-asset-action-sheet-partial-repair-preview:sha256:[a-f0-9]{64}$/),
  requestDigest: sha256Schema,
  executionId: recordIdSchema,
  executionMode: z.literal('byok-direct'),
  identity: z.object({ id: recordIdSchema, revision: recordIdSchema }).strict(),
  runId: recordIdSchema,
  providerId: recordIdSchema,
  model: z.enum(['qwen-image-3.0', 'qwen-image-3.0-pro']),
  familyPlanId: recordIdSchema,
  familyPlanHash: sha256Schema,
  groupId: recordIdSchema,
  gamePlanId: recordIdSchema,
  gamePlanHash: sha256Schema,
  parentAuthorizationReceiptId: recordIdSchema,
  parentAuthorizationReceiptHash: sha256Schema,
  parentSourceId: recordIdSchema,
  parentPartialId: z.string().regex(/^action-sheet-partial:sha256:[a-f0-9]{64}$/),
  roleRequests: z.array(authorizedGameAssetRoleRequestSchema).min(1).max(15),
  replacementRoleIds: z.array(recordIdSchema).min(1).max(15),
  preservedCells: z.array(preservedActionSheetCellLineageSchema).min(1).max(15),
  outputs: z.array(authorizedGameAssetRoleOutputSchema).min(1).max(15),
  status: z.literal('succeeded'),
  startedAt: z.number().int().nonnegative(),
  completedAt: z.number().int().nonnegative(),
  signature: sha256Schema,
}).strict().superRefine((authorization, context) => {
  const replacementIds = new Set(authorization.replacementRoleIds)
  if (authorization.planId !== `game-asset-action-sheet-partial-repair-preview:sha256:${authorization.requestDigest}`
    || authorization.completedAt < authorization.startedAt
    || authorization.roleRequests.length !== authorization.replacementRoleIds.length
    || authorization.outputs.length !== authorization.replacementRoleIds.length
    || authorization.roleRequests.some((request, index) => request.roleId !== authorization.replacementRoleIds[index])
    || authorization.outputs.some((output, index) => output.roleId !== authorization.replacementRoleIds[index])
    || new Set(authorization.replacementRoleIds).size !== authorization.replacementRoleIds.length
    || new Set(authorization.preservedCells.map(({ roleId }) => roleId)).size !== authorization.preservedCells.length
    || authorization.preservedCells.some(({ roleId }) => replacementIds.has(roleId))) {
    context.addIssue({ code: 'custom', message: 'Partial action-sheet repair authorization lineage and output closure are inconsistent.' })
  }
})
export type GameAssetActionSheetPartialRepairAuthorization = z.infer<typeof gameAssetActionSheetPartialRepairAuthorizationSchema>

export const gameAssetActionSheetPartialReprocessAuthorizationSchema = z.object({
  protocol: z.literal(GAME_ASSET_ACTION_SHEET_PARTIAL_REPROCESS_AUTHORIZATION_PROTOCOL),
  receiptId: recordIdSchema,
  receiptHash: sha256Schema,
  planId: z.string().regex(/^game-asset-action-sheet-partial-reprocess-preview:sha256:[a-f0-9]{64}$/),
  requestDigest: sha256Schema,
  executionId: recordIdSchema,
  executionMode: z.literal('local-deterministic'),
  identity: z.object({ id: recordIdSchema, revision: recordIdSchema }).strict(),
  runId: recordIdSchema,
  providerId: recordIdSchema,
  model: z.enum(['qwen-image-3.0', 'qwen-image-3.0-pro']),
  familyPlanId: recordIdSchema,
  familyPlanHash: sha256Schema,
  groupId: recordIdSchema,
  gamePlanId: recordIdSchema,
  gamePlanHash: sha256Schema,
  parentAuthorizationReceiptId: recordIdSchema,
  parentAuthorizationReceiptHash: sha256Schema,
  parentSourceId: recordIdSchema,
  parentPartialId: z.string().regex(/^action-sheet-partial:sha256:[a-f0-9]{64}$/),
  sourceReceiptId: recordIdSchema,
  sourceReceiptHash: sha256Schema,
  clipId: recordIdSchema,
  reprocessedRoleIds: z.array(recordIdSchema).min(1).max(15),
  preservedCells: z.array(preservedActionSheetCellLineageSchema).min(1).max(15),
  cells: z.array(authorizedActionSheetCellSchema).min(2).max(16),
  processorImplementation: z.union([
    z.literal(V9_GAME_ASSET_SPATIAL_BOARD_RASTER_PROCESSOR),
    z.literal(V10_GAME_ASSET_SPATIAL_BOARD_RASTER_PROCESSOR),
    z.literal(GAME_ASSET_SPATIAL_BOARD_RASTER_PROCESSOR),
  ]),
  providerCalls: z.literal(0),
  status: z.literal('succeeded'),
  startedAt: z.number().int().nonnegative(),
  completedAt: z.number().int().nonnegative(),
  signature: sha256Schema,
}).strict().superRefine((authorization, context) => {
  const reprocessed = new Set(authorization.reprocessedRoleIds)
  if (authorization.planId !== `game-asset-action-sheet-partial-reprocess-preview:sha256:${authorization.requestDigest}`
    || authorization.completedAt < authorization.startedAt
    || new Set(authorization.cells.map(({ roleId }) => roleId)).size !== authorization.cells.length
    || new Set(authorization.preservedCells.map(({ roleId }) => roleId)).size !== authorization.preservedCells.length
    || authorization.preservedCells.some(({ roleId }) => reprocessed.has(roleId))
    || authorization.cells.length !== authorization.preservedCells.length + authorization.reprocessedRoleIds.length) {
    context.addIssue({ code: 'custom', message: 'Local partial reprocess authorization lineage and complete cell closure are inconsistent.' })
  }
})
export type GameAssetActionSheetPartialReprocessAuthorization = z.infer<typeof gameAssetActionSheetPartialReprocessAuthorizationSchema>

const retainedActionSheetRepairFailureSchema = z.object({
  roleId: recordIdSchema,
  receipt: multimodalHostReceiptSchema,
  sourceMediaType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  sourceArtifactBytesBase64: retainedBase64Schema,
  failure: z.string().min(1).max(2_000),
}).strict().superRefine((attempt, context) => {
  if (attempt.receipt.semanticRole === undefined
    || attempt.receipt.artifact.mediaType !== attempt.sourceMediaType) {
    context.addIssue({ code: 'custom', message: 'Rejected action-sheet repair source drifted from its verified receipt.' })
  }
})

function nativeOptional<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => value === null ? undefined : value, schema.optional())
}

export const gameAssetActionSheetRepairApplyResultSchema = z.object({
  status: z.enum(['succeeded', 'failed']),
  parentSourceId: recordIdSchema,
  parentClipId: recordIdSchema,
  outputs: z.array(retainedGameAssetRoleOutputSchema).max(15),
  failedAttempt: nativeOptional(retainedActionSheetRepairFailureSchema),
  authorization: nativeOptional(gameAssetActionSheetRepairAuthorizationSchema),
  error: nativeOptional(z.string().min(1).max(2_000)),
}).strict().superRefine((result, context) => {
  const succeeded = result.status === 'succeeded'
  if (succeeded !== Boolean(result.authorization)
    || (succeeded && (result.outputs.length === 0 || result.failedAttempt || result.error))
    || (!succeeded && result.authorization)
    || (!succeeded && !result.error)
    || (result.failedAttempt && result.failedAttempt.failure !== result.error)
    || (result.failedAttempt && result.outputs.some(({ roleId }) => roleId === result.failedAttempt?.roleId))) {
    context.addIssue({ code: 'custom', message: 'Action-sheet repair execution result settlement is inconsistent.' })
  }
  if (result.authorization
    && (result.authorization.parentSourceId !== result.parentSourceId
      || result.authorization.parentClipId !== result.parentClipId
      || result.authorization.outputs.length !== result.outputs.length
      || result.authorization.outputs.some((authorized, index) => authorized.roleId !== result.outputs[index]?.roleId))) {
    context.addIssue({ code: 'custom', message: 'Action-sheet repair result drifted from its native authorization.' })
  }
})
export type GameAssetActionSheetRepairApplyResult = z.infer<typeof gameAssetActionSheetRepairApplyResultSchema>

export const gameAssetActionSheetPartialRepairApplyResultSchema = z.object({
  status: z.enum(['succeeded', 'failed']),
  parentSourceId: recordIdSchema,
  parentPartialId: z.string().regex(/^action-sheet-partial:sha256:[a-f0-9]{64}$/),
  outputs: z.array(retainedGameAssetRoleOutputSchema).max(15),
  failedAttempt: nativeOptional(retainedActionSheetRepairFailureSchema),
  authorization: nativeOptional(gameAssetActionSheetPartialRepairAuthorizationSchema),
  error: nativeOptional(z.string().min(1).max(2_000)),
}).strict().superRefine((result, context) => {
  const succeeded = result.status === 'succeeded'
  if (succeeded !== Boolean(result.authorization)
    || (succeeded && (result.outputs.length === 0 || result.failedAttempt || result.error))
    || (!succeeded && result.authorization)
    || (!succeeded && !result.error)
    || (result.failedAttempt && result.failedAttempt.failure !== result.error)
    || (result.failedAttempt && result.outputs.some(({ roleId }) => roleId === result.failedAttempt?.roleId))) {
    context.addIssue({ code: 'custom', message: 'Partial action-sheet repair execution settlement is inconsistent.' })
  }
  if (result.authorization
    && (result.authorization.parentSourceId !== result.parentSourceId
      || result.authorization.parentPartialId !== result.parentPartialId
      || result.authorization.outputs.length !== result.outputs.length
      || result.authorization.outputs.some((authorized, index) => authorized.roleId !== result.outputs[index]?.roleId))) {
    context.addIssue({ code: 'custom', message: 'Partial action-sheet repair result drifted from its native authorization.' })
  }
})
export type GameAssetActionSheetPartialRepairApplyResult = z.infer<typeof gameAssetActionSheetPartialRepairApplyResultSchema>

export const gameAssetActionSheetPartialReprocessApplyResultSchema = z.object({
  status: z.enum(['succeeded', 'failed']),
  parentSourceId: recordIdSchema,
  parentPartialId: z.string().regex(/^action-sheet-partial:sha256:[a-f0-9]{64}$/),
  clip: nativeOptional(gameAssetActionClipSchema),
  authorization: nativeOptional(gameAssetActionSheetPartialReprocessAuthorizationSchema),
  providerCalls: z.literal(0),
  error: nativeOptional(z.string().min(1).max(2_000)),
}).strict().superRefine((result, context) => {
  const succeeded = result.status === 'succeeded'
  if (succeeded !== Boolean(result.authorization)
    || succeeded !== Boolean(result.clip)
    || (succeeded && result.error)
    || (!succeeded && !result.error)) {
    context.addIssue({ code: 'custom', message: 'Local partial reprocess execution settlement is inconsistent.' })
  }
  if (result.authorization && result.clip
    && (result.authorization.parentSourceId !== result.parentSourceId
      || result.authorization.parentPartialId !== result.parentPartialId
      || result.authorization.clipId !== result.clip.id)) {
    context.addIssue({ code: 'custom', message: 'Local partial reprocess result drifted from its signed clip authority.' })
  }
})
export type GameAssetActionSheetPartialReprocessApplyResult = z.infer<typeof gameAssetActionSheetPartialReprocessApplyResultSchema>

export const gameAssetActionSheetApplyResultSchema = z.object({
  status: z.enum(['succeeded', 'partial', 'failed']),
  source: nativeOptional(gameAssetActionSourceSchema),
  clip: nativeOptional(gameAssetActionClipSchema),
  partial: nativeOptional(gameAssetActionSheetPartialSchema),
  authorization: nativeOptional(gameAssetActionSheetAuthorizationSchema),
  partialAuthorization: nativeOptional(gameAssetActionSheetPartialAuthorizationSchema),
  error: nativeOptional(z.string().min(1).max(2_000)),
}).strict().superRefine((result, context) => {
  const succeeded = result.status === 'succeeded'
  const partial = result.status === 'partial'
  if ((succeeded && (!result.source || !result.clip || !result.authorization
    || result.partial || result.partialAuthorization || result.error))
    || (partial && (!result.source || !result.partial || !result.partialAuthorization
      || result.clip || result.authorization || !result.error))
    || (result.status === 'failed' && (result.clip || result.partial
      || result.authorization || result.partialAuthorization || !result.error))) {
    context.addIssue({ code: 'custom', message: 'Action-sheet execution result settlement is inconsistent.' })
  }
  if (result.source && result.clip && result.authorization
    && (result.source.id !== result.authorization.sourceId
      || result.clip.id !== result.authorization.clipId
      || result.source.familyPlanId !== result.authorization.familyPlanId
      || result.clip.familyPlanId !== result.authorization.familyPlanId
      || result.source.groupId !== result.authorization.groupId
      || result.clip.groupId !== result.authorization.groupId)) {
    context.addIssue({ code: 'custom', message: 'Action-sheet result artifacts drifted from their native authorization.' })
  }
  if (result.source && result.partial && result.partialAuthorization
    && (result.source.id !== result.partialAuthorization.sourceId
      || result.partial.id !== result.partialAuthorization.partialId
      || result.partial.sourceId !== result.source.id
      || result.source.familyPlanId !== result.partialAuthorization.familyPlanId
      || result.partial.familyPlanId !== result.partialAuthorization.familyPlanId
      || result.source.groupId !== result.partialAuthorization.groupId
      || result.partial.groupId !== result.partialAuthorization.groupId)) {
    context.addIssue({ code: 'custom', message: 'Partial action-sheet result drifted from its native authorization.' })
  }
})
export type GameAssetActionSheetApplyResult = z.infer<typeof gameAssetActionSheetApplyResultSchema>

export const gameAssetScaleProfileSchema = z.object({
  version: z.literal(GAME_ASSET_SCALE_PROFILE_PROTOCOL),
  id: recordIdSchema,
  familyPlanId: recordIdSchema,
  masterClipId: recordIdSchema,
  masterClipHash: sha256Schema,
  compatibleClasses: z.array(z.literal('grounded-body')).min(1).max(1),
  canvas: pixelSizeSchema,
  measuredAlphaSize: pixelSizeSchema,
  anchorPolicy: gameAssetAnchorSchema,
  measuredAnchor: gameAssetAnchorPointSchema,
  identityLock: gameAssetEvidenceReferenceSchema,
  measurementImplementation: z.literal('rgba-alpha-bounds-v1'),
}).strict().superRefine((profile, context) => {
  if (profile.measuredAlphaSize.width > profile.canvas.width
    || profile.measuredAlphaSize.height > profile.canvas.height
    || profile.measuredAnchor.x < 0
    || profile.measuredAnchor.x > profile.canvas.width
    || profile.measuredAnchor.y < 0
    || profile.measuredAnchor.y > profile.canvas.height) {
    context.addIssue({ code: 'custom', message: 'Measured Game Asset scale profile geometry exceeds its master canvas.' })
  }
})
export type GameAssetScaleProfile = z.infer<typeof gameAssetScaleProfileSchema>

const clipReferenceSchema = z.object({
  clipId: recordIdSchema,
  clipHash: sha256Schema,
  groupId: recordIdSchema,
}).strict()

export const gameAssetFamilyAcceptanceSchema = z.object({
  version: z.literal(GAME_ASSET_FAMILY_ACCEPTANCE_PROTOCOL),
  receiptId: recordIdSchema,
  receiptHash: sha256Schema,
  familyPlanId: recordIdSchema,
  familyPlanHash: sha256Schema,
  scaleProfileId: recordIdSchema,
  scaleProfileHash: sha256Schema,
  acceptedClips: z.array(clipReferenceSchema).min(1).max(32),
  synchronizedRelationships: z.array(z.object({
    bodyGroupId: recordIdSchema,
    fxGroupId: recordIdSchema,
    origin: gameAssetAnchorPointSchema,
  }).strict()).max(32),
  verifierImplementationHash: sha256Schema,
  signature: sha256Schema,
}).strict().superRefine((acceptance, context) => {
  const clipIds = acceptance.acceptedClips.map(({ clipId }) => clipId)
  const groupIds = acceptance.acceptedClips.map(({ groupId }) => groupId)
  if (new Set(clipIds).size !== clipIds.length || new Set(groupIds).size !== groupIds.length) {
    context.addIssue({ code: 'custom', message: 'Family acceptance may bind each clip and action group only once.' })
  }
})
export type GameAssetFamilyAcceptance = z.infer<typeof gameAssetFamilyAcceptanceSchema>

export const gameAssetFamilyBundleSchema = z.object({
  version: z.literal(GAME_ASSET_FAMILY_BUNDLE_PROTOCOL),
  deliveryStatus: z.enum(['candidate', 'accepted']),
  compilerImplementation: z.literal(GAME_ASSET_FAMILY_ATLAS_COMPILER),
  familyPlan: gameAssetFamilyPlanSchema,
  familyPlanHash: sha256Schema,
  scaleProfile: gameAssetScaleProfileSchema,
  scaleProfileHash: sha256Schema,
  clips: z.array(gameAssetActionClipSchema).min(1).max(32),
  acceptance: gameAssetFamilyAcceptanceSchema.optional(),
  atlases: z.array(z.object({
    logicalPath: z.string().regex(/^atlases\/[a-z0-9][a-z0-9._-]*\.png$/),
    artifactId: artifactIdSchema,
    sha256: sha256Schema,
    byteLength: z.number().int().positive().max(384 * 1024 * 1024),
    width: z.number().int().positive().max(16_384),
    height: z.number().int().positive().max(16_384),
  }).strict()).min(1).max(32),
  animations: z.array(z.object({
    groupId: recordIdSchema,
    clipId: recordIdSchema,
    atlasArtifactId: artifactIdSchema,
    looping: z.boolean(),
    frameDurationMs: z.number().int().positive().max(10_000),
    roleIds: z.array(recordIdSchema).min(1).max(16),
  }).strict()).min(1).max(32),
}).strict().superRefine((bundle, context) => {
  const clipIds = new Set(bundle.clips.map(({ id }) => id))
  const groupIds = new Set(bundle.familyPlan.groups.map(({ id }) => id))
  const atlasIds = new Set(bundle.atlases.map(({ artifactId }) => artifactId))
  const acceptance = bundle.acceptance
  if ((bundle.deliveryStatus === 'accepted') !== Boolean(acceptance)
    || bundle.scaleProfile.familyPlanId !== bundle.familyPlan.id
    || bundle.clips.length !== bundle.familyPlan.groups.length
    || bundle.clips.some((clip) => (
      clip.familyPlanId !== bundle.familyPlan.id
      || !groupIds.has(clip.groupId)
    ))
    || bundle.animations.length !== bundle.clips.length
    || bundle.animations.some((animation) => (
      !clipIds.has(animation.clipId)
      || !groupIds.has(animation.groupId)
      || !atlasIds.has(animation.atlasArtifactId)
    ))
    || bundle.atlases.some((atlas) => atlas.artifactId !== `artifact:sha256:${atlas.sha256}`)
    || (acceptance && (
      acceptance.familyPlanId !== bundle.familyPlan.id
      || acceptance.familyPlanHash !== bundle.familyPlanHash
      || acceptance.scaleProfileId !== bundle.scaleProfile.id
      || acceptance.scaleProfileHash !== bundle.scaleProfileHash
      || acceptance.acceptedClips.length !== bundle.clips.length
      || acceptance.acceptedClips.some(({ clipId, groupId }) => (
        !clipIds.has(clipId) || !groupIds.has(groupId)
      ))
    ))) {
    context.addIssue({ code: 'custom', message: 'Game Asset family delivery closure is inconsistent.' })
  }
})
export type GameAssetFamilyBundle = z.infer<typeof gameAssetFamilyBundleSchema>

export const gameAssetFamilyAuthoringInputSchema = z.object({
  sourceText: safeBriefSchema,
  assetName: z.string().trim().min(1).max(120),
  kind: gameAssetKindSchema.exclude(['fx', 'projectile', 'impact', 'layered-map']),
  view: gameAssetViewSchema,
  direction: gameAssetDirectionSchema,
  frame: pixelSizeSchema,
  bodyAlphaTarget: pixelSizeSchema,
  fxAlphaTarget: pixelSizeSchema,
  identityReference: gameAssetEvidenceReferenceSchema,
  artDirectionEvidence: gameAssetEvidenceReferenceSchema,
  identityLock: gameAssetEvidenceReferenceSchema,
  provisionalScaleLock: gameAssetEvidenceReferenceSchema,
  bodyAnchorLock: gameAssetEvidenceReferenceSchema,
  fxAnchorLock: gameAssetEvidenceReferenceSchema,
}).strict().superRefine((input, context) => {
  const safeMargin = familySafeMargin(input.frame)
  const safeWidth = input.frame.width - safeMargin * 2
  const safeHeight = input.frame.height - safeMargin * 2
  if (input.bodyAlphaTarget.width > input.frame.width
    || input.bodyAlphaTarget.height > input.frame.height
    || input.fxAlphaTarget.width > input.frame.width
    || input.fxAlphaTarget.height > input.frame.height) {
    context.addIssue({ code: 'custom', message: 'Family alpha targets must fit within the output frame.' })
  }
  if (input.bodyAlphaTarget.width > safeWidth
    || input.bodyAlphaTarget.height > safeHeight
    || input.fxAlphaTarget.width > safeWidth
    || input.fxAlphaTarget.height > safeHeight) {
    context.addIssue({ code: 'custom', message: 'Family alpha targets must preserve the frame-derived safety margin.' })
  }
})
export type GameAssetFamilyAuthoringInput = z.infer<typeof gameAssetFamilyAuthoringInputSchema>

function sameEvidence(left: GameAssetEvidenceReference, right: GameAssetEvidenceReference): boolean {
  return left.id === right.id && left.revision === right.revision && left.contentHash === right.contentHash
}

function exactGrid(frameCount: number): { readonly rows: number, readonly columns: number } {
  for (let rows = Math.floor(Math.sqrt(frameCount)); rows >= 1; rows -= 1) {
    if (frameCount % rows === 0) return { rows, columns: frameCount / rows }
  }
  return { rows: 1, columns: frameCount }
}

export function familySafeMargin(
  frame: { readonly width: number, readonly height: number },
): number {
  const shortestSide = Math.min(frame.width, frame.height)
  return Math.max(1, Math.min(64, Math.floor(shortestSide / 16)))
}

function expectedAnchor(
  frame: { readonly width: number, readonly height: number },
  alpha: { readonly width: number, readonly height: number },
  anchor: 'bottom' | 'feet' | 'ignition-baseline',
): { readonly x: number, readonly y: number } {
  return anchor === 'ignition-baseline'
    ? { x: (frame.width - alpha.width) / 2, y: frame.height / 2 }
    : { x: frame.width / 2, y: (frame.height + alpha.height) / 2 }
}

type FamilySubjectKind = GameAssetFamilyAuthoringInput['kind']
type FamilyBodyAction = 'idle' | 'walk' | 'run' | 'attack' | 'cast' | 'shoot' | 'hurt' | 'charge'

interface FamilySubjectPolicy {
  readonly anchor: 'feet' | 'bottom'
  readonly subject: string
  readonly defaultActions: readonly FamilyBodyAction[]
}

interface ActionLibraryEntry {
  readonly action: FamilyBodyAction
  readonly label: string
  readonly frames: number
  readonly frameDurationMs: number
  readonly looping: boolean
  readonly cues: readonly RegExp[]
  readonly phases: readonly string[]
}

interface BoundedGroupSpec {
  readonly key: string
  readonly label: string
  readonly component: 'body' | 'detached-fx'
  readonly compatibilityClass: 'grounded-body' | 'detached-fx'
  readonly action: FamilyBodyAction | 'impact'
  readonly frames: number
  readonly frameDurationMs: number
  readonly looping: boolean
  readonly dependencyKeys: readonly string[]
  readonly synchronizedBodyKey?: string
  readonly phases: readonly string[]
}

interface FamilySemanticCues {
  readonly weapon: 'blade' | 'ranged' | 'generic' | null
  readonly detachedFx: boolean
  readonly detachedFxTarget: 'attack' | 'cast' | 'shoot' | null
}

const SUBJECT_POLICIES: Readonly<Record<FamilySubjectKind, FamilySubjectPolicy>> = Object.freeze({
  player: { anchor: 'feet', subject: 'player subject', defaultActions: ['idle', 'run'] },
  npc: { anchor: 'feet', subject: 'NPC subject', defaultActions: ['idle', 'walk'] },
  creature: { anchor: 'feet', subject: 'creature subject', defaultActions: ['idle', 'walk'] },
  prop: { anchor: 'bottom', subject: 'grounded prop', defaultActions: ['idle'] },
})

const ACTION_LIBRARY: readonly ActionLibraryEntry[] = Object.freeze([
  {
    action: 'idle', label: 'Idle', frames: 4, frameDurationMs: 160, looping: true,
    cues: [/\bidl(?:e|ing)\b/iu, /\bstand(?:ing)?\b/iu, /待机|静止|呼吸循环/iu],
    phases: [
      'This group is IDLE only: a subtle grounded hold loop with no locomotion or active action.',
      'Frame phases: neutral hold; slight compression; slight rise; return toward neutral.',
      'Keep the ground-contact baseline stable throughout the loop.',
    ],
  },
  {
    action: 'walk', label: 'Walk', frames: 6, frameDurationMs: 120, looping: true,
    cues: [/\bwalk(?:ing)?\b/iu, /行走|走路|步行|漫步/iu],
    phases: [
      'This group is WALK only: one continuous grounded locomotion cycle.',
      'Frame phases: contact; transfer; passing; opposite contact; opposite transfer; opposite passing.',
      'Keep cadence, scale, orientation, and the ground-contact baseline stable.',
    ],
  },
  {
    action: 'run', label: 'Run', frames: 6, frameDurationMs: 90, looping: true,
    cues: [/\brun(?:ning)?\b/iu, /\bsprint(?:ing)?\b/iu, /跑步|奔跑|疾跑/iu],
    phases: [
      'This group is RUN only: one continuous fast grounded locomotion cycle.',
      'Frame phases: contact; compression; passing; lift; opposite contact; opposite passing.',
      'Keep cadence, scale, orientation, and the ground-contact baseline stable.',
    ],
  },
  {
    action: 'attack', label: 'Attack', frames: 6, frameDurationMs: 80, looping: false,
    cues: [/\battack(?:ing)?\b/iu, /\bstrike\b/iu, /\bbite\b/iu, /\bpounce\b/iu, /攻击|近战|扑咬|撕咬|抓击|撞击|挥砍|劈砍/iu],
    phases: [
      'This group is ATTACK only: one continuous action, not a menu of unrelated poses.',
      'Frame phases: ready; anticipation; acceleration; contact pose; follow-through; recovery.',
      'Keep only the primary subject and its explicitly retained visible details.',
    ],
  },
  {
    action: 'cast', label: 'Cast', frames: 6, frameDurationMs: 100, looping: false,
    cues: [/\bcast(?:ing)?\b/iu, /\bspell\b/iu, /施法|法术|魔法/iu],
    phases: [
      'This group is CAST only: one continuous preparation and release gesture.',
      'Frame phases: ready; gather; focus; release; follow-through; recover.',
      'Keep the primary subject readable and spatially contained throughout the action.',
    ],
  },
  {
    action: 'shoot', label: 'Shoot', frames: 5, frameDurationMs: 90, looping: false,
    cues: [/\bshoot(?:ing)?\b/iu, /\bfire\b/iu, /射击|开火|发射/iu],
    phases: [
      'This group is SHOOT only: one continuous aim and release action.',
      'Frame phases: ready; aim; release; recoil; recover.',
      'Keep the primary subject readable and preserve the requested emission direction.',
    ],
  },
  {
    action: 'hurt', label: 'Hurt', frames: 4, frameDurationMs: 100, looping: false,
    cues: [/\bhurt\b/iu, /\bhit reaction\b/iu, /受击|受伤|硬直/iu],
    phases: [
      'This group is HURT only: one readable reaction followed by stabilization.',
      'Frame phases: contact reaction; maximum recoil; regain balance; settle.',
      'Preserve the primary subject identity and ground-contact baseline.',
    ],
  },
  {
    action: 'charge', label: 'Charge', frames: 6, frameDurationMs: 100, looping: false,
    cues: [/\bcharg(?:e|ing)\b/iu, /\bpower(?:ing)? up\b/iu, /蓄力|充能/iu],
    phases: [
      'This group is CHARGE only: one continuous buildup and settle action.',
      'Frame phases: neutral; initiate; build; peak; release tension; settle.',
      'Keep the primary subject readable and spatially contained throughout the action.',
    ],
  },
])

const ACTION_SHEET_NO_GROUND_CONSTRAINT = 'Do not render a ground plane, floor line, contact shadow, or horizontal baseline beneath any subject.'
const ACTION_SHEET_CELL_CONTAINMENT_CONSTRAINT = 'Keep every visible pixel of the requested subject spatially isolated inside its own cell; nothing may cross a cell boundary.'
const ACTION_SHEET_DETACHED_COMPONENT_SEPARATION = 'Do not render the separately requested detached visual in a primary-subject group; it belongs only in its dedicated detached-visual group.'
const FAMILY_AUTHORING_COMPILER = 'game-asset.family-authoring.v3' as const

function matchesAny(value: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value))
}

function semanticCues(sourceText: string): FamilySemanticCues {
  const deniesDetachedFx = /(?:不要|无需|不需要|无|without|no)\s*(?:独立|分离|detached|separate)?\s*(?:特效|效果|刀光|剑光|剑气|炮口火焰|fx|effects?|vfx)/iu.test(sourceText)
  const detachedFx = !deniesDetachedFx && matchesAny(sourceText, [
    /(?:独立|分离|单独)[^，。,.]{0,16}(?:特效|效果|刀光|剑光|剑气|冲击波|炮口火焰)/iu,
    /(?:detached|separate|isolated)[^,.]{0,24}(?:fx|effects?|vfx|slash arc|impact flash)/iu,
    /刀光|剑光|剑气|炮口火焰|独立特效|分离特效|slash arc|impact flash|muzzle flash/iu,
  ])
  const weapon = matchesAny(sourceText, [/刀|剑|blade|sword|katana/iu])
    ? 'blade'
    : matchesAny(sourceText, [/枪|弓|弩|gun|rifle|pistol|bow|crossbow/iu])
      ? 'ranged'
      : matchesAny(sourceText, [/武器|weapon/iu]) ? 'generic' : null
  const detachedFxTarget = matchesAny(sourceText, [/炮口火焰|muzzle flash/iu])
    ? 'shoot'
    : matchesAny(sourceText, [/刀光|剑光|剑气|slash arc/iu])
      ? 'attack'
      : detachedFx && matchesAny(sourceText, [/魔法|法术|spell|magic/iu]) ? 'cast' : null
  return { weapon, detachedFx, detachedFxTarget }
}

function inferBoundedActionProgram(
  input: GameAssetFamilyAuthoringInput,
): {
    readonly subjectPolicy: FamilySubjectPolicy
    readonly semanticCues: FamilySemanticCues
    readonly groups: readonly BoundedGroupSpec[]
  } {
  const subjectPolicy = SUBJECT_POLICIES[input.kind]
  const cues = semanticCues(input.sourceText)
  const detected = ACTION_LIBRARY.filter((entry) => matchesAny(input.sourceText, entry.cues))
  const selectedActions = new Set<FamilyBodyAction>(
    (detected.length ? detected.map(({ action }) => action) : subjectPolicy.defaultActions),
  )
  if (cues.detachedFxTarget) {
    selectedActions.add(cues.detachedFxTarget)
  } else if (cues.detachedFx && !['attack', 'cast', 'shoot', 'charge'].some((action) => selectedActions.has(action as FamilyBodyAction))) {
    selectedActions.add('attack')
  }
  if (!selectedActions.has('idle') && !selectedActions.has('run')) selectedActions.add('idle')
  const selected = ACTION_LIBRARY.filter(({ action }) => selectedActions.has(action))
  const master = selected.find(({ action }) => action === 'idle' || action === 'run')!
  const bodyGroups: BoundedGroupSpec[] = selected.map((entry) => ({
    key: entry.action,
    label: entry.label,
    component: 'body',
    compatibilityClass: 'grounded-body',
    action: entry.action,
    frames: entry.frames,
    frameDurationMs: entry.frameDurationMs,
    looping: entry.looping,
    dependencyKeys: entry.action === master.action ? [] : [master.action],
    phases: entry.phases,
  }))
  if (!cues.detachedFx) return { subjectPolicy, semanticCues: cues, groups: bodyGroups }
  const synchronized = selected.find(({ action }) => action === cues.detachedFxTarget)
    ?? [...selected].reverse().find(({ action }) => (
      action === 'attack' || action === 'cast' || action === 'shoot' || action === 'charge'
    ))!
  return {
    subjectPolicy,
    semanticCues: cues,
    groups: [...bodyGroups, {
      key: `${synchronized.action}-fx`,
      label: `${synchronized.label} FX`,
      component: 'detached-fx',
      compatibilityClass: 'detached-fx',
      action: 'impact',
      frames: synchronized.frames,
      frameDurationMs: synchronized.frameDurationMs,
      looping: false,
      dependencyKeys: [synchronized.action],
      synchronizedBodyKey: synchronized.action,
      phases: [
        `This group is the explicitly requested DETACHED VISUAL synchronized to the ${synchronized.action} action.`,
        synchronized.frames === 5
          ? 'Frame phases: empty/pre-ignition; ignition; peak; dissipation; clear.'
          : 'Frame phases: empty/pre-ignition; ignition; growth; peak; dissipation; nearly clear.',
        'Render only that detached visual with a stable origin and no primary subject.',
      ],
    }],
  }
}

function atomicPlan(
  input: GameAssetFamilyAuthoringInput,
  familyAssetId: string,
  familyHash: string,
  spec: BoundedGroupSpec,
  subjectPolicy: FamilySubjectPolicy,
): GameAssetPlan {
  const alphaTarget = spec.component === 'body' ? input.bodyAlphaTarget : input.fxAlphaTarget
  const anchor = spec.component === 'body' ? subjectPolicy.anchor : 'ignition-baseline' as const
  const anchorLock = spec.component === 'body' ? input.bodyAnchorLock : input.fxAnchorLock
  return gameAssetPlanSchema.parse({
    version: 'game-asset.plan.v1',
    id: `plan:${familyHash}:${spec.key}`,
    assetId: familyAssetId,
    kind: spec.component === 'body' ? input.kind : 'fx',
    view: input.view,
    artDirectionEvidence: [input.artDirectionEvidence],
    referenceArtifacts: [input.identityReference],
    roles: Array.from({ length: spec.frames }, (_, frameIndex) => ({
      id: `role:${familyHash}:${spec.key}:${frameIndex}`,
      assetId: familyAssetId,
      action: spec.action,
      direction: input.direction,
      frameIndex,
      outputSchema: { id: 'game-asset.frame', version: 1 },
      identityLock: input.identityLock,
      scaleLock: input.provisionalScaleLock,
      expectedAlphaSize: alphaTarget,
      anchorLock,
      anchor,
      expectedAnchor: expectedAnchor(input.frame, alphaTarget, anchor),
    })),
    delivery: {
      formatId: 'game-asset.atlas-manifest.v1',
      frameWidth: input.frame.width,
      frameHeight: input.frame.height,
      columns: spec.frames,
      rows: 1,
    },
  })
}

function actionSheetBrief(
  input: GameAssetFamilyAuthoringInput,
  spec: BoundedGroupSpec,
  grid: { readonly rows: number, readonly columns: number },
  subjectPolicy: FamilySubjectPolicy,
  cues: FamilySemanticCues,
  safeMargin: number,
): string {
  const subject = spec.component === 'body' ? `${input.assetName} ${subjectPolicy.subject}` : `${input.assetName} detached visual`
  const explicitWeaponDirection = spec.component === 'body' && (spec.action === 'attack' || spec.action === 'shoot')
    ? cues.weapon === 'blade'
      ? ['Preserve the explicitly requested bladed implement consistently across every phase.']
      : cues.weapon === 'ranged'
        ? ['Preserve the explicitly requested ranged implement consistently across every phase.']
        : cues.weapon === 'generic'
          ? ['Preserve the explicitly requested weapon consistently across every phase.']
          : []
    : []
  const explicitFxDirection = spec.component === 'detached-fx' && cues.weapon === 'blade'
    ? ['The detached visual is the explicitly requested blade-shaped slash arc with a stable palette and origin.']
    : []
  return [
    spec.component === 'body'
      ? 'Treat the accepted reference image as the sole source of primary-subject identity, palette, silhouette, visible details, and visual style.'
      : 'Treat the accepted reference image as the sole source of palette and visual style for the requested detached visual.',
    `Create one coherent ${grid.rows}x${grid.columns} action sheet for ${subject}.`,
    `The sheet contains exactly ${spec.frames} sequential ${spec.action} frames facing ${input.direction}; read left-to-right, top-to-bottom.`,
    ...spec.phases,
    ...explicitWeaponDirection,
    ...explicitFxDirection,
    ...(spec.component === 'body' && cues.detachedFx
      ? [ACTION_SHEET_DETACHED_COMPONENT_SEPARATION]
      : []),
    'Every cell has equal dimensions and a flat, uniform pure magenta (#FF00FF) background to all four cell edges.',
    `Keep every visible pixel inside the frame-derived safety margin of at least ${safeMargin} pixels on all four sides of its cell.`,
    spec.component === 'body'
      ? `Keep the accepted primary-subject identity, palette, silhouette, ${input.view} view, ${subjectPolicy.anchor} anchor, scale, and camera stable across every cell.`
      : 'Render only the explicitly requested detached visual with a stable ignition origin. Do not include the primary subject.',
    ACTION_SHEET_NO_GROUND_CONSTRAINT,
    ACTION_SHEET_CELL_CONTAINMENT_CONSTRAINT,
    'No labels, text, borders, gutters, grid lines, cast shadows, extra subjects, or composition outside the cells.',
  ].join('\n')
}

export async function compileDefaultGameAssetFamilyPlan(
  value: GameAssetFamilyAuthoringInput,
): Promise<GameAssetFamilyPlan> {
  const input = gameAssetFamilyAuthoringInputSchema.parse(value)
  const program = inferBoundedActionProgram(input)
  const safeMargin = familySafeMargin(input.frame)
  const familyHash = await fingerprint({
    compiler: FAMILY_AUTHORING_COMPILER,
    promptPolicy: {
      noGround: ACTION_SHEET_NO_GROUND_CONSTRAINT,
      cellContainment: ACTION_SHEET_CELL_CONTAINMENT_CONSTRAINT,
      detachedComponentSeparation: ACTION_SHEET_DETACHED_COMPONENT_SEPARATION,
    },
    sourceText: input.sourceText,
    assetName: input.assetName,
    kind: input.kind,
    view: input.view,
    direction: input.direction,
    subjectPolicy: program.subjectPolicy,
    semanticCues: program.semanticCues,
    actionProgram: program.groups.map((group) => ({
      key: group.key,
      label: group.label,
      component: group.component,
      compatibilityClass: group.compatibilityClass,
      action: group.action,
      frames: group.frames,
      frameDurationMs: group.frameDurationMs,
      looping: group.looping,
      dependencyKeys: group.dependencyKeys,
      ...(group.synchronizedBodyKey ? { synchronizedBodyKey: group.synchronizedBodyKey } : {}),
      phases: group.phases,
    })),
    geometry: {
      frame: input.frame,
      safeMargin,
      bodyAlphaTarget: input.bodyAlphaTarget,
      fxAlphaTarget: input.fxAlphaTarget,
    },
    evidence: [
      input.identityReference,
      input.artDirectionEvidence,
      input.identityLock,
      input.provisionalScaleLock,
      input.bodyAnchorLock,
      input.fxAnchorLock,
    ].sort((left, right) => compareGameAssetEvidenceIdentity(
      `${left.id}@${left.revision}`,
      `${right.id}@${right.revision}`,
    )),
  })
  const familyAssetId = `asset:game-family:${familyHash}`
  const groupId = (key: string) => `group:${familyHash}:${key}`
  const groups = program.groups.map((spec) => {
    const plan = atomicPlan(input, familyAssetId, familyHash, spec, program.subjectPolicy)
    const grid = exactGrid(spec.frames)
    return {
      id: groupId(spec.key),
      label: spec.label,
      component: spec.component,
      compatibilityClass: spec.compatibilityClass,
      action: spec.action,
      direction: input.direction,
      dependencies: spec.dependencyKeys.map(groupId),
      ...(spec.synchronizedBodyKey ? { synchronizedBodyGroupId: groupId(spec.synchronizedBodyKey) } : {}),
      timing: {
        frameDurationMs: spec.frameDurationMs,
        looping: spec.looping,
      },
      source: {
        strategy: 'coherent-grid' as const,
        rows: grid.rows,
        columns: grid.columns,
        initialProviderCallBudget: 1 as const,
      },
      sourceBrief: actionSheetBrief(input, spec, grid, program.subjectPolicy, program.semanticCues, safeMargin),
      plan,
    }
  })
  return gameAssetFamilyPlanSchema.parse({
    version: GAME_ASSET_FAMILY_PLAN_PROTOCOL,
    id: `family-plan:${familyHash}`,
    assetId: familyAssetId,
    kind: input.kind,
    view: input.view,
    identityReference: input.identityReference,
    artDirectionEvidence: input.artDirectionEvidence,
    groups,
    masterSelection: {
      policy: 'first-accepted-grounded-body',
      priorityGroupIds: program.groups
        .filter(({ component, action }) => component === 'body' && (action === 'idle' || action === 'run'))
        .map(({ key }) => groupId(key)),
    },
    delivery: {
      formatId: GAME_ASSET_FAMILY_BUNDLE_PROTOCOL,
      atlasPolicy: 'canonical-action-direction-frame',
      bodyFxPolicy: 'detached-origin-synchronized',
    },
  })
}

export async function compileGameAssetGroundedNormalizationSuccessorPlan(
  value: GameAssetFamilyPlan,
): Promise<GameAssetFamilyPlan> {
  const parent = gameAssetFamilyPlanSchema.parse(value)
  const parentPlanHash = await fingerprint(parent)
  const successorSeed = await fingerprint({
    version: 'game-asset.grounded-normalization-successor.v2',
    parentPlanHash,
    processorImplementation: GAME_ASSET_GROUNDED_NORMALIZATION_PROCESSOR,
    scalePolicy: GAME_ASSET_GROUNDED_NORMALIZATION_SCALE_POLICY,
    safeMargin: 32,
    futureFxBriefPolicy: 'no-ground-and-cell-containment-v1',
  })
  const successorAssetId = `asset:game-family:${successorSeed}`
  const successorGroupIds = parent.groups.map((group, index) => (
    `group:${successorSeed}:${index}:${group.action}`
  ))
  const parentGroupIndex = new Map(parent.groups.map((group, index) => [group.id, index]))
  const mappedGroupId = (parentId: string): string => {
    const index = parentGroupIndex.get(parentId)
    if (index === undefined) throw new Error(`Grounded normalization cannot map family group ${parentId}.`)
    return successorGroupIds[index]!
  }
  const groups = await Promise.all(parent.groups.map(async (group, groupIndex) => {
    const grounded = group.compatibilityClass === 'grounded-body'
    const roles = await Promise.all(group.plan.roles.map(async (role) => {
      const left = Math.floor(role.expectedAnchor.x)
      const right = Math.floor(group.plan.delivery.frameWidth - role.expectedAnchor.x)
      const safeWidth = (Math.min(left, right) - 32) * 2
      if (grounded && (role.anchor !== 'feet'
        || safeWidth < role.expectedAlphaSize.width
        || safeWidth <= 0)) {
        throw new Error(`Grounded normalization cannot derive a safe canvas for ${role.id}.`)
      }
      const expectedAlphaSize = grounded
        ? { width: safeWidth, height: role.expectedAlphaSize.height }
        : role.expectedAlphaSize
      const scaleLock = grounded
        ? await (async () => {
          const contentHash = await fingerprint({
            version: 'game-asset.grounded-normalization-lock.v1',
            parentScaleLock: role.scaleLock,
            expectedAlphaSize,
            processorImplementation: GAME_ASSET_GROUNDED_NORMALIZATION_PROCESSOR,
            scalePolicy: GAME_ASSET_GROUNDED_NORMALIZATION_SCALE_POLICY,
          })
          return {
            id: `evidence:game-asset-grounded-normalization-lock:${contentHash}`,
            revision: `revision:sha256:${contentHash}`,
            contentHash,
          }
        })()
        : role.scaleLock
      return {
        ...role,
        id: `role:${successorSeed}:${groupIndex}:${role.frameIndex}`,
        assetId: successorAssetId,
        scaleLock,
        expectedAlphaSize,
      }
    }))
    const roleIds = roles.map(({ id }) => id)
    return {
      ...group,
      id: successorGroupIds[groupIndex]!,
      dependencies: group.dependencies.map(mappedGroupId),
      ...(group.synchronizedBodyGroupId
        ? { synchronizedBodyGroupId: mappedGroupId(group.synchronizedBodyGroupId) }
        : {}),
      sourceBrief: group.compatibilityClass === 'detached-fx'
        ? [
            group.sourceBrief,
            ...[
              ACTION_SHEET_NO_GROUND_CONSTRAINT,
              ACTION_SHEET_CELL_CONTAINMENT_CONSTRAINT,
            ].filter((constraint) => !group.sourceBrief.includes(constraint)),
          ].join('\n')
        : group.sourceBrief,
      source: group.source.strategy === 'coherent-grid'
        ? group.source
        : { ...group.source, roleIds },
      plan: {
        ...group.plan,
        id: `plan:${successorSeed}:${groupIndex}`,
        assetId: successorAssetId,
        roles,
      },
    }
  }))
  return gameAssetFamilyPlanSchema.parse({
    ...parent,
    id: `family-plan:${successorSeed}`,
    assetId: successorAssetId,
    groups,
    masterSelection: {
      ...parent.masterSelection,
      priorityGroupIds: parent.masterSelection.priorityGroupIds.map(mappedGroupId),
    },
  })
}

export function normalizeGameAssetActionSheetPreviewInput(
  value: GameAssetActionSheetPreviewInput,
): GameAssetActionSheetPreviewInput {
  const input = gameAssetActionSheetPreviewInputSchema.parse(value)
  return {
    ...input,
    retainedEvidence: [...input.retainedEvidence].sort((left, right) => (
      compareGameAssetEvidenceIdentity(
        `${left.reference.id}@${left.reference.revision}`,
        `${right.reference.id}@${right.reference.revision}`,
      )
    )),
  }
}

export function normalizeGameAssetActionSheetRepairPreviewInput(
  value: GameAssetActionSheetRepairPreviewInput,
): GameAssetActionSheetRepairPreviewInput {
  return gameAssetActionSheetRepairPreviewInputSchema.parse(value)
}

export function normalizeGameAssetActionSheetPartialRepairPreviewInput(
  value: GameAssetActionSheetPartialRepairPreviewInput,
): GameAssetActionSheetPartialRepairPreviewInput {
  return gameAssetActionSheetPartialRepairPreviewInputSchema.parse(value)
}

export function normalizeGameAssetActionSheetPartialReprocessPreviewInput(
  value: GameAssetActionSheetPartialReprocessPreviewInput,
): GameAssetActionSheetPartialReprocessPreviewInput {
  return gameAssetActionSheetPartialReprocessPreviewInputSchema.parse(value)
}

export interface GameAssetActionSheetDesktopRunner {
  preview(input: GameAssetActionSheetPreviewInput): Promise<GameAssetActionSheetPreview>
  apply(planId: string, signal?: AbortSignal): Promise<GameAssetActionSheetApplyResult>
  verify(input: {
    readonly authorization: GameAssetActionSheetAuthorization
    readonly plan: GameAssetPlan
    readonly source: GameAssetActionSource
    readonly clip: GameAssetActionClip
  }): Promise<GameAssetActionSheetAuthorization>
  verifyPartial(input: {
    readonly authorization: GameAssetActionSheetPartialAuthorization
    readonly plan: GameAssetPlan
    readonly source: GameAssetActionSource
    readonly partial: GameAssetActionSheetPartial
  }): Promise<GameAssetActionSheetPartialAuthorization>
  previewRepair(input: GameAssetActionSheetRepairPreviewInput): Promise<GameAssetActionSheetRepairPreview>
  applyRepair(planId: string, signal?: AbortSignal): Promise<GameAssetActionSheetRepairApplyResult>
  verifyRepair(input: {
    readonly authorization: GameAssetActionSheetRepairAuthorization
    readonly plan: GameAssetPlan
    readonly parentAuthorization: GameAssetActionSheetAuthorization
    readonly parentSource: GameAssetActionSource
    readonly parentClip: GameAssetActionClip
    readonly outputs: readonly RetainedGameAssetRoleOutput[]
  }): Promise<GameAssetActionSheetRepairAuthorization>
  previewPartialRepair(input: GameAssetActionSheetPartialRepairPreviewInput): Promise<GameAssetActionSheetPartialRepairPreview>
  applyPartialRepair(planId: string, signal?: AbortSignal): Promise<GameAssetActionSheetPartialRepairApplyResult>
  verifyPartialRepair(input: {
    readonly authorization: GameAssetActionSheetPartialRepairAuthorization
    readonly plan: GameAssetPlan
    readonly parentAuthorization: GameAssetActionSheetPartialAuthorization
    readonly parentSource: GameAssetActionSource
    readonly parentPartial: GameAssetActionSheetPartial
    readonly outputs: readonly RetainedGameAssetRoleOutput[]
  }): Promise<GameAssetActionSheetPartialRepairAuthorization>
  previewPartialReprocess(input: GameAssetActionSheetPartialReprocessPreviewInput): Promise<GameAssetActionSheetPartialReprocessPreview>
  applyPartialReprocess(planId: string): Promise<GameAssetActionSheetPartialReprocessApplyResult>
  verifyPartialReprocess(input: {
    readonly authorization: GameAssetActionSheetPartialReprocessAuthorization
    readonly plan: GameAssetPlan
    readonly parentAuthorization: GameAssetActionSheetPartialAuthorization
    readonly parentSource: GameAssetActionSource
    readonly parentPartial: GameAssetActionSheetPartial
    readonly clip: GameAssetActionClip
  }): Promise<GameAssetActionSheetPartialReprocessAuthorization>
}

export function createGameAssetActionSheetDesktopRunner(): GameAssetActionSheetDesktopRunner {
  return {
    async preview(input) {
      return gameAssetActionSheetPreviewSchema.parse(await invoke(
        'preview_game_asset_action_sheet_generation',
        { input: normalizeGameAssetActionSheetPreviewInput(input) },
      ))
    },
    async apply(planId, signal) {
      return gameAssetActionSheetApplyResultSchema.parse(await invokeCancellableProxy(
        'apply_game_asset_action_sheet_generation',
        { planId: gameAssetActionSheetPreviewSchema.shape.planId.parse(planId) },
        signal,
      ))
    },
    async verify(input) {
      return verifyNativeGameAssetActionSheetAuthorization(input)
    },
    async verifyPartial(input) {
      return verifyNativeGameAssetActionSheetPartialAuthorization(input)
    },
    async previewRepair(input) {
      return gameAssetActionSheetRepairPreviewSchema.parse(await invoke(
        'preview_game_asset_action_sheet_repair',
        { input: normalizeGameAssetActionSheetRepairPreviewInput(input) },
      ))
    },
    async applyRepair(planId, signal) {
      return gameAssetActionSheetRepairApplyResultSchema.parse(await invokeCancellableProxy(
        'apply_game_asset_action_sheet_repair',
        { planId: gameAssetActionSheetRepairPreviewSchema.shape.planId.parse(planId) },
        signal,
      ))
    },
    async verifyRepair(input) {
      return verifyNativeGameAssetActionSheetRepairAuthorization(input)
    },
    async previewPartialRepair(input) {
      return gameAssetActionSheetPartialRepairPreviewSchema.parse(await invoke(
        'preview_game_asset_action_sheet_partial_repair',
        { input: normalizeGameAssetActionSheetPartialRepairPreviewInput(input) },
      ))
    },
    async applyPartialRepair(planId, signal) {
      return gameAssetActionSheetPartialRepairApplyResultSchema.parse(await invokeCancellableProxy(
        'apply_game_asset_action_sheet_partial_repair',
        { planId: gameAssetActionSheetPartialRepairPreviewSchema.shape.planId.parse(planId) },
        signal,
      ))
    },
    async verifyPartialRepair(input) {
      return verifyNativeGameAssetActionSheetPartialRepairAuthorization(input)
    },
    async previewPartialReprocess(input) {
      return gameAssetActionSheetPartialReprocessPreviewSchema.parse(await invoke(
        'preview_game_asset_action_sheet_partial_reprocess',
        { input: normalizeGameAssetActionSheetPartialReprocessPreviewInput(input) },
      ))
    },
    async applyPartialReprocess(planId) {
      return gameAssetActionSheetPartialReprocessApplyResultSchema.parse(await invoke(
        'apply_game_asset_action_sheet_partial_reprocess',
        { planId: gameAssetActionSheetPartialReprocessPreviewSchema.shape.planId.parse(planId) },
      ))
    },
    async verifyPartialReprocess(input) {
      return verifyNativeGameAssetActionSheetPartialReprocessAuthorization(input)
    },
  }
}

export async function verifyNativeGameAssetActionSheetAuthorization(input: {
  readonly authorization: GameAssetActionSheetAuthorization
  readonly plan: GameAssetPlan
  readonly source: GameAssetActionSource
  readonly clip: GameAssetActionClip
}): Promise<GameAssetActionSheetAuthorization> {
  return gameAssetActionSheetAuthorizationSchema.parse(await invoke(
    'verify_game_asset_action_sheet_authorization',
    {
      authorization: gameAssetActionSheetAuthorizationSchema.parse(input.authorization),
      plan: gameAssetPlanSchema.parse(input.plan),
      source: gameAssetActionSourceSchema.parse(input.source),
      clip: gameAssetActionClipSchema.parse(input.clip),
    },
  ))
}

export async function verifyNativeGameAssetActionSheetPartialAuthorization(input: {
  readonly authorization: GameAssetActionSheetPartialAuthorization
  readonly plan: GameAssetPlan
  readonly source: GameAssetActionSource
  readonly partial: GameAssetActionSheetPartial
}): Promise<GameAssetActionSheetPartialAuthorization> {
  return gameAssetActionSheetPartialAuthorizationSchema.parse(await invoke(
    'verify_game_asset_action_sheet_partial_authorization',
    {
      authorization: gameAssetActionSheetPartialAuthorizationSchema.parse(input.authorization),
      plan: gameAssetPlanSchema.parse(input.plan),
      source: gameAssetActionSourceSchema.parse(input.source),
      partial: gameAssetActionSheetPartialSchema.parse(input.partial),
    },
  ))
}

export async function verifyNativeGameAssetActionSheetRepairAuthorization(input: {
  readonly authorization: GameAssetActionSheetRepairAuthorization
  readonly plan: GameAssetPlan
  readonly parentAuthorization: GameAssetActionSheetAuthorization
  readonly parentSource: GameAssetActionSource
  readonly parentClip: GameAssetActionClip
  readonly outputs: readonly RetainedGameAssetRoleOutput[]
}): Promise<GameAssetActionSheetRepairAuthorization> {
  return gameAssetActionSheetRepairAuthorizationSchema.parse(await invoke(
    'verify_game_asset_action_sheet_repair_authorization',
    {
      authorization: gameAssetActionSheetRepairAuthorizationSchema.parse(input.authorization),
      plan: gameAssetPlanSchema.parse(input.plan),
      parentAuthorization: gameAssetActionSheetAuthorizationSchema.parse(input.parentAuthorization),
      parentSource: gameAssetActionSourceSchema.parse(input.parentSource),
      parentClip: gameAssetActionClipSchema.parse(input.parentClip),
      outputs: input.outputs.map((output) => retainedGameAssetRoleOutputSchema.parse(output)),
    },
  ))
}

export async function verifyNativeGameAssetActionSheetPartialRepairAuthorization(input: {
  readonly authorization: GameAssetActionSheetPartialRepairAuthorization
  readonly plan: GameAssetPlan
  readonly parentAuthorization: GameAssetActionSheetPartialAuthorization
  readonly parentSource: GameAssetActionSource
  readonly parentPartial: GameAssetActionSheetPartial
  readonly outputs: readonly RetainedGameAssetRoleOutput[]
}): Promise<GameAssetActionSheetPartialRepairAuthorization> {
  return gameAssetActionSheetPartialRepairAuthorizationSchema.parse(await invoke(
    'verify_game_asset_action_sheet_partial_repair_authorization',
    {
      authorization: gameAssetActionSheetPartialRepairAuthorizationSchema.parse(input.authorization),
      plan: gameAssetPlanSchema.parse(input.plan),
      parentAuthorization: gameAssetActionSheetPartialAuthorizationSchema.parse(input.parentAuthorization),
      parentSource: gameAssetActionSourceSchema.parse(input.parentSource),
      parentPartial: gameAssetActionSheetPartialSchema.parse(input.parentPartial),
      outputs: input.outputs.map((output) => retainedGameAssetRoleOutputSchema.parse(output)),
    },
  ))
}

export async function verifyNativeGameAssetActionSheetPartialReprocessAuthorization(input: {
  readonly authorization: GameAssetActionSheetPartialReprocessAuthorization
  readonly plan: GameAssetPlan
  readonly parentAuthorization: GameAssetActionSheetPartialAuthorization
  readonly parentSource: GameAssetActionSource
  readonly parentPartial: GameAssetActionSheetPartial
  readonly clip: GameAssetActionClip
}): Promise<GameAssetActionSheetPartialReprocessAuthorization> {
  return gameAssetActionSheetPartialReprocessAuthorizationSchema.parse(await invoke(
    'verify_game_asset_action_sheet_partial_reprocess_authorization',
    {
      authorization: gameAssetActionSheetPartialReprocessAuthorizationSchema.parse(input.authorization),
      plan: gameAssetPlanSchema.parse(input.plan),
      parentAuthorization: gameAssetActionSheetPartialAuthorizationSchema.parse(input.parentAuthorization),
      parentSource: gameAssetActionSourceSchema.parse(input.parentSource),
      parentPartial: gameAssetActionSheetPartialSchema.parse(input.parentPartial),
      clip: gameAssetActionClipSchema.parse(input.clip),
    },
  ))
}

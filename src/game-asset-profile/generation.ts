import { invoke } from '@tauri-apps/api/core'
import { z } from 'zod'
import { base64ToBytes } from '@/lib/image'
import { invokeCancellableProxy } from '@/services/ai/tauri-fetch'
import { multimodalHostReceiptSchema } from '@/multimodal-host/contracts'
import {
  compareGameAssetEvidenceIdentity,
  gameAssetEvidenceReferenceSchema,
  gameAssetPlanSchema,
} from './contracts'

export const GAME_ASSET_GENERATION_PREVIEW_PROTOCOL = 'cutout.game-asset-generation-preview.v2' as const
export const GAME_ASSET_GENERATION_AUTHORIZATION_PROTOCOL = 'cutout.game-asset-generation-authorization.v2' as const
export const GAME_ASSET_SEMANTIC_ACCEPTANCE_PREVIEW_PROTOCOL = 'cutout.game-asset-semantic-acceptance-preview.v1' as const
export const GAME_ASSET_SEMANTIC_ACCEPTANCE_PROTOCOL = 'cutout.game-asset-semantic-acceptance.v1' as const
export const GAME_ASSET_RASTER_PROCESSING_PROTOCOL = 'cutout.game-asset-raster-processing.v1' as const
export const LEGACY_GAME_ASSET_RASTER_PROCESSOR = 'cutout-white-border-flood-matte-rust-image-0.23-v1' as const
export const GAME_ASSET_RASTER_PROCESSOR = 'cutout-white-border-flood-matte-normalize-anchor-rust-image-0.23-v2' as const
export const GAME_ASSET_RASTER_SCALE_POLICY = 'contain-preserve-aspect' as const

const CREDENTIAL_SHAPED = /(?:\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b|\bBearer\s+[A-Za-z0-9._~+/-]+\b|(?:api[-_]?key|token|secret)\s*=\s*[^\s,;]+)/i
const MAX_RETAINED_EVIDENCE_BASE64_CHARACTERS = 89_478_488
const MAX_RETAINED_OUTPUT_BASE64_CHARACTERS = 134_217_732
const safeIdSchema = z.string().min(1).max(240).refine(
  (value) => !CREDENTIAL_SHAPED.test(value) && !/\p{Cc}/u.test(value),
  'Credential-shaped or control-character values are not accepted.',
)
const safePromptSchema = z.string().min(1).max(40_000).refine(
  (value) => value.trim().length > 0
    && !CREDENTIAL_SHAPED.test(value)
    && !value.split('').some((character) => /\p{Cc}/u.test(character) && character !== '\n' && character !== '\t'),
  'Game Asset prompts cannot contain credentials or unsafe control characters.',
)
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const gameAssetGenerationModelSchema = z.enum(['qwen-image-3.0', 'qwen-image-3.0-pro'])
const artifactIdSchema = z.string().regex(/^artifact:sha256:[a-f0-9]{64}$/)
const retainedGameAssetEvidenceInputSchema = z.object({
  reference: gameAssetEvidenceReferenceSchema,
  mediaType: z.enum(['application/json', 'image/png', 'image/jpeg', 'image/webp']),
  artifactBytesBase64: z.string().min(4).max(MAX_RETAINED_EVIDENCE_BASE64_CHARACTERS),
}).strict()

export const gameAssetPixelEvidenceSchema = z.object({
  implementation: z.literal('rgba-alpha-bounds-v1'),
  alphaThreshold: z.literal(8),
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
}).strict().superRefine((value, context) => {
  if (value.alphaBounds.x + value.alphaBounds.width > value.decodedWidth
    || value.alphaBounds.y + value.alphaBounds.height > value.decodedHeight) {
    context.addIssue({ code: 'custom', message: 'Game Asset pixel bounds exceed decoded output dimensions.' })
  }
})
export type GameAssetPixelEvidence = z.infer<typeof gameAssetPixelEvidenceSchema>

const rasterProcessingIdentityShape = {
  protocol: z.literal(GAME_ASSET_RASTER_PROCESSING_PROTOCOL),
  whiteThreshold: z.literal(246),
  backgroundAlphaMax: z.literal(8),
  sourceArtifactId: artifactIdSchema,
  sourceArtifactSha256: sha256Schema,
  outputArtifactId: artifactIdSchema,
  outputArtifactSha256: sha256Schema,
  outputByteLength: z.number().int().positive().max(96 * 1024 * 1024),
} as const
const rasterPixelSizeSchema = z.object({
  width: z.number().int().positive().max(16_384),
  height: z.number().int().positive().max(16_384),
}).strict()
const rasterAlphaBoundsSchema = z.object({
  x: z.number().int().nonnegative().max(16_384),
  y: z.number().int().nonnegative().max(16_384),
  width: z.number().int().positive().max(16_384),
  height: z.number().int().positive().max(16_384),
}).strict()
const legacyGameAssetRasterProcessingEvidenceSchema = z.object({
  ...rasterProcessingIdentityShape,
  implementation: z.literal(LEGACY_GAME_ASSET_RASTER_PROCESSOR),
}).strict()
const normalizedGameAssetRasterProcessingEvidenceSchema = z.object({
  ...rasterProcessingIdentityShape,
  implementation: z.literal(GAME_ASSET_RASTER_PROCESSOR),
  sourceAlphaBounds: rasterAlphaBoundsSchema,
  frameSize: rasterPixelSizeSchema,
  alphaTarget: rasterPixelSizeSchema,
  expectedAnchor: z.object({ x: z.number().finite(), y: z.number().finite() }).strict(),
  anchorPolicy: z.enum(['center', 'bottom', 'feet', 'ignition-baseline']),
  scalePolicy: z.literal(GAME_ASSET_RASTER_SCALE_POLICY),
  resizedSubjectSize: rasterPixelSizeSchema,
  placement: rasterAlphaBoundsSchema,
  outputAlphaBounds: rasterAlphaBoundsSchema,
}).strict().superRefine((evidence, context) => {
  if (evidence.alphaTarget.width > evidence.frameSize.width
    || evidence.alphaTarget.height > evidence.frameSize.height
    || evidence.resizedSubjectSize.width > evidence.alphaTarget.width
    || evidence.resizedSubjectSize.height > evidence.alphaTarget.height
    || evidence.placement.width !== evidence.resizedSubjectSize.width
    || evidence.placement.height !== evidence.resizedSubjectSize.height
    || evidence.placement.x + evidence.placement.width > evidence.frameSize.width
    || evidence.placement.y + evidence.placement.height > evidence.frameSize.height
    || evidence.outputAlphaBounds.x + evidence.outputAlphaBounds.width > evidence.frameSize.width
    || evidence.outputAlphaBounds.y + evidence.outputAlphaBounds.height > evidence.frameSize.height) {
    context.addIssue({ code: 'custom', message: 'Game Asset normalized raster geometry exceeds its signed frame or alpha envelope.' })
  }
})
export const gameAssetRasterProcessingEvidenceSchema = z.discriminatedUnion('implementation', [
  legacyGameAssetRasterProcessingEvidenceSchema,
  normalizedGameAssetRasterProcessingEvidenceSchema,
]).superRefine((evidence, context) => {
  if (evidence.sourceArtifactId !== `artifact:sha256:${evidence.sourceArtifactSha256}`
    || evidence.outputArtifactId !== `artifact:sha256:${evidence.outputArtifactSha256}`) {
    context.addIssue({ code: 'custom', message: 'Game Asset raster processing identities must equal their byte digests.' })
  }
})
export type GameAssetRasterProcessingEvidence = z.infer<typeof gameAssetRasterProcessingEvidenceSchema>

export const gameAssetGenerationPreviewSchema = z.object({
  protocol: z.literal(GAME_ASSET_GENERATION_PREVIEW_PROTOCOL),
  planId: z.string().regex(/^game-asset-preview:sha256:[a-f0-9]{64}$/),
  requestDigest: sha256Schema,
  runId: safeIdSchema,
  gamePlanId: safeIdSchema,
  providerId: safeIdSchema,
  model: gameAssetGenerationModelSchema,
  roleIds: z.array(safeIdSchema).min(1).max(16),
  referenceArtifactIds: z.array(artifactIdSchema).min(1).max(3),
  outputSize: z.string().regex(/^\d+x\d+$/),
  processorImplementation: z.literal(GAME_ASSET_RASTER_PROCESSOR),
  expiresAt: z.number().int().positive(),
  executionMode: z.literal('byok-direct'),
}).strict().superRefine((preview, context) => {
  if (preview.planId !== `game-asset-preview:sha256:${preview.requestDigest}`) {
    context.addIssue({ code: 'custom', message: 'Game Asset preview identity must equal its request digest.' })
  }
  if (new Set(preview.roleIds).size !== preview.roleIds.length
    || new Set(preview.referenceArtifactIds).size !== preview.referenceArtifactIds.length) {
    context.addIssue({ code: 'custom', message: 'Game Asset preview roles and references must be unique.' })
  }
})
export type GameAssetGenerationPreview = z.infer<typeof gameAssetGenerationPreviewSchema>

export const authorizedGameAssetRoleRequestSchema = z.object({
  roleId: safeIdSchema,
  requestId: safeIdSchema,
  prompt: safePromptSchema,
  promptHash: sha256Schema,
  semanticRole: safeIdSchema,
  nodeId: safeIdSchema,
  capabilityId: z.literal('capability:image-generation'),
  acceptedReferenceArtifactIds: z.array(artifactIdSchema).min(1).max(3),
  lockIds: z.array(safeIdSchema).min(1).max(256),
  anchorPolicy: z.enum(['center', 'bottom', 'feet', 'ignition-baseline']),
}).strict()

export const authorizedGameAssetRoleOutputSchema = z.object({
  roleId: safeIdSchema,
  receiptId: safeIdSchema,
  receiptHash: sha256Schema,
  sourceArtifactId: artifactIdSchema,
  sourceArtifactSha256: sha256Schema,
  artifactId: artifactIdSchema,
  artifactSha256: sha256Schema,
  processingEvidence: gameAssetRasterProcessingEvidenceSchema,
  pixelEvidence: gameAssetPixelEvidenceSchema,
}).strict().superRefine((output, context) => {
  if (output.sourceArtifactId !== `artifact:sha256:${output.sourceArtifactSha256}`
    || output.artifactId !== `artifact:sha256:${output.artifactSha256}`
    || output.sourceArtifactId !== output.processingEvidence.sourceArtifactId
    || output.sourceArtifactSha256 !== output.processingEvidence.sourceArtifactSha256
    || output.artifactId !== output.processingEvidence.outputArtifactId
    || output.artifactSha256 !== output.processingEvidence.outputArtifactSha256) {
    context.addIssue({ code: 'custom', message: 'Authorized Game Asset output identity must equal its digest.' })
  }
})

export const gameAssetGenerationAuthorizationSchema = z.object({
  protocol: z.literal(GAME_ASSET_GENERATION_AUTHORIZATION_PROTOCOL),
  receiptId: safeIdSchema,
  receiptHash: sha256Schema,
  planId: z.string().regex(/^game-asset-preview:sha256:[a-f0-9]{64}$/),
  requestDigest: sha256Schema,
  executionId: safeIdSchema,
  executionMode: z.literal('byok-direct'),
  identity: z.object({ id: safeIdSchema, revision: safeIdSchema }).strict(),
  runId: safeIdSchema,
  providerId: safeIdSchema,
  model: gameAssetGenerationModelSchema,
  gamePlanId: safeIdSchema,
  gamePlanHash: sha256Schema,
  outputSize: z.string().regex(/^\d+x\d+$/),
  processorImplementation: z.union([
    z.literal(GAME_ASSET_RASTER_PROCESSOR),
    z.literal(LEGACY_GAME_ASSET_RASTER_PROCESSOR),
  ]),
  roleRequests: z.array(authorizedGameAssetRoleRequestSchema).min(1).max(16),
  outputs: z.array(authorizedGameAssetRoleOutputSchema).min(1).max(16),
  status: z.literal('succeeded'),
  startedAt: z.number().int().nonnegative(),
  completedAt: z.number().int().nonnegative(),
  signature: sha256Schema,
}).strict().superRefine((authorization, context) => {
  if (authorization.planId !== `game-asset-preview:sha256:${authorization.requestDigest}`
    || authorization.completedAt < authorization.startedAt
    || authorization.roleRequests.length !== authorization.outputs.length
    || authorization.roleRequests.some((request, index) => request.roleId !== authorization.outputs[index]?.roleId)) {
    context.addIssue({ code: 'custom', message: 'Game Asset generation authorization closure is inconsistent.' })
  }
  if (new Set(authorization.roleRequests.map(({ roleId }) => roleId)).size !== authorization.roleRequests.length
    || new Set(authorization.outputs.map(({ roleId }) => roleId)).size !== authorization.outputs.length
    || new Set(authorization.outputs.map(({ sourceArtifactId }) => sourceArtifactId)).size !== authorization.outputs.length
    || new Set(authorization.outputs.map(({ artifactId }) => artifactId)).size !== authorization.outputs.length) {
    context.addIssue({ code: 'custom', message: 'Game Asset authorization roles and artifacts must be unique.' })
  }
})
export type GameAssetGenerationAuthorization = z.infer<typeof gameAssetGenerationAuthorizationSchema>

export const retainedGameAssetRoleOutputSchema = z.object({
  roleId: safeIdSchema,
  receipt: multimodalHostReceiptSchema,
  sourceMediaType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  sourceArtifactBytesBase64: z.string().min(4).max(MAX_RETAINED_OUTPUT_BASE64_CHARACTERS),
  mediaType: z.literal('image/png'),
  artifactBytesBase64: z.string().min(4).max(MAX_RETAINED_OUTPUT_BASE64_CHARACTERS),
  processingEvidence: gameAssetRasterProcessingEvidenceSchema,
  pixelEvidence: gameAssetPixelEvidenceSchema,
}).strict().superRefine((output, context) => {
  if (output.sourceMediaType !== output.receipt.artifact.mediaType
    || output.processingEvidence.sourceArtifactId !== output.receipt.artifact.artifactId
    || output.processingEvidence.sourceArtifactSha256 !== output.receipt.artifact.sha256) {
    context.addIssue({ code: 'custom', message: 'Retained Game Asset output must bind its exact native source receipt.' })
  }
})
export type RetainedGameAssetRoleOutput = z.infer<typeof retainedGameAssetRoleOutputSchema>

export const gameAssetSemanticAcceptanceDecisionSchema = z.object({
  roleId: safeIdSchema,
  referenceContinuity: z.literal('accepted'),
  roleReadability: z.literal('accepted'),
  styleConsistency: z.literal('accepted'),
}).strict()
export type GameAssetSemanticAcceptanceDecision = z.infer<typeof gameAssetSemanticAcceptanceDecisionSchema>

export const gameAssetSemanticAcceptancePreviewSchema = z.object({
  protocol: z.literal(GAME_ASSET_SEMANTIC_ACCEPTANCE_PREVIEW_PROTOCOL),
  previewId: z.string().regex(/^game-asset-acceptance-preview:sha256:[a-f0-9]{64}$/),
  reviewDigest: sha256Schema,
  generationReceiptId: safeIdSchema,
  generationReceiptHash: sha256Schema,
  planId: z.string().regex(/^game-asset-preview:sha256:[a-f0-9]{64}$/),
  runId: safeIdSchema,
  roleIds: z.array(safeIdSchema).min(1).max(16),
  artifactIds: z.array(artifactIdSchema).min(1).max(16),
  expiresAt: z.number().int().positive(),
  requiresApproval: z.literal(true),
}).strict().superRefine((preview, context) => {
  if (preview.previewId !== `game-asset-acceptance-preview:sha256:${preview.reviewDigest}`
    || preview.roleIds.length !== preview.artifactIds.length) {
    context.addIssue({ code: 'custom', message: 'Game Asset semantic acceptance preview closure is inconsistent.' })
  }
})
export type GameAssetSemanticAcceptancePreview = z.infer<typeof gameAssetSemanticAcceptancePreviewSchema>

export const gameAssetSemanticAcceptanceSchema = z.object({
  protocol: z.literal(GAME_ASSET_SEMANTIC_ACCEPTANCE_PROTOCOL),
  receiptId: safeIdSchema,
  receiptHash: sha256Schema,
  generationReceiptId: safeIdSchema,
  generationReceiptHash: sha256Schema,
  planId: z.string().regex(/^game-asset-preview:sha256:[a-f0-9]{64}$/),
  runId: safeIdSchema,
  producerId: safeIdSchema,
  reviewerKind: z.literal('native-local-human'),
  approvalId: safeIdSchema,
  decisions: z.array(gameAssetSemanticAcceptanceDecisionSchema).min(1).max(16),
  outputs: z.array(authorizedGameAssetRoleOutputSchema).min(1).max(16),
  acceptedAt: z.number().int().nonnegative(),
  signature: sha256Schema,
}).strict().superRefine((acceptance, context) => {
  if (acceptance.decisions.length !== acceptance.outputs.length
    || acceptance.decisions.some((decision, index) => decision.roleId !== acceptance.outputs[index]?.roleId)) {
    context.addIssue({ code: 'custom', message: 'Game Asset semantic acceptance must bind every exact output role.' })
  }
})
export type GameAssetSemanticAcceptance = z.infer<typeof gameAssetSemanticAcceptanceSchema>

export const gameAssetGenerationApplyResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('succeeded'),
    outputs: z.array(retainedGameAssetRoleOutputSchema).min(1).max(16),
    authorization: gameAssetGenerationAuthorizationSchema,
    error: z.null(),
  }).strict(),
  z.object({
    status: z.literal('partial'),
    outputs: z.array(retainedGameAssetRoleOutputSchema).max(15),
    authorization: z.null(),
    error: z.string().min(1).max(2_000),
  }).strict(),
])
export type GameAssetGenerationApplyResult = z.infer<typeof gameAssetGenerationApplyResultSchema>

export const gameAssetGenerationPreviewInputSchema = z.object({
  identity: z.object({ id: safeIdSchema, revision: safeIdSchema }).strict(),
  runId: safeIdSchema,
  providerId: safeIdSchema,
  model: gameAssetGenerationModelSchema,
  plan: gameAssetPlanSchema,
  retainedEvidence: z.array(retainedGameAssetEvidenceInputSchema).min(1).max(128),
  roles: z.array(z.object({ roleId: safeIdSchema, prompt: safePromptSchema }).strict()).min(1).max(16),
}).strict().superRefine((input, context) => {
  if (input.plan.roles.length !== input.roles.length
    || input.plan.roles.some((role, index) => role.id !== input.roles[index]?.roleId)) {
    context.addIssue({ code: 'custom', message: 'Game Asset prompts must match the exact ordered role closure.' })
  }
})
export type GameAssetGenerationPreviewInput = z.infer<typeof gameAssetGenerationPreviewInputSchema>

export function normalizeGameAssetGenerationPreviewInput(
  input: GameAssetGenerationPreviewInput,
): GameAssetGenerationPreviewInput {
  const parsed = gameAssetGenerationPreviewInputSchema.parse(input)
  return {
    ...parsed,
    retainedEvidence: [...parsed.retainedEvidence].sort((left, right) => compareGameAssetEvidenceIdentity(
      `${left.reference.id}@${left.reference.revision}`,
      `${right.reference.id}@${right.reference.revision}`,
    )),
  }
}

export interface GameAssetDesktopGenerationRunner {
  preview(input: GameAssetGenerationPreviewInput): Promise<GameAssetGenerationPreview>
  apply(planId: string, signal?: AbortSignal): Promise<GameAssetGenerationApplyResult>
  verify(input: {
    readonly authorization: GameAssetGenerationAuthorization
    readonly outputs: readonly RetainedGameAssetRoleOutput[]
  }): Promise<GameAssetGenerationAuthorization>
  previewAcceptance(input: {
    readonly authorization: GameAssetGenerationAuthorization
    readonly outputs: readonly RetainedGameAssetRoleOutput[]
    readonly decisions: readonly GameAssetSemanticAcceptanceDecision[]
  }): Promise<GameAssetSemanticAcceptancePreview>
  applyAcceptance(previewId: string): Promise<GameAssetSemanticAcceptance>
  verifyAcceptance(input: {
    readonly acceptance: GameAssetSemanticAcceptance
    readonly authorization: GameAssetGenerationAuthorization
    readonly outputs: readonly RetainedGameAssetRoleOutput[]
  }): Promise<GameAssetSemanticAcceptance>
}

export function createGameAssetDesktopGenerationRunner(): GameAssetDesktopGenerationRunner {
  return {
    async preview(input) {
      return gameAssetGenerationPreviewSchema.parse(await invoke(
        'preview_game_asset_generation',
        { input: normalizeGameAssetGenerationPreviewInput(input) },
      ))
    },
    async apply(planId, signal) {
      return gameAssetGenerationApplyResultSchema.parse(await invokeCancellableProxy(
        'apply_game_asset_generation',
        { planId: gameAssetGenerationPreviewSchema.shape.planId.parse(planId) },
        signal,
      ))
    },
    async verify(input) {
      return verifyNativeGameAssetGenerationAuthorization(input)
    },
    async previewAcceptance(input) {
      return gameAssetSemanticAcceptancePreviewSchema.parse(await invoke(
        'preview_game_asset_semantic_acceptance',
        {
          authorization: gameAssetGenerationAuthorizationSchema.parse(input.authorization),
          outputs: input.outputs.map((output) => retainedGameAssetRoleOutputSchema.parse(output)),
          decisions: input.decisions.map((decision) => gameAssetSemanticAcceptanceDecisionSchema.parse(decision)),
        },
      ))
    },
    async applyAcceptance(previewId) {
      return gameAssetSemanticAcceptanceSchema.parse(await invoke(
        'apply_game_asset_semantic_acceptance',
        { previewId: gameAssetSemanticAcceptancePreviewSchema.shape.previewId.parse(previewId) },
      ))
    },
    async verifyAcceptance(input) {
      return verifyNativeGameAssetSemanticAcceptance(input)
    },
  }
}

export async function verifyNativeGameAssetGenerationAuthorization(input: {
  readonly authorization: GameAssetGenerationAuthorization
  readonly outputs: readonly RetainedGameAssetRoleOutput[]
}): Promise<GameAssetGenerationAuthorization> {
  return gameAssetGenerationAuthorizationSchema.parse(await invoke(
    'verify_game_asset_generation_authorization',
    {
      authorization: gameAssetGenerationAuthorizationSchema.parse(input.authorization),
      outputs: input.outputs.map((output) => retainedGameAssetRoleOutputSchema.parse(output)),
    },
  ))
}

export function decodeRetainedGameAssetRoleBytes(output: RetainedGameAssetRoleOutput): Uint8Array {
  return base64ToBytes(retainedGameAssetRoleOutputSchema.parse(output).artifactBytesBase64)
}

export function decodeRetainedGameAssetRoleSourceBytes(output: RetainedGameAssetRoleOutput): Uint8Array {
  return base64ToBytes(retainedGameAssetRoleOutputSchema.parse(output).sourceArtifactBytesBase64)
}

export async function verifyNativeGameAssetSemanticAcceptance(input: {
  readonly acceptance: GameAssetSemanticAcceptance
  readonly authorization: GameAssetGenerationAuthorization
  readonly outputs: readonly RetainedGameAssetRoleOutput[]
}): Promise<GameAssetSemanticAcceptance> {
  return gameAssetSemanticAcceptanceSchema.parse(await invoke(
    'verify_game_asset_semantic_acceptance',
    {
      acceptance: gameAssetSemanticAcceptanceSchema.parse(input.acceptance),
      authorization: gameAssetGenerationAuthorizationSchema.parse(input.authorization),
      outputs: input.outputs.map((output) => retainedGameAssetRoleOutputSchema.parse(output)),
    },
  ))
}

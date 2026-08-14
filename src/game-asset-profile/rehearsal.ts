import { z } from 'zod'
import { sha256Bytes } from '@/asset-production/hash'
import { canonicalJson, fingerprint } from '@/design-ir/fingerprint'
import { fingerprintTrustedImplementation } from '@/design-profile-platform/registries'
import { readRasterDimensions } from '@/lib/raster-dimensions'
import {
  multimodalHostReceiptSchema,
  verifiedMultimodalHostArtifactSchema,
  type MultimodalHostReceipt,
} from '@/multimodal-host/contracts'
import { verifyNativeMultimodalHostArtifact } from '@/multimodal-host/desktop-host'
import {
  compareGameAssetEvidenceIdentity,
  gameAssetEvidenceReferenceSchema,
  gameAssetAlphaBoundsSchema,
  gameAssetAnchorPointSchema,
  gameAssetEvaluationSchema,
  gameAssetPlanSchema,
  observedGameAssetFrameSchema,
  type GameAssetEvidenceReference,
  type GameAssetPlan,
  type ObservedGameAssetFrame,
} from './contracts'
import { evaluateGameAssetFrames } from './evaluation'
import {
  gameAssetGenerationAuthorizationSchema,
  gameAssetPixelEvidenceSchema,
  gameAssetRasterProcessingEvidenceSchema,
  GAME_ASSET_RASTER_PROCESSOR,
  GAME_ASSET_RASTER_SCALE_POLICY,
  LEGACY_GAME_ASSET_RASTER_PROCESSOR,
  gameAssetSemanticAcceptanceSchema,
  retainedGameAssetRoleOutputSchema,
  verifyNativeGameAssetGenerationAuthorization,
  verifyNativeGameAssetSemanticAcceptance,
  type GameAssetGenerationAuthorization,
  type GameAssetPixelEvidence,
  type GameAssetRasterProcessingEvidence,
  type GameAssetSemanticAcceptance,
} from './generation'

const MAX_RETAINED_BASE64_CHARACTERS = 256 * 1024 * 1024
const GAME_ASSET_GENERATION_CAPABILITY_ID = 'capability:image-generation'
const artifactIdSchema = z.string().regex(/^artifact:sha256:[a-f0-9]{64}$/)
const retainedMediaTypeSchema = z.enum([
  'application/json',
  'image/png',
  'image/jpeg',
  'image/webp',
])
const base64Schema = z.string()
  .min(4)
  .max(MAX_RETAINED_BASE64_CHARACTERS)
  .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)

export const retainedGameAssetEvidenceSchema = z.object({
  reference: gameAssetEvidenceReferenceSchema,
  mediaType: retainedMediaTypeSchema,
  artifactBytesBase64: base64Schema,
}).strict()
export type RetainedGameAssetEvidence = z.infer<typeof retainedGameAssetEvidenceSchema>

export const retainedGameAssetFrameSchema = z.object({
  roleId: z.string().min(1).max(240),
  receipt: multimodalHostReceiptSchema,
  sourceArtifactBytesBase64: base64Schema,
  artifactBytesBase64: base64Schema,
  processingEvidence: gameAssetRasterProcessingEvidenceSchema,
  pixelEvidence: gameAssetPixelEvidenceSchema,
}).strict()
export type RetainedGameAssetFrame = z.infer<typeof retainedGameAssetFrameSchema>

export const gameAssetProductionRehearsalBundleSchema = z.object({
  schema: z.literal('game-asset.production-rehearsal.v1'),
  identity: z.object({
    id: z.string().min(1).max(240),
    revision: z.string().min(1).max(240),
  }).strict(),
  runId: z.string().min(1).max(240),
  plan: gameAssetPlanSchema,
  authorization: gameAssetGenerationAuthorizationSchema,
  semanticAcceptance: gameAssetSemanticAcceptanceSchema.optional(),
  retainedEvidence: z.array(retainedGameAssetEvidenceSchema).min(1).max(10_000),
  frames: z.array(retainedGameAssetFrameSchema).min(1).max(20_000),
}).strict().superRefine((bundle, context) => {
  const retainedCharacters = bundle.retainedEvidence.reduce(
    (total, evidence) => total + evidence.artifactBytesBase64.length,
    0,
  ) + bundle.frames.reduce(
    (total, frame) => total
      + frame.sourceArtifactBytesBase64.length
      + frame.artifactBytesBase64.length,
    0,
  )
  if (retainedCharacters > MAX_RETAINED_BASE64_CHARACTERS) {
    context.addIssue({ code: 'custom', message: 'Game Asset rehearsal retained bytes exceed the bounded run budget.' })
  }
  if (new Set(bundle.frames.map(({ roleId }) => roleId)).size !== bundle.frames.length) {
    context.addIssue({ code: 'custom', message: 'Game Asset rehearsal frame roles must be unique.' })
  }
})
export type GameAssetProductionRehearsalBundle = z.infer<typeof gameAssetProductionRehearsalBundleSchema>

export interface VerifiedGameAssetEvidenceBytes {
  readonly reference: GameAssetEvidenceReference
  readonly mediaType: z.infer<typeof retainedMediaTypeSchema>
  readonly byteLength: number
  readonly dimensions?: { readonly width: number, readonly height: number }
}

export interface VerifiedGameAssetFrame {
  readonly roleId: string
  readonly generationReceipt: MultimodalHostReceipt
  readonly sourceArtifactId: string
  readonly sourceContentHash: string
  readonly sourceMediaType: 'image/png' | 'image/jpeg' | 'image/webp'
  readonly artifactId: string
  readonly contentHash: string
  readonly mediaType: 'image/png'
  readonly byteLength: number
  readonly decodedWidth: number
  readonly decodedHeight: number
  readonly pixelEvidence: GameAssetPixelEvidence
  readonly processingEvidence: GameAssetRasterProcessingEvidence
  readonly observedFrame: ObservedGameAssetFrame
}

export interface VerifiedGameAssetProductionRehearsal {
  readonly identity: GameAssetProductionRehearsalBundle['identity']
  readonly runId: string
  readonly bundleHash: string
  readonly planHash: string
  readonly retainedEvidence: readonly VerifiedGameAssetEvidenceBytes[]
  readonly frames: readonly VerifiedGameAssetFrame[]
  readonly authorization: GameAssetGenerationAuthorization
  readonly deterministicInspectionClosure: {
    readonly status: 'complete'
    readonly roleIds: readonly string[]
  }
  readonly semanticAcceptanceClosure: {
    readonly status: 'complete' | 'blocked'
    readonly missingRoleIds: readonly string[]
    readonly acceptance?: GameAssetSemanticAcceptance
  }
  readonly evaluation: z.infer<typeof gameAssetEvaluationSchema>
}

function bytesFromBase64(value: string): Uint8Array {
  const binary = atob(base64Schema.parse(value))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function exactArray(actual: readonly string[], expected: readonly string[], label: string): void {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new Error(`${label} must match the exact Game Asset rehearsal closure.`)
  }
}

function exactGameAssetReferences(plan: GameAssetPlan): readonly GameAssetEvidenceReference[] {
  const references = [
    ...plan.artDirectionEvidence,
    ...plan.referenceArtifacts,
    ...plan.roles.flatMap((role) => [role.identityLock, role.scaleLock, role.anchorLock]),
  ]
  const byIdentity = new Map<string, GameAssetEvidenceReference>()
  for (const reference of references) {
    const key = `${reference.id}@${reference.revision}`
    const existing = byIdentity.get(key)
    if (existing && existing.contentHash !== reference.contentHash) {
      throw new Error(`Game Asset plan has conflicting evidence hashes for ${key}.`)
    }
    byIdentity.set(key, reference)
  }
  return [...byIdentity.values()].sort((left, right) => compareGameAssetEvidenceIdentity(
    `${left.id}@${left.revision}`,
    `${right.id}@${right.revision}`,
  ))
}

function mediaTypeFromBytes(bytes: Uint8Array): VerifiedGameAssetEvidenceBytes['mediaType'] | undefined {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50
    && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 12
    && new TextDecoder().decode(bytes.subarray(0, 4)) === 'RIFF'
    && new TextDecoder().decode(bytes.subarray(8, 12)) === 'WEBP') return 'image/webp'
  try {
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    return 'application/json'
  } catch {
    return undefined
  }
}

async function verifyRetainedPlanEvidence(
  bundle: GameAssetProductionRehearsalBundle,
): Promise<readonly VerifiedGameAssetEvidenceBytes[]> {
  const expected = exactGameAssetReferences(bundle.plan)
  exactArray(
    bundle.retainedEvidence.map(({ reference }) => `${reference.id}@${reference.revision}`),
    expected.map((reference) => `${reference.id}@${reference.revision}`),
    'Retained plan evidence references',
  )
  const referenceArtifactIds = new Set(bundle.plan.referenceArtifacts.map(({ id }) => id))
  const verified: VerifiedGameAssetEvidenceBytes[] = []
  for (let index = 0; index < bundle.retainedEvidence.length; index += 1) {
    const retained = bundle.retainedEvidence[index]!
    const expectedReference = expected[index]!
    if (canonicalJson(retained.reference) !== canonicalJson(expectedReference)) {
      throw new Error(`Retained plan evidence changed its exact reference: ${expectedReference.id}`)
    }
    const bytes = bytesFromBase64(retained.artifactBytesBase64)
    const contentHash = await sha256Bytes(bytes)
    const mediaType = mediaTypeFromBytes(bytes)
    if (contentHash !== expectedReference.contentHash || mediaType !== retained.mediaType) {
      throw new Error(`Retained plan evidence does not match its bytes: ${expectedReference.id}`)
    }
    const dimensions = readRasterDimensions(bytes) ?? undefined
    if (retained.mediaType.startsWith('image/') !== (dimensions !== undefined)) {
      throw new Error(`Retained plan evidence media cannot be decoded as declared: ${expectedReference.id}`)
    }
    if (referenceArtifactIds.has(expectedReference.id)
      && (expectedReference.id !== `artifact:sha256:${contentHash}` || !dimensions)) {
      throw new Error(`Game Asset reference artifact is not a retained content-addressed image: ${expectedReference.id}`)
    }
    verified.push({
      reference: expectedReference,
      mediaType: retained.mediaType,
      byteLength: bytes.byteLength,
      ...(dimensions ? { dimensions } : {}),
    })
  }
  return verified
}

function generationNodeId(roleId: string): string {
  return `node:game-asset-frame:${roleId}`
}

async function signedGenerationLocks(
  plan: GameAssetPlan,
  role: GameAssetPlan['roles'][number],
): Promise<readonly string[]> {
  const planHash = await fingerprint(plan)
  const references = [
    ...plan.artDirectionEvidence,
    ...plan.referenceArtifacts,
    role.identityLock,
    role.scaleLock,
    role.anchorLock,
  ]
  const uniqueReferences = new Map<string, GameAssetEvidenceReference>()
  for (const reference of references) uniqueReferences.set(`${reference.id}@${reference.revision}`, reference)
  return [
    `game-asset-plan:sha256:${planHash}`,
    ...await Promise.all([...uniqueReferences.values()]
      .sort((left, right) => compareGameAssetEvidenceIdentity(
        `${left.id}@${left.revision}`,
        `${right.id}@${right.revision}`,
      ))
      .map(async (reference) => `game-asset-evidence:sha256:${await fingerprint(reference)}`)),
  ]
}

async function assertGenerationAuthorizationClosure(
  bundle: GameAssetProductionRehearsalBundle,
  authorization: GameAssetGenerationAuthorization,
): Promise<void> {
  const planHash = await fingerprint(bundle.plan)
  const outputSize = `${bundle.plan.delivery.frameWidth}x${bundle.plan.delivery.frameHeight}`
  if (authorization.identity.id !== bundle.identity.id
    || authorization.identity.revision !== bundle.identity.revision
    || authorization.runId !== bundle.runId
    || authorization.gamePlanId !== bundle.plan.id
    || authorization.gamePlanHash !== planHash
    || authorization.outputSize !== outputSize
    || ![GAME_ASSET_RASTER_PROCESSOR, LEGACY_GAME_ASSET_RASTER_PROCESSOR]
      .includes(authorization.processorImplementation)) {
    throw new Error('Game Asset generation authorization does not bind the exact rehearsal identity, run, Plan, or output size.')
  }
  exactArray(
    authorization.roleRequests.map(({ roleId }) => roleId),
    bundle.plan.roles.map(({ id }) => id),
    'Authorized Game Asset role requests',
  )
  const referenceArtifactIds = bundle.plan.referenceArtifacts.map(({ id }) => artifactIdSchema.parse(id))
  for (let index = 0; index < bundle.plan.roles.length; index += 1) {
    const role = bundle.plan.roles[index]!
    const request = authorization.roleRequests[index]!
    if (request.semanticRole !== role.id
      || request.nodeId !== generationNodeId(role.id)
      || request.capabilityId !== GAME_ASSET_GENERATION_CAPABILITY_ID
      || request.anchorPolicy !== role.anchor
      || request.promptHash !== await sha256Bytes(new TextEncoder().encode(request.prompt))) {
      throw new Error(`Authorized Game Asset request does not bind the exact role and prompt: ${role.id}`)
    }
    const output = authorization.outputs[index]!
    if (authorization.processorImplementation === GAME_ASSET_RASTER_PROCESSOR) {
      const processing = output.processingEvidence
      if (processing.implementation !== GAME_ASSET_RASTER_PROCESSOR
        || canonicalJson(processing.frameSize) !== canonicalJson({
          width: bundle.plan.delivery.frameWidth,
          height: bundle.plan.delivery.frameHeight,
        })
        || canonicalJson(processing.alphaTarget) !== canonicalJson(role.expectedAlphaSize)
        || canonicalJson(processing.expectedAnchor) !== canonicalJson(role.expectedAnchor)
        || processing.anchorPolicy !== role.anchor
        || processing.scalePolicy !== GAME_ASSET_RASTER_SCALE_POLICY
        || canonicalJson(processing.outputAlphaBounds) !== canonicalJson(output.pixelEvidence.alphaBounds)) {
        throw new Error(`Authorized Game Asset output does not bind the exact normalized geometry: ${role.id}`)
      }
    } else if (output.processingEvidence.implementation !== LEGACY_GAME_ASSET_RASTER_PROCESSOR) {
      throw new Error(`Authorized Game Asset legacy output changed its processor identity: ${role.id}`)
    }
    exactArray(request.acceptedReferenceArtifactIds, referenceArtifactIds, `Authorized Game Asset role ${role.id} references`)
    exactArray(request.lockIds, await signedGenerationLocks(bundle.plan, role), `Authorized Game Asset role ${role.id} locks`)
  }
  const roleRequests = authorization.roleRequests.map(({ anchorPolicy: _anchorPolicy, ...request }) => request)
  const requestDigest = await fingerprint({
    identity: bundle.identity,
    runId: bundle.runId,
    providerId: authorization.providerId,
    model: authorization.model,
    plan: bundle.plan,
    retainedEvidence: bundle.retainedEvidence.map((evidence) => ({
      reference: evidence.reference,
      mediaType: evidence.mediaType,
      byteLength: bytesFromBase64(evidence.artifactBytesBase64).byteLength,
    })),
    roles: roleRequests,
    outputSize,
    processorImplementation: authorization.processorImplementation,
  })
  if (authorization.requestDigest !== requestDigest
    || authorization.planId !== `game-asset-preview:sha256:${requestDigest}`) {
    throw new Error('Game Asset generation authorization request digest cannot be reconstructed from retained evidence.')
  }
}

function assertReceiptContext(input: {
  readonly receipt: MultimodalHostReceipt
  readonly runId: string
  readonly semanticRole: string
  readonly nodeId: string
  readonly capabilityId: string
  readonly operation: MultimodalHostReceipt['operation']
  readonly acceptedReferenceArtifactIds: readonly string[]
  readonly lockIds: readonly string[]
  readonly label: string
}): void {
  if (input.receipt.runId !== input.runId
    || input.receipt.semanticRole !== input.semanticRole
    || input.receipt.nodeId !== input.nodeId
    || input.receipt.capabilityId !== input.capabilityId
    || input.receipt.operation !== input.operation) {
    throw new Error(`${input.label} is not bound to the exact run, semantic role, Plan node, and capability.`)
  }
  exactArray(input.receipt.acceptedReferenceArtifactIds, input.acceptedReferenceArtifactIds, `${input.label} references`)
  exactArray(input.receipt.lockIds, input.lockIds, `${input.label} locks`)
}

async function verifyNativeRetainedArtifact(input: {
  readonly receipt: MultimodalHostReceipt
  readonly bytes: Uint8Array
  readonly label: string
}): Promise<void> {
  const contentHash = await sha256Bytes(input.bytes)
  if (contentHash !== input.receipt.artifact.sha256
    || input.bytes.byteLength !== input.receipt.artifact.byteLength
    || input.receipt.artifact.artifactId !== `artifact:sha256:${contentHash}`) {
    throw new Error(`${input.label} does not match its retained artifact bytes.`)
  }
  const verified = verifiedMultimodalHostArtifactSchema.parse(
    await verifyNativeMultimodalHostArtifact({ receipt: input.receipt, bytes: input.bytes }),
  )
  if (canonicalJson(verified.receipt) !== canonicalJson(input.receipt)
    || canonicalJson(verified.artifact) !== canonicalJson(input.receipt.artifact)) {
    throw new Error(`${input.label} verifier changed or failed to authenticate the retained receipt.`)
  }
}

export async function verifyGameAssetProductionRehearsalBundle(
  input: unknown,
): Promise<VerifiedGameAssetProductionRehearsal> {
  const bundle = gameAssetProductionRehearsalBundleSchema.parse(input)
  const retainedEvidence = await verifyRetainedPlanEvidence(bundle)
  const retainedOutputs = bundle.frames.map((frame) => retainedGameAssetRoleOutputSchema.parse({
    roleId: frame.roleId,
    receipt: frame.receipt,
    sourceMediaType: frame.receipt.artifact.mediaType,
    sourceArtifactBytesBase64: frame.sourceArtifactBytesBase64,
    mediaType: 'image/png',
    artifactBytesBase64: frame.artifactBytesBase64,
    processingEvidence: frame.processingEvidence,
    pixelEvidence: frame.pixelEvidence,
  }))
  const authorization = gameAssetGenerationAuthorizationSchema.parse(
    await verifyNativeGameAssetGenerationAuthorization({
      authorization: bundle.authorization,
      outputs: retainedOutputs,
    }),
  )
  const semanticAcceptance = bundle.semanticAcceptance
    ? gameAssetSemanticAcceptanceSchema.parse(await verifyNativeGameAssetSemanticAcceptance({
        acceptance: bundle.semanticAcceptance,
        authorization,
        outputs: retainedOutputs,
      }))
    : undefined
  await assertGenerationAuthorizationClosure(bundle, authorization)
  exactArray(
    bundle.frames.map(({ roleId }) => roleId),
    bundle.plan.roles.map(({ id }) => id),
    'Retained Game Asset frame roles',
  )
  const generatedReceiptIds = bundle.frames.map(({ receipt }) => receipt.receiptId)
  if (new Set(generatedReceiptIds).size !== generatedReceiptIds.length) {
    throw new Error('Game Asset generation receipt ids must be unique.')
  }
  const generatedRequestIds = bundle.frames.map(({ receipt }) => receipt.requestId)
  if (new Set(generatedRequestIds).size !== generatedRequestIds.length) {
    throw new Error('Game Asset generation request ids must be unique.')
  }
  const sourceArtifactIds = bundle.frames.map(({ receipt }) => receipt.artifact.artifactId)
  const processedArtifactIds = authorization.outputs.map(({ artifactId }) => artifactId)
  if (new Set(sourceArtifactIds).size !== sourceArtifactIds.length
    || new Set(processedArtifactIds).size !== processedArtifactIds.length) {
    throw new Error('Game Asset source and processed artifacts must each be unique across semantic roles.')
  }
  const referenceArtifactIds = bundle.plan.referenceArtifacts.map(({ id }) => artifactIdSchema.parse(id))
  const frames: VerifiedGameAssetFrame[] = []
  const observedFrames: ObservedGameAssetFrame[] = []
  for (let index = 0; index < bundle.frames.length; index += 1) {
    const retained = bundle.frames[index]!
    const role = bundle.plan.roles[index]!
    const authorizedOutput = authorization.outputs[index]!
    const sourceBytes = bytesFromBase64(retained.sourceArtifactBytesBase64)
    const bytes = bytesFromBase64(retained.artifactBytesBase64)
    await verifyNativeRetainedArtifact({
      receipt: retained.receipt,
      bytes: sourceBytes,
      label: `Game Asset generated source ${role.id}`,
    })
    const sourceArtifact = retained.receipt.artifact
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(sourceArtifact.mediaType)
      || !sourceArtifact.width || !sourceArtifact.height
      || authorizedOutput.sourceArtifactId !== sourceArtifact.artifactId
      || authorizedOutput.sourceArtifactSha256 !== sourceArtifact.sha256) {
      throw new Error(`Game Asset generated source is not an authorized retained image: ${role.id}`)
    }
    const contentHash = await sha256Bytes(bytes)
    if (contentHash !== authorizedOutput.artifactSha256
      || authorizedOutput.artifactId !== `artifact:sha256:${contentHash}`
      || retained.processingEvidence.outputByteLength !== bytes.byteLength
      || canonicalJson(retained.processingEvidence) !== canonicalJson(authorizedOutput.processingEvidence)) {
      throw new Error(`Game Asset processed frame does not match its authorized processing evidence: ${role.id}`)
    }
    const decodedDimensions = readRasterDimensions(bytes)
    if (!decodedDimensions || retained.processingEvidence.protocol !== 'cutout.game-asset-raster-processing.v1') {
      throw new Error(`Game Asset processed frame is not a decoded retained PNG: ${role.id}`)
    }
    const generationLocks = await signedGenerationLocks(bundle.plan, role)
    assertReceiptContext({
      receipt: retained.receipt,
      runId: bundle.runId,
      semanticRole: role.id,
      nodeId: generationNodeId(role.id),
      capabilityId: GAME_ASSET_GENERATION_CAPABILITY_ID,
      operation: 'image-edit',
      acceptedReferenceArtifactIds: referenceArtifactIds,
      lockIds: generationLocks,
      label: `Game Asset generated frame ${role.id}`,
    })
    const verified: VerifiedGameAssetFrame = {
      roleId: role.id,
      generationReceipt: retained.receipt,
      sourceArtifactId: sourceArtifact.artifactId,
      sourceContentHash: sourceArtifact.sha256,
      sourceMediaType: sourceArtifact.mediaType as VerifiedGameAssetFrame['sourceMediaType'],
      artifactId: authorizedOutput.artifactId,
      contentHash,
      mediaType: 'image/png',
      byteLength: bytes.byteLength,
      decodedWidth: decodedDimensions.width,
      decodedHeight: decodedDimensions.height,
      pixelEvidence: retained.pixelEvidence,
      processingEvidence: retained.processingEvidence,
      observedFrame: observedGameAssetFrameSchema.parse({
        roleId: role.id,
        artifactId: authorizedOutput.artifactId,
        artifactRevision: retained.receipt.receiptId,
        contentHash,
        decodedWidth: retained.pixelEvidence.decodedWidth,
        decodedHeight: retained.pixelEvidence.decodedHeight,
        alphaBounds: retained.pixelEvidence.alphaBounds,
        edgeContact: retained.pixelEvidence.edgeContact,
        anchor: retained.pixelEvidence.anchor,
        identityLock: role.identityLock,
        scaleLock: role.scaleLock,
        anchorLock: role.anchorLock,
        sourceArtifacts: bundle.plan.referenceArtifacts,
      }),
    }
    observedFrames.push(verified.observedFrame)
    frames.push(verified)
  }
  return {
    identity: bundle.identity,
    runId: bundle.runId,
    bundleHash: await fingerprint(bundle),
    planHash: await fingerprint(bundle.plan),
    authorization,
    retainedEvidence,
    frames,
    deterministicInspectionClosure: {
      status: 'complete',
      roleIds: bundle.plan.roles.map(({ id }) => id),
    },
    semanticAcceptanceClosure: {
      status: semanticAcceptance ? 'complete' : 'blocked',
      missingRoleIds: semanticAcceptance ? [] : bundle.plan.roles.map(({ id }) => id),
      ...(semanticAcceptance ? { acceptance: semanticAcceptance } : {}),
    },
    evaluation: evaluateGameAssetFrames({ plan: bundle.plan, frames: observedFrames }),
  }
}

export async function fingerprintGameAssetRehearsalVerifier(): Promise<string> {
  return fingerprintTrustedImplementation({
    id: 'implementation:game-asset-retained-evidence-verifier',
    functions: [
      verifyGameAssetProductionRehearsalBundle,
      verifyRetainedPlanEvidence,
      verifyNativeRetainedArtifact,
      assertGenerationAuthorizationClosure,
      signedGenerationLocks,
      assertReceiptContext,
      exactGameAssetReferences,
      compareGameAssetEvidenceIdentity,
      exactArray,
      mediaTypeFromBytes,
      bytesFromBase64,
      generationNodeId,
      readRasterDimensions,
      sha256Bytes,
      verifyNativeMultimodalHostArtifact,
      verifyNativeGameAssetGenerationAuthorization,
      verifyNativeGameAssetSemanticAcceptance,
      evaluateGameAssetFrames,
    ],
    schemas: [
      gameAssetProductionRehearsalBundleSchema,
      retainedGameAssetEvidenceSchema,
      retainedGameAssetFrameSchema,
      gameAssetGenerationAuthorizationSchema,
      gameAssetPixelEvidenceSchema,
      gameAssetRasterProcessingEvidenceSchema,
      retainedGameAssetRoleOutputSchema,
      gameAssetSemanticAcceptanceSchema,
      gameAssetPlanSchema,
      observedGameAssetFrameSchema,
      gameAssetEvaluationSchema,
      gameAssetAlphaBoundsSchema,
      gameAssetAnchorPointSchema,
      multimodalHostReceiptSchema,
      verifiedMultimodalHostArtifactSchema,
    ],
    constants: [
      MAX_RETAINED_BASE64_CHARACTERS,
      GAME_ASSET_GENERATION_CAPABILITY_ID,
      GAME_ASSET_RASTER_PROCESSOR,
      LEGACY_GAME_ASSET_RASTER_PROCESSOR,
      GAME_ASSET_RASTER_SCALE_POLICY,
    ],
  })
}

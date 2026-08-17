import { invoke } from '@tauri-apps/api/core'
import { z } from 'zod'
import { sha256Bytes } from '@/asset-production/hash'
import { canonicalJson, fingerprint } from '@/design-ir/fingerprint'
import { recordIdSchema, sha256Schema } from '@/design-os-kernel/contracts'
import { base64ToBytes } from '@/lib/image'
import {
  createMultimodalDesktopHost,
  type MultimodalDesktopHost,
} from '@/multimodal-host/desktop-host'
import { multimodalHostReceiptSchema } from '@/multimodal-host/contracts'
import {
  GAME_MAP_OCCLUSION_TOLERANT_SPATIAL_BOARD_RASTER_PROCESSOR,
  gameAssetPixelEvidenceSchema,
  gameAssetRasterProcessingEvidenceSchema,
} from './generation'
import { compileGameMapProductionPlan } from './map-authoring'
import {
  fingerprintGameMapObjectLibrary,
  fingerprintGameMapProductionPlan,
  fingerprintGameMapRuntimeManifest,
  gameMapAcceptedArtifactSchema,
  gameMapObjectLibrarySchema,
  gameMapProductionPlanSchema,
  gameMapRuntimeManifestSchema,
  type GameMapProductionPlan,
} from './map'
import {
  composeGameMapPreview,
  gameMapRasterInputSchema,
  gameMapRuntimeProcessingInputSchema,
  nativeGameMapPreviewSchema,
  validateGameMapRuntime,
} from './map-production'

export const GAME_MAP_LIVE_ARTIFACT_PROTOCOL = 'cutout.game-map-live-artifact.v1' as const
export const GAME_MAP_ARTIFACT_ADMISSION_PROTOCOL = 'cutout.game-map-artifact-admission.v1' as const
export const GAME_MAP_RUNTIME_PNG_PROCESSOR = 'cutout-game-map-runtime-png-rust-image-0.23-v1' as const
export const GAME_MAP_SEMANTIC_ACCEPTANCE_PROTOCOL = 'game-map.semantic-acceptance.v1' as const
export const GAME_MAP_SEMANTIC_ACCEPTANCE_VERIFIER = 'cutout-game-map-semantic-acceptance-native-replay-rust-image-0.23-v1' as const

const boundedBase64Schema = z.string().min(4).max(128 * 1024 * 1024)
const pixelSizeSchema = z.object({
  width: z.number().int().positive().max(16_384),
  height: z.number().int().positive().max(16_384),
}).strict()
const floatPointSchema = z.object({ x: z.number().finite(), y: z.number().finite() }).strict()

export const gameMapLiveArtifactProcessingSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('runtime-png') }).strict(),
  z.object({
    kind: z.literal('object-cutout'),
    frameSize: pixelSizeSchema,
    alphaTarget: pixelSizeSchema,
    expectedAnchor: floatPointSchema,
    anchorPolicy: z.enum(['center', 'bottom', 'feet']),
  }).strict(),
])
export type GameMapLiveArtifactProcessing = z.infer<typeof gameMapLiveArtifactProcessingSchema>

const runtimePngProcessingEvidenceSchema = z.object({
  protocol: z.literal('cutout.game-map-runtime-png-processing.v1'),
  implementation: z.literal(GAME_MAP_RUNTIME_PNG_PROCESSOR),
  sourceArtifactId: z.string().regex(/^artifact:sha256:[a-f0-9]{64}$/),
  sourceArtifactSha256: sha256Schema,
  outputArtifactId: z.string().regex(/^artifact:sha256:[a-f0-9]{64}$/),
  outputArtifactSha256: sha256Schema,
  outputByteLength: z.number().int().positive().max(64 * 1024 * 1024),
  decodedSize: pixelSizeSchema,
}).strict()

export const gameMapArtifactAdmissionReceiptSchema = z.object({
  protocol: z.literal(GAME_MAP_ARTIFACT_ADMISSION_PROTOCOL),
  receiptId: recordIdSchema,
  receiptHash: sha256Schema,
  binding: gameMapRasterInputSchema.shape.binding,
  sourceReceiptId: recordIdSchema,
  sourceReceiptHash: sha256Schema,
  sourceArtifactId: z.string().regex(/^artifact:sha256:[a-f0-9]{64}$/),
  sourceArtifactSha256: sha256Schema,
  outputArtifactId: z.string().regex(/^artifact:sha256:[a-f0-9]{64}$/),
  outputArtifactSha256: sha256Schema,
  outputByteLength: z.number().int().positive().max(64 * 1024 * 1024),
  decodedSize: pixelSizeSchema,
  processing: gameMapLiveArtifactProcessingSchema,
  processingEvidenceHash: sha256Schema,
  admittedAt: z.number().int().nonnegative(),
  signature: sha256Schema,
}).strict()
export type GameMapArtifactAdmissionReceipt = z.infer<typeof gameMapArtifactAdmissionReceiptSchema>

export const gameMapLiveArtifactSchema = z.object({
  protocol: z.literal(GAME_MAP_LIVE_ARTIFACT_PROTOCOL),
  binding: gameMapRasterInputSchema.shape.binding,
  sourceReceipt: multimodalHostReceiptSchema,
  sourceArtifactBytesBase64: boundedBase64Schema,
  processing: gameMapLiveArtifactProcessingSchema,
  processingEvidence: z.union([
    runtimePngProcessingEvidenceSchema,
    gameAssetRasterProcessingEvidenceSchema,
  ]),
  pixelEvidence: gameAssetPixelEvidenceSchema.optional(),
  acceptedArtifact: gameMapAcceptedArtifactSchema,
  mediaType: z.literal('image/png'),
  bytesBase64: boundedBase64Schema,
  decodedSize: pixelSizeSchema,
  admission: gameMapArtifactAdmissionReceiptSchema,
}).strict().superRefine((artifact, context) => {
  const runtime = artifact.processing.kind === 'runtime-png'
  const runtimeBinding = artifact.binding.kind === 'runtime-visual'
  const evidenceDecodedSize = 'decodedSize' in artifact.processingEvidence
    ? artifact.processingEvidence.decodedSize
    : 'frameSize' in artifact.processingEvidence
      ? artifact.processingEvidence.frameSize
      : undefined
  if (runtime !== (artifact.processingEvidence.implementation === GAME_MAP_RUNTIME_PNG_PROCESSOR)
    || runtime !== (artifact.pixelEvidence === undefined)
    || runtime !== runtimeBinding
    || artifact.binding.kind === 'extraction-source'
    || canonicalJson(artifact.admission.binding) !== canonicalJson(artifact.binding)
    || canonicalJson(artifact.admission.processing) !== canonicalJson(artifact.processing)
    || artifact.admission.sourceReceiptId !== artifact.sourceReceipt.receiptId
    || artifact.admission.sourceReceiptHash !== artifact.sourceReceipt.receiptHash
    || artifact.admission.sourceArtifactId !== artifact.sourceReceipt.artifact.artifactId
    || artifact.admission.sourceArtifactSha256 !== artifact.sourceReceipt.artifact.sha256
    || artifact.admission.outputArtifactId !== artifact.acceptedArtifact.artifact.id
    || artifact.admission.outputArtifactSha256 !== artifact.acceptedArtifact.artifact.contentHash
    || artifact.admission.outputByteLength !== artifact.processingEvidence.outputByteLength
    || artifact.processingEvidence.sourceArtifactId !== artifact.sourceReceipt.artifact.artifactId
    || artifact.processingEvidence.sourceArtifactSha256 !== artifact.sourceReceipt.artifact.sha256
    || artifact.processingEvidence.outputArtifactId !== artifact.acceptedArtifact.artifact.id
    || artifact.processingEvidence.outputArtifactSha256 !== artifact.acceptedArtifact.artifact.contentHash
    || canonicalJson(artifact.admission.decodedSize) !== canonicalJson(artifact.decodedSize)
    || canonicalJson(evidenceDecodedSize) !== canonicalJson(artifact.decodedSize)
    || artifact.acceptedArtifact.acceptance.receiptId !== artifact.admission.receiptId
    || artifact.acceptedArtifact.acceptance.receiptHash !== artifact.admission.receiptHash) {
    context.addIssue({ code: 'custom', message: 'Live Game Map artifact does not close its source, processing, output, and admission identities.' })
  }
  if (!runtime && (artifact.processing.kind !== 'object-cutout'
    || !artifact.pixelEvidence
    || artifact.pixelEvidence.decodedWidth !== artifact.decodedSize.width
    || artifact.pixelEvidence.decodedHeight !== artifact.decodedSize.height)) {
    context.addIssue({ code: 'custom', message: 'Live Game Map object cutout evidence must bind its exact decoded output.' })
  }
  if (!runtime && artifact.processingEvidence.implementation !== GAME_MAP_OCCLUSION_TOLERANT_SPATIAL_BOARD_RASTER_PROCESSOR) {
    context.addIssue({ code: 'custom', message: 'Live Game Map objects require the reviewed spatial-board cutout processor.' })
  }
})
export type GameMapLiveArtifact = z.infer<typeof gameMapLiveArtifactSchema>

export const gameMapSemanticReviewDecisionSchema = z.object({
  subjectId: recordIdSchema,
  criterion: z.enum([
    'visual-role-fidelity',
    'object-cutout-quality',
    'runtime-composition',
    'authored-geometry',
    'terrain-grid-coherence',
  ]),
  status: z.enum(['accepted', 'rejected']),
  reviewerKind: z.enum(['local-agent-visual-review', 'local-human-visual-review']),
  reviewerId: recordIdSchema,
  evidenceArtifactIds: z.array(z.string().regex(/^artifact:sha256:[a-f0-9]{64}$/)).length(1),
  notes: z.string().trim().min(1).max(2_000),
}).strict().superRefine((decision, context) => {
  if (decision.evidenceArtifactIds[0] !== decision.subjectId) {
    context.addIssue({ code: 'custom', message: 'Semantic review subject must equal its exact displayed artifact evidence.' })
  }
})
export type GameMapSemanticReviewDecision = z.infer<typeof gameMapSemanticReviewDecisionSchema>

const acceptedProductionArtifactSchema = z.object({
  bindingKey: z.string().trim().min(1).max(512),
  admissionReceiptId: recordIdSchema,
  admissionReceiptHash: sha256Schema,
  sourceReceiptId: recordIdSchema,
  sourceReceiptHash: sha256Schema,
  sourceArtifactId: z.string().regex(/^artifact:sha256:[a-f0-9]{64}$/),
  sourceArtifactSha256: sha256Schema,
  outputArtifactId: z.string().regex(/^artifact:sha256:[a-f0-9]{64}$/),
  outputArtifactSha256: sha256Schema,
}).strict()

export const gameMapSemanticAcceptanceSchema = z.object({
  version: z.literal(GAME_MAP_SEMANTIC_ACCEPTANCE_PROTOCOL),
  receiptId: recordIdSchema,
  receiptHash: sha256Schema,
  mapId: recordIdSchema,
  mode: z.enum(['scene', 'tile']),
  plan: z.object({ id: recordIdSchema, contentHash: sha256Schema }).strict(),
  runtimeManifest: z.object({ id: recordIdSchema, revision: recordIdSchema, contentHash: sha256Schema }).strict(),
  objectLibrary: z.object({ id: recordIdSchema, revision: recordIdSchema, contentHash: sha256Schema }).strict().optional(),
  previewReceiptId: recordIdSchema,
  previewReceiptHash: sha256Schema,
  previewArtifactId: z.string().regex(/^artifact:sha256:[a-f0-9]{64}$/),
  debugOverlayArtifactId: z.string().regex(/^artifact:sha256:[a-f0-9]{64}$/),
  acceptedArtifacts: z.array(acceptedProductionArtifactSchema).min(2).max(2_000),
  decisions: z.array(gameMapSemanticReviewDecisionSchema).min(4).max(2_004),
  verifierImplementationHash: sha256Schema,
  reviewerKind: z.enum(['local-agent-visual-review', 'local-human-visual-review']),
  reviewerId: recordIdSchema,
  acceptedAt: z.number().int().nonnegative(),
  signature: sha256Schema,
}).strict().superRefine((acceptance, context) => {
  if (acceptance.verifierImplementationHash !== undefined
    && acceptance.acceptedArtifacts.some(({ sourceArtifactId, sourceArtifactSha256, outputArtifactId, outputArtifactSha256 }) => (
      sourceArtifactId !== `artifact:sha256:${sourceArtifactSha256}`
      || outputArtifactId !== `artifact:sha256:${outputArtifactSha256}`
    ))) {
    context.addIssue({ code: 'custom', message: 'Accepted production artifact ids must equal their exact byte hashes.' })
  }
  if (acceptance.decisions.some(({ status, reviewerKind, reviewerId }) => (
    status !== 'accepted' || reviewerKind !== acceptance.reviewerKind || reviewerId !== acceptance.reviewerId
  ))) {
    context.addIssue({ code: 'custom', message: 'Semantic acceptance requires one attributed reviewer and only accepted decisions.' })
  }
})
export type GameMapSemanticAcceptance = z.infer<typeof gameMapSemanticAcceptanceSchema>

const gameMapSemanticAcceptanceInputBaseSchema = z.object({
  runtime: gameMapRuntimeProcessingInputSchema,
  preview: nativeGameMapPreviewSchema,
  artifacts: z.array(gameMapLiveArtifactSchema).min(2).max(2_000),
  decisions: z.array(gameMapSemanticReviewDecisionSchema).min(4).max(2_004),
}).strict()

function compareStableText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function liveBindingKey(binding: z.infer<typeof gameMapRasterInputSchema>['binding']): string {
  switch (binding.kind) {
    case 'runtime-visual': return `runtime:${binding.role}`
    case 'object-visual': return `object:${binding.objectId}@${binding.objectRevision}`
    case 'extraction-source': return `extraction:${binding.role}`
  }
}

export const gameMapSemanticAcceptanceInputSchema = gameMapSemanticAcceptanceInputBaseSchema.superRefine((input, context) => {
  const { runtime, preview } = input
  const manifest = runtime.runtimeManifest
  const library = runtime.objectLibrary
  if ((manifest.mode !== 'scene' && manifest.mode !== 'tile')
    || manifest.visuals.length !== 1
    || !library
    || !runtime.objectLibraryHash
    || !manifest.objectLibrary) {
    context.addIssue({ code: 'custom', message: 'Live Game Map semantic acceptance requires one scene/tile runtime visual and its exact object library.' })
    return
  }

  const expectedPreviewInputs = runtime.artifacts.map(({ acceptedArtifact }) => acceptedArtifact)
    .sort((left, right) => compareStableText(
      `${left.artifact.id}@${left.artifact.revision}`,
      `${right.artifact.id}@${right.artifact.revision}`,
    ))
  if (preview.receipt.mapId !== manifest.mapId
    || preview.receipt.plan.id !== runtime.plan.id
    || preview.receipt.plan.contentHash !== runtime.plan.contentHash
    || preview.receipt.runtimeManifest.id !== manifest.id
    || preview.receipt.runtimeManifest.revision !== manifest.revision
    || preview.receipt.runtimeManifest.contentHash !== runtime.runtimeManifestHash
    || preview.receipt.objectLibrary?.id !== library.id
    || preview.receipt.objectLibrary?.revision !== library.revision
    || preview.receipt.objectLibrary?.contentHash !== runtime.objectLibraryHash
    || preview.width !== manifest.world.width
    || preview.height !== manifest.world.height
    || canonicalJson(preview.receipt.inputs) !== canonicalJson(expectedPreviewInputs)) {
    context.addIssue({ code: 'custom', message: 'Live Game Map semantic acceptance preview is stale for the exact runtime closure.' })
  }

  const liveArtifacts = new Map<string, GameMapLiveArtifact>()
  for (const artifact of input.artifacts) {
    const key = liveBindingKey(artifact.binding)
    if (liveArtifacts.has(key)) {
      context.addIssue({ code: 'custom', message: `Live Game Map semantic acceptance contains duplicate artifact ${key}.` })
    } else {
      liveArtifacts.set(key, artifact)
    }
  }
  for (const raster of runtime.artifacts) {
    const key = liveBindingKey(raster.binding)
    const artifact = liveArtifacts.get(key)
    if (!artifact
      || canonicalJson(artifact.binding) !== canonicalJson(raster.binding)
      || canonicalJson(artifact.acceptedArtifact) !== canonicalJson(raster.acceptedArtifact)
      || artifact.mediaType !== raster.mediaType
      || artifact.bytesBase64 !== raster.bytesBase64) {
      context.addIssue({ code: 'custom', message: `Live Game Map semantic acceptance artifact ${key} differs from the runtime closure.` })
    }
    liveArtifacts.delete(key)
  }
  if (input.artifacts.length !== runtime.artifacts.length || liveArtifacts.size > 0) {
    context.addIssue({ code: 'custom', message: 'Live Game Map semantic acceptance requires the exact runtime artifact closure.' })
  }

  const requirements = [
    `visual-role-fidelity\u0000${manifest.visuals[0]!.source.artifact.id}`,
    ...library.objects.map(({ visual }) => `object-cutout-quality\u0000${visual.artifact.id}`),
    `runtime-composition\u0000${preview.receipt.preview.id}`,
    `authored-geometry\u0000${preview.receipt.debugOverlay.id}`,
    ...(manifest.mode === 'tile'
      ? [`terrain-grid-coherence\u0000${manifest.visuals[0]!.source.artifact.id}`]
      : []),
  ].sort(compareStableText)
  const observed = input.decisions.map(({ criterion, subjectId }) => `${criterion}\u0000${subjectId}`)
    .sort(compareStableText)
  const reviewer = input.decisions[0]
  if (!reviewer
    || input.decisions.some((decision) => decision.status !== 'accepted'
      || decision.reviewerKind !== reviewer.reviewerKind
      || decision.reviewerId !== reviewer.reviewerId)
    || canonicalJson(observed) !== canonicalJson(requirements)) {
    context.addIssue({ code: 'custom', message: 'Live Game Map semantic review must accept the exact visual, cutout, composition, geometry, and mode-specific closure under one reviewer.' })
  }
})
export type GameMapSemanticAcceptanceInput = z.infer<typeof gameMapSemanticAcceptanceInputSchema>

export interface GameMapLiveNativeRunner {
  admit(input: {
    readonly binding: z.infer<typeof gameMapRasterInputSchema>['binding']
    readonly sourceReceipt: z.infer<typeof multimodalHostReceiptSchema>
    readonly sourceArtifactBytes: Uint8Array
    readonly processing: GameMapLiveArtifactProcessing
  }): Promise<GameMapLiveArtifact>
  verifyArtifact(artifact: GameMapLiveArtifact): Promise<GameMapLiveArtifact>
  accept(input: GameMapSemanticAcceptanceInput): Promise<GameMapSemanticAcceptance>
  verifyAcceptance(acceptance: GameMapSemanticAcceptance, input: GameMapSemanticAcceptanceInput): Promise<GameMapSemanticAcceptance>
}

export function createGameMapLiveNativeRunner(): GameMapLiveNativeRunner {
  return {
    async admit(input) {
      return gameMapLiveArtifactSchema.parse(await invoke('admit_game_map_live_artifact', {
        request: {
          binding: input.binding,
          sourceReceipt: input.sourceReceipt,
          sourceArtifactBytes: Array.from(input.sourceArtifactBytes),
          processing: input.processing,
        },
      }))
    },
    async verifyArtifact(artifact) {
      return gameMapLiveArtifactSchema.parse(await invoke('verify_game_map_live_artifact', {
        artifact: gameMapLiveArtifactSchema.parse(artifact),
      }))
    },
    async accept(input) {
      return gameMapSemanticAcceptanceSchema.parse(await invoke('accept_game_map_semantic_review', {
        input: gameMapSemanticAcceptanceInputSchema.parse(input),
      }))
    },
    async verifyAcceptance(acceptance, input) {
      return gameMapSemanticAcceptanceSchema.parse(await invoke('verify_game_map_semantic_acceptance', {
        acceptance: gameMapSemanticAcceptanceSchema.parse(acceptance),
        input: gameMapSemanticAcceptanceInputSchema.parse(input),
      }))
    },
  }
}

export const gameMapLiveProductionRequestSchema = z.object({
  sourceText: z.string().trim().min(1).max(20_000),
  mapName: z.string().trim().min(1).max(240),
  providerId: recordIdSchema,
  model: z.enum(['qwen-image-3.0', 'qwen-image-3.0-pro']),
  runId: recordIdSchema,
  objectBrief: z.string().trim().min(1).max(2_000).optional(),
  canvas: z.object({
    width: z.number().int().min(512).max(1_024).multipleOf(32),
    height: z.number().int().min(512).max(1_024).multipleOf(32),
  }).strict().default({ width: 512, height: 512 }),
}).strict()
export type GameMapLiveProductionRequest = z.infer<typeof gameMapLiveProductionRequestSchema>

export interface GameMapLiveVisualProduction {
  readonly plan: GameMapProductionPlan
  readonly planHash: string
  readonly runtimeVisual: GameMapLiveArtifact
  readonly objectVisual: GameMapLiveArtifact
}

function nodeId(plan: GameMapProductionPlan, role: 'base' | 'terrain-atlas' | 'object-library'): string {
  const node = plan.nodes.find((candidate) => candidate.role === role)
  if (!node) throw new Error(`Game Map production plan is missing ${role}.`)
  return node.id
}

function runtimeVisualPrompt(plan: GameMapProductionPlan, sourceText: string): string {
  if (plan.mode === 'scene') {
    return `${sourceText}\nCreate the runtime-authoritative TOP-DOWN ORTHOGRAPHIC game map base plate only. Exact ${plan.world.width}x${plan.world.height} canvas. Production game art, coherent ground, paths and environmental surfaces. No freestanding props, characters, labels, text, interface, frame, grid lines, border, perspective horizon, or baked collision marks. Fill every canvas edge; this plate will be composed with separate transparent objects.`
  }
  return `${sourceText}\nCreate the runtime-authoritative TOP-DOWN ORTHOGRAPHIC terrain plate for a 32-pixel tile grid. Exact ${plan.world.width}x${plan.world.height} canvas. Continuous coherent terrain with paths and ground variation aligned to the square cell rhythm, but draw NO grid lines, separators, labels, text, interface, frame, border, props, characters, or collision marks. Fill every canvas edge; Cutout will split and deterministically recompose the exact 32-pixel cells.`
}

function objectPrompt(sourceText: string, objectBrief?: string): string {
  return `${sourceText}\nCreate exactly one reusable TOP-DOWN game environment object: ${objectBrief ?? 'a distinctive environmental landmark that belongs in this map'}. Center the complete object with a generous safe margin on a pure flat chroma magenta #FF00FF board. No ground plane, contact shadow, horizon, text, label, grid, frame, border, extra object, cropped edge, or magenta color inside the object. The board must fill every canvas edge and stay spatially uniform.`
}

async function oneGeneratedImage(
  host: MultimodalDesktopHost,
  input: Parameters<MultimodalDesktopHost['image']>[0],
) {
  const outputs = await host.image(input)
  if (outputs.length !== 1) throw new Error('Live Game Map generation requires exactly one retained Qwen image per role.')
  await host.verify(outputs[0]!)
  return outputs[0]!
}

export async function produceGameMapLiveVisuals(
  value: GameMapLiveProductionRequest,
  host: MultimodalDesktopHost = createMultimodalDesktopHost(),
  runner: GameMapLiveNativeRunner = createGameMapLiveNativeRunner(),
): Promise<GameMapLiveVisualProduction> {
  const input = gameMapLiveProductionRequestSchema.parse(value)
  const plan = gameMapProductionPlanSchema.parse(await compileGameMapProductionPlan({
    sourceText: input.sourceText,
    mapName: input.mapName,
    canvas: input.canvas,
  }))
  if (plan.mode !== 'scene' && plan.mode !== 'tile') {
    throw new Error(`Live Game Map production currently admits scene and tile plans; inferred ${plan.mode}.`)
  }
  const planHash = await fingerprintGameMapProductionPlan(plan)
  const visualRole = plan.mode === 'scene' ? 'base' as const : 'terrain-atlas' as const
  const visual = await oneGeneratedImage(host, {
    providerId: input.providerId,
    model: input.model,
    operation: 'image-generation',
    prompt: runtimeVisualPrompt(plan, input.sourceText),
    size: `${plan.world.width}x${plan.world.height}`,
    context: {
      requestId: `request:game-map:${plan.intentDigest.slice(0, 24)}:${visualRole}`,
      runId: input.runId,
      semanticRole: `game-map-${visualRole}`,
      nodeId: nodeId(plan, visualRole),
      capabilityId: 'capability:image-generation',
      acceptedReferenceArtifactIds: [],
      lockIds: [`lock:game-map:${plan.intentDigest.slice(0, 24)}:art-direction`],
    },
  })
  const objectId = `object:game-map:${plan.intentDigest.slice(0, 24)}:landmark`
  const objectRevision = `object:game-map:${plan.intentDigest.slice(0, 24)}:revision:1`
  const object = await oneGeneratedImage(host, {
    providerId: input.providerId,
    model: input.model,
    operation: 'image-generation',
    prompt: objectPrompt(input.sourceText, input.objectBrief),
    size: '512x512',
    context: {
      requestId: `request:game-map:${plan.intentDigest.slice(0, 24)}:object`,
      runId: input.runId,
      semanticRole: 'game-map-object',
      nodeId: nodeId(plan, 'object-library'),
      capabilityId: 'capability:image-generation',
      acceptedReferenceArtifactIds: [],
      lockIds: [`lock:game-map:${plan.intentDigest.slice(0, 24)}:art-direction`],
    },
  })
  const [runtimeVisual, objectVisual] = await Promise.all([
    runner.admit({
      binding: { kind: 'runtime-visual', role: visualRole },
      sourceReceipt: visual.receipt,
      sourceArtifactBytes: visual.bytes,
      processing: { kind: 'runtime-png' },
    }),
    runner.admit({
      binding: { kind: 'object-visual', objectId, objectRevision },
      sourceReceipt: object.receipt,
      sourceArtifactBytes: object.bytes,
      processing: {
        kind: 'object-cutout',
        frameSize: { width: 192, height: 192 },
        alphaTarget: { width: 128, height: 160 },
        expectedAnchor: { x: 96, y: 176 },
        anchorPolicy: 'bottom',
      },
    }),
  ])
  return {
    plan,
    planHash,
    runtimeVisual: await runner.verifyArtifact(runtimeVisual),
    objectVisual: await runner.verifyArtifact(objectVisual),
  }
}

export const gameMapExplicitGeometrySchema = z.object({
  placement: z.object({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative() }).strict(),
  collision: gameMapRuntimeManifestSchema.shape.collision,
  zones: gameMapRuntimeManifestSchema.shape.zones,
  spawns: gameMapRuntimeManifestSchema.shape.spawns,
  exits: gameMapRuntimeManifestSchema.shape.exits,
  navigation: gameMapRuntimeManifestSchema.shape.navigation,
}).strict()
export type GameMapExplicitGeometry = z.infer<typeof gameMapExplicitGeometrySchema>

export function defaultGameMapExplicitGeometry(planValue: GameMapProductionPlan): GameMapExplicitGeometry {
  const plan = gameMapProductionPlanSchema.parse(planValue)
  if (plan.mode !== 'scene' && plan.mode !== 'tile') throw new Error('Default live geometry supports scene and tile maps only.')
  const cell = 32
  return gameMapExplicitGeometrySchema.parse({
    placement: { x: Math.floor(plan.world.width / 2), y: plan.world.height - 128 },
    collision: [{
      id: 'collision:south-boundary',
      behavior: 'solid',
      shape: { kind: 'rectangle', bounds: { x: 0, y: plan.world.height - cell, width: plan.world.width, height: cell } },
    }],
    zones: [{
      id: 'zone:checkpoint',
      purpose: 'checkpoint',
      shape: { kind: 'rectangle', bounds: { x: cell * 6, y: cell * 6, width: cell * 2, height: cell * 2 } },
    }],
    spawns: [{ id: 'spawn:player', kind: 'player', position: { x: cell * 2, y: plan.world.height - cell * 3 } }],
    exits: [{
      id: 'exit:east',
      area: { kind: 'rectangle', bounds: { x: plan.world.width - cell, y: plan.world.height - cell * 4, width: cell, height: cell * 3 } },
      destination: { kind: 'map', mapId: 'map:next', spawnId: 'spawn:west' },
    }],
    navigation: plan.mode === 'tile'
      ? { kind: 'orthogonal-grid', movement: 'cardinal-4', blockedCells: [] }
      : { kind: 'unavailable', reason: 'no-explicit-navigation-data' },
  })
}

export interface GameMapLiveRuntimeClosure extends GameMapLiveVisualProduction {
  readonly runtime: z.infer<typeof gameMapRuntimeProcessingInputSchema>
  readonly preview: z.infer<typeof nativeGameMapPreviewSchema>
  readonly artifacts: readonly GameMapLiveArtifact[]
}

export async function authorGameMapLiveRuntime(
  production: GameMapLiveVisualProduction,
  geometryValue: GameMapExplicitGeometry,
): Promise<GameMapLiveRuntimeClosure> {
  const geometry = gameMapExplicitGeometrySchema.parse(geometryValue)
  const { plan, planHash, runtimeVisual, objectVisual } = production
  if (runtimeVisual.decodedSize.width !== plan.world.width || runtimeVisual.decodedSize.height !== plan.world.height) {
    throw new Error('Qwen runtime visual dimensions do not equal the inferred map world.')
  }
  if (objectVisual.binding.kind !== 'object-visual') throw new Error('Live Game Map object admission lost its object binding.')
  const objectLibraryRevisionHash = await fingerprint({
    plan: { id: plan.id, contentHash: planHash },
    object: objectVisual.acceptedArtifact,
    binding: objectVisual.binding,
  })
  const objectLibrary = gameMapObjectLibrarySchema.parse({
    version: 'game-map.object-library.v1',
    id: `object-library:game-map:${plan.intentDigest.slice(0, 24)}`,
    revision: `revision:sha256:${objectLibraryRevisionHash}`,
    mapId: plan.mapId,
    plan: { id: plan.id, contentHash: planHash },
    objects: [{
      id: objectVisual.binding.objectId,
      revision: objectVisual.binding.objectRevision,
      name: 'Map landmark',
      visual: objectVisual.acceptedArtifact,
      decodedSize: objectVisual.decodedSize,
      anchor: { x: 96, y: 176 },
      occlusionClass: 'actor-height',
      placementSafeArea: { x: 0, y: 0, ...objectVisual.decodedSize },
      collisionPolicy: { kind: 'none' },
    }],
  })
  const objectLibraryHash = await fingerprintGameMapObjectLibrary(objectLibrary)
  const manifestRevisionHash = await fingerprint({
    plan: { id: plan.id, contentHash: planHash },
    runtimeVisual: runtimeVisual.acceptedArtifact,
    objectLibraryHash,
    geometry,
  })
  const visualRole = plan.mode === 'scene' ? 'base' as const : 'terrain-atlas' as const
  const tileCoordinateSystem = plan.mode === 'tile' && plan.coordinateSystem.kind === 'orthogonal-grid'
    ? plan.coordinateSystem
    : undefined
  if (plan.mode === 'tile' && !tileCoordinateSystem) {
    throw new Error('Live tile production requires the exact inferred orthogonal grid.')
  }
  const layers = plan.mode === 'scene'
    ? [{ id: 'layer:base', kind: 'base' as const, order: 0, sourceId: runtimeVisual.acceptedArtifact.artifact.id }]
    : [{
        id: 'layer:terrain',
        kind: 'terrain' as const,
        order: 0,
        sourceId: runtimeVisual.acceptedArtifact.artifact.id,
        atlas: {
          columns: tileCoordinateSystem!.columns,
          rows: tileCoordinateSystem!.rows,
          cellWidth: 32,
          cellHeight: 32,
        },
        tiles: Array.from({ length: tileCoordinateSystem!.rows }, (_, row) => (
          Array.from({ length: tileCoordinateSystem!.columns }, (__, column) => ({
            column,
            row,
            atlasColumn: column,
            atlasRow: row,
          }))
        )).flat(),
      }]
  const runtimeManifest = gameMapRuntimeManifestSchema.parse({
    version: 'game-map.runtime-manifest.v1',
    id: `runtime-manifest:game-map:${plan.intentDigest.slice(0, 24)}`,
    revision: `revision:sha256:${manifestRevisionHash}`,
    mapId: plan.mapId,
    plan: { id: plan.id, contentHash: planHash },
    mode: plan.mode,
    playable: true,
    world: plan.world,
    coordinateSystem: plan.coordinateSystem,
    camera: plan.camera,
    objectLibrary: { id: objectLibrary.id, revision: objectLibrary.revision, contentHash: objectLibraryHash },
    visuals: [{ role: visualRole, source: runtimeVisual.acceptedArtifact }],
    layers: [
      ...layers,
      { id: 'layer:objects', kind: 'objects', order: 10, sourceId: objectLibrary.id },
    ],
    placements: [{
      id: 'placement:landmark',
      layerId: 'layer:objects',
      objectId: objectVisual.binding.objectId,
      objectRevision: objectVisual.binding.objectRevision,
      position: geometry.placement,
      scale: { x: 1, y: 1 },
      rotationDegrees: 0,
      sortOffset: 0,
    }],
    collision: geometry.collision,
    zones: geometry.zones,
    spawns: geometry.spawns,
    exits: geometry.exits,
    navigation: geometry.navigation,
  })
  const runtimeManifestHash = await fingerprintGameMapRuntimeManifest(runtimeManifest)
  const artifacts = [runtimeVisual, objectVisual]
  const runtime = gameMapRuntimeProcessingInputSchema.parse({
    plan: { id: plan.id, contentHash: planHash },
    runtimeManifest,
    runtimeManifestHash,
    objectLibrary,
    objectLibraryHash,
    artifacts: artifacts.map((artifact) => ({
      binding: artifact.binding,
      acceptedArtifact: artifact.acceptedArtifact,
      mediaType: artifact.mediaType,
      bytesBase64: artifact.bytesBase64,
    })),
  })
  const validation = await validateGameMapRuntime(runtime)
  if (validation.status !== 'passed') throw new Error('Authored live Game Map runtime did not pass native validation.')
  const preview = await composeGameMapPreview(runtime)
  return { ...production, runtime, preview, artifacts }
}

export async function acceptGameMapSemanticReview(
  closure: GameMapLiveRuntimeClosure,
  decisionsValue: readonly GameMapSemanticReviewDecision[],
  runner: GameMapLiveNativeRunner = createGameMapLiveNativeRunner(),
): Promise<{ readonly acceptance: GameMapSemanticAcceptance, readonly input: GameMapSemanticAcceptanceInput }> {
  const input = gameMapSemanticAcceptanceInputSchema.parse({
    runtime: closure.runtime,
    preview: closure.preview,
    artifacts: closure.artifacts,
    decisions: decisionsValue,
  })
  const acceptance = await runner.accept(input)
  const verified = await runner.verifyAcceptance(acceptance, input)
  return { acceptance: verified, input }
}

export async function verifyGameMapSemanticAcceptance(input: {
  readonly acceptance: GameMapSemanticAcceptance
  readonly runtime: z.infer<typeof gameMapRuntimeProcessingInputSchema>
  readonly preview: z.infer<typeof nativeGameMapPreviewSchema>
  readonly artifacts: readonly GameMapLiveArtifact[]
}, runner: GameMapLiveNativeRunner = createGameMapLiveNativeRunner()): Promise<GameMapSemanticAcceptance> {
  const closure = gameMapSemanticAcceptanceInputSchema.parse({
    runtime: input.runtime,
    preview: input.preview,
    artifacts: input.artifacts,
    decisions: input.acceptance.decisions,
  })
  return runner.verifyAcceptance(gameMapSemanticAcceptanceSchema.parse(input.acceptance), closure)
}

export async function assertGameMapLiveArtifactBytes(artifactValue: GameMapLiveArtifact): Promise<void> {
  const artifact = gameMapLiveArtifactSchema.parse(artifactValue)
  const outputBytes = base64ToBytes(artifact.bytesBase64)
  const sourceBytes = base64ToBytes(artifact.sourceArtifactBytesBase64)
  const [outputHash, sourceHash] = await Promise.all([sha256Bytes(outputBytes), sha256Bytes(sourceBytes)])
  if (outputHash !== artifact.acceptedArtifact.artifact.contentHash
    || sourceHash !== artifact.sourceReceipt.artifact.sha256
    || outputBytes.byteLength !== artifact.admission.outputByteLength
    || outputBytes.byteLength !== artifact.processingEvidence.outputByteLength
    || sourceBytes.byteLength !== artifact.sourceReceipt.artifact.byteLength) {
    throw new Error('Live Game Map retained source or output bytes failed frontend verification.')
  }
}

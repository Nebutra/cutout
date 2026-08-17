import { invoke } from '@tauri-apps/api/core'
import { z } from 'zod'
import { sha256Bytes } from '@/asset-production/hash'
import { recordIdSchema, sha256Schema } from '@/design-os-kernel/contracts'
import { base64ToBytes } from '@/lib/image'
import {
  fingerprintGameMapObjectLibrary,
  fingerprintGameMapRuntimeManifest,
  gameMapAcceptedArtifactSchema,
  gameMapAtlasGridSchema,
  gameMapObjectLibrarySchema,
  gameMapPreviewReceiptSchema,
  gameMapReachabilitySchema,
  gameMapRuntimeManifestSchema,
} from './map'

export const GAME_MAP_PROP_EXTRACTION_PROTOCOL = 'cutout.game-map-prop-extraction.v1' as const
export const GAME_MAP_TERRAIN_EXTRACTION_PROTOCOL = 'cutout.game-map-terrain-extraction.v1' as const
export const GAME_MAP_RUNTIME_VALIDATION_PROTOCOL = 'cutout.game-map-runtime-validation.v1' as const
export const GAME_MAP_NATIVE_PREVIEW_PROTOCOL = 'cutout.game-map-native-preview.v1' as const
export const GAME_MAP_PROP_EXTRACTOR = 'cutout-game-map-prop-grid-rust-image-0.23-v1' as const
export const GAME_MAP_TERRAIN_EXTRACTOR = 'cutout-game-map-terrain-grid-rust-image-0.23-v1' as const
export const GAME_MAP_RUNTIME_VALIDATOR = 'cutout-game-map-runtime-validator-rust-v1' as const
export const GAME_MAP_COMPOSITOR = 'cutout-game-map-compositor-rust-image-0.23-v1' as const

const artifactIdSchema = z.string().regex(/^artifact:sha256:[a-f0-9]{64}$/)
const boundedBase64Schema = z.string().min(4).max(512 * 1024 * 1024)
const boundedRasterInputBase64Schema = z.string().min(4).max(96 * 1024 * 1024)
const alphaBoundsSchema = z.object({
  x: z.number().int().nonnegative().max(16_383),
  y: z.number().int().nonnegative().max(16_383),
  width: z.number().int().positive().max(16_384),
  height: z.number().int().positive().max(16_384),
}).strict()

export const gameMapProcessorFindingSchema = z.object({
  code: recordIdSchema,
  subjectId: recordIdSchema,
  severity: z.enum(['informational', 'blocking']),
  message: z.string().trim().min(1).max(2_000),
}).strict()
export type GameMapProcessorFinding = z.infer<typeof gameMapProcessorFindingSchema>

export const gameMapRasterInputSchema = z.object({
  binding: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('runtime-visual'),
      role: z.enum([
        'base', 'terrain-atlas', 'parallax-plates', 'room-chunks', 'baked-scene', 'foreground',
      ]),
    }).strict(),
    z.object({
      kind: z.literal('object-visual'),
      objectId: recordIdSchema,
      objectRevision: recordIdSchema,
    }).strict(),
    z.object({
      kind: z.literal('extraction-source'),
      role: z.enum(['prop-pack', 'terrain-atlas']),
    }).strict(),
  ]),
  acceptedArtifact: gameMapAcceptedArtifactSchema,
  mediaType: z.literal('image/png'),
  bytesBase64: boundedRasterInputBase64Schema,
}).strict().superRefine((input, context) => {
  const { id, contentHash } = input.acceptedArtifact.artifact
  if (id !== `artifact:sha256:${contentHash}`) {
    context.addIssue({ code: 'custom', message: 'Game Map raster ids must content-address their exact bytes.' })
  }
})
export type GameMapRasterInput = z.infer<typeof gameMapRasterInputSchema>

const extractionCellSchema = z.object({
  id: recordIdSchema,
  column: z.number().int().nonnegative().max(255),
  row: z.number().int().nonnegative().max(255),
  artifactId: artifactIdSchema,
  sha256: sha256Schema,
  byteLength: z.number().int().positive().max(64 * 1024 * 1024),
  bytesBase64: boundedBase64Schema,
  alphaBounds: alphaBoundsSchema.nullable(),
  opaquePixelCount: z.number().int().nonnegative().max(268_435_456),
  edgeContact: z.boolean(),
}).strict().superRefine((cell, context) => {
  if (cell.artifactId !== `artifact:sha256:${cell.sha256}`
    || (cell.alphaBounds === null) !== (cell.opaquePixelCount === 0)) {
    context.addIssue({ code: 'custom', message: 'Extracted map cell evidence is inconsistent.' })
  }
})

export const gameMapPropPackExtractionInputSchema = z.object({
  source: gameMapRasterInputSchema,
  grid: gameMapAtlasGridSchema,
  objects: z.array(z.object({
    id: recordIdSchema,
    name: z.string().trim().min(1).max(240),
    column: z.number().int().nonnegative().max(255),
    row: z.number().int().nonnegative().max(255),
    collisionPolicy: z.enum(['none', 'authored-shape']),
  }).strict()).min(1).max(4_096),
}).strict()
export type GameMapPropPackExtractionInput = z.infer<typeof gameMapPropPackExtractionInputSchema>

export const gameMapPropPackExtractionSchema = z.object({
  protocol: z.literal(GAME_MAP_PROP_EXTRACTION_PROTOCOL),
  processor: z.literal(GAME_MAP_PROP_EXTRACTOR),
  sourceArtifactId: artifactIdSchema,
  sourceSha256: sha256Schema,
  decodedSize: z.object({
    width: z.number().int().positive().max(16_384),
    height: z.number().int().positive().max(16_384),
  }).strict(),
  grid: gameMapAtlasGridSchema,
  status: z.enum(['passed', 'blocked']),
  findings: z.array(gameMapProcessorFindingSchema).max(8_192),
  cells: z.array(extractionCellSchema.extend({
    objectId: recordIdSchema,
    objectName: z.string().trim().min(1).max(240),
    classification: z.enum(['compact', 'wide', 'collision-bearing']),
  }).strict()).min(1).max(4_096),
}).strict().superRefine((receipt, context) => {
  const blocked = receipt.findings.some(({ severity }) => severity === 'blocking')
  if ((receipt.status === 'blocked') !== blocked) {
    context.addIssue({ code: 'custom', message: 'Prop extraction status must match its blocking findings.' })
  }
})
export type GameMapPropPackExtraction = z.infer<typeof gameMapPropPackExtractionSchema>

export const gameMapTerrainExtractionInputSchema = z.object({
  source: gameMapRasterInputSchema,
  grid: gameMapAtlasGridSchema,
  edgePolicy: z.enum(['seamable', 'isolated']),
}).strict()
export type GameMapTerrainExtractionInput = z.infer<typeof gameMapTerrainExtractionInputSchema>

export const gameMapTerrainExtractionSchema = z.object({
  protocol: z.literal(GAME_MAP_TERRAIN_EXTRACTION_PROTOCOL),
  processor: z.literal(GAME_MAP_TERRAIN_EXTRACTOR),
  sourceArtifactId: artifactIdSchema,
  sourceSha256: sha256Schema,
  decodedSize: z.object({
    width: z.number().int().positive().max(16_384),
    height: z.number().int().positive().max(16_384),
  }).strict(),
  grid: gameMapAtlasGridSchema,
  edgePolicy: z.enum(['seamable', 'isolated']),
  status: z.enum(['passed', 'blocked']),
  findings: z.array(gameMapProcessorFindingSchema).max(131_072),
  cells: z.array(extractionCellSchema).min(1).max(65_536),
}).strict().superRefine((receipt, context) => {
  if (receipt.cells.length !== receipt.grid.columns * receipt.grid.rows
    || (receipt.status === 'blocked') !== receipt.findings.some(({ severity }) => severity === 'blocking')) {
    context.addIssue({ code: 'custom', message: 'Terrain extraction closure is inconsistent.' })
  }
})
export type GameMapTerrainExtraction = z.infer<typeof gameMapTerrainExtractionSchema>

export const gameMapRuntimeProcessingInputSchema = z.object({
  plan: z.object({ id: recordIdSchema, contentHash: sha256Schema }).strict(),
  runtimeManifest: gameMapRuntimeManifestSchema,
  runtimeManifestHash: sha256Schema,
  objectLibrary: gameMapObjectLibrarySchema.optional(),
  objectLibraryHash: sha256Schema.optional(),
  artifacts: z.array(gameMapRasterInputSchema).min(1).max(2_000),
}).strict().superRefine((input, context) => {
  if (Boolean(input.objectLibrary) !== Boolean(input.objectLibraryHash)) {
    context.addIssue({ code: 'custom', message: 'Game Map object-library value and hash must be supplied together.' })
  }
})
export type GameMapRuntimeProcessingInput = z.infer<typeof gameMapRuntimeProcessingInputSchema>

export const gameMapRuntimeValidationSchema = z.object({
  protocol: z.literal(GAME_MAP_RUNTIME_VALIDATION_PROTOCOL),
  validator: z.literal(GAME_MAP_RUNTIME_VALIDATOR),
  runtimeManifestHash: sha256Schema,
  status: z.enum(['passed', 'blocked']),
  findings: z.array(gameMapProcessorFindingSchema).max(20_000),
  reachability: gameMapReachabilitySchema,
}).strict().superRefine((report, context) => {
  const hasBlockingFindings = report.findings.some(({ severity }) => severity === 'blocking')
  if ((report.status === 'blocked') !== hasBlockingFindings
    || (report.reachability.status === 'blocked' && !hasBlockingFindings)) {
    context.addIssue({ code: 'custom', message: 'Game Map runtime validation status is inconsistent.' })
  }
})
export type GameMapRuntimeValidation = z.infer<typeof gameMapRuntimeValidationSchema>

export const nativeGameMapPreviewSchema = z.object({
  protocol: z.literal(GAME_MAP_NATIVE_PREVIEW_PROTOCOL),
  receipt: gameMapPreviewReceiptSchema,
  previewBytesBase64: boundedBase64Schema,
  debugOverlayBytesBase64: boundedBase64Schema,
  width: z.number().int().positive().max(8_192),
  height: z.number().int().positive().max(8_192),
}).strict()
export type NativeGameMapPreview = z.infer<typeof nativeGameMapPreviewSchema>

async function verifyExtractedCells(
  cells: readonly z.infer<typeof extractionCellSchema>[],
): Promise<void> {
  await Promise.all(cells.map(async (cell) => {
    const bytes = base64ToBytes(cell.bytesBase64)
    const hash = await sha256Bytes(bytes)
    if (bytes.byteLength !== cell.byteLength || hash !== cell.sha256
      || cell.artifactId !== `artifact:sha256:${hash}`) {
      throw new Error(`Extracted Game Map cell ${cell.id} bytes do not match native evidence.`)
    }
  }))
}

export async function extractGameMapPropPack(
  value: GameMapPropPackExtractionInput,
): Promise<GameMapPropPackExtraction> {
  const request = gameMapPropPackExtractionInputSchema.parse(value)
  const result = gameMapPropPackExtractionSchema.parse(await invoke(
    'extract_game_map_prop_pack', { request },
  ))
  await verifyExtractedCells(result.cells)
  return result
}

export async function extractGameMapTerrainAtlas(
  value: GameMapTerrainExtractionInput,
): Promise<GameMapTerrainExtraction> {
  const request = gameMapTerrainExtractionInputSchema.parse(value)
  const result = gameMapTerrainExtractionSchema.parse(await invoke(
    'extract_game_map_terrain_atlas', { request },
  ))
  await verifyExtractedCells(result.cells)
  return result
}

async function parseRuntimeInput(value: GameMapRuntimeProcessingInput): Promise<GameMapRuntimeProcessingInput> {
  const request = gameMapRuntimeProcessingInputSchema.parse(value)
  if (await fingerprintGameMapRuntimeManifest(request.runtimeManifest) !== request.runtimeManifestHash) {
    throw new Error('Game Map runtime manifest hash does not match its canonical content.')
  }
  if (request.objectLibrary && request.objectLibraryHash
    && await fingerprintGameMapObjectLibrary(request.objectLibrary) !== request.objectLibraryHash) {
    throw new Error('Game Map object-library hash does not match its canonical content.')
  }
  return request
}

export async function validateGameMapRuntime(
  value: GameMapRuntimeProcessingInput,
): Promise<GameMapRuntimeValidation> {
  const request = await parseRuntimeInput(value)
  return gameMapRuntimeValidationSchema.parse(await invoke(
    'validate_game_map_runtime', { request },
  ))
}

export async function composeGameMapPreview(
  value: GameMapRuntimeProcessingInput,
): Promise<NativeGameMapPreview> {
  const request = await parseRuntimeInput(value)
  const result = nativeGameMapPreviewSchema.parse(await invoke(
    'compose_game_map_preview', { request },
  ))
  const [previewHash, debugHash] = await Promise.all([
    sha256Bytes(base64ToBytes(result.previewBytesBase64)),
    sha256Bytes(base64ToBytes(result.debugOverlayBytesBase64)),
  ])
  if (previewHash !== result.receipt.preview.contentHash
    || debugHash !== result.receipt.debugOverlay.contentHash
    || result.receipt.runtimeManifest.contentHash !== request.runtimeManifestHash
    || result.width !== request.runtimeManifest.world.width
    || result.height !== request.runtimeManifest.world.height) {
    throw new Error('Native Game Map preview bytes or manifest identity failed verification.')
  }
  return result
}

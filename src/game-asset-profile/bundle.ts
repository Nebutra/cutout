import { invoke } from '@tauri-apps/api/core'
import { z } from 'zod'
import { sha256Bytes } from '@/asset-production/hash'
import { canonicalJson } from '@/design-ir/fingerprint'
import { base64ToBytes } from '@/lib/image'
import {
  gameAssetGenerationAuthorizationSchema,
  gameAssetSemanticAcceptanceSchema,
  retainedGameAssetRoleOutputSchema,
  type RetainedGameAssetRoleOutput,
} from './generation'
import {
  gameAssetProductionRehearsalBundleSchema,
  type GameAssetProductionRehearsalBundle,
} from './rehearsal'

export const GAME_ASSET_BUNDLE_PROTOCOL = 'game-asset.bundle.v1' as const
export const GAME_ASSET_BUNDLE_COMPILER = 'cutout-game-asset-atlas-rust-image-0.23-v1' as const
export const GAME_ASSET_BUNDLE_TIMING_POLICY = 'game-asset-action-timing.v1' as const

const safeIdSchema = z.string().min(1).max(240).refine((value) => !/\p{Cc}/u.test(value))
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const artifactIdSchema = z.string().regex(/^artifact:sha256:[a-f0-9]{64}$/)
const deliveryStatusSchema = z.enum(['candidate', 'accepted'])
const bundleEvidenceReferenceSchema = z.object({
  receiptId: safeIdSchema,
  receiptHash: sha256Schema,
}).strict()
const bundleGenerationReferenceSchema = bundleEvidenceReferenceSchema.extend({
  previewId: z.string().regex(/^game-asset-preview:sha256:[a-f0-9]{64}$/),
  runId: safeIdSchema,
}).strict()
const bundleCellSchema = z.object({
  x: z.number().int().nonnegative().max(16_384),
  y: z.number().int().nonnegative().max(16_384),
  width: z.number().int().positive().max(16_384),
  height: z.number().int().positive().max(16_384),
}).strict()

export const gameAssetBundleManifestSchema = z.object({
  version: z.literal(GAME_ASSET_BUNDLE_PROTOCOL),
  deliveryStatus: deliveryStatusSchema,
  compilerImplementation: z.literal(GAME_ASSET_BUNDLE_COMPILER),
  timingPolicy: z.literal(GAME_ASSET_BUNDLE_TIMING_POLICY),
  assetId: safeIdSchema,
  planId: safeIdSchema,
  planHash: sha256Schema,
  generation: bundleGenerationReferenceSchema,
  semanticAcceptance: bundleEvidenceReferenceSchema.optional(),
  atlas: z.object({
    logicalPath: z.literal('atlas.png'),
    artifactId: artifactIdSchema,
    sha256: sha256Schema,
    mediaType: z.literal('image/png'),
    byteLength: z.number().int().positive().max(384 * 1024 * 1024),
    width: z.number().int().positive().max(16_384),
    height: z.number().int().positive().max(16_384),
    columns: z.number().int().positive().max(1_000),
    rows: z.number().int().positive().max(1_000),
  }).strict(),
  frames: z.array(z.object({
    roleId: safeIdSchema,
    action: z.enum([
      'single', 'idle', 'walk', 'run', 'attack', 'cast', 'shoot', 'jump', 'hurt',
      'death', 'hover', 'charge', 'projectile', 'impact', 'explode',
    ]),
    direction: z.enum(['none', 'down', 'left', 'right', 'up']),
    frameIndex: z.number().int().nonnegative().max(10_000),
    durationMs: z.number().int().positive().max(10_000),
    cell: bundleCellSchema,
    anchor: z.object({ x: z.number().finite(), y: z.number().finite() }).strict(),
    artifactId: artifactIdSchema,
    artifactSha256: sha256Schema,
  }).strict()).min(1).max(16),
  animations: z.array(z.object({
    id: safeIdSchema,
    action: z.enum([
      'single', 'idle', 'walk', 'run', 'attack', 'cast', 'shoot', 'jump', 'hurt',
      'death', 'hover', 'charge', 'projectile', 'impact', 'explode',
    ]),
    direction: z.enum(['none', 'down', 'left', 'right', 'up']),
    frameDurationMs: z.number().int().positive().max(10_000),
    looping: z.boolean(),
    roleIds: z.array(safeIdSchema).min(1).max(16),
  }).strict()).min(1).max(16),
}).strict().superRefine((manifest, context) => {
  const roleIds = manifest.frames.map(({ roleId }) => roleId)
  const animationRoleIds = manifest.animations.flatMap(({ roleIds: ids }) => ids)
  if ((manifest.deliveryStatus === 'accepted') !== Boolean(manifest.semanticAcceptance)
    || manifest.atlas.artifactId !== `artifact:sha256:${manifest.atlas.sha256}`
    || new Set(roleIds).size !== roleIds.length
    || animationRoleIds.length !== roleIds.length
    || new Set(animationRoleIds).size !== animationRoleIds.length
    || animationRoleIds.some((roleId) => !roleIds.includes(roleId))
    || manifest.frames.some(({ artifactId, artifactSha256, cell }) => (
      artifactId !== `artifact:sha256:${artifactSha256}`
      || cell.x + cell.width > manifest.atlas.width
      || cell.y + cell.height > manifest.atlas.height
    ))) {
    context.addIssue({ code: 'custom', message: 'Game Asset bundle manifest closure is inconsistent.' })
  }
})
export type GameAssetBundleManifest = z.infer<typeof gameAssetBundleManifestSchema>

export const compiledGameAssetBundleSchema = z.object({
  protocol: z.literal(GAME_ASSET_BUNDLE_PROTOCOL),
  bundleId: z.string().regex(/^game-asset-bundle:sha256:[a-f0-9]{64}$/),
  bundleHash: sha256Schema,
  deliveryStatus: deliveryStatusSchema,
  manifestLogicalPath: z.literal('manifest.json'),
  manifestMediaType: z.literal('application/json'),
  manifestByteLength: z.number().int().positive().max(16 * 1024 * 1024),
  manifestBytesBase64: z.string().min(4).max(24 * 1024 * 1024),
  atlasBytesBase64: z.string().min(4).max(512 * 1024 * 1024),
  manifest: gameAssetBundleManifestSchema,
}).strict().superRefine((bundle, context) => {
  if (bundle.bundleId !== `game-asset-bundle:sha256:${bundle.bundleHash}`
    || bundle.deliveryStatus !== bundle.manifest.deliveryStatus) {
    context.addIssue({ code: 'custom', message: 'Compiled Game Asset bundle identity is inconsistent.' })
  }
})
export type CompiledGameAssetBundle = z.infer<typeof compiledGameAssetBundleSchema>

function retainedOutputs(bundle: GameAssetProductionRehearsalBundle): RetainedGameAssetRoleOutput[] {
  return bundle.frames.map((frame) => retainedGameAssetRoleOutputSchema.parse({
    roleId: frame.roleId,
    receipt: frame.receipt,
    sourceMediaType: frame.receipt.artifact.mediaType,
    sourceArtifactBytesBase64: frame.sourceArtifactBytesBase64,
    mediaType: 'image/png',
    artifactBytesBase64: frame.artifactBytesBase64,
    processingEvidence: frame.processingEvidence,
    pixelEvidence: frame.pixelEvidence,
  }))
}

export async function compileGameAssetProductionBundle(
  value: GameAssetProductionRehearsalBundle,
): Promise<CompiledGameAssetBundle> {
  const bundle = gameAssetProductionRehearsalBundleSchema.parse(value)
  return verifyCompiledGameAssetBundleBytes(await invoke(
    'compile_game_asset_production_bundle',
    {
      plan: bundle.plan,
      authorization: gameAssetGenerationAuthorizationSchema.parse(bundle.authorization),
      outputs: retainedOutputs(bundle),
      semanticAcceptance: bundle.semanticAcceptance
        ? gameAssetSemanticAcceptanceSchema.parse(bundle.semanticAcceptance)
        : null,
    },
  ))
}

export async function verifyCompiledGameAssetBundleBytes(
  value: unknown,
): Promise<CompiledGameAssetBundle> {
  const result = compiledGameAssetBundleSchema.parse(value)
  const atlasBytes = base64ToBytes(result.atlasBytesBase64)
  const manifestBytes = base64ToBytes(result.manifestBytesBase64)
  const manifestJson = new TextDecoder().decode(manifestBytes)
  let retainedManifest: unknown
  try {
    retainedManifest = JSON.parse(manifestJson)
  } catch {
    throw new Error('Native Game Asset bundle manifest bytes are not JSON.')
  }
  if (atlasBytes.byteLength !== result.manifest.atlas.byteLength
    || await sha256Bytes(atlasBytes) !== result.manifest.atlas.sha256
    || manifestBytes.byteLength !== result.manifestByteLength
    || await sha256Bytes(manifestBytes) !== result.bundleHash
    || manifestJson !== canonicalJson(result.manifest)
    || canonicalJson(retainedManifest) !== canonicalJson(result.manifest)) {
    throw new Error('Native Game Asset bundle bytes do not match the returned content identities.')
  }
  return result
}

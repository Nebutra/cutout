import { sha256Bytes } from '@/asset-production/hash'
import { canonicalJson, fingerprint } from '@/design-ir/fingerprint'
import { base64ToBytes } from '@/lib/image'
import type { BundleRepository, BundleSaveReceipt } from '@/services/types'
import { isErr } from '@/services/types'
import { z } from 'zod'
import {
  fingerprintGameMapBundle,
  fingerprintGameMapObjectLibrary,
  fingerprintGameMapPreviewReceipt,
  fingerprintGameMapRuntimeManifest,
  gameMapBundleSchema,
  type GameMapAcceptedArtifact,
  type GameMapBundle,
} from './map'
import {
  GAME_MAP_COMPOSITOR,
  gameMapRuntimeProcessingInputSchema,
  nativeGameMapPreviewSchema,
  type GameMapRuntimeProcessingInput,
} from './map-production'
import {
  createGameMapLiveNativeRunner,
  gameMapLiveArtifactSchema,
  gameMapSemanticAcceptanceSchema,
  verifyGameMapSemanticAcceptance,
  type GameMapLiveNativeRunner,
} from './map-live-production'

export const GAME_MAP_MANAGED_BUNDLE_PREVIEW_PROTOCOL = 'cutout.game-map-managed-bundle-preview.v1' as const
export const GAME_MAP_MANAGED_BUNDLE_APPLY_PROTOCOL = 'cutout.game-map-managed-bundle-apply.v1' as const
export const GAME_MAP_BUNDLE_MANIFEST_PATH = 'manifests/bundle.json' as const

export const gameMapManagedBundleInputSchema = z.object({
  runtime: gameMapRuntimeProcessingInputSchema,
  preview: nativeGameMapPreviewSchema,
  semanticAcceptance: z.object({
    receipt: gameMapSemanticAcceptanceSchema,
    artifacts: z.array(gameMapLiveArtifactSchema).min(2).max(2_000),
  }).strict().optional(),
}).strict()
export type GameMapManagedBundleInput = z.infer<typeof gameMapManagedBundleInputSchema>

export interface GameMapManagedBundleFile {
  readonly logicalPath: string
  readonly artifactId: string
  readonly contentHash: string
  readonly byteLength: number
  readonly mediaType: 'application/json' | 'image/png'
  readonly bytes: Uint8Array
}

export interface PreparedGameMapManagedBundle {
  readonly protocol: typeof GAME_MAP_MANAGED_BUNDLE_PREVIEW_PROTOCOL
  readonly previewId: string
  readonly previewHash: string
  readonly bundleHash: string
  readonly name: string
  readonly bundle: GameMapBundle
  readonly files: readonly GameMapManagedBundleFile[]
  readonly input: GameMapManagedBundleInput
}

export interface AppliedGameMapManagedBundle {
  readonly protocol: typeof GAME_MAP_MANAGED_BUNDLE_APPLY_PROTOCOL
  readonly previewId: string
  readonly bundleHash: string
  readonly deliveryStatus: 'candidate' | 'accepted'
  readonly status: 'canceled' | 'candidate-exported' | 'accepted-exported'
  readonly receipt: BundleSaveReceipt
}

function acceptedIdentity(accepted: GameMapAcceptedArtifact): string {
  return `${accepted.artifact.id}@${accepted.artifact.revision}`
}

async function verifiedRasterFiles(
  runtime: GameMapRuntimeProcessingInput,
): Promise<readonly GameMapManagedBundleFile[]> {
  const expected = new Map<string, {
    readonly acceptedArtifact: GameMapAcceptedArtifact
    readonly logicalPath: string
  }>()
  for (const { role, source } of runtime.runtimeManifest.visuals) {
    expected.set(`runtime:${role}`, {
      acceptedArtifact: source,
      logicalPath: `assets/runtime/${role}.png`,
    })
  }
  for (const [index, object] of (runtime.objectLibrary?.objects ?? []).entries()) {
    expected.set(`object:${object.id}@${object.revision}`, {
      acceptedArtifact: object.visual,
      logicalPath: `assets/objects/${String(index).padStart(4, '0')}-${object.visual.artifact.contentHash}.png`,
    })
  }
  const expectedIdentities = [...expected.values()].map(({ acceptedArtifact }) => (
    acceptedIdentity(acceptedArtifact)
  ))
  if (new Set(expectedIdentities).size !== expectedIdentities.length) {
    throw new Error('Game Map bundle runtime inputs contain duplicate accepted artifact revisions.')
  }
  if (runtime.artifacts.length !== expected.size) {
    throw new Error('Game Map bundle raster inputs do not equal the exact runtime artifact closure.')
  }
  const paths = new Set<string>()
  const actualKeys = new Set<string>()
  const files = await Promise.all(runtime.artifacts.map(async (raster) => {
    if (raster.binding.kind === 'extraction-source') {
      throw new Error('Extraction sources cannot enter a managed Game Map bundle.')
    }
    const bindingKey = raster.binding.kind === 'runtime-visual'
      ? `runtime:${raster.binding.role}`
      : `object:${raster.binding.objectId}@${raster.binding.objectRevision}`
    const expectedRaster = expected.get(bindingKey)
    if (!expectedRaster
      || actualKeys.has(bindingKey)
      || canonicalJson(expectedRaster.acceptedArtifact) !== canonicalJson(raster.acceptedArtifact)) {
      throw new Error(`Game Map bundle raster ${bindingKey} does not match its exact accepted runtime reference.`)
    }
    actualKeys.add(bindingKey)
    const bytes = base64ToBytes(raster.bytesBase64)
    const contentHash = await sha256Bytes(bytes)
    if (contentHash !== raster.acceptedArtifact.artifact.contentHash
      || raster.acceptedArtifact.artifact.id !== `artifact:sha256:${contentHash}`) {
      throw new Error(`Game Map raster ${raster.acceptedArtifact.artifact.id} bytes failed bundle verification.`)
    }
    const logicalPath = expectedRaster.logicalPath
    if (paths.has(logicalPath)) throw new Error(`Game Map bundle path is duplicated: ${logicalPath}.`)
    paths.add(logicalPath)
    return {
      logicalPath,
      artifactId: `artifact:sha256:${contentHash}`,
      contentHash,
      byteLength: bytes.byteLength,
      mediaType: 'image/png' as const,
      bytes,
    }
  }))
  const order = new Map([...expected.values()].map(({ logicalPath }, index) => [logicalPath, index]))
  return files.sort((left, right) => order.get(left.logicalPath)! - order.get(right.logicalPath)!)
}

async function canonicalJsonFile(
  logicalPath: string,
  value: unknown,
): Promise<GameMapManagedBundleFile> {
  const bytes = new TextEncoder().encode(canonicalJson(value))
  const contentHash = await sha256Bytes(bytes)
  return {
    logicalPath,
    artifactId: `artifact:sha256:${contentHash}`,
    contentHash,
    byteLength: bytes.byteLength,
    mediaType: 'application/json',
    bytes,
  }
}

async function retainedPngFile(
  logicalPath: 'previews/map.png' | 'previews/debug.png',
  bytesBase64: string,
  expectedHash: string,
): Promise<GameMapManagedBundleFile> {
  const bytes = base64ToBytes(bytesBase64)
  const contentHash = await sha256Bytes(bytes)
  if (contentHash !== expectedHash) {
    throw new Error(`Game Map ${logicalPath} bytes failed bundle verification.`)
  }
  return {
    logicalPath,
    artifactId: `artifact:sha256:${contentHash}`,
    contentHash,
    byteLength: bytes.byteLength,
    mediaType: 'image/png',
    bytes,
  }
}

function uniqueProvenance(input: GameMapManagedBundleInput): GameMapBundle['provenance'] {
  const acceptedArtifacts = [
    ...input.runtime.runtimeManifest.visuals.map(({ source }) => source),
    ...(input.runtime.objectLibrary?.objects.map(({ visual }) => visual) ?? []),
  ]
  const references = [
    ...acceptedArtifacts.flatMap((acceptedArtifact) => [
      acceptedArtifact.artifact,
      {
        id: acceptedArtifact.acceptance.receiptId,
        revision: acceptedArtifact.acceptance.receiptRevision,
        contentHash: acceptedArtifact.acceptance.receiptHash,
      },
    ]),
    input.preview.receipt.preview,
    input.preview.receipt.debugOverlay,
    ...(input.semanticAcceptance ? [
      {
        id: input.semanticAcceptance.receipt.receiptId,
        revision: `revision:sha256:${input.semanticAcceptance.receipt.receiptHash}`,
        contentHash: input.semanticAcceptance.receipt.receiptHash,
      },
      ...input.semanticAcceptance.artifacts.map(({ sourceReceipt }) => ({
        id: sourceReceipt.artifact.artifactId,
        revision: `revision:sha256:${sourceReceipt.artifact.sha256}`,
        contentHash: sourceReceipt.artifact.sha256,
      })),
    ] : []),
  ]
  const seen = new Set<string>()
  return references.filter((reference) => {
    const identity = `${reference.id}@${reference.revision}`
    if (seen.has(identity)) return false
    seen.add(identity)
    return true
  })
}

function sameAcceptedInputs(input: GameMapManagedBundleInput): boolean {
  const expected = [...input.runtime.artifacts.map(({ acceptedArtifact }) => acceptedArtifact)]
    .sort((left, right) => acceptedIdentity(left).localeCompare(acceptedIdentity(right)))
  return canonicalJson(expected) === canonicalJson(input.preview.receipt.inputs)
}

async function verifyPreviewClosure(input: GameMapManagedBundleInput): Promise<void> {
  const { runtime, preview } = input
  const [manifestHash, objectLibraryHash, previewReceiptHash] = await Promise.all([
    fingerprintGameMapRuntimeManifest(runtime.runtimeManifest),
    runtime.objectLibrary ? fingerprintGameMapObjectLibrary(runtime.objectLibrary) : undefined,
    fingerprintGameMapPreviewReceipt(preview.receipt),
  ])
  if (manifestHash !== runtime.runtimeManifestHash
    || runtime.runtimeManifest.plan.id !== runtime.plan.id
    || runtime.runtimeManifest.plan.contentHash !== runtime.plan.contentHash
    || preview.receipt.runtimeManifest.id !== runtime.runtimeManifest.id
    || preview.receipt.runtimeManifest.revision !== runtime.runtimeManifest.revision
    || preview.receipt.runtimeManifest.contentHash !== manifestHash
    || preview.receipt.plan.id !== runtime.plan.id
    || preview.receipt.plan.contentHash !== runtime.plan.contentHash
    || preview.receipt.mapId !== runtime.runtimeManifest.mapId
    || preview.receipt.compositor.id !== GAME_MAP_COMPOSITOR
    || preview.receipt.validationStatus !== 'passed'
    || preview.receipt.findings.some(({ severity }) => severity === 'blocking')
    || !sameAcceptedInputs(input)
    || !previewReceiptHash) {
    throw new Error('Game Map preview does not close the exact accepted runtime inputs.')
  }
  if (preview.width !== runtime.runtimeManifest.world.width
    || preview.height !== runtime.runtimeManifest.world.height
    || preview.receipt.preview.id !== `artifact:sha256:${preview.receipt.preview.contentHash}`
    || preview.receipt.debugOverlay.id !== `artifact:sha256:${preview.receipt.debugOverlay.contentHash}`) {
    throw new Error('Game Map preview dimensions or artifact identities are not content-addressed runtime output.')
  }
  if (runtime.objectLibrary) {
    if (!preview.receipt.objectLibrary
      || runtime.objectLibrary.mapId !== runtime.runtimeManifest.mapId
      || runtime.objectLibrary.plan.id !== runtime.plan.id
      || runtime.objectLibrary.plan.contentHash !== runtime.plan.contentHash
      || !runtime.runtimeManifest.objectLibrary
      || runtime.runtimeManifest.objectLibrary.id !== runtime.objectLibrary.id
      || runtime.runtimeManifest.objectLibrary.revision !== runtime.objectLibrary.revision
      || runtime.runtimeManifest.objectLibrary.contentHash !== objectLibraryHash
      || preview.receipt.objectLibrary.id !== runtime.objectLibrary.id
      || preview.receipt.objectLibrary.revision !== runtime.objectLibrary.revision
      || preview.receipt.objectLibrary.contentHash !== objectLibraryHash
      || runtime.objectLibraryHash !== objectLibraryHash) {
      throw new Error('Game Map preview object-library identity is stale.')
    }
  } else if (preview.receipt.objectLibrary || runtime.objectLibraryHash
    || runtime.runtimeManifest.objectLibrary) {
    throw new Error('Game Map preview has an unexpected object-library identity.')
  }
}

export async function prepareGameMapManagedBundle(
  value: GameMapManagedBundleInput,
  liveRunner: GameMapLiveNativeRunner = createGameMapLiveNativeRunner(),
): Promise<PreparedGameMapManagedBundle> {
  const input = gameMapManagedBundleInputSchema.parse(value)
  await verifyPreviewClosure(input)
  const semanticAcceptance = input.semanticAcceptance
    ? await verifyGameMapSemanticAcceptance({
        acceptance: input.semanticAcceptance.receipt,
        runtime: input.runtime,
        preview: input.preview,
        artifacts: input.semanticAcceptance.artifacts,
      }, liveRunner)
    : undefined
  const rasterFiles = await verifiedRasterFiles(input.runtime)
  const [runtimeManifestFile, objectLibraryFile, previewFile, debugFile, previewReceiptHash, semanticAcceptanceFile] = await Promise.all([
    canonicalJsonFile('manifests/map.json', input.runtime.runtimeManifest),
    input.runtime.objectLibrary
      ? canonicalJsonFile('manifests/objects.json', input.runtime.objectLibrary)
      : undefined,
    retainedPngFile('previews/map.png', input.preview.previewBytesBase64, input.preview.receipt.preview.contentHash),
    retainedPngFile('previews/debug.png', input.preview.debugOverlayBytesBase64, input.preview.receipt.debugOverlay.contentHash),
    fingerprintGameMapPreviewReceipt(input.preview.receipt),
    semanticAcceptance
      ? canonicalJsonFile('evidence/semantic-acceptance.json', semanticAcceptance)
      : undefined,
  ])
  if (runtimeManifestFile.contentHash !== input.runtime.runtimeManifestHash
    || (objectLibraryFile && objectLibraryFile.contentHash !== input.runtime.objectLibraryHash)) {
    throw new Error('Canonical Game Map manifest bytes do not match the runtime identities.')
  }
  const payloadFiles = [
    ...rasterFiles,
    runtimeManifestFile,
    ...(objectLibraryFile ? [objectLibraryFile] : []),
    previewFile,
    debugFile,
    ...(semanticAcceptanceFile ? [semanticAcceptanceFile] : []),
  ]
  const bundle = gameMapBundleSchema.parse({
    version: 'game-map.bundle.v1',
    id: `bundle:game-map:${input.runtime.runtimeManifest.id}:${input.runtime.runtimeManifest.revision}`,
    mapId: input.runtime.runtimeManifest.mapId,
    deliveryStatus: semanticAcceptance ? 'accepted' : 'candidate',
    plan: input.runtime.plan,
    ...(input.runtime.objectLibrary && input.runtime.objectLibraryHash ? {
      objectLibrary: {
        id: input.runtime.objectLibrary.id,
        revision: input.runtime.objectLibrary.revision,
        contentHash: input.runtime.objectLibraryHash,
      },
    } : {}),
    runtimeManifest: {
      id: input.runtime.runtimeManifest.id,
      revision: input.runtime.runtimeManifest.revision,
      contentHash: input.runtime.runtimeManifestHash,
    },
    previewReceipt: { id: input.preview.receipt.id, contentHash: previewReceiptHash },
    ...(semanticAcceptance ? {
      semanticAcceptance: {
        receiptId: semanticAcceptance.receiptId,
        receiptRevision: `revision:sha256:${semanticAcceptance.receiptHash}`,
        receiptHash: semanticAcceptance.receiptHash,
      },
    } : {}),
    files: payloadFiles.map(({ bytes: _bytes, ...file }) => file),
    provenance: uniqueProvenance(input),
  })
  const bundleHash = await fingerprintGameMapBundle(bundle)
  const bundleManifestFile = await canonicalJsonFile(GAME_MAP_BUNDLE_MANIFEST_PATH, bundle)
  if (bundleManifestFile.contentHash !== bundleHash) {
    throw new Error('Game Map bundle manifest bytes do not match its canonical identity.')
  }
  const files = [...payloadFiles, bundleManifestFile]
  const previewHash = await fingerprint({
    bundleHash,
    name: `game-map-${bundleHash.slice(0, 12)}`,
    files: files.map(({ logicalPath, contentHash, byteLength, mediaType }) => ({
      logicalPath,
      contentHash,
      byteLength,
      mediaType,
    })),
  })
  return {
    protocol: GAME_MAP_MANAGED_BUNDLE_PREVIEW_PROTOCOL,
    previewId: `game-map-managed-bundle-preview:sha256:${previewHash}`,
    previewHash,
    bundleHash,
    name: `game-map-${bundleHash.slice(0, 12)}`,
    bundle,
    files,
    input,
  }
}

export async function applyPreparedGameMapManagedBundle(
  prepared: PreparedGameMapManagedBundle,
  repository: BundleRepository,
  liveRunner: GameMapLiveNativeRunner = createGameMapLiveNativeRunner(),
): Promise<AppliedGameMapManagedBundle> {
  const replay = await prepareGameMapManagedBundle(prepared.input, liveRunner)
  if (replay.previewId !== prepared.previewId
    || replay.previewHash !== prepared.previewHash
    || replay.bundleHash !== prepared.bundleHash
    || canonicalJson(replay.bundle) !== canonicalJson(prepared.bundle)) {
    throw new Error('Managed Game Map bundle preview is stale or changed.')
  }
  const result = await repository.save({
    name: replay.name,
    files: replay.files.map(({ logicalPath, bytes }) => ({ path: logicalPath, content: bytes })),
  })
  if (isErr(result)) throw new Error(result.error)
  if (!result.data.canceled) {
    const receipts = new Map(result.data.files.map((file) => [file.path, file]))
    const expectedPaths = new Set(replay.files.map(({ logicalPath }) => logicalPath))
    const mismatch = replay.files.find((file) => {
      const receipt = receipts.get(file.logicalPath)
      return receipt?.sha256 !== file.contentHash || receipt.size !== file.byteLength
    })
    const unexpected = result.data.files.find(({ path }) => !expectedPaths.has(path))
    const expectedTotalBytes = replay.files.reduce((total, file) => total + file.byteLength, 0)
    if (result.data.fileCount !== replay.files.length
      || result.data.files.length !== replay.files.length
      || receipts.size !== replay.files.length
      || result.data.totalBytes !== expectedTotalBytes
      || unexpected
      || mismatch) {
      throw new Error(`Managed Game Map export receipt does not match the previewed file closure${mismatch ? ` at ${mismatch.logicalPath}` : ''}.`)
    }
  }
  return {
    protocol: GAME_MAP_MANAGED_BUNDLE_APPLY_PROTOCOL,
    previewId: replay.previewId,
    bundleHash: replay.bundleHash,
    deliveryStatus: replay.bundle.deliveryStatus,
    status: result.data.canceled
      ? 'canceled'
      : replay.bundle.deliveryStatus === 'accepted'
        ? 'accepted-exported'
        : 'candidate-exported',
    receipt: result.data,
  }
}

import { sha256Bytes } from '@/asset-production/hash'
import { canonicalJson, fingerprint } from '@/design-ir/fingerprint'
import { readRasterDimensions } from '@/lib/raster-dimensions'
import {
  compareGameAssetEvidenceIdentity,
  gameAssetActionSchema,
  gameAssetAnchorSchema,
  gameAssetDirectionSchema,
  gameAssetKindSchema,
  gameAssetPlanSchema,
  gameAssetViewSchema,
  type GameAssetEvidenceReference,
} from './contracts'
import {
  gameAssetGenerationPreviewInputSchema,
  type GameAssetGenerationPreviewInput,
} from './generation'

const MAX_REFERENCE_BYTES = 64 * 1024 * 1024

export interface GameAssetActionAuthoringInput {
  readonly assetName: string
  readonly kind: 'player' | 'npc' | 'creature' | 'prop' | 'fx' | 'projectile' | 'impact'
  readonly view: 'topdown' | 'side' | 'three-quarter'
  readonly action: 'single' | 'idle' | 'walk' | 'run' | 'attack' | 'cast' | 'shoot' | 'jump' | 'hurt' | 'death' | 'hover' | 'charge' | 'projectile' | 'impact' | 'explode'
  readonly direction: 'none' | 'down' | 'left' | 'right' | 'up'
  readonly frameCount: number
  readonly prompt: string
  readonly frameWidth: number
  readonly frameHeight: number
  readonly expectedAlphaWidth: number
  readonly expectedAlphaHeight: number
  readonly anchor: 'center' | 'bottom' | 'feet' | 'ignition-baseline'
  readonly referenceFile: File
  readonly providerId: string
  readonly model: 'qwen-image-3.0' | 'qwen-image-3.0-pro'
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

function rasterMediaType(bytes: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' | undefined {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50
    && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 12
    && new TextDecoder().decode(bytes.subarray(0, 4)) === 'RIFF'
    && new TextDecoder().decode(bytes.subarray(8, 12)) === 'WEBP') return 'image/webp'
  return undefined
}

async function jsonEvidence(
  id: string,
  value: unknown,
): Promise<{
  readonly reference: GameAssetEvidenceReference
  readonly mediaType: 'application/json'
  readonly artifactBytesBase64: string
}> {
  const bytes = new TextEncoder().encode(canonicalJson(value))
  const contentHash = await sha256Bytes(bytes)
  return {
    reference: {
      id,
      revision: `revision:sha256:${contentHash}`,
      contentHash,
    },
    mediaType: 'application/json',
    artifactBytesBase64: bytesToBase64(bytes),
  }
}

function expectedAnchor(input: GameAssetActionAuthoringInput): { readonly x: number, readonly y: number } {
  if (input.anchor === 'ignition-baseline') {
    return {
      x: (input.frameWidth - input.expectedAlphaWidth) / 2,
      y: input.frameHeight / 2,
    }
  }
  return {
    x: input.frameWidth / 2,
    y: input.anchor === 'center'
      ? input.frameHeight / 2
      : (input.frameHeight + input.expectedAlphaHeight) / 2,
  }
}

export async function authorGameAssetActionRun(
  inputValue: GameAssetActionAuthoringInput,
): Promise<GameAssetGenerationPreviewInput> {
  const input = {
    ...inputValue,
    assetName: inputValue.assetName.trim(),
    prompt: inputValue.prompt.trim(),
    kind: gameAssetKindSchema.exclude(['layered-map']).parse(inputValue.kind),
    view: gameAssetViewSchema.parse(inputValue.view),
    action: gameAssetActionSchema.parse(inputValue.action),
    direction: gameAssetDirectionSchema.parse(inputValue.direction),
    anchor: gameAssetAnchorSchema.parse(inputValue.anchor),
  }
  if (!input.assetName || input.assetName.length > 120 || !input.prompt || input.prompt.length > 20_000) {
    throw new Error('Game Asset name or prompt is outside the reviewed bounds.')
  }
  if (!Number.isInteger(input.frameCount) || input.frameCount < 1 || input.frameCount > 16) {
    throw new Error('Game Asset action must contain between 1 and 16 frames.')
  }
  for (const dimension of [
    input.frameWidth,
    input.frameHeight,
    input.expectedAlphaWidth,
    input.expectedAlphaHeight,
  ]) {
    if (!Number.isInteger(dimension) || dimension < 1 || dimension > 2_048) {
      throw new Error('Game Asset dimensions are outside the reviewed bounds.')
    }
  }
  if (input.expectedAlphaWidth > input.frameWidth || input.expectedAlphaHeight > input.frameHeight) {
    throw new Error('Game Asset alpha target must fit within the output frame.')
  }
  const referenceBytes = new Uint8Array(await input.referenceFile.arrayBuffer())
  if (referenceBytes.byteLength < 1 || referenceBytes.byteLength > MAX_REFERENCE_BYTES) {
    throw new Error('Game Asset reference bytes are outside the retained evidence budget.')
  }
  const referenceMediaType = rasterMediaType(referenceBytes)
  const referenceDimensions = readRasterDimensions(referenceBytes)
  if (!referenceMediaType || !referenceDimensions) {
    throw new Error('Game Asset reference must be a decodable PNG, JPEG, or WebP image.')
  }
  const referenceHash = await sha256Bytes(referenceBytes)
  const reference = {
    reference: {
      id: `artifact:sha256:${referenceHash}`,
      revision: `revision:sha256:${referenceHash}`,
      contentHash: referenceHash,
    },
    mediaType: referenceMediaType,
    artifactBytesBase64: bytesToBase64(referenceBytes),
  } as const
  const authoring = {
    assetName: input.assetName,
    kind: input.kind,
    view: input.view,
    action: input.action,
    direction: input.direction,
    frameCount: input.frameCount,
    frame: { width: input.frameWidth, height: input.frameHeight },
    alphaTarget: { width: input.expectedAlphaWidth, height: input.expectedAlphaHeight },
    anchor: input.anchor,
    prompt: input.prompt,
    reference: {
      artifactId: reference.reference.id,
      width: referenceDimensions.width,
      height: referenceDimensions.height,
    },
  }
  const [artDirection, identityLock, scaleLock, anchorLock] = await Promise.all([
    jsonEvidence(`evidence:game-asset-art-direction:${referenceHash}`, {
      schema: 'game-asset.art-direction.v1',
      prompt: input.prompt,
      kind: input.kind,
      view: input.view,
    }),
    jsonEvidence(`evidence:game-asset-identity-lock:${referenceHash}`, {
      schema: 'game-asset.identity-lock.v1',
      assetName: input.assetName,
      referenceArtifactId: reference.reference.id,
      referenceHash,
    }),
    jsonEvidence(`evidence:game-asset-scale-lock:${referenceHash}`, {
      schema: 'game-asset.scale-lock.v1',
      expectedAlphaSize: {
        width: input.expectedAlphaWidth,
        height: input.expectedAlphaHeight,
      },
    }),
    jsonEvidence(`evidence:game-asset-anchor-lock:${referenceHash}`, {
      schema: 'game-asset.anchor-lock.v1',
      policy: input.anchor,
      expectedAnchor: expectedAnchor(input),
    }),
  ])
  const authoringHash = await fingerprint(authoring)
  const assetId = `asset:game:${authoringHash}`
  const plan = gameAssetPlanSchema.parse({
    version: 'game-asset.plan.v1',
    id: `plan:game:${authoringHash}`,
    assetId,
    kind: input.kind,
    view: input.view,
    artDirectionEvidence: [artDirection.reference],
    referenceArtifacts: [reference.reference],
    roles: Array.from({ length: input.frameCount }, (_, frameIndex) => ({
      id: `role:${input.action}:${input.direction}:${frameIndex}`,
      assetId,
      action: input.action,
      direction: input.direction,
      frameIndex,
      outputSchema: { id: 'game-asset.frame', version: 1 },
      identityLock: identityLock.reference,
      scaleLock: scaleLock.reference,
      expectedAlphaSize: {
        width: input.expectedAlphaWidth,
        height: input.expectedAlphaHeight,
      },
      anchorLock: anchorLock.reference,
      anchor: input.anchor,
      expectedAnchor: expectedAnchor(input),
    })),
    delivery: {
      formatId: 'game-asset.atlas-manifest.v1',
      frameWidth: input.frameWidth,
      frameHeight: input.frameHeight,
      columns: input.frameCount,
      rows: 1,
    },
  })
  const retainedEvidence = [artDirection, reference, identityLock, scaleLock, anchorLock]
    .sort((left, right) => compareGameAssetEvidenceIdentity(
      `${left.reference.id}@${left.reference.revision}`,
      `${right.reference.id}@${right.reference.revision}`,
    ))
  return gameAssetGenerationPreviewInputSchema.parse({
    identity: {
      id: `rehearsal:game:${authoringHash}`,
      revision: `revision:sha256:${await fingerprint({ authoringHash, plan })}`,
    },
    runId: `run:game:${crypto.randomUUID()}`,
    providerId: input.providerId,
    model: input.model,
    plan,
    retainedEvidence,
    roles: plan.roles.map((role) => ({
      roleId: role.id,
      prompt: [
        input.prompt,
        `Create only frame ${role.frameIndex + 1} of ${input.frameCount} for the ${input.action} action facing ${input.direction}.`,
        `Use the accepted reference exactly for identity, silhouette language, palette, and ${input.view} view.`,
        `One complete subject on a pure white background. No text, border, grid, labels, shadows crossing the canvas edge, or extra subjects.`,
        `Output ${input.frameWidth}x${input.frameHeight}; keep the subject near ${input.expectedAlphaWidth}x${input.expectedAlphaHeight} pixels with the ${input.anchor} anchor stable.`,
      ].join('\n'),
    })),
  })
}

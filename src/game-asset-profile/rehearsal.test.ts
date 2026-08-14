import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { sha256Bytes } from '@/asset-production/hash'
import { fingerprint } from '@/design-ir/fingerprint'
import { pngDimensionFixture } from '@/lib/raster-dimensions.test-fixture'
import type { MultimodalHostReceipt } from '@/multimodal-host/contracts'
import { verifyNativeMultimodalHostArtifact } from '@/multimodal-host/desktop-host'
import {
  compareGameAssetEvidenceIdentity,
  gameAssetPlanSchema,
  type GameAssetEvidenceReference,
  type GameAssetPlan,
} from './contracts'
import {
  gameAssetProductionRehearsalBundleSchema,
  verifyGameAssetProductionRehearsalBundle,
  type GameAssetProductionRehearsalBundle,
} from './rehearsal'
import { GAME_ASSET_RASTER_PROCESSOR } from './generation'

vi.mock('@/multimodal-host/desktop-host', () => ({
  verifyNativeMultimodalHostArtifact: vi.fn(),
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

function base64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

async function evidenceReference(
  id: string,
  bytes: Uint8Array,
): Promise<GameAssetEvidenceReference> {
  return {
    id,
    revision: `${id}:revision:1`,
    contentHash: await sha256Bytes(bytes),
  }
}

async function generationLocks(
  plan: GameAssetPlan,
  role: GameAssetPlan['roles'][number],
): Promise<readonly string[]> {
  const references = [
    ...plan.artDirectionEvidence,
    ...plan.referenceArtifacts,
    role.identityLock,
    role.scaleLock,
    role.anchorLock,
  ]
  const unique = new Map(references.map((reference) => [
    `${reference.id}@${reference.revision}`,
    reference,
  ]))
  return [
    `game-asset-plan:sha256:${await fingerprint(plan)}`,
    ...await Promise.all([...unique.values()]
      .sort((left, right) => compareGameAssetEvidenceIdentity(
        `${left.id}@${left.revision}`,
        `${right.id}@${right.revision}`,
      ))
      .map(async (reference) => `game-asset-evidence:sha256:${await fingerprint(reference)}`)),
  ]
}

async function generationReceipt(input: {
  readonly runId: string
  readonly roleId: string
  readonly index: number
  readonly bytes: Uint8Array
  readonly referenceArtifactIds: readonly string[]
  readonly lockIds: readonly string[]
}): Promise<MultimodalHostReceipt> {
  const sha256 = await sha256Bytes(input.bytes)
  return {
    protocol: 'cutout.multimodal-host-receipt.v1',
    receiptId: `receipt:game-frame:${input.index}`,
    receiptHash: (input.index + 1).toString(16).repeat(64),
    requestId: `request:game-frame:${input.index}`,
    runId: input.runId,
    providerId: 'provider:contract-test-only',
    providerKind: 'dashscope',
    model: 'qwen-image-3.0',
    routeId: 'route:dashscope:qwen-image-3.0:image-edit',
    operation: 'image-edit',
    semanticRole: input.roleId,
    nodeId: `node:game-asset-frame:${input.roleId}`,
    capabilityId: 'capability:image-generation',
    acceptedReferenceArtifactIds: [...input.referenceArtifactIds],
    lockIds: [...input.lockIds],
    status: 'succeeded',
    artifact: {
      artifactId: `artifact:sha256:${sha256}`,
      sha256,
      mediaType: 'image/png',
      byteLength: input.bytes.byteLength,
      decoded: true,
      width: 128,
      height: 128,
    },
    startedAt: 1_000 + input.index * 100,
    completedAt: 1_050 + input.index * 100,
    signature: (input.index + 8).toString(16).repeat(64),
  }
}

async function createRejectedPathBundle(): Promise<GameAssetProductionRehearsalBundle> {
  const evidenceBytes = {
    artDirection: new TextEncoder().encode('{"palette":"high-contrast"}'),
    masterFrame: pngDimensionFixture(128, 128, 90),
    identity: new TextEncoder().encode('{"identity":"hero"}'),
    scale: new TextEncoder().encode('{"scale":"80x104"}'),
    anchor: new TextEncoder().encode('{"anchor":"feet@64,116"}'),
  }
  const [artDirection, masterFrame, identityLock, scaleLock, anchorLock] = await Promise.all([
    evidenceReference('evidence:art-direction', evidenceBytes.artDirection),
    sha256Bytes(evidenceBytes.masterFrame).then((hash) => evidenceReference(`artifact:sha256:${hash}`, evidenceBytes.masterFrame)),
    evidenceReference('evidence:identity-lock', evidenceBytes.identity),
    evidenceReference('evidence:scale-lock', evidenceBytes.scale),
    evidenceReference('evidence:anchor-lock', evidenceBytes.anchor),
  ])
  const plan = gameAssetPlanSchema.parse({
    version: 'game-asset.plan.v1',
    id: 'plan:contract-test-only',
    assetId: 'asset:contract-test-only',
    kind: 'player',
    view: 'side',
    artDirectionEvidence: [artDirection],
    referenceArtifacts: [masterFrame],
    roles: [0, 1].map((frameIndex) => ({
      id: `role:run:right:${frameIndex}`,
      assetId: 'asset:contract-test-only',
      action: 'run',
      direction: 'right',
      frameIndex,
      outputSchema: { id: 'game-asset.frame', version: 1 },
      identityLock,
      scaleLock,
      expectedAlphaSize: { width: 80, height: 104 },
      anchorLock,
      anchor: 'feet',
      expectedAnchor: { x: 64, y: 116 },
    })),
    delivery: {
      formatId: 'game-asset.atlas-manifest.v1',
      frameWidth: 128,
      frameHeight: 128,
      columns: 2,
      rows: 1,
    },
  })
  const retainedById = new Map([
    [artDirection.id, { reference: artDirection, mediaType: 'application/json' as const, bytes: evidenceBytes.artDirection }],
    [masterFrame.id, { reference: masterFrame, mediaType: 'image/png' as const, bytes: evidenceBytes.masterFrame }],
    [identityLock.id, { reference: identityLock, mediaType: 'application/json' as const, bytes: evidenceBytes.identity }],
    [scaleLock.id, { reference: scaleLock, mediaType: 'application/json' as const, bytes: evidenceBytes.scale }],
    [anchorLock.id, { reference: anchorLock, mediaType: 'application/json' as const, bytes: evidenceBytes.anchor }],
  ])
  const retainedEvidence = [...retainedById.values()]
    .sort((left, right) => compareGameAssetEvidenceIdentity(
      `${left.reference.id}@${left.reference.revision}`,
      `${right.reference.id}@${right.reference.revision}`,
    ))
    .map(({ reference, mediaType, bytes }) => ({
      reference,
      mediaType,
      artifactBytesBase64: base64(bytes),
    }))
  const runId = 'run:game-contract-test-only'
  const frameBytes = [pngDimensionFixture(128, 128, 1), pngDimensionFixture(128, 128, 2)]
  const frames = await Promise.all(plan.roles.map(async (role, index) => {
    const receipt = await generationReceipt({
      runId,
      roleId: role.id,
      index,
      bytes: frameBytes[index]!,
      referenceArtifactIds: [masterFrame.id],
      lockIds: await generationLocks(plan, role),
    })
    const processingEvidence = {
      protocol: 'cutout.game-asset-raster-processing.v1' as const,
      implementation: GAME_ASSET_RASTER_PROCESSOR,
      whiteThreshold: 246 as const,
      backgroundAlphaMax: 8 as const,
      sourceArtifactId: receipt.artifact.artifactId,
      sourceArtifactSha256: receipt.artifact.sha256,
      outputArtifactId: receipt.artifact.artifactId,
      outputArtifactSha256: receipt.artifact.sha256,
      outputByteLength: frameBytes[index]!.byteLength,
    }
    return {
      roleId: role.id,
      receipt,
      sourceArtifactBytesBase64: base64(frameBytes[index]!),
      artifactBytesBase64: base64(frameBytes[index]!),
      processingEvidence,
      pixelEvidence: {
      implementation: 'rgba-alpha-bounds-v1' as const,
      alphaThreshold: 8 as const,
      decodedWidth: 128,
      decodedHeight: 128,
      alphaBounds: { x: 24, y: 12, width: 80, height: 104 },
      edgeContact: false,
      anchor: { x: 64, y: 116 },
      },
    }
  }))
  const identity = {
    id: 'rehearsal:game-contract-test-only',
    revision: 'rehearsal:revision:1',
  }
  const roleRequests = await Promise.all(plan.roles.map(async (role, index) => {
    const prompt = `Contract-only prompt for ${role.id}`
    return {
      roleId: role.id,
      requestId: frames[index]!.receipt.requestId,
      prompt,
      promptHash: await sha256Bytes(new TextEncoder().encode(prompt)),
      semanticRole: role.id,
      nodeId: `node:game-asset-frame:${role.id}`,
      capabilityId: 'capability:image-generation' as const,
      acceptedReferenceArtifactIds: [masterFrame.id],
      lockIds: await generationLocks(plan, role),
      anchorPolicy: 'feet' as const,
    }
  }))
  const digestRoleRequests = roleRequests.map(({ anchorPolicy: _anchorPolicy, ...request }) => request)
  const requestDigest = await fingerprint({
    identity,
    runId,
    providerId: 'provider:contract-test-only',
    model: 'qwen-image-3.0',
    plan,
    retainedEvidence: retainedEvidence.map((evidence) => ({
      reference: evidence.reference,
      mediaType: evidence.mediaType,
      byteLength: atob(evidence.artifactBytesBase64).length,
    })),
    roles: digestRoleRequests,
    outputSize: '128x128',
    processorImplementation: GAME_ASSET_RASTER_PROCESSOR,
  })
  const authorization = {
    protocol: 'cutout.game-asset-generation-authorization.v2' as const,
    receiptId: 'receipt:game-asset-authorization:contract-test-only',
    receiptHash: 'd'.repeat(64),
    planId: `game-asset-preview:sha256:${requestDigest}`,
    requestDigest,
    executionId: 'execution:game-asset:contract-test-only',
    executionMode: 'byok-direct' as const,
    identity,
    runId,
    providerId: 'provider:contract-test-only',
    model: 'qwen-image-3.0' as const,
    gamePlanId: plan.id,
    gamePlanHash: await fingerprint(plan),
    outputSize: '128x128',
    processorImplementation: GAME_ASSET_RASTER_PROCESSOR,
    roleRequests,
    outputs: frames.map((frame) => ({
      roleId: frame.roleId,
      receiptId: frame.receipt.receiptId,
      receiptHash: frame.receipt.receiptHash,
      sourceArtifactId: frame.receipt.artifact.artifactId,
      sourceArtifactSha256: frame.receipt.artifact.sha256,
      artifactId: frame.processingEvidence.outputArtifactId,
      artifactSha256: frame.processingEvidence.outputArtifactSha256,
      processingEvidence: frame.processingEvidence,
      pixelEvidence: frame.pixelEvidence,
    })),
    status: 'succeeded' as const,
    startedAt: 900,
    completedAt: 2_000,
    signature: 'f'.repeat(64),
  }
  return gameAssetProductionRehearsalBundleSchema.parse({
    schema: 'game-asset.production-rehearsal.v1',
    identity,
    runId,
    plan,
    authorization,
    retainedEvidence,
    frames,
  })
}

describe('Game Asset retained-evidence verifier contract (negative paths only)', () => {
  beforeEach(() => {
    vi.mocked(verifyNativeMultimodalHostArtifact).mockReset()
    vi.mocked(invoke).mockReset()
  })

  it('rejects caller-authored observation, evaluation, and readiness fields before native verification', async () => {
    const bundle = await createRejectedPathBundle()
    const forged = {
      ...bundle,
      observedFrames: [],
      evaluation: { status: 'passed' },
      productionReady: true,
    }

    await expect(verifyGameAssetProductionRehearsalBundle(forged)).rejects.toThrow()
    expect(verifyNativeMultimodalHostArtifact).not.toHaveBeenCalled()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('requires native authorization verification before trusting retained frame bytes', async () => {
    const bundle = await createRejectedPathBundle()
    bundle.frames[0]!.artifactBytesBase64 = bundle.frames[1]!.artifactBytesBase64
    vi.mocked(invoke).mockRejectedValue(new Error('native authorization rejected retained byte drift'))

    await expect(verifyGameAssetProductionRehearsalBundle(bundle))
      .rejects.toThrow(/native authorization rejected retained byte drift/)
    expect(invoke).toHaveBeenCalledOnce()
    expect(verifyNativeMultimodalHostArtifact).not.toHaveBeenCalled()
  })

  it('fails the complete contract when native verification rejects a later retained frame', async () => {
    const bundle = await createRejectedPathBundle()
    vi.mocked(invoke).mockImplementation(async (_command, args) => (
      args as { authorization: GameAssetProductionRehearsalBundle['authorization'] }
    ).authorization)
    vi.mocked(verifyNativeMultimodalHostArtifact)
      .mockImplementationOnce(async ({ receipt }) => ({ verified: true, receipt, artifact: receipt.artifact }))
      .mockRejectedValueOnce(new Error('native receipt authentication rejected'))

    await expect(verifyGameAssetProductionRehearsalBundle(bundle))
      .rejects.toThrow(/native receipt authentication rejected/)
    expect(verifyNativeMultimodalHostArtifact).toHaveBeenCalledTimes(2)
  })
})

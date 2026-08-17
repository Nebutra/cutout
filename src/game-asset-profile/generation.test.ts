import { describe, expect, it } from 'vitest'
import { compareGameAssetEvidenceIdentity } from './contracts'
import {
  ADAPTIVE_BOARD_GAME_ASSET_RASTER_PROCESSOR,
  CHROMA_ML_GAME_ASSET_RASTER_PROCESSOR,
  GAME_ASSET_RASTER_PROCESSOR,
  GAME_ASSET_RASTER_SCALE_POLICY,
  LEGACY_GAME_ASSET_RASTER_PROCESSOR,
  V5_GAME_ASSET_RASTER_PROCESSOR,
  V6_GAME_ASSET_RASTER_PROCESSOR,
  V7_GAME_ASSET_RASTER_PROCESSOR,
  WHITE_BOARD_GAME_ASSET_RASTER_PROCESSOR,
  gameAssetSemanticAcceptanceDecisionSchema,
  gameAssetSemanticAcceptancePreviewSchema,
  gameAssetGenerationRepairLineageSchema,
  gameAssetGenerationRepairPreviewSchema,
  gameAssetRasterProcessingEvidenceSchema,
} from './generation'

describe('Game Asset native generation contracts (contract-only)', () => {
  it('uses locale-independent UTF-8 ordering for evidence identities', () => {
    const identities = ['evidence:中', 'evidence:z', 'evidence:ä', 'evidence:a']
    expect(identities.sort(compareGameAssetEvidenceIdentity)).toEqual([
      'evidence:a',
      'evidence:z',
      'evidence:ä',
      'evidence:中',
    ])
  })

  it('requires an exact self-addressed semantic acceptance preview', () => {
    const digest = 'a'.repeat(64)
    const artifactId = `artifact:sha256:${'b'.repeat(64)}`
    const preview = {
      protocol: 'cutout.game-asset-semantic-acceptance-preview.v1',
      previewId: `game-asset-acceptance-preview:sha256:${digest}`,
      reviewDigest: digest,
      generationReceiptId: 'receipt:generation:one',
      generationReceiptHash: 'c'.repeat(64),
      planId: `game-asset-preview:sha256:${'d'.repeat(64)}`,
      runId: 'run:game:one',
      roleIds: ['role:idle'],
      artifactIds: [artifactId],
      expiresAt: 1,
      requiresApproval: true,
    } as const
    expect(gameAssetSemanticAcceptancePreviewSchema.parse(preview)).toEqual(preview)
    expect(() => gameAssetSemanticAcceptancePreviewSchema.parse({
      ...preview,
      previewId: `game-asset-acceptance-preview:sha256:${'e'.repeat(64)}`,
    })).toThrow(/preview closure/i)
  })

  it('requires repair preview to replace a strict subset of the parent roles', () => {
    const digest = 'a'.repeat(64)
    const preview = {
      protocol: 'cutout.game-asset-generation-repair-preview.v2',
      planId: `game-asset-preview:sha256:${digest}`,
      requestDigest: digest,
      runId: 'run:repair:1',
      gamePlanId: 'plan:runner',
      providerId: 'provider:qwen',
      model: 'qwen-image-3.0-pro',
      roleIds: ['role:run:0', 'role:run:1'],
      referenceArtifactIds: [`artifact:sha256:${'b'.repeat(64)}`],
      outputSize: '1024x1024',
      processorImplementation: GAME_ASSET_RASTER_PROCESSOR,
      expiresAt: 1,
      executionMode: 'byok-direct',
      parentAuthorizationReceiptId: 'receipt:parent',
      parentAuthorizationReceiptHash: 'c'.repeat(64),
      replacementRoleIds: ['role:run:1'],
    } as const
    expect(gameAssetGenerationRepairPreviewSchema.parse(preview)).toEqual(preview)
    expect(() => gameAssetGenerationRepairPreviewSchema.parse({
      ...preview,
      replacementRoleIds: preview.roleIds,
    })).toThrow(/repair preview closure/i)
  })

  it('binds preserved repair roles to their exact origin identities', () => {
    const lineage = {
      parentReceiptId: 'receipt:parent',
      parentReceiptHash: 'a'.repeat(64),
      replacedRoleIds: ['role:run:1'],
      preservedRoles: [{
        roleId: 'role:run:0',
        originRunId: 'run:original',
        requestId: 'request:original:0',
        receiptId: 'receipt:original:0',
        sourceArtifactId: `artifact:sha256:${'b'.repeat(64)}`,
        artifactId: `artifact:sha256:${'c'.repeat(64)}`,
      }],
    } as const
    expect(gameAssetGenerationRepairLineageSchema.parse(lineage)).toEqual(lineage)
    expect(() => gameAssetGenerationRepairLineageSchema.parse({
      ...lineage,
      preservedRoles: [{ ...lineage.preservedRoles[0], artifactId: 'artifact:mutable' }],
    })).toThrow()
  })

  it('cannot encode a rejected or incomplete role as semantic acceptance', () => {
    expect(() => gameAssetSemanticAcceptanceDecisionSchema.parse({
      roleId: 'role:idle',
      referenceContinuity: 'accepted',
      roleReadability: 'rejected',
      styleConsistency: 'accepted',
    })).toThrow()
    expect(() => gameAssetSemanticAcceptanceDecisionSchema.parse({
      roleId: 'role:idle',
      referenceContinuity: 'accepted',
      roleReadability: 'accepted',
    })).toThrow()
  })

  it('requires exact source and processed identities in raster processing evidence', () => {
    const sourceHash = 'a'.repeat(64)
    const outputHash = 'b'.repeat(64)
    const evidence = {
      protocol: 'cutout.game-asset-raster-processing.v1',
      implementation: GAME_ASSET_RASTER_PROCESSOR,
      backgroundColor: [255, 0, 255],
      colorDistanceThreshold: 128,
      mattingRoute: 'adaptive-border-chroma-trimap-pymatting-ml-foreground',
      backgroundAlphaMax: 8,
      sourceArtifactId: `artifact:sha256:${sourceHash}`,
      sourceArtifactSha256: sourceHash,
      outputArtifactId: `artifact:sha256:${outputHash}`,
      outputArtifactSha256: outputHash,
      outputByteLength: 128,
      sourceAlphaBounds: { x: 20, y: 4, width: 60, height: 92 },
      sourceSize: { width: 128, height: 128 },
      frameSize: { width: 128, height: 128 },
      alphaTarget: { width: 80, height: 104 },
      expectedAnchor: { x: 64, y: 116 },
      anchorPolicy: 'feet',
      scalePolicy: GAME_ASSET_RASTER_SCALE_POLICY,
      resizedSubjectSize: { width: 68, height: 104 },
      placement: { x: 30, y: 12, width: 68, height: 104 },
      outputAlphaBounds: { x: 30, y: 12, width: 68, height: 104 },
    } as const
    expect(gameAssetRasterProcessingEvidenceSchema.parse(evidence)).toEqual(evidence)
    expect(() => gameAssetRasterProcessingEvidenceSchema.parse({
      ...evidence,
      outputArtifactSha256: 'c'.repeat(64),
    })).toThrow(/identities/i)
    expect(() => gameAssetRasterProcessingEvidenceSchema.parse({
      ...evidence,
      colorDistanceThreshold: 4_097,
    })).toThrow()
    expect(gameAssetRasterProcessingEvidenceSchema.parse({
      ...evidence,
      implementation: V5_GAME_ASSET_RASTER_PROCESSOR,
    }).implementation).toBe(V5_GAME_ASSET_RASTER_PROCESSOR)
    expect(gameAssetRasterProcessingEvidenceSchema.parse({
      ...evidence,
      implementation: V6_GAME_ASSET_RASTER_PROCESSOR,
    }).implementation).toBe(V6_GAME_ASSET_RASTER_PROCESSOR)
    expect(gameAssetRasterProcessingEvidenceSchema.parse({
      ...evidence,
      implementation: V7_GAME_ASSET_RASTER_PROCESSOR,
    }).implementation).toBe(V7_GAME_ASSET_RASTER_PROCESSOR)
    expect(GAME_ASSET_RASTER_PROCESSOR).toMatch(/-v7$/)
  })

  it('keeps normalized v4 evidence replayable without granting adaptive-border v5', () => {
    const sourceHash = 'a'.repeat(64)
    const outputHash = 'b'.repeat(64)
    const evidence = {
      protocol: 'cutout.game-asset-raster-processing.v1',
      implementation: CHROMA_ML_GAME_ASSET_RASTER_PROCESSOR,
      backgroundColor: [255, 0, 255],
      colorDistanceThreshold: 64,
      mattingRoute: 'chroma-trimap-pymatting-ml-foreground',
      backgroundAlphaMax: 8,
      sourceArtifactId: `artifact:sha256:${sourceHash}`,
      sourceArtifactSha256: sourceHash,
      outputArtifactId: `artifact:sha256:${outputHash}`,
      outputArtifactSha256: outputHash,
      outputByteLength: 128,
      sourceAlphaBounds: { x: 20, y: 4, width: 60, height: 92 },
      sourceSize: { width: 128, height: 128 },
      frameSize: { width: 128, height: 128 },
      alphaTarget: { width: 80, height: 104 },
      expectedAnchor: { x: 64, y: 116 },
      anchorPolicy: 'feet',
      scalePolicy: GAME_ASSET_RASTER_SCALE_POLICY,
      resizedSubjectSize: { width: 68, height: 104 },
      placement: { x: 30, y: 12, width: 68, height: 104 },
      outputAlphaBounds: { x: 30, y: 12, width: 68, height: 104 },
    } as const
    expect(gameAssetRasterProcessingEvidenceSchema.parse(evidence)).toEqual(evidence)
    expect(() => gameAssetRasterProcessingEvidenceSchema.parse({
      ...evidence,
      implementation: GAME_ASSET_RASTER_PROCESSOR,
    })).toThrow()
  })

  it('keeps normalized v3 evidence replayable without granting the v4 or v5 foreground estimator', () => {
    const sourceHash = 'a'.repeat(64)
    const outputHash = 'b'.repeat(64)
    const evidence = {
      protocol: 'cutout.game-asset-raster-processing.v1',
      implementation: ADAPTIVE_BOARD_GAME_ASSET_RASTER_PROCESSOR,
      backgroundColor: [255, 0, 255],
      colorDistanceThreshold: 36,
      mattingRoute: 'adaptive-uniform-board',
      backgroundAlphaMax: 8,
      sourceArtifactId: `artifact:sha256:${sourceHash}`,
      sourceArtifactSha256: sourceHash,
      outputArtifactId: `artifact:sha256:${outputHash}`,
      outputArtifactSha256: outputHash,
      outputByteLength: 128,
      sourceAlphaBounds: { x: 20, y: 4, width: 60, height: 92 },
      sourceSize: { width: 128, height: 128 },
      frameSize: { width: 128, height: 128 },
      alphaTarget: { width: 80, height: 104 },
      expectedAnchor: { x: 64, y: 116 },
      anchorPolicy: 'feet',
      scalePolicy: GAME_ASSET_RASTER_SCALE_POLICY,
      resizedSubjectSize: { width: 68, height: 104 },
      placement: { x: 30, y: 12, width: 68, height: 104 },
      outputAlphaBounds: { x: 30, y: 12, width: 68, height: 104 },
    } as const
    expect(gameAssetRasterProcessingEvidenceSchema.parse(evidence)).toEqual(evidence)
    expect(() => gameAssetRasterProcessingEvidenceSchema.parse({
      ...evidence,
      implementation: GAME_ASSET_RASTER_PROCESSOR,
    })).toThrow()
  })

  it('keeps normalized v2 evidence replayable without treating it as v3 adaptive matting', () => {
    const sourceHash = 'a'.repeat(64)
    const outputHash = 'b'.repeat(64)
    const evidence = {
      protocol: 'cutout.game-asset-raster-processing.v1',
      implementation: WHITE_BOARD_GAME_ASSET_RASTER_PROCESSOR,
      whiteThreshold: 246,
      backgroundAlphaMax: 8,
      sourceArtifactId: `artifact:sha256:${sourceHash}`,
      sourceArtifactSha256: sourceHash,
      outputArtifactId: `artifact:sha256:${outputHash}`,
      outputArtifactSha256: outputHash,
      outputByteLength: 128,
      sourceAlphaBounds: { x: 20, y: 4, width: 60, height: 92 },
      sourceSize: { width: 128, height: 128 },
      frameSize: { width: 128, height: 128 },
      alphaTarget: { width: 80, height: 104 },
      expectedAnchor: { x: 64, y: 116 },
      anchorPolicy: 'feet',
      scalePolicy: GAME_ASSET_RASTER_SCALE_POLICY,
      resizedSubjectSize: { width: 68, height: 104 },
      placement: { x: 30, y: 12, width: 68, height: 104 },
      outputAlphaBounds: { x: 30, y: 12, width: 68, height: 104 },
    } as const
    expect(gameAssetRasterProcessingEvidenceSchema.parse(evidence)).toEqual(evidence)
  })

  it('keeps retained v1 processing evidence decodable without granting it v2 geometry', () => {
    const sourceHash = 'a'.repeat(64)
    const outputHash = 'b'.repeat(64)
    const legacyEvidence = {
      protocol: 'cutout.game-asset-raster-processing.v1',
      implementation: LEGACY_GAME_ASSET_RASTER_PROCESSOR,
      whiteThreshold: 246,
      backgroundAlphaMax: 8,
      sourceArtifactId: `artifact:sha256:${sourceHash}`,
      sourceArtifactSha256: sourceHash,
      outputArtifactId: `artifact:sha256:${outputHash}`,
      outputArtifactSha256: outputHash,
      outputByteLength: 128,
    } as const

    expect(gameAssetRasterProcessingEvidenceSchema.parse(legacyEvidence)).toEqual(legacyEvidence)
    expect(() => gameAssetRasterProcessingEvidenceSchema.parse({
      ...legacyEvidence,
      scalePolicy: GAME_ASSET_RASTER_SCALE_POLICY,
    })).toThrow()
  })
})

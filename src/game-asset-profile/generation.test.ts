import { describe, expect, it } from 'vitest'
import { compareGameAssetEvidenceIdentity } from './contracts'
import {
  GAME_ASSET_RASTER_PROCESSOR,
  GAME_ASSET_RASTER_SCALE_POLICY,
  LEGACY_GAME_ASSET_RASTER_PROCESSOR,
  gameAssetSemanticAcceptanceDecisionSchema,
  gameAssetSemanticAcceptancePreviewSchema,
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
      whiteThreshold: 246,
      backgroundAlphaMax: 8,
      sourceArtifactId: `artifact:sha256:${sourceHash}`,
      sourceArtifactSha256: sourceHash,
      outputArtifactId: `artifact:sha256:${outputHash}`,
      outputArtifactSha256: outputHash,
      outputByteLength: 128,
      sourceAlphaBounds: { x: 20, y: 4, width: 60, height: 92 },
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

import { describe, expect, it } from 'vitest'
import {
  gameAssetFamilyProductionInputSchema,
  gameAssetFamilyRetainedEvidenceSchema,
  nativeGameAssetScaleProfileSchema,
} from './family-production'
import { compileDefaultGameAssetFamilyPlan, type GameAssetFamilyAuthoringInput } from './family'

function evidence(id: string, hashCharacter: string) {
  const contentHash = hashCharacter.repeat(64)
  return { id, revision: `revision:sha256:${contentHash}`, contentHash }
}

function authoringInput(): GameAssetFamilyAuthoringInput {
  return {
    sourceText: 'Create idle, run, attack body, and detached attack FX.',
    assetName: 'Courier',
    kind: 'player',
    view: 'side',
    direction: 'right',
    frame: { width: 512, height: 512 },
    bodyAlphaTarget: { width: 300, height: 420 },
    fxAlphaTarget: { width: 420, height: 260 },
    identityReference: evidence('artifact:identity-reference', '1'),
    artDirectionEvidence: evidence('evidence:art-direction', '2'),
    identityLock: evidence('evidence:identity-lock', '3'),
    provisionalScaleLock: evidence('evidence:scale-lock', '4'),
    bodyAnchorLock: evidence('evidence:body-anchor', '5'),
    fxAnchorLock: evidence('evidence:fx-anchor', '6'),
  }
}

describe('native Game Asset family production contract', () => {
  it('has no caller-authored merged clip in either repair evidence variant', () => {
    expect(gameAssetFamilyRetainedEvidenceSchema.safeParse({
      kind: 'complete-sheet-repair',
      evidence: { mergedClip: {} },
    }).success).toBe(false)
    expect(gameAssetFamilyRetainedEvidenceSchema.safeParse({
      kind: 'partial-sheet-repair',
      evidence: { mergedClip: {} },
    }).success).toBe(false)
    expect(gameAssetFamilyRetainedEvidenceSchema.safeParse({
      kind: 'local-partial-reprocess',
      evidence: { mergedClip: {} },
    }).success).toBe(false)
  })

  it('keeps measured alpha size observational instead of making it the normalization target', () => {
    const identityLock = evidence('evidence:identity-lock', '3')
    const profile = nativeGameAssetScaleProfileSchema.parse({
      version: 'game-asset.scale-profile.v1',
      id: `scale-profile:${'7'.repeat(64)}`,
      familyPlanId: 'family:plan',
      masterClipId: 'clip:idle',
      masterClipHash: '8'.repeat(64),
      compatibleClasses: ['grounded-body'],
      canvas: { width: 512, height: 512 },
      measuredAlphaSize: { width: 81, height: 420 },
      anchorPolicy: 'feet',
      measuredAnchor: { x: 256, y: 466 },
      identityLock,
      measurementImplementation: 'rgba-alpha-bounds-v1',
      normalizationContract: {
        processorImplementation: 'cutout-adaptive-border-chroma-trimap-pymatting-ml-foreground-normalize-anchor-shadow-prune-rust-image-0.23-v6',
        frameSize: { width: 512, height: 512 },
        alphaTarget: { width: 300, height: 420 },
        expectedAnchor: { x: 256, y: 466 },
        anchorPolicy: 'feet',
        identityLock,
        scaleLock: evidence('evidence:scale-lock', '4'),
        scalePolicy: 'contain-preserve-aspect',
      },
    })

    expect(profile.measuredAlphaSize.width).toBe(81)
    expect(profile.normalizationContract.alphaTarget.width).toBe(300)
  })

  it('rejects renderer readiness and incomplete semantic closure', async () => {
    const familyPlan = await compileDefaultGameAssetFamilyPlan(authoringInput())
    expect(gameAssetFamilyProductionInputSchema.safeParse({
      familyPlan,
      retainedEvidence: [],
      decisions: [],
      acceptedGroupIds: familyPlan.groups.map(({ id }) => id),
      readiness: 'ready',
    }).success).toBe(false)
  })
})

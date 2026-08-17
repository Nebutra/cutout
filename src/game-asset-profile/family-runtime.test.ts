import { describe, expect, it } from 'vitest'
import {
  compileDefaultGameAssetFamilyPlan,
  type GameAssetActionClip,
  type GameAssetFamilyAuthoringInput,
} from './family'
import {
  deriveGameAssetScaleProfile,
  projectGameAssetFamilyActionStates,
  projectGameAssetFamilyClosure,
} from './family-runtime'

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

function masterClip(
  familyPlanId: string,
  groupId: string,
  atomicPlanId: string,
  roleIds: readonly string[],
): GameAssetActionClip {
  return {
    version: 'game-asset.action-clip.v1',
    id: 'clip:master',
    familyPlanId,
    groupId,
    atomicPlanId,
    atomicPlanHash: '7'.repeat(64),
    sourceId: 'source:master',
    frames: roleIds.map((roleId, index) => {
      const sourceHash = String((index % 8) + 1).repeat(64)
      const outputHash = String(((index + 4) % 8) + 1).repeat(64)
      return {
        roleId,
        sourceArtifactId: `artifact:sha256:${sourceHash}`,
        artifactId: `artifact:sha256:${outputHash}`,
        artifactSha256: outputHash,
        artifactBytesBase64: 'iVBORw0KGgo=',
        durationMs: 160,
        anchor: { x: 256, y: 466 },
        processingEvidence: {
          protocol: 'cutout.game-asset-raster-processing.v1',
          implementation: 'cutout-adaptive-border-chroma-trimap-pymatting-ml-foreground-normalize-anchor-shadow-prune-rust-image-0.23-v6',
          backgroundAlphaMax: 8,
          sourceArtifactId: `artifact:sha256:${sourceHash}`,
          sourceArtifactSha256: sourceHash,
          outputArtifactId: `artifact:sha256:${outputHash}`,
          outputArtifactSha256: outputHash,
          outputByteLength: 8,
          backgroundColor: [255, 0, 255],
          colorDistanceThreshold: 64,
          mattingRoute: 'adaptive-border-chroma-trimap-pymatting-ml-foreground',
          sourceAlphaBounds: { x: 80, y: 30, width: 250 + index, height: 400 },
          sourceSize: { width: 512, height: 512 },
          frameSize: { width: 512, height: 512 },
          alphaTarget: { width: 300, height: 420 },
          expectedAnchor: { x: 256, y: 466 },
          anchorPolicy: 'feet',
          scalePolicy: 'contain-preserve-aspect',
          resizedSubjectSize: { width: 250 + index, height: 400 },
          placement: { x: 131 - Math.floor(index / 2), y: 66, width: 250 + index, height: 400 },
          outputAlphaBounds: { x: 131 - Math.floor(index / 2), y: 66, width: 250 + index, height: 400 },
        },
        pixelEvidence: {
          implementation: 'rgba-alpha-bounds-v1',
          alphaThreshold: 8,
          decodedWidth: 512,
          decodedHeight: 512,
          alphaBounds: { x: 131 - Math.floor(index / 2), y: 66, width: 250 + index, height: 400 },
          edgeContact: false,
          anchor: { x: 256, y: 466 },
        },
      }
    }),
  }
}

describe('Game Asset family runtime projection (contract-only)', () => {
  it('keeps every missing action visibly blocked instead of inferring family completion', async () => {
    const plan = await compileDefaultGameAssetFamilyPlan(authoringInput())
    const actions = projectGameAssetFamilyActionStates(plan, [])

    expect(actions).toHaveLength(4)
    expect(actions.every(({ result }) => result.status === 'failed')).toBe(true)
    await expect(projectGameAssetFamilyClosure({
      familyPlan: plan,
      actions,
      acceptedGroupIds: [],
    })).resolves.toMatchObject({
      status: 'blocked',
      scaleProfile: null,
    })
  })

  it('derives one content-addressed scale profile from measured master geometry', async () => {
    const plan = await compileDefaultGameAssetFamilyPlan(authoringInput())
    const idle = plan.groups[0]!
    const clip = masterClip(plan.id, idle.id, idle.plan.id, idle.plan.roles.map(({ id }) => id))
    const profile = await deriveGameAssetScaleProfile({
      familyPlan: plan,
      masterGroup: idle,
      masterClip: clip,
    })

    expect(profile.id).toMatch(/^scale-profile:[a-f0-9]{64}$/)
    expect(profile.masterClipId).toBe(clip.id)
    expect(profile.measuredAlphaSize).toEqual({ width: 253, height: 400 })
    expect(profile.measuredAnchor).toEqual({ x: 256, y: 466 })
  })

  it('rejects unexplained anchor drift in the proposed master clip', async () => {
    const plan = await compileDefaultGameAssetFamilyPlan(authoringInput())
    const idle = plan.groups[0]!
    const clip = masterClip(plan.id, idle.id, idle.plan.id, idle.plan.roles.map(({ id }) => id))
    const drifted = {
      ...clip,
      frames: clip.frames.map((frame, index) => (
        index === 2 ? { ...frame, anchor: { ...frame.anchor, y: frame.anchor.y + 2 } } : frame
      )),
    }

    await expect(deriveGameAssetScaleProfile({
      familyPlan: plan,
      masterGroup: idle,
      masterClip: drifted,
    })).rejects.toThrow('anchor drift')
  })
})

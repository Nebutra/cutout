import { describe, expect, it } from 'vitest'
import { pngDimensionFixture } from '@/lib/raster-dimensions.test-fixture'
import { compareGameAssetEvidenceIdentity } from './contracts'
import { authorGameAssetActionRun } from './authoring'

function blobPart(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

describe('Game Asset action authoring contract (contract-only)', () => {
  it('builds a content-addressed retained plan from user-selected bytes without claiming rehearsal', async () => {
    const input = await authorGameAssetActionRun({
      assetName: 'Courier',
      kind: 'player',
      view: 'side',
      action: 'run',
      direction: 'right',
      frameCount: 4,
      prompt: 'A compact high-contrast courier with a red scarf.',
      frameWidth: 1024,
      frameHeight: 1024,
      expectedAlphaWidth: 640,
      expectedAlphaHeight: 800,
      anchor: 'feet',
      referenceFile: new File([blobPart(pngDimensionFixture(320, 480, 7))], 'courier.png', { type: 'image/png' }),
      providerId: 'provider:dashscope-qwen-image3',
      model: 'qwen-image-3.0-pro',
    })
    expect(input.plan.roles).toHaveLength(4)
    expect(input.roles.map(({ roleId }) => roleId)).toEqual(input.plan.roles.map(({ id }) => id))
    expect(input.retainedEvidence.map(({ reference }) => `${reference.id}@${reference.revision}`))
      .toEqual([...input.retainedEvidence]
        .sort((left, right) => compareGameAssetEvidenceIdentity(
          `${left.reference.id}@${left.reference.revision}`,
          `${right.reference.id}@${right.reference.revision}`,
        ))
        .map(({ reference }) => `${reference.id}@${reference.revision}`))
    expect(input.roles.every(({ prompt }) => prompt.includes('pure white background'))).toBe(true)
    expect(input).not.toHaveProperty('productionReady')
    expect(input).not.toHaveProperty('semanticAcceptance')
  })

  it('rejects undecodable references and alpha targets outside the frame', async () => {
    const base = {
      assetName: 'Courier',
      kind: 'player' as const,
      view: 'side' as const,
      action: 'run' as const,
      direction: 'right' as const,
      frameCount: 4,
      prompt: 'Courier run cycle.',
      frameWidth: 1024,
      frameHeight: 1024,
      expectedAlphaWidth: 640,
      expectedAlphaHeight: 800,
      anchor: 'feet' as const,
      providerId: 'provider:dashscope-qwen-image3',
      model: 'qwen-image-3.0-pro' as const,
    }
    await expect(authorGameAssetActionRun({
      ...base,
      referenceFile: new File([blobPart(Uint8Array.of(1, 2, 3))], 'broken.png', { type: 'image/png' }),
    })).rejects.toThrow(/decodable/i)
    await expect(authorGameAssetActionRun({
      ...base,
      expectedAlphaWidth: 1_025,
      referenceFile: new File([blobPart(pngDimensionFixture(320, 480, 7))], 'courier.png', { type: 'image/png' }),
    })).rejects.toThrow(/fit/i)
  })
})

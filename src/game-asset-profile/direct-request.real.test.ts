import { readFile, writeFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { sha256Bytes } from '@/asset-production/hash'
import { createGameAssetLaunchRequest, routeWorkspaceSubmission } from '@/workspace/scenario-launch'
import { authorGameAssetActionRun } from './authoring'
import { gameAssetGenerationPreviewInputSchema } from './generation'

const referencePath = process.env.CUTOUT_REAL_GAME_REFERENCE
const outputPath = process.env.CUTOUT_REAL_GAME_PREVIEW_OUTPUT

function blobPart(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

describe.runIf(Boolean(referencePath && outputPath))('direct real Game Asset GUI request', () => {
  it('compiles retained Qwen reference bytes into the exact native preview payload', async () => {
    const bytes = new Uint8Array(await readFile(referencePath!))
    const route = routeWorkspaceSubmission('给这个角色做 4 帧向右跑步素材')
    if (route.kind !== 'game-assets') throw new Error('Expected a Game Asset route')
    const launch = createGameAssetLaunchRequest(route.intent, [{
      name: 'cutout-game-reference.png',
      mediaType: 'image/png',
      bytes,
    }])
    if (!launch.reference) throw new Error('Expected the one retained image reference')

    const input = await authorGameAssetActionRun({
      assetName: 'Courier',
      kind: launch.intent.kind,
      view: launch.intent.view,
      action: launch.intent.action,
      direction: launch.intent.direction,
      frameCount: launch.intent.frameCount,
      prompt: launch.intent.sourceText,
      frameWidth: 1024,
      frameHeight: 1024,
      expectedAlphaWidth: 640,
      expectedAlphaHeight: 800,
      anchor: 'feet',
      referenceFile: new File([blobPart(launch.reference.bytes)], launch.reference.name, {
        type: launch.reference.mediaType,
      }),
      providerId: 'dashscope-qwen-image3',
      model: 'qwen-image-3.0-pro',
    })
    const decoded = gameAssetGenerationPreviewInputSchema.parse(input)
    const referenceHash = await sha256Bytes(bytes)

    expect(decoded.plan.roles).toHaveLength(4)
    expect(decoded.roles).toHaveLength(4)
    expect(decoded.model).toBe('qwen-image-3.0-pro')
    expect(decoded.retainedEvidence).toContainEqual(expect.objectContaining({
      reference: expect.objectContaining({
        id: `artifact:sha256:${referenceHash}`,
        contentHash: referenceHash,
      }),
      mediaType: 'image/png',
    }))
    expect(decoded).not.toHaveProperty('approvalId')
    expect(decoded).not.toHaveProperty('productionReady')

    await writeFile(outputPath!, JSON.stringify(decoded), { encoding: 'utf8', mode: 0o600 })
  })
})

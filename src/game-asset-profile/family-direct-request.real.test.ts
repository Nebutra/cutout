import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { authorGameAssetFamilyRun } from './family-authoring'

const referencePath = process.env.CUTOUT_REAL_GAME_FAMILY_REFERENCE
const outputDir = process.env.CUTOUT_REAL_GAME_FAMILY_PREVIEW_DIR

function familyKind(): 'player' | 'npc' | 'creature' | 'prop' {
  const value = process.env.CUTOUT_REAL_GAME_FAMILY_KIND ?? 'player'
  if (value === 'player' || value === 'npc' || value === 'creature' || value === 'prop') return value
  throw new Error(`Unsupported CUTOUT_REAL_GAME_FAMILY_KIND: ${value}`)
}

function blobPart(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

describe.runIf(Boolean(referencePath && outputDir))('direct real Game Asset family request', () => {
  it('compiles one retained identity into exact native Qwen action-sheet previews', async () => {
    const bytes = new Uint8Array(await readFile(referencePath!))
    const authored = await authorGameAssetFamilyRun({
      assetName: process.env.CUTOUT_REAL_GAME_FAMILY_ASSET_NAME ?? 'Courier',
      sourceText: process.env.CUTOUT_REAL_GAME_FAMILY_INTENT
        ?? '为这个角色制作一套完整的待机、跑步和带独立刀光的攻击动作，保持身份、侧视角、比例和脚底锚点稳定。',
      kind: familyKind(),
      view: 'side',
      direction: 'right',
      referenceFile: new File([blobPart(bytes)], 'cutout-game-reference.png', { type: 'image/png' }),
      providerId: process.env.CUTOUT_REAL_GAME_FAMILY_PROVIDER_ID ?? 'dashscope-qwen-image3',
      model: process.env.CUTOUT_REAL_GAME_FAMILY_MODEL === 'qwen-image-3.0'
        ? 'qwen-image-3.0'
        : 'qwen-image-3.0-pro',
    })

    expect(authored.previews.length).toBeGreaterThan(0)
    expect(authored.previews).toHaveLength(authored.plan.groups.length)
    await mkdir(outputDir!, { recursive: true, mode: 0o700 })
    await writeFile(
      path.join(outputDir!, 'family-plan.json'),
      JSON.stringify(authored.plan, null, 2),
      { encoding: 'utf8', mode: 0o600 },
    )
    for (let index = 0; index < authored.previews.length; index += 1) {
      const group = authored.plan.groups[index]!
      const preview = authored.previews[index]!
      await writeFile(
        path.join(outputDir!, `${String(index + 1).padStart(2, '0')}-${group.action}.json`),
        JSON.stringify(preview, null, 2),
        { encoding: 'utf8', mode: 0o600 },
      )
    }
  })
})

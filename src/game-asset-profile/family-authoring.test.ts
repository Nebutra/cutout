import { describe, expect, it } from 'vitest'
import { pngDimensionFixture } from '@/lib/raster-dimensions.test-fixture'
import {
  authorGameAssetFamilyRun,
  compileGameAssetActionSheetRepairPrompt,
} from './family-authoring'

function blobPart(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

describe('Game Asset family authoring contract (contract-only)', () => {
  it('turns one natural-language character request into four coherent native previews', async () => {
    const authored = await authorGameAssetFamilyRun({
      assetName: 'Crimson Ranger',
      sourceText: '制作待机、跑步和带独立刀光的攻击动作，保持角色身份和脚底锚点稳定。',
      kind: 'player',
      view: 'side',
      direction: 'right',
      referenceFile: new File(
        [blobPart(pngDimensionFixture(320, 480, 19))],
        'crimson-ranger.png',
        { type: 'image/png' },
      ),
      providerId: 'provider:dashscope-qwen-image3',
      model: 'qwen-image-3.0-pro',
    })

    expect(authored.plan.groups).toHaveLength(4)
    expect(authored.previews).toHaveLength(4)
    expect(authored.previews.map(({ groupId }) => groupId))
      .toEqual(authored.plan.groups.map(({ id }) => id))
    expect(authored.previews.every(({ familyPlanId }) => familyPlanId === authored.plan.id)).toBe(true)
    expect(new Set(authored.previews.map(({ familyPlanHash }) => familyPlanHash)).size).toBe(1)
    expect(authored.previews.every(({ grid, plan }) => (
      grid.rows * grid.columns === plan.roles.length
    ))).toBe(true)
    expect(authored.previews.every(({ retainedEvidence, plan }) => (
      retainedEvidence.some(({ reference }) => reference.id === plan.referenceArtifacts[0]?.id)
    ))).toBe(true)
    expect(authored.previews.reduce((calls, preview) => (
      calls + (preview.grid.rows * preview.grid.columns > 0 ? 1 : 0)
    ), 0)).toBe(4)
    expect(authored.plan.groups
      .filter(({ component }) => component === 'body')
      .flatMap(({ plan }) => plan.roles)
      .every(({ expectedAlphaSize, expectedAnchor }) => (
        expectedAlphaSize.width === 448
        && expectedAlphaSize.height === 448
        && expectedAnchor.x === 256
        && expectedAnchor.y === 480
      ))).toBe(true)

    const attackFxGroup = authored.plan.groups.find(({ component }) => component === 'detached-fx')!
    const attackFx = authored.previews.find(({ groupId }) => groupId === attackFxGroup.id)
    expect(attackFx?.sourceBrief).toContain('Do not include the primary subject.')
    expect(authored.previews.some((preview) => 'approvalId' in preview)).toBe(false)
    expect(authored.previews.some((preview) => 'productionReady' in preview)).toBe(false)
  })

  it('compiles body and detached FX repair briefs from the exact planned role', async () => {
    const authored = await authorGameAssetFamilyRun({
      assetName: 'Crimson Ranger',
      sourceText: '制作待机、跑步和带独立刀光的攻击动作。',
      kind: 'player',
      view: 'side',
      direction: 'right',
      referenceFile: new File(
        [blobPart(pngDimensionFixture(320, 480, 23))],
        'crimson-ranger.png',
        { type: 'image/png' },
      ),
      providerId: 'provider:dashscope-qwen-image3',
      model: 'qwen-image-3.0-pro',
    })
    const body = authored.plan.groups.find(({ component }) => component === 'body')!
    const fx = authored.plan.groups.find(({ component }) => component === 'detached-fx')!
    const bodyPrompt = compileGameAssetActionSheetRepairPrompt({
      role: body.plan.roles[0]!, component: body.component, failed: true, excludeDetachedVisual: true,
    })
    const fxPrompt = compileGameAssetActionSheetRepairPrompt({
      role: fx.plan.roles[0]!, component: fx.component, failed: true, excludeDetachedVisual: false,
    })

    expect(bodyPrompt).toContain('primary subject')
    expect(bodyPrompt).toContain('planned 448x448 normalization envelope')
    expect(bodyPrompt).toContain('uninterrupted magenta')
    expect(bodyPrompt).toContain('Keep every detached-visual origin empty')
    expect(bodyPrompt).not.toContain('96 pixels')
    expect(fxPrompt).toContain('planned 448x448 normalization envelope')
    expect(fxPrompt).toContain('Preserve only the retained detached visual')
    expect(fxPrompt).toContain('Do not include the primary subject')
    expect(fxPrompt).not.toContain('blade-shaped')
  })

  it('authors grounded props through the same native request path with frame-derived geometry', async () => {
    const authored = await authorGameAssetFamilyRun({
      assetName: 'Copper Turret',
      sourceText: '为自动炮塔制作待机、充能、开火和独立炮口火焰。',
      kind: 'prop',
      view: 'three-quarter',
      direction: 'right',
      referenceFile: new File(
        [blobPart(pngDimensionFixture(480, 320, 31))],
        'copper-turret.png',
        { type: 'image/png' },
      ),
      providerId: 'provider:dashscope-qwen-image3',
      model: 'qwen-image-3.0-pro',
    })

    expect(authored.plan.kind).toBe('prop')
    expect(authored.plan.groups.map(({ action }) => action)).toEqual(['idle', 'shoot', 'charge', 'impact'])
    const bodyRoles = authored.plan.groups
      .filter(({ component }) => component === 'body')
      .flatMap(({ plan }) => plan.roles)
    expect(bodyRoles.every(({ anchor }) => anchor === 'bottom')).toBe(true)
    expect(bodyRoles.every(({ expectedAlphaSize, expectedAnchor }) => (
      expectedAlphaSize.width === 448
      && expectedAlphaSize.height === 448
      && expectedAnchor.x === 256
      && expectedAnchor.y === 480
    ))).toBe(true)
    const briefs = authored.previews.map(({ sourceBrief }) => sourceBrief).join('\n').toLowerCase()
    expect(briefs).not.toMatch(/blade|weapon|feet|character|humanoid/)
  })
})

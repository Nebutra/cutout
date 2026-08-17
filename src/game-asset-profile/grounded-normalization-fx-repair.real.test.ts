import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { compileGameAssetActionSheetRepairPrompt } from './family-authoring'
import {
  gameAssetActionSheetApplyResultSchema,
  gameAssetActionSheetPartialRepairPreviewInputSchema,
  gameAssetActionSheetPreviewInputSchema,
} from './family'

const previewPath = process.env.CUTOUT_REAL_GAME_ACTION_SHEET_PREVIEW_INPUT
const parentResultPath = process.env.CUTOUT_REAL_GAME_ACTION_SHEET_PARENT_APPLY_RESULT
const outputPath = process.env.CUTOUT_REAL_GAME_ACTION_SHEET_PARTIAL_REPAIR_INPUT
const repairComponent = process.env.CUTOUT_REAL_GAME_ACTION_SHEET_REPAIR_COMPONENT === 'body'
  ? 'body' as const
  : 'detached-fx' as const

const enabled = Boolean(previewPath && parentResultPath && outputPath)

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, 'utf8')) as unknown
}

describe.runIf(enabled)('real Game Asset partial repair request assembly', () => {
  it('targets only failed cells with the production repair brief', async () => {
    const preview = gameAssetActionSheetPreviewInputSchema.parse(await readJson(previewPath!))
    const parent = gameAssetActionSheetApplyResultSchema.parse(await readJson(parentResultPath!))
    if (parent.status !== 'partial' || !parent.source || !parent.partial || !parent.partialAuthorization) {
      throw new Error('Real successor FX parent is not a signed partial action sheet.')
    }
    const roles = parent.partial.failures.map(({ roleId }) => {
      const role = preview.plan.roles.find(({ id }) => id === roleId)
      if (!role) throw new Error(`Failed successor FX role ${roleId} disappeared from its plan.`)
      return {
        roleId,
        prompt: compileGameAssetActionSheetRepairPrompt({
          role,
          component: repairComponent,
          failed: true,
          excludeDetachedVisual: repairComponent === 'body',
        }),
      }
    })
    const input = gameAssetActionSheetPartialRepairPreviewInputSchema.parse({
      parentAuthorization: parent.partialAuthorization,
      parentSource: parent.source,
      parentPartial: parent.partial,
      runId: `run:game-family-action-sheet-partial-repair:${crypto.randomUUID()}`,
      plan: preview.plan,
      roles,
    })

    expect(input.roles.map(({ roleId }) => roleId)).toEqual(
      parent.partial.failures.map(({ roleId }) => roleId),
    )
    expect(input.roles.every(({ roleId, prompt }) => {
      const role = preview.plan.roles.find(({ id }) => id === roleId)!
      return prompt.includes(`planned ${role.expectedAlphaSize.width}x${role.expectedAlphaSize.height} normalization envelope`)
        && !prompt.includes('96 pixels')
        && !prompt.includes('Preserve the retained character identity')
        && (repairComponent === 'body'
          ? prompt.includes('Keep every detached-visual origin empty')
          : prompt.includes('Preserve only the retained detached visual'))
    })).toBe(true)

    await mkdir(path.dirname(outputPath!), { recursive: true, mode: 0o700 })
    await writeFile(outputPath!, JSON.stringify(input, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    })
  })
})

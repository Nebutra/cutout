import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { fingerprint } from '@/design-ir/fingerprint'
import {
  gameAssetActionSheetPreviewInputSchema,
  gameAssetFamilyPlanSchema,
} from './family'

const successorPlanPath = process.env.CUTOUT_REAL_GAME_SUCCESSOR_FAMILY_PLAN
const parentFxPreviewPath = process.env.CUTOUT_REAL_GAME_PARENT_FX_PREVIEW_INPUT
const outputPath = process.env.CUTOUT_REAL_GAME_SUCCESSOR_FX_PREVIEW_OUTPUT

const enabled = Boolean(successorPlanPath && parentFxPreviewPath && outputPath)

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, 'utf8')) as unknown
}

describe.runIf(enabled)('real successor Game Asset FX request assembly', () => {
  it('rebinds retained identity bytes to the exact successor FX authority', async () => {
    const successorPlan = gameAssetFamilyPlanSchema.parse(await readJson(successorPlanPath!))
    const parentPreview = gameAssetActionSheetPreviewInputSchema.parse(
      await readJson(parentFxPreviewPath!),
    )
    const group = successorPlan.groups.find(({ component }) => component === 'detached-fx')
    if (!group || group.source.strategy !== 'coherent-grid') {
      throw new Error('Successor Game Asset plan does not contain one coherent detached FX group.')
    }
    const familyPlanHash = await fingerprint(successorPlan)
    const preview = gameAssetActionSheetPreviewInputSchema.parse({
      identity: {
        id: `rehearsal:${group.id}`,
        revision: `revision:sha256:${familyPlanHash}`,
      },
      runId: `run:game-family:${crypto.randomUUID()}`,
      providerId: parentPreview.providerId,
      model: parentPreview.model,
      familyPlanId: successorPlan.id,
      familyPlanHash,
      groupId: group.id,
      plan: group.plan,
      retainedEvidence: parentPreview.retainedEvidence,
      sourceBrief: group.sourceBrief,
      grid: {
        rows: group.source.rows,
        columns: group.source.columns,
      },
      frameDurationMs: group.timing.frameDurationMs,
      looping: group.timing.looping,
    })

    expect(preview.familyPlanId).toBe(successorPlan.id)
    expect(preview.groupId).toBe(group.id)
    expect(preview.plan.id).toBe(group.plan.id)
    expect(preview.retainedEvidence).toEqual(parentPreview.retainedEvidence)
    expect(preview.plan.roles).toHaveLength(6)
    expect(preview.plan.roles.every(({ expectedAlphaSize }) => (
      expectedAlphaSize.width === 420 && expectedAlphaSize.height === 260
    ))).toBe(true)

    await mkdir(path.dirname(outputPath!), { recursive: true, mode: 0o700 })
    await writeFile(outputPath!, JSON.stringify(preview, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    })
  })
})

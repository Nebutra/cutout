import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  gameAssetFamilyAcceptancePreviewSchema,
  gameAssetFamilyProductionInputSchema,
} from './family-production'

const inputPath = process.env.CUTOUT_REAL_GAME_FAMILY_PRODUCTION_INPUT
const previewPath = process.env.CUTOUT_REAL_GAME_FAMILY_ACCEPTANCE_PREVIEW

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, 'utf8')) as unknown
}

describe.runIf(Boolean(inputPath && previewPath))('real Game Asset family acceptance preview', () => {
  it('decodes four native-replay groups and exact local FX authority', async () => {
    const input = gameAssetFamilyProductionInputSchema.parse(await readJson(inputPath!))
    const preview = gameAssetFamilyAcceptancePreviewSchema.parse(await readJson(previewPath!))
    const fx = input.retainedEvidence[3]

    expect(input.retainedEvidence.map(({ kind }) => kind)).toEqual([
      'grounded-normalization-migration',
      'grounded-normalization-migration',
      'grounded-normalization-migration',
      'local-partial-reprocess',
    ])
    expect(input.decisions).toHaveLength(22)
    expect(preview.clips).toHaveLength(4)
    expect(preview.roleIds).toHaveLength(22)
    expect(preview.artifactIds).toHaveLength(22)
    expect(preview.clips[3]?.sourceKind).toBe('local-partial-reprocess')
    expect(fx?.kind).toBe('local-partial-reprocess')
    if (fx?.kind !== 'local-partial-reprocess') return
    expect(fx.evidence.reprocessAuthorization.providerCalls).toBe(0)
    expect(fx.evidence.reprocessAuthorization.clipId).toBe(fx.evidence.clip.id)
  })
})

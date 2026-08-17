import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  compileGameAssetGroundedNormalizationSuccessorPlan,
  gameAssetActionSheetApplyResultSchema,
  gameAssetActionSheetPartialRepairApplyResultSchema,
  gameAssetFamilyPlanSchema,
} from './family'
import { gameAssetFamilyOriginalRetainedEvidenceSchema } from './family-production'

const parentPlanPath = process.env.CUTOUT_REAL_GAME_PARENT_FAMILY_PLAN
const idleResultPath = process.env.CUTOUT_REAL_GAME_IDLE_APPLY_RESULT
const runResultPath = process.env.CUTOUT_REAL_GAME_RUN_APPLY_RESULT
const attackParentPath = process.env.CUTOUT_REAL_GAME_ATTACK_PARENT_APPLY_RESULT
const attackRepairPath = process.env.CUTOUT_REAL_GAME_ATTACK_REPAIR_APPLY_RESULT
const outputDir = process.env.CUTOUT_REAL_GAME_GROUNDED_MIGRATION_INPUT_DIR

const enabled = [
  parentPlanPath,
  idleResultPath,
  runResultPath,
  attackParentPath,
  attackRepairPath,
  outputDir,
].every(Boolean)

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, 'utf8')) as unknown
}

describe.runIf(enabled)('real grounded normalization input assembly', () => {
  it('binds retained Qwen authority to one deterministic successor family plan', async () => {
    const parentPlan = gameAssetFamilyPlanSchema.parse(await readJson(parentPlanPath!))
    const successorPlan = await compileGameAssetGroundedNormalizationSuccessorPlan(parentPlan)
    const idle = gameAssetActionSheetApplyResultSchema.parse(await readJson(idleResultPath!))
    const run = gameAssetActionSheetApplyResultSchema.parse(await readJson(runResultPath!))
    const attackParent = gameAssetActionSheetApplyResultSchema.parse(await readJson(attackParentPath!))
    const attackRepair = gameAssetActionSheetPartialRepairApplyResultSchema.parse(await readJson(attackRepairPath!))

    expect(idle.status).toBe('succeeded')
    expect(run.status).toBe('succeeded')
    expect(attackParent.status).toBe('partial')
    expect(attackRepair.status).toBe('succeeded')
    const parentEvidence = [
      gameAssetFamilyOriginalRetainedEvidenceSchema.parse({
        kind: 'coherent-sheet',
        evidence: {
          authorization: idle.authorization,
          source: idle.source,
          clip: idle.clip,
        },
      }),
      gameAssetFamilyOriginalRetainedEvidenceSchema.parse({
        kind: 'coherent-sheet',
        evidence: {
          authorization: run.authorization,
          source: run.source,
          clip: run.clip,
        },
      }),
      gameAssetFamilyOriginalRetainedEvidenceSchema.parse({
        kind: 'partial-sheet-repair',
        evidence: {
          parentAuthorization: attackParent.partialAuthorization,
          parentSource: attackParent.source,
          parentPartial: attackParent.partial,
          repairAuthorization: attackRepair.authorization,
          outputs: attackRepair.outputs,
        },
      }),
    ]
    await mkdir(outputDir!, { recursive: true, mode: 0o700 })
    await Promise.all([
      writeFile(
        path.join(outputDir!, 'parent-family-plan.json'),
        JSON.stringify(parentPlan, null, 2),
        { encoding: 'utf8', mode: 0o600 },
      ),
      writeFile(
        path.join(outputDir!, 'successor-family-plan.json'),
        JSON.stringify(successorPlan, null, 2),
        { encoding: 'utf8', mode: 0o600 },
      ),
      writeFile(
        path.join(outputDir!, 'parent-evidence.json'),
        JSON.stringify(parentEvidence, null, 2),
        { encoding: 'utf8', mode: 0o600 },
      ),
    ])
    expect(successorPlan.groups.slice(0, 3).every((group) => (
      group.plan.roles.every((role) => (
        role.expectedAlphaSize.width === 448 && role.expectedAlphaSize.height === 420
      ))
    ))).toBe(true)
  })
})

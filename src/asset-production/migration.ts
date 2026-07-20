import type { Box } from '@/algorithm/types'
import {
  assetProductionSnapshotSchema,
  emptyAssetProductionSnapshot,
  type AssetProductionSnapshot,
  type ProductionArtifactRef,
} from './contracts'
import { sha256Bytes, sha256Json } from './hash'
import { compileAssetProductionPlan } from './planner'
import { warningIssue } from './quality-policy'
import { reduceAssetProduction } from './reducer'

export interface LegacyProductionSlice {
  readonly id: string
  readonly name: string
  readonly blob: Blob
  readonly width: number
  readonly height: number
  readonly box: Box
  readonly regionId?: string | null
  readonly pageId?: string | null
  readonly assetManifestItemId?: string | null
}

export interface LegacyMigrationInput {
  readonly projectId: string
  readonly projectRevisionId: string
  readonly slices: readonly LegacyProductionSlice[]
  readonly createdAt: number
  readonly writeArtifact?: (input: {
    readonly bytes: Uint8Array
    readonly mediaType: string
    readonly runId: string
  }) => Promise<string>
}

export async function migrateLegacySlicesToAssetProduction(
  input: LegacyMigrationInput,
): Promise<AssetProductionSnapshot> {
  if (input.slices.length === 0) return emptyAssetProductionSnapshot()
  const prepared = await Promise.all(input.slices.map(async (slice) => {
    const bytes = new Uint8Array(await slice.blob.arrayBuffer())
    const sha256 = await sha256Bytes(bytes)
    return { slice, bytes, sha256 }
  }))
  const plan = await compileAssetProductionPlan({
    sourceRevision: { projectRevisionId: input.projectRevisionId, pageArtifacts: [] },
    items: prepared.map(({ slice }) => ({
      manifestItemId: slice.assetManifestItemId ?? `legacy:${slice.id}`,
      pageId: slice.pageId ?? 'legacy-page',
      regionId: slice.regionId ?? 'legacy-region',
      route: 'import-cutout',
    })),
    createdAt: input.createdAt,
  })
  const runHash = await sha256Json({ projectId: input.projectId, planHash: plan.planHash })
  const runId = `legacy-run:${runHash.slice(0, 24)}`
  let snapshot = reduceAssetProduction(emptyAssetProductionSnapshot(), { type: 'plan-registered', plan })
  snapshot = reduceAssetProduction(snapshot, {
    type: 'run-started', planId: plan.planId, runId, at: input.createdAt,
  })

  const taskByManifest = new Map(plan.tasks.map((task) => [task.manifestItemId, task]))
  const taskStates = { ...snapshot.runs[runId]!.tasks }
  for (const { slice, bytes, sha256 } of prepared) {
    const manifestItemId = slice.assetManifestItemId ?? `legacy:${slice.id}`
    const task = taskByManifest.get(manifestItemId)
    if (!task) throw new Error(`Legacy slice has no production task: ${slice.id}`)
    const artifactId = input.writeArtifact
      ? await input.writeArtifact({ bytes, mediaType: slice.blob.type || 'image/png', runId })
      : `artifact:sha256:${sha256}`
    const artifact: ProductionArtifactRef = {
      artifactId,
      sha256,
      mediaType: slice.blob.type || 'image/png',
      width: slice.width,
      height: slice.height,
    }
    taskStates[task.taskId] = {
      taskId: task.taskId,
      status: 'legacy-ready',
      attempt: 0,
      candidate: artifact,
      output: artifact,
      issues: [warningIssue(
        'legacy-unverified',
        `Legacy slice "${slice.name}" has no historical QA or production receipt.`,
        input.createdAt,
      )],
      origin: 'legacy-imported',
      updatedAt: input.createdAt,
    }
  }

  return assetProductionSnapshotSchema.parse({
    ...snapshot,
    revision: snapshot.revision + 1,
    runs: {
      ...snapshot.runs,
      [runId]: {
        ...snapshot.runs[runId]!,
        status: 'completed',
        tasks: taskStates,
        completedAt: input.createdAt,
      },
    },
    activeRunId: undefined,
  })
}


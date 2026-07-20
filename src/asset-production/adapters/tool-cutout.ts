import type { Box, CutoutParams } from '@/algorithm/types'
import type {
  AssetProductionSnapshot,
  ProductionArtifactRef,
} from '../contracts'
import { compileAssetProductionPlan } from '../planner'
import { createMemoryAssetProductionRepository } from '../repository'
import { createAssetProductionRuntime } from '../runtime'
import { createDirectAssetExecutor } from '../executors/direct'

export interface ToolCutoutArtifact {
  readonly sliceId: string
  readonly box: Box
  readonly artifact: ProductionArtifactRef
}

export async function publishToolCutoutProduction(input: {
  readonly snapshot: AssetProductionSnapshot
  readonly projectRevisionId: string
  readonly sourceArtifactId: string
  readonly sourceSha256: string
  readonly toolCallId: string
  readonly runId: string
  readonly outputs: readonly ToolCutoutArtifact[]
  readonly cutoutParams: CutoutParams
  readonly createdAt?: number
}): Promise<AssetProductionSnapshot> {
  if (input.outputs.length === 0) {
    throw new Error('A cutout production run requires at least one output artifact.')
  }
  const plan = await compileAssetProductionPlan({
    sourceRevision: {
      projectRevisionId: input.projectRevisionId,
      pageArtifacts: [{
        pageId: 'tool-source',
        artifactId: input.sourceArtifactId,
        sha256: input.sourceSha256,
      }],
    },
    items: input.outputs.map((output) => ({
      manifestItemId: `tool:${input.toolCallId}:${output.sliceId}`,
      pageId: 'tool-source',
      regionId: `tool:${input.toolCallId}`,
      route: 'import-cutout',
      label: output.sliceId,
    })),
    createdAt: input.createdAt,
  })
  const outputByManifestId = new Map(input.outputs.map((output) => [
    `tool:${input.toolCallId}:${output.sliceId}`,
    output,
  ]))
  const repository = createMemoryAssetProductionRepository(input.snapshot)
  const executor = createDirectAssetExecutor({
    producer: {
      async produce({ task }) {
        const output = outputByManifestId.get(task.manifestItemId)
        if (!output) throw new Error(`Cutout output is unavailable for ${task.manifestItemId}.`)
        return {
          artifact: output.artifact,
          evidence: {
            sourceArtifactId: input.sourceArtifactId,
            bounds: output.box,
            cutoutParams: input.cutoutParams,
            providerRoute: 'local/cutout-v1',
          },
        }
      },
    },
    reviewer: { async review() { return [] } },
    verifier: { async verify() { return [] } },
  })
  await createAssetProductionRuntime({
    repository,
    executors: { 'import-cutout': executor },
  }).execute(plan, { runId: input.runId })
  return repository.load()
}

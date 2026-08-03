import type { CutoutResultSink } from './desktop-tool-executor'
import type { Store } from '@/store/types'
import { parseArtifactId } from './content-addressed-desktop-artifacts'
import { publishToolCutoutProduction } from '@/asset-production'
import { DEFAULT_PARAMS } from '@/store/slices/params'

/** Adapt the unified tool loop result into one visible canvas transaction. */
export function createCutoutResultSink(
  getState: () => Pick<
    Store,
    'source' | 'assetProduction' | 'commitAssetProduction' | 'replaceProductionSliceProjection'
  >,
): CutoutResultSink {
  return {
    async commit({ execution, slices, outputArtifactIds, maskArtifactId, providerRoute }) {
      const initial = getState()
      if (!initial.source.bitmap || !initial.source.imageId) {
        throw new Error('The cutout source changed before its result could be published.')
      }
      if (execution.expectedSourceImageId
        && initial.source.imageId !== execution.expectedSourceImageId) {
        throw new Error('The cutout source changed before its result could be published.')
      }
      if (slices.length !== outputArtifactIds.length) {
        throw new Error('Cutout slices and committed artifacts do not have one-to-one coverage.')
      }
      const sourceImageId = initial.source.imageId
      const sourceArtifactId = execution.request.inputArtifactIds[0]
      const sourceSha256 = sourceArtifactId ? parseArtifactId(sourceArtifactId) : null
      if (!sourceArtifactId || !sourceSha256) {
        throw new Error('The cutout source artifact is not content-addressed.')
      }
      const outputs = slices.map((slice, index) => {
        const artifactId = outputArtifactIds[index]
        const sha256 = artifactId ? parseArtifactId(artifactId) : null
        if (!artifactId || !sha256) {
          throw new Error(`Cutout output ${index + 1} is not content-addressed.`)
        }
        return {
          sliceId: slice.id,
          box: slice.box,
          artifact: {
            artifactId,
            sha256,
            mediaType: slice.png.type || 'image/png',
            width: slice.width,
            height: slice.height,
          },
        }
      })
      const productionRunId = `asset-production:tool:${execution.requestId}`
      const production = await publishToolCutoutProduction({
        snapshot: initial.assetProduction,
        projectRevisionId: `project-revision:${execution.expectedRevision}`,
        sourceArtifactId,
        sourceSha256,
        toolCallId: execution.toolCallId,
        runId: productionRunId,
        outputs,
        cutoutParams: execution.cutoutParams ?? DEFAULT_PARAMS,
        maskArtifactId,
        providerRoute,
      })
      const current = getState()
      if (current.source.imageId !== sourceImageId) {
        throw new Error('The cutout source changed before its result could be published.')
      }
      if (execution.expectedSourceImageId
        && current.source.imageId !== execution.expectedSourceImageId) {
        throw new Error('The cutout source changed before its result could be published.')
      }
      if (!current.commitAssetProduction(initial.assetProduction.revision, production)) {
        throw new Error('Asset production changed before the cutout result could be published.')
      }
      const run = production.runs[productionRunId]!
      const plan = production.plans[run.planId]!
      const taskByManifest = new Map(plan.tasks.map((task) => [task.manifestItemId, task]))
      const projectedSlices = slices.map((slice) => {
        const manifestItemId = `tool:${execution.toolCallId}:${slice.id}`
        const task = taskByManifest.get(manifestItemId)
        if (!task) throw new Error(`Cutout task is unavailable for ${slice.id}.`)
        const state = run.tasks[task.taskId]
        if (!state?.output) throw new Error(`Cutout output is unavailable for ${slice.id}.`)
        return {
          id: slice.id,
          index: slice.index,
          box: slice.box,
          blob: slice.png,
          width: slice.width,
          height: slice.height,
          assetManifestItemId: manifestItemId,
          productionTaskId: task.taskId,
          productionRunId,
          outputArtifactId: state.output.artifactId,
          readiness: state.status,
        }
      })
      current.replaceProductionSliceProjection({
        slices: projectedSlices,
      })
    },
  }
}

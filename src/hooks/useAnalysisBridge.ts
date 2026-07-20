/**
 * Analysis bridge (spec §5 / §6) — the store ⇄ worker glue.
 *
 * Owns the single pipeline Worker instance and routes its push responses into
 * the Zustand store:
 *   - `preview` → `applyPreview` (store closes the superseded bitmap)
 *   - `slices`  → `applyAnalysisResult` (store revokes replaced objectUrls)
 *   - `error`   → `failAnalysis`
 * All three store actions internally drop stale `runId`s AND release the
 * incoming GPU/URL resources, so this file just forwards.
 *
 * The worker needs its OWN copy of the source bitmap (a transferred bitmap is
 * detached from the main thread, but the store still displays `source.bitmap`
 * in the SourceCanvas). So each new `imageId` is uploaded as a fresh clone.
 */
import { useCallback, useEffect, useRef } from 'react'
import { useStore, getStoreState } from '@/store'
import type { WorkerResponse } from '@/workers/protocol'
import type { AnalysisResult } from '@/store/types'
import { bitmapToBytes } from '@/lib/image'
import {
  ContentAddressedDesktopArtifactStore,
  parseArtifactId,
} from '@/services/content-addressed-desktop-artifacts'
import { publishToolCutoutProduction } from '@/asset-production'

/** The trigger returned to callers (e.g. `useParamAutoRun`). */
export interface AnalysisBridge {
  /** Begin a run for the current params; `wantSlices` gates the heavy path. */
  analyze(wantSlices: boolean): void
}

function createPipelineWorker(): Worker {
  return new Worker(new URL('@/workers/pipeline.worker.ts', import.meta.url), {
    type: 'module',
  })
}

export function useAnalysisBridge(): AnalysisBridge {
  const workerRef = useRef<Worker | null>(null)
  const artifactStoreRef = useRef<ContentAddressedDesktopArtifactStore | null>(null)
  // Track which imageId the worker already holds, to upload each source once.
  const uploadedImageIdRef = useRef<string>('')

  const beginAnalysis = useStore((s) => s.beginAnalysis)
  const applyPreview = useStore((s) => s.applyPreview)
  const applyResult = useStore((s) => s.applyAnalysisResult)
  const failAnalysis = useStore((s) => s.failAnalysis)

  // Create the worker once; wire message routing; terminate on unmount.
  useEffect(() => {
    const worker = createPipelineWorker()
    workerRef.current = worker

    const publishSlices = async (
      msg: Extract<WorkerResponse, { type: 'slices' }>,
    ): Promise<void> => {
      const initial = getStoreState()
      if (
        initial.analysis.runId !== msg.runId
        || !initial.source.bitmap
        || !initial.source.imageId
      ) return
      const sourceImageId = initial.source.imageId
      const artifactStore = artifactStoreRef.current
        ?? new ContentAddressedDesktopArtifactStore(indexedDB)
      artifactStoreRef.current = artifactStore
      try {
        const sourceBytes = await bitmapToBytes(initial.source.bitmap)
        const productionRunId = `asset-production:manual:${sourceImageId}:${msg.runId}`
        const sourceArtifactId = await artifactStore.write({
          bytes: sourceBytes,
          mediaType: 'image/png',
          source: 'cutout',
          runId: productionRunId,
        })
        const sourceSha256 = parseArtifactId(sourceArtifactId)
        if (!sourceSha256) throw new Error('Manual cutout source has an invalid content address.')
        const outputBytes = await Promise.all(
          msg.slices.map((slice) => slice.png.arrayBuffer().then((value) => new Uint8Array(value))),
        )
        const committedOutputIds = await artifactStore.writeBatch(outputBytes.map((bytes, index) => ({
          bytes,
          mediaType: msg.slices[index]?.png.type || 'image/png',
          source: 'cutout' as const,
          runId: productionRunId,
        })))
        if (committedOutputIds.length !== msg.slices.length) {
          throw new Error('Manual cutout artifact publication was incomplete.')
        }
        const outputs = msg.slices.map((slice, index) => {
          const artifactId = committedOutputIds[index]
          const sha256 = artifactId ? parseArtifactId(artifactId) : null
          if (!artifactId || !sha256) {
            throw new Error(`Manual cutout output ${index + 1} has an invalid content address.`)
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
        const production = await publishToolCutoutProduction({
          snapshot: initial.assetProduction,
          projectRevisionId: `project-revision:manual:${sourceImageId}:${msg.runId}`,
          sourceArtifactId,
          sourceSha256,
          toolCallId: `manual:${sourceImageId}:${msg.runId}`,
          runId: productionRunId,
          outputs,
          cutoutParams: initial.params,
        })
        const current = getStoreState()
        if (
          current.analysis.runId !== msg.runId
          || current.source.imageId !== sourceImageId
        ) return
        if (!current.commitAssetProduction(initial.assetProduction.revision, production)) {
          throw new Error('Asset production changed before the manual cutout could be published.')
        }
        const run = production.runs[productionRunId]!
        const plan = production.plans[run.planId]!
        const taskByManifest = new Map(plan.tasks.map((task) => [task.manifestItemId, task]))
        const result: AnalysisResult = {
          slices: msg.slices.map((slice) => {
            const manifestItemId = `tool:manual:${sourceImageId}:${msg.runId}:${slice.id}`
            const task = taskByManifest.get(manifestItemId)
            const taskState = task ? run.tasks[task.taskId] : undefined
            if (!task || !taskState?.output) {
              throw new Error(`Manual cutout task is unavailable for ${slice.id}.`)
            }
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
              outputArtifactId: taskState.output.artifactId,
              readiness: taskState.status,
            }
          }),
        }
        applyResult(msg.runId, result)
      } catch (error) {
        failAnalysis(msg.runId, error instanceof Error ? error.message : String(error))
      }
    }

    const onMessage = (event: MessageEvent<WorkerResponse>): void => {
      const msg = event.data
      switch (msg.type) {
        case 'preview':
          applyPreview(msg.runId, msg.full)
          break
        case 'slices': {
          void publishSlices(msg)
          break
        }
        case 'error':
          failAnalysis(msg.runId, msg.message)
          break
        // `progress` / `canceled` need no store change here.
      }
    }

    worker.addEventListener('message', onMessage)
    return () => {
      worker.removeEventListener('message', onMessage)
      worker.terminate()
      workerRef.current = null
      uploadedImageIdRef.current = ''
    }
  }, [applyPreview, applyResult, failAnalysis])

  const analyze = useCallback(
    (wantSlices: boolean): void => {
      const worker = workerRef.current
      if (!worker) return
      const { source } = getStoreState()
      if (!source.bitmap || !source.imageId) return

      const runId = beginAnalysis()

      const dispatch = (): void => {
        worker.postMessage({
          type: 'analyze',
          runId,
          imageId: source.imageId,
          params: getStoreState().params,
          wantSlices,
        })
      }

      // Upload a fresh clone the first time we see this imageId, then analyze.
      if (uploadedImageIdRef.current !== source.imageId) {
        const imageId = source.imageId
        void createImageBitmap(source.bitmap).then((clone) => {
          if (workerRef.current !== worker) {
            clone.close()
            return
          }
          worker.postMessage({ type: 'loadImage', imageId, bitmap: clone }, [
            clone,
          ])
          uploadedImageIdRef.current = imageId
          dispatch()
        })
      } else {
        dispatch()
      }
    },
    [beginAnalysis],
  )

  return { analyze }
}

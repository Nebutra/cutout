import type { Box, CutoutParams } from '@/algorithm/types'

/**
 * Worker message protocol (spec §4b).
 *
 * The source image is uploaded to the worker exactly once (`loadImage`,
 * transferring the `ImageBitmap`); thereafter analysis and explicit reruns send
 * only a tiny `analyze` message and transfer zero image bytes. Responses come in
 * two phases: a preview and the heavier encoded `slices` result.
 */

/** Named pipeline stages, used for progress reporting. */
export type PipelineStage =
  | 'flood'
  | 'alphaCut'
  | 'feather'
  | 'components'
  | 'merge'
  | 'pad'
  | 'render'

/** One exported slice: its box plus an encoded PNG blob. */
export interface SliceOut {
  readonly id: string
  readonly index: number
  readonly box: Box
  readonly png: Blob
  readonly width: number
  readonly height: number
}

/** Main-thread → worker requests. */
export type WorkerRequest =
  | { type: 'loadImage'; imageId: string; bitmap: ImageBitmap }
  | {
      type: 'analyze'
      runId: number
      imageId: string
      params: CutoutParams
      wantSlices: boolean
    }
  | { type: 'cancel'; runId: number }

/** Worker → main-thread responses. */
export type WorkerResponse =
  | { type: 'preview'; runId: number; full: ImageBitmap; boxes: Box[] }
  | { type: 'slices'; runId: number; slices: SliceOut[] }
  | { type: 'progress'; runId: number; stage: PipelineStage; pct: number }
  | { type: 'error'; runId: number; message: string }
  | { type: 'canceled'; runId: number }

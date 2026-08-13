import { decodeImage } from '@/lib/image'
import {
  PIPELINE_FOREGROUND_NOISE_FLOOR,
  type PipelineForegroundCoverage,
} from '@/algorithm/runPipeline'
import type { ProductionIssue } from './contracts'
import { qualityIssue } from './quality-policy'

const TRANSPARENT_ALPHA_MAX = 8
const OPAQUE_ALPHA_MIN = 247

export interface RasterEdgeAlphaSummary {
  readonly edgePixelCount: number
  readonly transparentEdgePixelCount: number
  readonly opaqueEdgePixelCount: number
}

export function rasterOutputContractIssues(
  summary: RasterEdgeAlphaSummary,
  transparent: boolean,
): readonly ProductionIssue[] {
  if (summary.edgePixelCount < 1) {
    return [qualityIssue(
      'raster-edge-unavailable',
      'Raster edge pixels are unavailable for output verification.',
      'deterministic-check',
    )]
  }
  if (transparent && summary.transparentEdgePixelCount !== summary.edgePixelCount) {
    return [qualityIssue(
      'transparent-subject-edge-contact',
      'A transparent subject touches the output canvas edge and may be clipped.',
      'deterministic-check',
    )]
  }
  if (!transparent && summary.opaqueEdgePixelCount !== summary.edgePixelCount) {
    return [qualityIssue(
      'rectangular-media-transparent-edge',
      'Rectangular media contains transparent or masked canvas edges.',
      'deterministic-check',
    )]
  }
  return []
}

export function slicingCoverageIssues(
  coverage: PipelineForegroundCoverage,
): readonly ProductionIssue[] {
  if (coverage.totalForegroundPixelCount < 1) {
    return [qualityIssue(
      'slice-foreground-unavailable',
      'No source foreground pixels were available for slicing verification.',
      'deterministic-check',
    )]
  }
  if (coverage.omittedForegroundPixelCount >= PIPELINE_FOREGROUND_NOISE_FLOOR) {
    const omittedPercent = (100 * (1 - coverage.retainedRatio)).toFixed(2)
    return [qualityIssue(
      'slice-foreground-omitted',
      `The final crops omit ${coverage.omittedForegroundPixelCount} detected foreground pixels (${omittedPercent}%).`,
      'deterministic-check',
    )]
  }
  return []
}

export async function inspectRasterOutputContract(
  blob: Blob,
  transparent: boolean,
): Promise<readonly ProductionIssue[]> {
  const bitmap = await decodeImage(blob)
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d')
    if (!context) {
      return rasterOutputContractIssues({
        edgePixelCount: 0,
        transparentEdgePixelCount: 0,
        opaqueEdgePixelCount: 0,
      }, transparent)
    }
    context.drawImage(bitmap, 0, 0)
    const edges = [
      context.getImageData(0, 0, bitmap.width, 1),
      context.getImageData(0, bitmap.height - 1, bitmap.width, 1),
      context.getImageData(0, 0, 1, bitmap.height),
      context.getImageData(bitmap.width - 1, 0, 1, bitmap.height),
    ]
    let edgePixelCount = 0
    let transparentEdgePixelCount = 0
    let opaqueEdgePixelCount = 0
    for (const edge of edges) {
      for (let index = 3; index < edge.data.length; index += 4) {
        const alpha = edge.data[index]!
        edgePixelCount += 1
        if (alpha <= TRANSPARENT_ALPHA_MAX) transparentEdgePixelCount += 1
        if (alpha >= OPAQUE_ALPHA_MIN) opaqueEdgePixelCount += 1
      }
    }
    return rasterOutputContractIssues({
      edgePixelCount,
      transparentEdgePixelCount,
      opaqueEdgePixelCount,
    }, transparent)
  } finally {
    bitmap.close()
  }
}

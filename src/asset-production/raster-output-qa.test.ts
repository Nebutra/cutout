import { describe, expect, it } from 'vitest'
import { rasterOutputContractIssues, slicingCoverageIssues } from './raster-output-qa'
import { sliceCoverageSchema } from './contracts'

describe('raster output edge QA', () => {
  it('accepts a transparent subject only when every canvas edge pixel is clear', () => {
    expect(rasterOutputContractIssues({
      edgePixelCount: 40,
      transparentEdgePixelCount: 40,
      opaqueEdgePixelCount: 0,
    }, true)).toEqual([])
    expect(rasterOutputContractIssues({
      edgePixelCount: 40,
      transparentEdgePixelCount: 39,
      opaqueEdgePixelCount: 1,
    }, true)).toMatchObject([{
      code: 'transparent-subject-edge-contact',
      kind: 'quality',
      source: 'deterministic-check',
    }])
  })

  it('rejects transparent rounded edges on full-bleed rectangular media', () => {
    expect(rasterOutputContractIssues({
      edgePixelCount: 40,
      transparentEdgePixelCount: 0,
      opaqueEdgePixelCount: 40,
    }, false)).toEqual([])
    expect(rasterOutputContractIssues({
      edgePixelCount: 40,
      transparentEdgePixelCount: 4,
      opaqueEdgePixelCount: 36,
    }, false)).toMatchObject([{
      code: 'rectangular-media-transparent-edge',
      kind: 'quality',
      source: 'deterministic-check',
    }])
  })

  it('fails closed when no edge pixels can be inspected', () => {
    expect(rasterOutputContractIssues({
      edgePixelCount: 0,
      transparentEdgePixelCount: 0,
      opaqueEdgePixelCount: 0,
    }, true)).toMatchObject([{ code: 'raster-edge-unavailable', kind: 'quality' }])
  })
})

describe('slicing foreground coverage QA', () => {
  it('accepts crops that retain the detected board foreground', () => {
    expect(slicingCoverageIssues({
      totalForegroundPixelCount: 1_000,
      retainedForegroundPixelCount: 1_000,
      omittedForegroundPixelCount: 0,
      retainedRatio: 1,
    })).toEqual([])
  })

  it('blocks a crop set that silently drops a meaningful disconnected part', () => {
    expect(slicingCoverageIssues({
      totalForegroundPixelCount: 1_020,
      retainedForegroundPixelCount: 1_000,
      omittedForegroundPixelCount: 20,
      retainedRatio: 1_000 / 1_020,
    })).toMatchObject([{
      code: 'slice-foreground-omitted',
      kind: 'quality',
      source: 'deterministic-check',
    }])
  })

  it('fails closed when a board has no measurable foreground', () => {
    expect(slicingCoverageIssues({
      totalForegroundPixelCount: 0,
      retainedForegroundPixelCount: 0,
      omittedForegroundPixelCount: 0,
      retainedRatio: 1,
    })).toMatchObject([{ code: 'slice-foreground-unavailable', kind: 'quality' }])
  })

  it('rejects persisted coverage totals or ratios that do not reconcile', () => {
    expect(sliceCoverageSchema.safeParse({
      totalForegroundPixelCount: 100,
      retainedForegroundPixelCount: 90,
      omittedForegroundPixelCount: 5,
      retainedRatio: 0.9,
    }).success).toBe(false)
    expect(sliceCoverageSchema.safeParse({
      totalForegroundPixelCount: 100,
      retainedForegroundPixelCount: 90,
      omittedForegroundPixelCount: 10,
      retainedRatio: 1,
    }).success).toBe(false)
  })
})

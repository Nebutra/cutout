/**
 * Real-browser proof of the per-region slicing pixel path.
 *
 * `sliceRegionBoardBitmap` (OffscreenCanvas frame extraction + the `runPipeline`
 * CV + PNG crops) cannot run under jsdom, so the vitest unit tests only cover
 * the region orchestration. This Playwright test runs the ACTUAL function in
 * Chromium against a synthetic board with a KNOWN number of separated shapes,
 * proving the whole chain — board bitmap → CV segmentation → region/page-tagged
 * slice blobs — works end to end with real canvas APIs.
 *
 * Deterministic (no model / no network): three well-separated dark squares on
 * a white board must yield exactly three region-tagged slices.
 */
import { test, expect } from '@playwright/test'

test.describe('per-region board slicing (real browser CV)', () => {
  test('segments a synthetic region board into region-tagged slices', async ({ page }) => {
    // A blank Vite-served page (not the app root, whose boot navigation would
    // destroy the evaluate context) — Vite still resolves the /src import.
    await page.goto('/tests/visual/region-slicing-harness.html')

    const result = await page.evaluate(async () => {
      const { sliceRegionBoardBitmap } = await import(
        '/src/prototype/region-deconstruct.ts'
      )

      // A white board with three well-separated dark squares — each square is
      // one "asset". Squares are 80x80 (area 6400 > minArea 900) and >18px
      // apart (> mergeGap), so CV must resolve exactly three components.
      const size = 512
      const canvas = new OffscreenCanvas(size, size)
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, size, size)
      ctx.fillStyle = '#202024'
      ctx.fillRect(60, 60, 80, 80)
      ctx.fillRect(360, 60, 80, 80)
      ctx.fillRect(210, 360, 80, 80)
      const bitmap = await createImageBitmap(canvas)

      const slices = await sliceRegionBoardBitmap(
        bitmap,
        { threshold: 246, minArea: 900, mergeGap: 18, padding: 10 },
        'region-hero',
        'page-1',
      )

      return {
        count: slices.length,
        regionIds: slices.map((s) => s.regionId),
        pageIds: slices.map((s) => s.pageId),
        allHaveBlob: slices.every((s) => s.blob instanceof Blob && s.blob.size > 0),
        allHaveSize: slices.every((s) => s.width > 0 && s.height > 0),
        indices: slices.map((s) => s.index),
      }
    })

    expect(result.count).toBe(3)
    expect(result.regionIds).toEqual(['region-hero', 'region-hero', 'region-hero'])
    expect(result.pageIds).toEqual(['page-1', 'page-1', 'page-1'])
    expect(result.allHaveBlob).toBe(true)
    expect(result.allHaveSize).toBe(true)
    expect(result.indices).toEqual([0, 1, 2])
  })
})

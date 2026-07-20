/**
 * Effect benchmark for the production white-board cutout path.
 *
 * Unlike the deterministic square smoke test, this fixture is generated as a
 * realistic asset board and deliberately includes pale material, thin line
 * art, soft shadow, glass, and irregular silhouettes. The benchmark exports
 * the actual transparent crops plus a light/dark contact sheet for review.
 */
import { expect, test } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const workspace = process.cwd()
const artifactDir = path.resolve(
  workspace,
  process.env.CUTOUT_EFFECT_OUTPUT_DIR ?? 'test-results/cutout-effect-e2e',
)
const sourcePath = process.env.CUTOUT_EFFECT_BOARD_3X2
  ? path.resolve(workspace, process.env.CUTOUT_EFFECT_BOARD_3X2)
  : null

test.describe('production cutout effect benchmark', () => {
  test('cuts a realistic six-asset board and exports visual evidence', async ({ page }) => {
    test.skip(!sourcePath, 'Set CUTOUT_EFFECT_BOARD_3X2 to an exact 3x2 white asset board.')
    await mkdir(artifactDir, { recursive: true })
    const sourceBase64 = (await readFile(sourcePath!)).toString('base64')
    await page.goto('/tests/visual/region-slicing-harness.html')

    const result = await page.evaluate(async ({ sourceBase64 }) => {
      const [{ sliceRegionBoardBitmap }, production] = await Promise.all([
        import('/src/prototype/region-deconstruct.ts'),
        import('/src/asset-production/index.ts'),
      ])

      const bytes = Uint8Array.from(atob(sourceBase64), (char) => char.charCodeAt(0))
      const sourceBlob = new Blob([bytes], { type: 'image/png' })
      const sourceBitmap = await createImageBitmap(sourceBlob)
      const width = sourceBitmap.width
      const height = sourceBitmap.height
      const sourceCanvas = new OffscreenCanvas(width, height)
      const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true })!
      sourceContext.drawImage(sourceBitmap, 0, 0)
      const cut = await sliceRegionBoardBitmap(
        sourceBitmap,
        { threshold: 246, minArea: 900, mergeGap: 18, padding: 10 },
        'effect-board',
        'effect-page',
      )

      const slots = Array.from({ length: 6 }, (_, index) => ({
        taskId: `slot-${index + 1}`,
        normalizedBounds: {
          x: (index % 3) / 3,
          y: Math.floor(index / 3) / 2,
          width: 1 / 3,
          height: 1 / 2,
        },
      }))
      const layout = {
        boardGroupId: 'effect-board',
        taskIds: slots.map((slot) => slot.taskId),
        slots,
      }
      const assignment = production.assignBoardCandidates(layout, {
        width,
        height,
        candidates: cut.slices.map((slice) => ({
          box: slice.box,
          artifact: {
            artifactId: `artifact:${slice.index}`,
            sha256: `slice-${slice.index}`,
            mediaType: 'image/png',
            width: slice.width,
            height: slice.height,
          },
        })),
      }, 1)

      const sliceOutputs: Array<{
        name: string
        base64: string
        metrics: Record<string, unknown>
      }> = []
      const decodedSlices: ImageBitmap[] = []
      for (const slice of cut.slices) {
        const sliceBytes = new Uint8Array(await slice.blob.arrayBuffer())
        let binary = ''
        for (let offset = 0; offset < sliceBytes.length; offset += 0x8000) {
          binary += String.fromCharCode(...sliceBytes.subarray(offset, offset + 0x8000))
        }
        const bitmap = await createImageBitmap(slice.blob)
        decodedSlices.push(bitmap)
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!
        ctx.drawImage(bitmap, 0, 0)
        const pixels = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data
        const sourcePixels = sourceContext.getImageData(
          slice.box.x,
          slice.box.y,
          slice.box.width,
          slice.box.height,
        ).data
        let transparent = 0
        let partial = 0
        let opaque = 0
        let brightNeutralOpaque = 0
        let partialWhite = 0
        let edgeForeground = 0
        let whiteCompositeError = 0
        let minX = bitmap.width
        let minY = bitmap.height
        let maxX = -1
        let maxY = -1
        for (let y = 0; y < bitmap.height; y += 1) {
          for (let x = 0; x < bitmap.width; x += 1) {
            const offset = (y * bitmap.width + x) * 4
            const alpha = pixels[offset + 3]!
            const alphaUnit = alpha / 255
            whiteCompositeError += Math.abs(
              pixels[offset]! * alphaUnit + 255 * (1 - alphaUnit) - sourcePixels[offset]!,
            )
            whiteCompositeError += Math.abs(
              pixels[offset + 1]! * alphaUnit + 255 * (1 - alphaUnit) - sourcePixels[offset + 1]!,
            )
            whiteCompositeError += Math.abs(
              pixels[offset + 2]! * alphaUnit + 255 * (1 - alphaUnit) - sourcePixels[offset + 2]!,
            )
            if (alpha === 0) transparent += 1
            else {
              minX = Math.min(minX, x)
              minY = Math.min(minY, y)
              maxX = Math.max(maxX, x)
              maxY = Math.max(maxY, y)
              if (x === 0 || y === 0 || x === bitmap.width - 1 || y === bitmap.height - 1) {
                edgeForeground += 1
              }
              if (alpha === 255) {
                opaque += 1
                const red = pixels[offset]!
                const green = pixels[offset + 1]!
                const blue = pixels[offset + 2]!
                if (
                  Math.min(red, green, blue) >= 220
                  && Math.max(red, green, blue) - Math.min(red, green, blue) <= 12
                ) {
                  brightNeutralOpaque += 1
                }
              }
              else {
                partial += 1
                if (pixels[offset]! >= 240 && pixels[offset + 1]! >= 240 && pixels[offset + 2]! >= 240) {
                  partialWhite += 1
                }
              }
            }
          }
        }
        const total = bitmap.width * bitmap.height
        const clearMargin = maxX < 0
          ? null
          : Math.min(minX, minY, bitmap.width - 1 - maxX, bitmap.height - 1 - maxY)
        sliceOutputs.push({
          name: `slice-${String(slice.index + 1).padStart(2, '0')}.png`,
          base64: btoa(binary),
          metrics: {
            index: slice.index,
            box: slice.box,
            width: bitmap.width,
            height: bitmap.height,
            pngBytes: slice.blob.size,
            transparentRatio: transparent / total,
            partialAlphaRatio: partial / total,
            opaqueRatio: opaque / total,
            brightNeutralOpaqueRatio: brightNeutralOpaque / total,
            partialWhiteRatio: partial > 0 ? partialWhite / partial : 0,
            edgeForegroundPixels: edgeForeground,
            clearMargin,
            whiteCompositeMeanAbsoluteError: whiteCompositeError / (total * 3),
          },
        })
      }

      const contact = new OffscreenCanvas(1600, 720)
      const contactCtx = contact.getContext('2d')!
      contactCtx.fillStyle = '#0f0f10'
      contactCtx.fillRect(0, 0, contact.width, contact.height)
      contactCtx.fillStyle = '#ffffff'
      contactCtx.font = '600 22px sans-serif'
      contactCtx.fillText('SOURCE BOARD', 40, 42)
      contactCtx.drawImage(sourceBitmap, 40, 70, 600, 600)

      decodedSlices.forEach((bitmap, index) => {
        const column = index % 3
        const row = Math.floor(index / 3)
        const x = 680 + column * 300
        const y = 70 + row * 300
        contactCtx.fillStyle = '#171719'
        contactCtx.fillRect(x, y, 145, 270)
        contactCtx.fillStyle = '#d5d5d7'
        contactCtx.fillRect(x + 145, y, 145, 270)
        const scale = Math.min(240 / bitmap.width, 220 / bitmap.height)
        const drawWidth = bitmap.width * scale
        const drawHeight = bitmap.height * scale
        contactCtx.drawImage(
          bitmap,
          x + (290 - drawWidth) / 2,
          y + 26 + (220 - drawHeight) / 2,
          drawWidth,
          drawHeight,
        )
        contactCtx.fillStyle = '#ffffff'
        contactCtx.font = '500 18px sans-serif'
        contactCtx.fillText(`SLICE ${index + 1}`, x + 12, y + 258)
      })
      const contactBlob = await contact.convertToBlob({ type: 'image/png' })
      const contactBytes = new Uint8Array(await contactBlob.arrayBuffer())
      let contactBinary = ''
      for (let offset = 0; offset < contactBytes.length; offset += 0x8000) {
        contactBinary += String.fromCharCode(...contactBytes.subarray(offset, offset + 0x8000))
      }

      sourceBitmap.close()
      decodedSlices.forEach((bitmap) => bitmap.close())
      return {
        source: { width, height },
        diagnostics: cut.diagnostics,
        sliceCount: cut.slices.length,
        assignedTaskIds: [...assignment.byTaskId.keys()],
        assignments: [...assignment.byTaskId.entries()].map(([taskId, candidate]) => ({
          taskId,
          sliceIndex: Number(candidate.artifact.sha256.replace('slice-', '')),
        })),
        assignmentIssues: assignment.issues.map((issue) => ({
          code: issue.code,
          message: issue.message,
        })),
        slices: sliceOutputs,
        contactSheetBase64: btoa(contactBinary),
      }
    }, { sourceBase64 })

    for (const slice of result.slices) {
      await writeFile(path.join(artifactDir, slice.name), Buffer.from(slice.base64, 'base64'))
    }
    await writeFile(
      path.join(artifactDir, 'contact-sheet.png'),
      Buffer.from(result.contactSheetBase64, 'base64'),
    )
    const report = {
      source: result.source,
      params: { threshold: 246, minArea: 900, mergeGap: 18, padding: 10 },
      diagnostics: result.diagnostics,
      sliceCount: result.sliceCount,
      assignedTaskIds: result.assignedTaskIds,
      assignments: result.assignments,
      assignmentIssues: result.assignmentIssues,
      slices: result.slices.map(({ name, metrics }) => ({ name, ...metrics })),
    }
    await writeFile(
      path.join(artifactDir, 'metrics.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    )

    expect(result.diagnostics.compliant).toBe(true)
    expect(result.sliceCount).toBe(6)
    expect(result.assignedTaskIds).toHaveLength(6)
    expect(result.assignmentIssues).toEqual([])
    for (const slice of result.slices) {
      expect(slice.metrics.edgeForegroundPixels).toBe(0)
      expect(slice.metrics.whiteCompositeMeanAbsoluteError).toBeLessThanOrEqual(3)
    }
    const shadowSlot = result.assignments.find((item) => item.taskId === 'slot-4')
    const shadowSlice = result.slices.find(
      (slice) => slice.metrics.index === shadowSlot?.sliceIndex,
    )
    expect(shadowSlice?.metrics.brightNeutralOpaqueRatio).toBeLessThan(0.005)
  })
})

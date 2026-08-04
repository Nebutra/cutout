import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import {
  assignSemanticSlots,
  computeCommonCanvasWhiteCompositeMeanAbsoluteError,
  parseConnectedComponents,
  validateBenchmarkDirectories,
} from './benchmark-imagemagick-slicing.mjs'

describe('ImageMagick slicing benchmark', () => {
  it('parses foreground components and assigns each expected board slot', () => {
    const output = `Objects (id: bounding-box centroid area mean-color):
  0: 2048x2048+0+0 1037.5,1010.9 3.4e+06 srgb(0,0,0)
  2: 433x426+143+368 358.9,580.3 170876 srgb(255,255,255)
  5: 482x559+784+1223 1024.0,1540.6 150932 srgb(255,255,255)
  4: 398x697+161+1167 358.9,1595.1 129645 srgb(255,255,255)
  6: 490x471+1444+1267 1686.4,1518.6 128600 srgb(255,255,255)
  3: 500x313+774+417 1027.2,597.3 117927 srgb(255,255,255)
  1: 400x612+1498+267 1716.6,533.5 95936 srgb(255,255,255)`

    const assigned = assignSemanticSlots(parseConnectedComponents(output), 2048, 2048)

    expect(assigned.map((component) => component.slot)).toEqual([1, 2, 3, 4, 5, 6])
    expect(assigned[0].box).toEqual({ x: 143, y: 368, width: 433, height: 426 })
  })

  it('parses grayscale connected-component output from an extracted alpha mask', () => {
    const components = parseConnectedComponents(`
      0: 200x200+0+0 100,100 30000 gray(0)
      1: 100x100+50+50 100,100 10000 gray(255)
    `)

    expect(components).toEqual([
      { id: 1, box: { x: 50, y: 50, width: 100, height: 100 }, area: 10_000 },
    ])
  })

  it('rejects segmentation that does not cover six unique semantic slots', () => {
    expect(() => assignSemanticSlots([
      { id: 1, box: { x: 10, y: 10, width: 100, height: 100 }, area: 10_000 },
      { id: 2, box: { x: 20, y: 20, width: 100, height: 100 }, area: 10_000 },
    ], 900, 600)).toThrow('did not preserve six semantic assets')
  })

  it('keeps generated evidence outside the baseline input tree', () => {
    expect(() => validateBenchmarkDirectories('/tmp/cutout-baseline', '/tmp/cutout-baseline')).toThrow('separate')
    expect(() => validateBenchmarkDirectories('/tmp/cutout-baseline', '/tmp/cutout-baseline/evidence')).toThrow('separate')
    expect(() => validateBenchmarkDirectories('/tmp/cutout-evidence/baseline', '/tmp/cutout-evidence')).toThrow('separate')
    expect(() => validateBenchmarkDirectories('/tmp/cutout-baseline', '/tmp/cutout-evidence')).not.toThrow()
  })

  it('compares white recomposition on one fixed source-sized canvas', () => {
    const source = Uint8Array.from([
      0, 0, 0, 255,
      255, 255, 255, 255,
    ])
    const blackPixel = Uint8Array.from([0, 0, 0, 255])
    const exact = computeCommonCanvasWhiteCompositeMeanAbsoluteError(source, 2, [
      { box: { x: 0, y: 0, width: 1, height: 1 }, pixels: blackPixel },
    ])

    expect(exact).toBe(0)
    expect(computeCommonCanvasWhiteCompositeMeanAbsoluteError(source, 2, [])).toBe(127.5)
    expect(() => computeCommonCanvasWhiteCompositeMeanAbsoluteError(source, 2, [
      { box: { x: 0, y: 0, width: 1, height: 1 }, pixels: blackPixel },
      { box: { x: 0, y: 0, width: 1, height: 1 }, pixels: blackPixel },
    ])).toThrow('overlap')
  })

  it('fails clearly when the configured ImageMagick executable is unavailable', () => {
    const result = spawnSync(process.execPath, ['scripts/benchmark-imagemagick-slicing.mjs'], {
      cwd: process.cwd(),
      env: { ...process.env, IMAGEMAGICK_BIN: '/definitely/missing/cutout-magick' },
      encoding: 'utf8',
    })

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('ImageMagick 7 executable not found')
    expect(result.stderr).toContain('IMAGEMAGICK_BIN')
  })
})

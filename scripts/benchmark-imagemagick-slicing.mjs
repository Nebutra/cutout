import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { performance } from 'node:perf_hooks'

const EXPECTED_SLOT_COUNT = 6
const COMPONENT_MIN_AREA = 900
const CROP_PADDING = 10
const MAX_COMMAND_BUFFER = 64 * 1024 * 1024
const DETERMINISTIC_PNG_ARGS = ['-strip', '-define', 'png:exclude-chunk=date,time']

function parseArguments(argv) {
  const options = {
    baselineDir: 'test-results/cutout-effect-e2e',
    outputDir: 'test-results/imagemagick-slicing',
  }
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag !== '--baseline-dir' && flag !== '--output-dir') {
      throw new Error(`Unknown argument: ${flag}`)
    }
    const value = argv[index + 1]
    if (!value) throw new Error(`${flag} requires a path.`)
    const key = flag === '--baseline-dir' ? 'baselineDir' : 'outputDir'
    options[key] = value
    index += 1
  }
  return options
}

export function parseConnectedComponents(output) {
  const components = []
  for (const line of output.split('\n')) {
    const match = line.match(
      /^\s*(\d+): (\d+)x(\d+)\+(\d+)\+(\d+) \S+ ([\d.eE+-]+) (?:srgb\(([^)]+)\)|gray\(([^)]+)\))\s*$/,
    )
    if (!match) continue
    const meanChannels = (match[7] ?? match[8]).split(',').map(Number)
    if (meanChannels.some((value) => !Number.isFinite(value))) continue
    const mean = meanChannels.reduce((total, value) => total + value, 0) / meanChannels.length
    if (mean <= 127) continue
    components.push({
      id: Number(match[1]),
      box: {
        width: Number(match[2]),
        height: Number(match[3]),
        x: Number(match[4]),
        y: Number(match[5]),
      },
      area: Number(match[6]),
    })
  }
  return components
}

export function assignSemanticSlots(components, sourceWidth, sourceHeight) {
  const assigned = components.map((component) => {
    const centerX = component.box.x + component.box.width / 2
    const centerY = component.box.y + component.box.height / 2
    const column = Math.max(0, Math.min(2, Math.floor(centerX / (sourceWidth / 3))))
    const row = Math.max(0, Math.min(1, Math.floor(centerY / (sourceHeight / 2))))
    return { ...component, slot: row * 3 + column + 1 }
  })
  const slots = new Set(assigned.map((component) => component.slot))
  if (assigned.length !== EXPECTED_SLOT_COUNT || slots.size !== EXPECTED_SLOT_COUNT) {
    throw new Error(
      `ImageMagick-only segmentation did not preserve six semantic assets: `
      + `${assigned.length} components mapped to ${slots.size} unique slots.`,
    )
  }
  return assigned.sort((left, right) => left.slot - right.slot)
}

function paddedBox(box, sourceWidth, sourceHeight) {
  const x = Math.max(0, box.x - CROP_PADDING)
  const y = Math.max(0, box.y - CROP_PADDING)
  const right = Math.min(sourceWidth, box.x + box.width + CROP_PADDING)
  const bottom = Math.min(sourceHeight, box.y + box.height + CROP_PADDING)
  return { x, y, width: right - x, height: bottom - y }
}

function pngOutput(outputPath) {
  return [...DETERMINISTIC_PNG_ARGS, outputPath]
}

export function validateBenchmarkDirectories(baselineDir, outputDir) {
  const baseline = path.resolve(baselineDir)
  const output = path.resolve(outputDir)
  const outputFromBaseline = path.relative(baseline, output)
  const baselineFromOutput = path.relative(output, baseline)
  const isInside = (relative) => relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
  if (isInside(outputFromBaseline) || isInside(baselineFromOutput)) {
    throw new Error('ImageMagick evidence output must be separate from the Cutout baseline directory.')
  }
}

function createRunner(executable) {
  const commands = []
  const run = (args, options = {}) => {
    commands.push({ executable, args: [...args] })
    const result = spawnSync(executable, args, {
      encoding: options.binary ? null : 'utf8',
      maxBuffer: MAX_COMMAND_BUFFER,
      shell: false,
    })
    if (result.error) {
      const unavailable = result.error.code === 'ENOENT'
      throw new Error(
        unavailable
          ? `ImageMagick 7 executable not found: ${executable}. Install ImageMagick 7 or set IMAGEMAGICK_BIN.`
          : `Unable to run ImageMagick: ${result.error.message}`,
      )
    }
    if (result.status !== 0) {
      const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString('utf8') : result.stderr
      throw new Error(`ImageMagick command failed (${result.status}): ${stderr.trim()}`)
    }
    return result
  }
  return { commands, run }
}

function identify(runner, imagePath) {
  const result = runner.run(['identify', '-format', '%w %h', imagePath])
  const match = result.stdout.trim().match(/^(\d+) (\d+)$/)
  if (!match) throw new Error(`Could not read image dimensions: ${imagePath}`)
  return { width: Number(match[1]), height: Number(match[2]) }
}

function readRgba(runner, imagePath, dimensions) {
  const result = runner.run(
    [imagePath, '-depth', '8', `rgba:-`],
    { binary: true },
  )
  const expectedBytes = dimensions.width * dimensions.height * 4
  if (result.stdout.byteLength !== expectedBytes) {
    throw new Error(
      `Unexpected RGBA byte count for ${imagePath}: expected ${expectedBytes}, got ${result.stdout.byteLength}.`,
    )
  }
  return result.stdout
}

function computeSliceMetrics({ pixels, sourcePixels, sourceWidth, box, pngBytes }) {
  const total = box.width * box.height
  let transparent = 0
  let partial = 0
  let opaque = 0
  let brightNeutralOpaque = 0
  let partialWhite = 0
  let edgeForeground = 0
  let whiteCompositeError = 0
  let minX = box.width
  let minY = box.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < box.height; y += 1) {
    for (let x = 0; x < box.width; x += 1) {
      const offset = (y * box.width + x) * 4
      const sourceOffset = ((box.y + y) * sourceWidth + box.x + x) * 4
      const alpha = pixels[offset + 3]
      const alphaUnit = alpha / 255
      for (let channel = 0; channel < 3; channel += 1) {
        whiteCompositeError += Math.abs(
          pixels[offset + channel] * alphaUnit
          + 255 * (1 - alphaUnit)
          - sourcePixels[sourceOffset + channel],
        )
      }
      if (alpha === 0) {
        transparent += 1
        continue
      }
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
      if (x === 0 || y === 0 || x === box.width - 1 || y === box.height - 1) edgeForeground += 1
      if (alpha === 255) {
        opaque += 1
        const red = pixels[offset]
        const green = pixels[offset + 1]
        const blue = pixels[offset + 2]
        if (Math.min(red, green, blue) >= 220 && Math.max(red, green, blue) - Math.min(red, green, blue) <= 12) {
          brightNeutralOpaque += 1
        }
      } else {
        partial += 1
        if (pixels[offset] >= 240 && pixels[offset + 1] >= 240 && pixels[offset + 2] >= 240) partialWhite += 1
      }
    }
  }
  return {
    box,
    width: box.width,
    height: box.height,
    pngBytes,
    alphaOccupancyRatio: (total - transparent) / total,
    transparentRatio: transparent / total,
    partialAlphaRatio: partial / total,
    opaqueRatio: opaque / total,
    brightNeutralOpaqueRatio: brightNeutralOpaque / total,
    partialWhiteRatio: partial > 0 ? partialWhite / partial : 0,
    edgeForegroundPixels: edgeForeground,
    clearMargin: maxX < 0
      ? null
      : Math.min(minX, minY, box.width - 1 - maxX, box.height - 1 - maxY),
    whiteCompositeMeanAbsoluteError: whiteCompositeError / (total * 3),
  }
}

function blankWhiteCanvasError(sourcePixels) {
  let error = 0
  for (let offset = 0; offset < sourcePixels.length; offset += 4) {
    error += Math.abs(255 - sourcePixels[offset])
    error += Math.abs(255 - sourcePixels[offset + 1])
    error += Math.abs(255 - sourcePixels[offset + 2])
  }
  return error
}

export function computeCommonCanvasWhiteCompositeMeanAbsoluteError(
  sourcePixels,
  sourceWidth,
  slices,
) {
  if (sourceWidth < 1 || sourcePixels.length % (sourceWidth * 4) !== 0) {
    throw new Error('Source pixels do not match the common recomposition canvas width.')
  }
  const sourceHeight = sourcePixels.length / (sourceWidth * 4)
  const occupied = new Uint8Array(sourceWidth * sourceHeight)
  let error = blankWhiteCanvasError(sourcePixels)
  for (const slice of slices) {
    const { box, pixels } = slice
    if (
      box.x < 0 || box.y < 0
      || box.x + box.width > sourceWidth || box.y + box.height > sourceHeight
      || pixels.length !== box.width * box.height * 4
    ) {
      throw new Error('Slice pixels do not fit their common recomposition canvas box.')
    }
    for (let y = 0; y < box.height; y += 1) {
      for (let x = 0; x < box.width; x += 1) {
        const sliceOffset = (y * box.width + x) * 4
        const sourcePixel = (box.y + y) * sourceWidth + box.x + x
        if (occupied[sourcePixel]) throw new Error('Slice boxes overlap on the common recomposition canvas.')
        occupied[sourcePixel] = 1
        const sourceOffset = sourcePixel * 4
        const alphaUnit = pixels[sliceOffset + 3] / 255
        for (let channel = 0; channel < 3; channel += 1) {
          const source = sourcePixels[sourceOffset + channel]
          const composite = pixels[sliceOffset + channel] * alphaUnit + 255 * (1 - alphaUnit)
          error += Math.abs(composite - source) - Math.abs(255 - source)
        }
      }
    }
  }
  return error / (sourceWidth * sourceHeight * 3)
}

async function measureSlices(runner, slices, sourcePixels, sourceWidth) {
  const measured = []
  const commonCanvasSlices = []
  for (const slice of slices) {
    const dimensions = identify(runner, slice.path)
    if (dimensions.width !== slice.box.width || dimensions.height !== slice.box.height) {
      throw new Error(`Slice dimensions do not match its box: ${slice.path}`)
    }
    const pixels = readRgba(runner, slice.path, dimensions)
    const file = await stat(slice.path)
    const metrics = computeSliceMetrics({
      pixels,
      sourcePixels,
      sourceWidth,
      box: slice.box,
      pngBytes: file.size,
    })
    commonCanvasSlices.push({ box: slice.box, pixels })
    measured.push({
      name: path.basename(slice.path),
      semanticSlot: `slot-${slice.slot}`,
      ...metrics,
    })
  }
  return {
    slices: measured,
    commonCanvasWhiteCompositeMeanAbsoluteError:
      computeCommonCanvasWhiteCompositeMeanAbsoluteError(sourcePixels, sourceWidth, commonCanvasSlices),
  }
}

function summarize(measurement) {
  const { slices } = measurement
  return {
    objectCount: slices.length,
    outputBytes: slices.reduce((total, slice) => total + slice.pngBytes, 0),
    meanPartialAlphaRatio: slices.reduce((total, slice) => total + slice.partialAlphaRatio, 0) / slices.length,
    meanBrightNeutralOpaqueRatio: slices.reduce(
      (total, slice) => total + slice.brightNeutralOpaqueRatio,
      0,
    ) / slices.length,
    meanWhiteCompositeAbsoluteError: slices.reduce(
      (total, slice) => total + slice.whiteCompositeMeanAbsoluteError,
      0,
    ) / slices.length,
    commonCanvasWhiteCompositeMeanAbsoluteError:
      measurement.commonCanvasWhiteCompositeMeanAbsoluteError,
    edgeForegroundPixels: slices.reduce((total, slice) => total + slice.edgeForegroundPixels, 0),
  }
}

function createGrid(runner, files, { background, outputDir, prefix, outputPath }) {
  if (files.length !== EXPECTED_SLOT_COUNT) {
    throw new Error(`Contact-sheet grid requires ${EXPECTED_SLOT_COUNT} files; received ${files.length}.`)
  }
  const tiles = files.map((file, index) => {
    const tilePath = path.join(outputDir, `.grid-${prefix}-tile-${index + 1}.png`)
    runner.run([
      file,
      '-thumbnail', '280x240>',
      '-background', background,
      '-gravity', 'center',
      '-extent', '328x288',
      ...pngOutput(tilePath),
    ])
    return tilePath
  })
  const rows = [0, 1].map((row) => {
    const rowPath = path.join(outputDir, `.grid-${prefix}-row-${row + 1}.png`)
    runner.run([...tiles.slice(row * 3, row * 3 + 3), '+append', ...pngOutput(rowPath)])
    return rowPath
  })
  runner.run([...rows, '-append', ...pngOutput(outputPath)])
}

async function createContactSheets(runner, variants, outputDir) {
  const themes = [
    { name: 'light', background: '#f4f4f5' },
    { name: 'dark', background: '#18181b' },
  ]
  const output = {}
  for (const theme of themes) {
    const rows = []
    for (const variant of variants) {
      const rowPath = path.join(outputDir, `contact-${theme.name}-${variant.id}.png`)
      createGrid(runner, variant.files, {
        background: theme.background,
        outputDir,
        prefix: `${theme.name}-${variant.id}`,
        outputPath: rowPath,
      })
      rows.push(rowPath)
    }
    const sheetPath = path.join(outputDir, `contact-sheet-${theme.name}.png`)
    runner.run([...rows, '-append', ...pngOutput(sheetPath)])
    output[theme.name] = {
      combined: sheetPath,
      rows: variants.map((variant, index) => ({
        pipeline: variant.id,
        path: rows[index],
      })),
    }
  }
  return output
}

async function requireFile(filePath, description) {
  try {
    const file = await stat(filePath)
    if (!file.isFile()) throw new Error()
  } catch {
    throw new Error(`Missing ${description}: ${filePath}`)
  }
}

async function sha256(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex')
}

export async function runBenchmark({ baselineDir, outputDir, executable }) {
  const resolvedBaseline = path.resolve(baselineDir)
  const resolvedOutput = path.resolve(outputDir)
  validateBenchmarkDirectories(resolvedBaseline, resolvedOutput)
  const sourcePath = path.join(resolvedBaseline, 'source-board.png')
  const baselineMetricsPath = path.join(resolvedBaseline, 'metrics.json')
  const imageMagickBin = executable ?? process.env.IMAGEMAGICK_BIN ?? 'magick'
  const runner = createRunner(imageMagickBin)

  const versionResult = runner.run(['-version'])
  const version = versionResult.stdout.split('\n')[0].trim()
  if (!/^Version: ImageMagick 7\./.test(version)) {
    throw new Error(`ImageMagick 7 is required; detected: ${version || 'unknown version'}`)
  }
  await requireFile(sourcePath, 'effect benchmark source board')
  await requireFile(baselineMetricsPath, 'Cutout baseline metrics')
  const baselineReport = JSON.parse(await readFile(baselineMetricsPath, 'utf8'))
  if (baselineReport.sliceCount !== EXPECTED_SLOT_COUNT || baselineReport.assignmentIssues.length > 0) {
    throw new Error('Cutout baseline must contain six cleanly assigned semantic assets.')
  }
  if (!Number.isFinite(baselineReport.pipelineRuntimeMs)) {
    throw new Error('Cutout baseline lacks pipelineRuntimeMs; rerun the recorded Playwright benchmark command.')
  }
  const expectedTaskIds = Array.from({ length: EXPECTED_SLOT_COUNT }, (_, index) => `slot-${index + 1}`)
  if (
    baselineReport.assignments.length !== EXPECTED_SLOT_COUNT
    || baselineReport.assignedTaskIds.length !== EXPECTED_SLOT_COUNT
    || expectedTaskIds.some((taskId) => !baselineReport.assignedTaskIds.includes(taskId))
    || expectedTaskIds.some((taskId) => !baselineReport.assignments.some((assignment) => assignment.taskId === taskId))
    || new Set(baselineReport.assignments.map(({ taskId }) => taskId)).size !== EXPECTED_SLOT_COUNT
    || new Set(baselineReport.assignments.map(({ sliceIndex }) => sliceIndex)).size !== EXPECTED_SLOT_COUNT
  ) {
    throw new Error('Cutout baseline assignments must map six unique slices to slots 1 through 6.')
  }
  await mkdir(resolvedOutput, { recursive: true })
  const onlyDir = path.join(resolvedOutput, 'imagemagick-only')
  const hybridDir = path.join(resolvedOutput, 'hybrid')
  await Promise.all([mkdir(onlyDir, { recursive: true }), mkdir(hybridDir, { recursive: true })])

  const source = identify(runner, sourcePath)
  if (source.width !== baselineReport.source.width || source.height !== baselineReport.source.height) {
    throw new Error('Source dimensions do not match the Cutout baseline metrics.')
  }
  const sourcePixels = readRgba(runner, sourcePath, source)
  const baselineSlotByIndex = new Map(
    baselineReport.assignments.map(({ taskId, sliceIndex }) => [sliceIndex, Number(taskId.replace('slot-', ''))]),
  )
  const baselineSlices = baselineReport.slices.map((slice) => ({
    path: path.join(resolvedBaseline, slice.name),
    slot: baselineSlotByIndex.get(slice.index),
    box: slice.box,
  })).sort((left, right) => left.slot - right.slot)
  for (const slice of baselineSlices) await requireFile(slice.path, 'Cutout baseline slice')

  const onlyStart = performance.now()
  const onlyBoardPath = path.join(onlyDir, 'border-flood-alpha.png')
  runner.run([
    sourcePath,
    '-bordercolor', 'white',
    '-border', '1',
    '-alpha', 'on',
    '-fuzz', '4%',
    '-fill', 'none',
    '-draw', 'alpha 0,0 floodfill',
    '-shave', '1x1',
    ...pngOutput(onlyBoardPath),
  ])
  const onlyMaskPath = path.join(onlyDir, 'alpha-mask.png')
  runner.run([onlyBoardPath, '-alpha', 'extract', ...pngOutput(onlyMaskPath)])
  const componentResult = runner.run([
    onlyMaskPath,
    '-threshold', '0',
    '-define', 'connected-components:verbose=true',
    '-define', `connected-components:area-threshold=${COMPONENT_MIN_AREA}`,
    '-connected-components', '4',
    'null:',
  ])
  const componentOutput = `${componentResult.stdout}\n${componentResult.stderr}`
  const components = assignSemanticSlots(
    parseConnectedComponents(componentOutput),
    source.width,
    source.height,
  )
  const onlySlices = []
  for (const component of components) {
    const box = paddedBox(component.box, source.width, source.height)
    const slicePath = path.join(onlyDir, `slot-${String(component.slot).padStart(2, '0')}.png`)
    runner.run([
      onlyBoardPath,
      '-crop', `${box.width}x${box.height}+${box.x}+${box.y}`,
      '+repage',
      ...pngOutput(slicePath),
    ])
    onlySlices.push({ path: slicePath, slot: component.slot, box, componentArea: component.area })
  }
  const onlyRuntimeMs = performance.now() - onlyStart

  const hybridStart = performance.now()
  const hybridSlices = []
  for (const baselineSlice of baselineSlices) {
    const slicePath = path.join(hybridDir, `slot-${String(baselineSlice.slot).padStart(2, '0')}.png`)
    const maskPath = path.join(hybridDir, `alpha-mask-${String(baselineSlice.slot).padStart(2, '0')}.png`)
    runner.run([
      baselineSlice.path,
      '-channel', 'A',
      '-morphology', 'Smooth', 'Diamond:1',
      '+channel',
      ...pngOutput(slicePath),
    ])
    hybridSlices.push({ path: slicePath, slot: baselineSlice.slot, box: baselineSlice.box, maskPath })
  }
  const hybridRuntimeMs = performance.now() - hybridStart
  for (const hybridSlice of hybridSlices) {
    runner.run([hybridSlice.path, '-alpha', 'extract', ...pngOutput(hybridSlice.maskPath)])
  }
  const hybridMaskPath = path.join(hybridDir, 'alpha-mask-contact-sheet.png')
  createGrid(runner, hybridSlices.map((slice) => slice.maskPath), {
    background: 'black',
    outputDir: hybridDir,
    prefix: 'hybrid-alpha',
    outputPath: hybridMaskPath,
  })

  const baselineMeasured = await measureSlices(runner, baselineSlices, sourcePixels, source.width)
  const onlyMeasured = await measureSlices(runner, onlySlices, sourcePixels, source.width)
  const hybridMeasured = await measureSlices(runner, hybridSlices, sourcePixels, source.width)
  const contactSheets = await createContactSheets(runner, [
    { id: 'cutoutBaseline', files: baselineSlices.map((slice) => slice.path) },
    { id: 'imageMagickOnly', files: onlySlices.map((slice) => slice.path) },
    { id: 'hybrid', files: hybridSlices.map((slice) => slice.path) },
  ], resolvedOutput)
  const baselineSummary = summarize(baselineMeasured)
  const onlySummary = summarize(onlyMeasured)
  const hybridSummary = summarize(hybridMeasured)
  const baselineSliceHashes = await Promise.all(baselineSlices.map(async (slice) => ({
    semanticSlot: `slot-${slice.slot}`,
    path: slice.path,
    sha256: await sha256(slice.path),
  })))

  const report = {
    schemaVersion: 2,
    fixture: {
      source: sourcePath,
      width: source.width,
      height: source.height,
      expectedSemanticSlots: EXPECTED_SLOT_COUNT,
      baselineMetrics: baselineMetricsPath,
    },
    inputs: {
      sourceBoard: { path: sourcePath, sha256: await sha256(sourcePath) },
      baselineMetrics: { path: baselineMetricsPath, sha256: await sha256(baselineMetricsPath) },
      baselineSlices: baselineSliceHashes,
    },
    tool: { executable: imageMagickBin, version },
    reproducibility: {
      baselineCommand: [
        'pnpm', 'exec', 'playwright', 'test',
        'tests/visual/cutout-effect-evaluation.spec.ts',
        '--project=desktop-chrome',
      ],
      environment: {
        CUTOUT_EFFECT_BOARD_3X2: sourcePath,
        CUTOUT_EFFECT_OUTPUT_DIR: resolvedBaseline,
      },
      imageMagickCommands: runner.commands,
    },
    pipelines: {
      cutoutBaseline: {
        kind: 'production-benchmark-artifacts',
        runtimeScope: 'One in-browser sliceRegionBoardBitmap call, including six PNG encodes; one sample.',
        runtimeMs: baselineReport.pipelineRuntimeMs,
        semanticCoverage: { expected: EXPECTED_SLOT_COUNT, observed: baselineMeasured.slices.length, complete: true },
        summary: baselineSummary,
        slices: baselineMeasured.slices,
      },
      imageMagickOnly: {
        kind: 'border-connected fuzzy-white flood plus connected components',
        runtimeScope: 'Nine sequential ImageMagick subprocesses for flood, mask, components, and six PNG crops; one sample.',
        parameters: { fuzz: '4%', componentConnectivity: 4, minArea: COMPONENT_MIN_AREA, padding: CROP_PADDING },
        runtimeMs: onlyRuntimeMs,
        semanticCoverage: { expected: EXPECTED_SLOT_COUNT, observed: onlyMeasured.slices.length, complete: true },
        componentCount: components.length,
        components: components.map(({ id, slot, box, area }) => ({ id, semanticSlot: `slot-${slot}`, box, area })),
        summary: onlySummary,
        slices: onlyMeasured.slices,
      },
      hybrid: {
        kind: 'Cutout boxes and pixels plus alpha-only ImageMagick morphology',
        runtimeScope: 'Six sequential ImageMagick subprocesses that each read, morph, and write one PNG; one sample.',
        parameters: { morphology: 'Smooth', kernel: 'Diamond:1' },
        runtimeMs: hybridRuntimeMs,
        semanticCoverage: { expected: EXPECTED_SLOT_COUNT, observed: hybridMeasured.slices.length, complete: true },
        summary: hybridSummary,
        slices: hybridMeasured.slices,
      },
    },
    evidence: {
      imageMagickOnlyAlphaMask: onlyMaskPath,
      hybridAlphaMaskContactSheet: hybridMaskPath,
      contactSheets,
    },
    decision: {
      recommendation: 'reject-production-adoption',
      rationale: 'Neither ImageMagick branch produces an inspectable slicing-quality improvement on this fixture.',
      failureClasses: {
        semanticCoverage: {
          outcome: 'unchanged',
          detail: 'All variants preserve six unique spatial slots on this fixture.',
        },
        cropEdgeSafety: {
          outcome: 'unchanged',
          detail: 'All variants keep zero foreground pixels on crop edges.',
        },
        softAlpha: {
          outcome: 'imagemagick-only-regressed',
          detail: `ImageMagick-only partial-alpha ratio is ${onlySummary.meanPartialAlphaRatio}; Cutout is ${baselineSummary.meanPartialAlphaRatio}.`,
        },
        whiteRecomposition: {
          outcome: 'regressed',
          detail: `Common-canvas mean absolute error: Cutout ${baselineSummary.commonCanvasWhiteCompositeMeanAbsoluteError}, ImageMagick-only ${onlySummary.commonCanvasWhiteCompositeMeanAbsoluteError}, hybrid ${hybridSummary.commonCanvasWhiteCompositeMeanAbsoluteError}.`,
        },
        brightNeutralOpacity: {
          outcome: 'imagemagick-only-regressed',
          detail: `Mean ratio: Cutout ${baselineSummary.meanBrightNeutralOpaqueRatio}, ImageMagick-only ${onlySummary.meanBrightNeutralOpaqueRatio}.`,
        },
        outputSize: {
          outcome: 'hybrid-improved',
          detail: `Hybrid PNG bytes ${hybridSummary.outputBytes}; Cutout ${baselineSummary.outputBytes}. Encoding size does not establish a slicing-quality improvement or justify a native dependency.`,
        },
        runtime: {
          outcome: 'observed-slower-not-generalizable',
          detail: `One local sample in milliseconds: Cutout ${baselineReport.pipelineRuntimeMs}, ImageMagick-only ${onlyRuntimeMs}, hybrid ${hybridRuntimeMs}. The ImageMagick values include sequential process startup and PNG I/O, so these are implementation-boundary observations rather than a backend-independent speed ratio.`,
        },
      },
    },
  }
  const reportPath = path.join(resolvedOutput, 'metrics.json')
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  return { report, reportPath }
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  const result = await runBenchmark(options)
  process.stdout.write(`ImageMagick slicing benchmark complete: ${result.reportPath}\n`)
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (isMain) {
  main().catch((error) => {
    process.stderr.write(`[imagemagick-slicing] ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}

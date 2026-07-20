import { readFile, readdir, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REQUIRED_DEFERRED_CHUNKS = [
  'PipelineCanvas-',
  'SettingsDialog-',
  'LibraryDrawer-',
  'GlobalLibraryView-',
  'DesignOsWorkbench-',
  'live-model-',
  'generation-service.local-',
]

const REQUIRED_VENDOR_CHUNKS = [
  'vendor-react-',
  'vendor-radix-',
  'vendor-icons-',
  'vendor-state-',
]

const MAX_ENTRY_BYTES = 450 * 1024

const FORBIDDEN_BROWSER_MARKERS = [
  "node:fs",
  "node:path",
  'createNodeFsRuntimeStore',
  'scanRepositorySource',
]

const FORBIDDEN_ENTRY_MARKERS = [
  // The catalog version is part of Design IR validation; a concrete catalog
  // item proves the heavy catalog implementation itself entered first paint.
  'a1.logo.standard',
  'design-system-kit.v1',
]

export async function checkFrontendBundle(distDir) {
  const assetsDir = join(distDir, 'assets')
  const files = await readdir(assetsDir)
  const javascript = files.filter((file) => file.endsWith('.js'))
  const html = await readFile(join(distDir, 'index.html'), 'utf8')
  const entryMatch = html.match(/<script[^>]+src="\.\/assets\/([^"]+\.js)"/)
    ?? html.match(/<script[^>]+src="\/assets\/([^"]+\.js)"/)
  if (!entryMatch?.[1]) throw new Error('Could not identify the frontend entry chunk from dist/index.html.')

  const entryFile = entryMatch[1]
  const sizes = new Map(
    await Promise.all(javascript.map(async (file) => [file, (await stat(join(assetsDir, file))).size])),
  )
  const totalBytes = [...sizes.values()].reduce((sum, size) => sum + size, 0)
  const entryBytes = sizes.get(entryFile)
  if (entryBytes === undefined) throw new Error(`Frontend entry chunk is missing: ${entryFile}`)

  // A ratio gate survives ordinary dependency/version changes while preventing
  // the old single-bundle architecture from returning. Deferred features must
  // account for more than half of shipped JS rather than inflating first paint.
  if (entryBytes >= totalBytes / 2) {
    throw new Error(`Frontend entry is ${format(entryBytes)} of ${format(totalBytes)} total JS; expected it below 50%.`)
  }

  if (entryBytes > MAX_ENTRY_BYTES) {
    throw new Error(`Frontend entry is ${format(entryBytes)}; expected it at or below ${format(MAX_ENTRY_BYTES)}.`)
  }

  for (const prefix of REQUIRED_DEFERRED_CHUNKS) {
    if (!javascript.some((file) => file.startsWith(prefix))) {
      throw new Error(`Required deferred frontend chunk is missing: ${prefix}*`)
    }
  }

  for (const prefix of REQUIRED_VENDOR_CHUNKS) {
    if (!javascript.some((file) => file.startsWith(prefix))) {
      throw new Error(`Required shared vendor chunk is missing: ${prefix}*`)
    }
  }

  const entrySource = await readFile(join(assetsDir, entryFile), 'utf8')
  const browserSource = await Promise.all(javascript.map((file) => readFile(join(assetsDir, file), 'utf8')))
  for (const marker of FORBIDDEN_BROWSER_MARKERS) {
    if (browserSource.some((source) => source.includes(marker))) {
      throw new Error(`Node-only marker leaked into the browser build: ${marker}`)
    }
  }
  for (const providerEndpoint of ['api.anthropic.com', 'generativelanguage.googleapis.com']) {
    if (entrySource.includes(providerEndpoint)) {
      throw new Error(`AI provider runtime leaked into the frontend entry: ${providerEndpoint}`)
    }
  }
  for (const marker of FORBIDDEN_ENTRY_MARKERS) {
    if (entrySource.includes(marker)) {
      throw new Error(`Deferred Design OS catalog leaked into the frontend entry: ${marker}`)
    }
  }

  return { entryFile, entryBytes, totalBytes, chunks: javascript.length }
}

function format(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = await checkFrontendBundle(join(process.cwd(), 'dist'))
  process.stdout.write(
    `Frontend bundle gate passed: ${basename(result.entryFile)} ${format(result.entryBytes)} / ${format(result.totalBytes)} across ${result.chunks} chunks.\n`,
  )
}

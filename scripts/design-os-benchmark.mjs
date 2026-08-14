import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { createServer } from 'vite'

const root = process.cwd()
const packagePath = resolve(root, 'package.json')
const commercePath = resolve(root, 'src/commerce-profile/benchmarks/current.json')
const snapshotPath = resolve(root, 'src/design-os-benchmark/benchmarks/current.json')
const identity = {
  id: 'benchmark-run:design-os:current',
  revision: 'benchmark-run:design-os:current:revision:1',
}

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
}

const packageManifest = JSON.parse(await readFile(packagePath, 'utf8'))
if (typeof packageManifest.version !== 'string' || packageManifest.version.length === 0) {
  throw new Error('Cutout package version is invalid.')
}

const server = await createServer({
  root,
  configFile: false,
  appType: 'custom',
  define: { __CUTOUT_VERSION__: JSON.stringify(packageManifest.version) },
  server: { middlewareMode: true, hmr: false },
  resolve: { alias: { '@': resolve(root, 'src') } },
  logLevel: 'error',
})

try {
  const { createDesignOsBenchmarkFromCommerce } = await server.ssrLoadModule('/src/design-os-benchmark/commerce.ts')
  const { decodeDesignOsBenchmarkReport } = await server.ssrLoadModule('/src/design-os-benchmark/contracts.ts')
  const commerceReport = JSON.parse(await readFile(commercePath, 'utf8'))
  const generated = await createDesignOsBenchmarkFromCommerce({ commerceReport, identity })
  const rendered = `${JSON.stringify(generated, null, 2)}\n`

  if (process.argv.includes('--write')) {
    await mkdir(dirname(snapshotPath), { recursive: true })
    await writeFile(snapshotPath, rendered)
  } else {
    const persisted = decodeDesignOsBenchmarkReport(JSON.parse(await readFile(snapshotPath, 'utf8')))
    if (canonical(persisted) !== canonical(generated)) {
      throw new Error('The current Design OS benchmark snapshot is stale. Run pnpm benchmark:design-os:update.')
    }
  }

  const stages = generated.summary.stages.map((stage) => (
    `${stage.stage} ${stage.passed}/${stage.total}`
  )).join(' | ')
  const coverage = (generated.summary.coverage.basisPoints / 100).toFixed(2)
  const frontier = generated.summary.criticalFrontier.map((metric) => metric.metricId).join(', ') || 'none'
  console.log(`Design OS maturity: ${generated.summary.maturity}`)
  console.log(`Coverage: ${generated.summary.coverage.passed}/${generated.summary.coverage.total} (${coverage}%)`)
  console.log(stages)
  console.log(`Critical frontier: ${frontier}`)
  console.log(`Production ready: ${generated.summary.productionReady ? 'yes' : 'no'}`)
} finally {
  await server.close()
}

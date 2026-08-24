#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { VERSION } from '../lib/contracts.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(root, '..', '..')
const errors = []
const assert = (condition, message) => { if (!condition) errors.push(message) }
const json = async (path) => JSON.parse(await readFile(path, 'utf8'))
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const EXPECTED_FILES = Object.freeze([
  'README.md', 'agent.js', 'agent.json', 'lib/contracts.js', 'lib/data.js', 'lib/filesystem.js',
  'lib/localization.js', 'lib/media.js', 'lib/orchestrator.js', 'lib/provider.js', 'lib/transport.js', 'package.json', 'provenance.json',
  'scripts/validate-package.js', 'scripts/validate-rehearsal.js', 'tests/agent.test.js',
  'tests/helpers.js', 'tests/provider.test.js', 'tests/rehearsal-validator.test.js',
].sort())
const EXPECTED_PROJECTION_SOURCES = Object.freeze([
  'src/design-os-kernel/contracts.ts',
  'src/design-os-kernel/runtime.ts',
  'src/commerce-profile/contracts.ts',
  'src/commerce-profile/normalizer.ts',
  'src/commerce-profile/catalog.ts',
  'src/commerce-profile/policies.ts',
  'src/commerce-profile/recipes.ts',
  'src/commerce-profile/evaluation.ts',
].sort())

const agent = await json(join(root, 'agent.json'))
const packageManifest = await json(join(root, 'package.json'))
const provenance = await json(join(root, 'provenance.json'))
assert(agent.runtime === 'node', 'agent.json runtime must be lowercase node')
assert(/^\d+\.\d+\.\d+$/.test(agent.version), 'agent.json version must be numeric three-part semver')
assert(agent.version === packageManifest.version, 'agent.json/package.json version mismatch')
assert(agent.version === VERSION, 'agent.json/runtime version mismatch')
assert(packageManifest.type === 'module', 'package must use Node ESM')
assert(Object.keys(packageManifest.dependencies ?? {}).length === 0, 'runtime dependencies are forbidden')
assert(provenance.schema === 'cutout.qianwen-package-provenance.v1', 'package provenance schema is invalid')
assert(provenance.hostProjection?.kernelContract === 'design-os.protocol.v1'
  && provenance.hostProjection?.productFacts === 'product-facts.v1'
  && provenance.hostProjection?.categoryIndex === 'commerce.category-index.v1'
  && provenance.hostProjection?.attributeIndex === 'commerce.attribute-index.v1',
'package Host projection contract is invalid')
assert(provenance.hostProjection?.mediaIdentity?.authority === 'first explicit product image'
  && JSON.stringify(provenance.hostProjection?.mediaIdentity?.binding) === JSON.stringify(['role', 'source JSON Pointer', 'ordered URL'])
  && provenance.hostProjection?.mediaIdentity?.inheritance === 'main image -> reviewed details -> image-conditioned video'
  && provenance.hostProjection?.mediaIdentity?.roleSupport === 'deterministic semantic role-to-source plan over ordered product and description images',
'package media-identity projection provenance is invalid')
assert(JSON.stringify(provenance.hostProjection?.strategyDelivery?.actualRunClosure)
    === JSON.stringify(['market', 'localization', 'role purpose', 'source support', 'semantic QA', 'repair'])
  && provenance.hostProjection?.strategyDelivery?.videoStoryboard === '0.0-5.0 seconds',
'package strategy-delivery projection provenance is invalid')
assert(provenance.hostProjection?.catalogSelection?.runtimeSampleAnswers === false
  && JSON.stringify(provenance.hostProjection?.catalogSelection?.candidateEvidence)
    === JSON.stringify(['complete lineage', 'garment type', 'audience', 'usage context', 'plus-size signal']),
'package catalog-selection projection provenance is invalid')
assert(provenance.hostProjection?.localization?.sourceBinding === 'original value plus source JSON Pointer'
  && JSON.stringify(provenance.hostProjection?.localization?.markets) === JSON.stringify(['en-US', 'ko-KR', 'pt-BR'])
  && provenance.hostProjection?.localization?.numericConversions === 'deterministic Host projection'
  && provenance.hostProjection?.localization?.modelTranslationClosure === 'exact ordered fact-id request and response in the structured plan'
  && provenance.hostProjection?.localization?.bodyScriptPolicy === 'target-market script outside fixed inline evidence and source-reference sections'
  && provenance.hostProjection?.localization?.benchmarkScope === 'translation request closure only, not language quality or SOTA',
'package localization projection provenance is invalid')
const declaredProjectionSources = (provenance.generatedFrom ?? []).map((source) => source.path).sort()
assert(declaredProjectionSources.length === EXPECTED_PROJECTION_SOURCES.length
  && declaredProjectionSources.every((path, index) => path === EXPECTED_PROJECTION_SOURCES[index]),
'package provenance must declare the exact canonical Kernel/Profile projection sources once')
for (const name of ['agent.js', 'agent.json', 'package.json']) {
  const info = await stat(join(root, name)).catch(() => undefined)
  assert(info?.isFile(), `required package root file missing: ${name}`)
}

const repositoryMarker = await stat(join(repositoryRoot, '.git')).catch(() => undefined)
for (const source of provenance.generatedFrom ?? []) {
  const path = resolve(repositoryRoot, source.path)
  assert(relative(repositoryRoot, path) && !relative(repositoryRoot, path).startsWith('..'), `provenance path escapes repository: ${source.path}`)
  assert(/^[a-f0-9]{64}$/u.test(source.sha256), `source projection hash is malformed: ${source.path}`)
  if (repositoryMarker) {
    const bytes = await readFile(path).catch(() => undefined)
    assert(bytes && sha256(bytes) === source.sha256, `source projection hash is stale: ${source.path}`)
  }
}

const files = []
const walk = async (directory) => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) await walk(path)
    else if (entry.isFile()) files.push(path)
    else errors.push(`unsupported package entry kind: ${relative(root, path)}`)
  }
}
await walk(root)
const relativeFiles = files.map((file) => relative(root, file)).sort()
assert(relativeFiles.length === EXPECTED_FILES.length
  && relativeFiles.every((path, index) => path === EXPECTED_FILES[index]),
'package file closure differs from the reviewed submission manifest')
let totalBytes = 0
let source = ''
for (const file of files) {
  const bytes = await readFile(file)
  totalBytes += bytes.length
  const relativePath = relative(root, file)
  if (relativePath === 'agent.js' || relativePath.startsWith(`lib/`)) source += `\n${relativePath}\n${bytes.toString('utf8')}`
}
assert(totalBytes < 100 * 1024 * 1024, 'package exceeds 100 MB')
assert(!source.includes("'qwen-image-3.0'") && !source.includes('"qwen-image-3.0"') && !source.includes('wan2.6-t2v') && !source.includes('qwen3.5-omni'), 'forbidden model id found')
assert(!/(?:responses\.create|files\.create|['"]\/(?:responses|files|uploads?)(?:['"/]))/i.test(source), 'forbidden Responses/upload API surface found')
assert(!/(?:PUBLIC_GOLD|acceptedIds|benchmarkPublicSample|qianwen-public-benchmark|product_\d{8,}\.json)/u.test(source),
  'public benchmark gold or evaluator coupling found in runtime source')
assert(!/(?:node:child_process|from\s+['"]child_process['"]|require\(['"]child_process['"]\))/.test(source), 'process execution is forbidden')
assert(!/https?:\/\/(?!dashscope\.aliyuncs\.com)/.test(source.replace(/https:\/\/dashscope-result-/g, 'https://dashscope.aliyuncs.com/')), 'unexpected literal network origin found')
for (const required of ['qwen3.8-max', 'qwen3-vl-plus', 'qwen-image-3.0-pro', 'wan2.7-i2v-2026-04-25']) assert(source.includes(required), `required model missing: ${required}`)
for (const required of ['product_description_en.md', 'product_description_ko.md', 'product_description_pt.md', 'main_image', 'detail_image_1', 'detail_image_2', 'detail_image_3', 'detail_image_4', 'detail_image_5', 'product_video', 'strategy_document.md']) assert(source.includes(required), `required output missing from contract: ${required}`)

if (errors.length) {
  process.stderr.write(`${errors.map((error) => `- ${error}`).join('\n')}\n`)
  process.exitCode = 1
} else {
  process.stdout.write(`Package valid: ${files.length} files, ${totalBytes} bytes, Node 22 dependency-free runtime.\n`)
}

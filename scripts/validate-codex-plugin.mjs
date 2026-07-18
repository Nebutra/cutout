#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pluginRoot = resolve(root, 'plugins/cutout')
const parse = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'))
const failures = []
const assert = (condition, message) => { if (!condition) failures.push(message) }

const [packageJson, capabilities, plugin, mcp, marketplace, buildManifest] = await Promise.all([
  parse('package.json'),
  parse('cutout.agent-capabilities.json'),
  parse('plugins/cutout/.codex-plugin/plugin.json'),
  parse('plugins/cutout/.mcp.json'),
  parse('.agents/plugins/marketplace.json'),
  parse('plugins/cutout/runtime/runtime-build.json'),
])

assert(plugin.name === 'cutout', 'Plugin name must be cutout.')
assert(plugin.version === packageJson.version, 'Plugin version must match package.json.')
assert(plugin.skills === './skills/', 'Plugin must expose its skills directory.')
assert(plugin.mcpServers === './.mcp.json', 'Plugin must point to its MCP config.')
assert(plugin.interface?.category === 'Design', 'Plugin category must be Design.')
assert(Array.isArray(plugin.interface?.defaultPrompt) && plugin.interface.defaultPrompt.length <= 3, 'Plugin must provide at most three default prompts.')

for (const assetPath of [plugin.interface?.composerIcon, plugin.interface?.logo]) {
  assert(typeof assetPath === 'string' && assetPath.startsWith('./assets/'), `Invalid plugin asset path: ${String(assetPath)}.`)
  if (typeof assetPath === 'string') assert(await exists(resolve(pluginRoot, assetPath)), `Missing plugin asset: ${assetPath}.`)
}

const server = mcp.mcpServers?.cutout
assert(server?.command === 'node', 'Plugin MCP must use the bundled Node runtime.')
assert(server?.cwd === '.', 'Plugin MCP cwd must stay inside the plugin package.')
assert(server?.args?.length === 1 && server.args[0] === './runtime/cutout-mcp.mjs', 'Plugin MCP must launch the bundled entry.')
assert(server?.env_vars?.includes(capabilities.mcp.projectRootEnv), 'Plugin MCP must forward the authoritative project-root environment variable.')

const marketplaceEntry = marketplace.plugins?.find((entry) => entry.name === 'cutout')
assert(marketplace.name === 'cutout-local', 'Repo marketplace name must remain stable.')
assert(marketplaceEntry?.source?.source === 'local' && marketplaceEntry.source.path === './plugins/cutout', 'Marketplace must point to the repo-owned plugin package.')
assert(marketplaceEntry?.policy?.installation === 'AVAILABLE', 'Plugin must be available, not silently installed by default.')
assert(marketplaceEntry?.category === 'Design', 'Marketplace category must match the plugin.')

const controllerSkill = await readFile(resolve(pluginRoot, 'skills/cutout-controller/SKILL.md'), 'utf8')
const referencedTools = [...new Set(controllerSkill.match(/\bcutout_[a-z0-9]+(?:_[a-z0-9]+)*\b/g) ?? [])]
for (const tool of referencedTools) assert(capabilities.mcp.tools.includes(tool), `Controller skill references an undeclared MCP tool: ${tool}.`)

assert(buildManifest.protocol === 'cutout.codex-plugin-runtime.v1', 'Unexpected plugin runtime build protocol.')
assert(buildManifest.packageVersion === packageJson.version, 'Bundled runtime version drifted from package.json.')
for (const [path, expectedHash] of Object.entries(buildManifest.sourceHashes ?? {})) {
  const sourcePath = resolve(root, path)
  assert(await exists(sourcePath), `Bundled runtime source is missing: ${path}.`)
  if (await exists(sourcePath)) assert(sha256(await readFile(sourcePath)) === expectedHash, `Bundled runtime source changed; run pnpm plugin:build: ${path}.`)
}

const bundle = await readFile(resolve(pluginRoot, 'runtime/cutout-mcp.mjs'), 'utf8')
assert(!bundle.includes('ssrLoadModule'), 'Bundled MCP must not load source through Vite SSR at runtime.')
const topLevelImports = bundle.match(/^import .*$/gm)?.join('\n') ?? ''
assert(!/from ["']vite["']/.test(topLevelImports), 'Bundled MCP must not depend on Vite at runtime.')
assert(await equalNormalizedTextFiles(resolve(root, 'cutout.agent-capabilities.json'), resolve(pluginRoot, 'runtime-data/cutout.agent-capabilities.json')), 'Bundled capability manifest drifted; run pnpm plugin:build.')
assert(await equalNormalizedTextTrees(resolve(root, 'skills'), resolve(pluginRoot, 'runtime-data/skills')), 'Bundled product Skills drifted; run pnpm plugin:build.')
assert(await hasPngSignature(resolve(pluginRoot, 'assets/logo.png')), 'Plugin logo must be a valid canonical PNG consumer asset.')

if (failures.length) {
  process.stderr.write(`Cutout Codex plugin validation failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}\n`)
  process.exitCode = 1
} else {
  process.stdout.write(`Cutout Codex plugin valid: ${referencedTools.length} workflow tools, ${Object.keys(buildManifest.sourceHashes).length} bundled source modules.\n`)
}

async function exists(path) {
  return stat(path).then(() => true, () => false)
}

async function hasPngSignature(path) {
  if (!(await exists(path))) return false
  const bytes = await readFile(path)
  return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
}

async function equalNormalizedTextFiles(left, right) {
  if (!(await exists(left)) || !(await exists(right))) return false
  const [leftText, rightText] = await Promise.all([readFile(left, 'utf8'), readFile(right, 'utf8')])
  return normalizeText(leftText) === rightText
}

async function equalNormalizedTextTrees(left, right) {
  if (!(await exists(left)) || !(await exists(right))) return false
  const leftFiles = await listFiles(left)
  const rightFiles = await listFiles(right)
  if (leftFiles.length !== rightFiles.length || leftFiles.some((path, index) => path !== rightFiles[index])) return false
  return (await Promise.all(leftFiles.map((path) => equalNormalizedTextFiles(resolve(left, path), resolve(right, path))))).every(Boolean)
}

async function listFiles(rootPath, current = rootPath) {
  const entries = await readdir(current, { withFileTypes: true })
  const files = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = resolve(current, entry.name)
    if (entry.isDirectory()) files.push(...await listFiles(rootPath, path))
    else if (entry.isFile()) files.push(relative(rootPath, path))
  }
  return files
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function normalizeText(source) {
  return `${source.replace(/[ \t]+$/gm, '').trimEnd()}\n`
}

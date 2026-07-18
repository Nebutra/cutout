#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pluginRoot = resolve(root, 'plugins/cutout')
const runtimeDir = resolve(pluginRoot, 'runtime')
const runtimeDataDir = resolve(pluginRoot, 'runtime-data')
const assetsDir = resolve(pluginRoot, 'assets')

await Promise.all([
  rm(runtimeDir, { recursive: true, force: true }),
  rm(runtimeDataDir, { recursive: true, force: true }),
])
await Promise.all([mkdir(runtimeDir, { recursive: true }), mkdir(runtimeDataDir, { recursive: true }), mkdir(assetsDir, { recursive: true })])

const buildResult = await build({
  root,
  configFile: false,
  publicDir: false,
  logLevel: 'warn',
  ssr: { noExternal: true },
  build: {
    ssr: resolve(root, 'scripts/cutout-mcp-bundle-entry.mjs'),
    outDir: runtimeDir,
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      output: { entryFileNames: 'cutout-mcp.mjs' },
    },
  },
})

await Promise.all([
  cp(resolve(root, 'cutout.agent-capabilities.json'), resolve(runtimeDataDir, 'cutout.agent-capabilities.json')),
  cp(resolve(root, 'skills'), resolve(runtimeDataDir, 'skills'), { recursive: true }),
])
await Promise.all([
  normalizeTextFile(resolve(runtimeDir, 'cutout-mcp.mjs')),
  normalizeTextTree(runtimeDataDir),
])

const outputs = Array.isArray(buildResult) ? buildResult.flatMap((result) => result.output) : buildResult.output
const modulePaths = [...new Set(outputs.flatMap((output) => output.type === 'chunk' ? Object.keys(output.modules) : []))]
  .filter((path) => path.startsWith(`${root}/`))
  .sort()
const sourceHashes = {}
for (const path of modulePaths) sourceHashes[relative(root, path)] = sha256(await readFile(path))

const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
await writeFile(resolve(runtimeDir, 'runtime-build.json'), `${JSON.stringify({
  protocol: 'cutout.codex-plugin-runtime.v1',
  packageVersion: packageJson.version,
  sourceHashes,
}, null, 2)}\n`)

process.stdout.write(`Built Cutout Codex plugin runtime from ${modulePaths.length} source modules.\n`)

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

async function normalizeTextTree(path) {
  const entries = await readdir(path, { withFileTypes: true })
  await Promise.all(entries.map((entry) => {
    const child = resolve(path, entry.name)
    return entry.isDirectory() ? normalizeTextTree(child) : normalizeTextFile(child)
  }))
}

async function normalizeTextFile(path) {
  const source = await readFile(path, 'utf8')
  await writeFile(path, normalizeText(source))
}

function normalizeText(source) {
  return `${source.replace(/[ \t]+$/gm, '').trimEnd()}\n`
}

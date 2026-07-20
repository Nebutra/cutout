import { createHash } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = resolve(root, 'brand/brand-asset-manifest.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const mode = process.argv[2] ?? 'check'

if (!['check', 'sync'].includes(mode)) {
  throw new Error('Usage: node scripts/brand-assets.mjs [check|sync]')
}

const sha256 = async (path) => createHash('sha256').update(await readFile(resolve(root, path))).digest('hex')

async function renderAppIcon(appIcon, destination) {
  const layout = JSON.parse(await readFile(resolve(root, appIcon.source), 'utf8'))
  const symbol = resolve(tmpdir(), `cutout-app-symbol-${process.pid}.png`)
  const render = spawnSync('sips', ['-s', 'format', 'png', resolve(root, dirname(appIcon.source), layout.symbol), '--out', symbol], { encoding: 'utf8' })
  if (render.status !== 0) throw new Error(render.stderr || 'Canonical symbol rendering failed.')
  const compose = spawnSync('swift', [resolve(root, 'scripts/app-icon-compose.swift'), symbol, resolve(root, appIcon.source), destination], { encoding: 'utf8' })
  await rm(symbol, { force: true })
  if (compose.status !== 0) throw new Error(compose.stderr || 'Canonical app icon composition failed.')
  process.stdout.write(compose.stdout)
}

async function syncConsumers() {
  const appIcon = manifest.appIcon
  if (appIcon) {
    if (process.platform !== 'darwin') {
      throw new Error('Syncing the canonical app icon requires macOS sips.')
    }
    await renderAppIcon(appIcon, resolve(root, appIcon.destination))
  }
  const tauriConsumers = manifest.consumers.filter((consumer) => consumer.mode === 'tauri-icon')
  const platformDerivatives = manifest.appIcon?.platformDerivatives ?? []
  const tauriInputs = [
    ...tauriConsumers.map((consumer) => ({ path: consumer.destination, expected: consumer.sha256 })),
    ...platformDerivatives.map((derivative) => ({
      path: derivative.destination,
      expected: manifest.assets.find((asset) => asset.path === derivative.destination)?.sha256,
    })),
    ...new Set(tauriConsumers.map((consumer) => consumer.source)),
  ]
  const tauriOutputsCurrent = (
    await Promise.all(
      tauriInputs.map(async (entry) => {
        if (typeof entry === 'string') {
          const expected = manifest.assets.find((asset) => asset.path === entry)?.sha256
          return Boolean(expected) && (await sha256(entry).catch(() => 'missing')) === expected
        }
        return Boolean(entry.expected) && (await sha256(entry.path).catch(() => 'missing')) === entry.expected
      }),
    )
  ).every(Boolean)
  const tauriOutput = tauriConsumers.length && !tauriOutputsCurrent
    ? await mkdtemp(join(tmpdir(), 'cutout-brand-icons-'))
    : null
  try {
    if (tauriOutput) {
      const sources = new Set(tauriConsumers.map((consumer) => consumer.source))
      if (sources.size !== 1) throw new Error('Tauri icon consumers must share one platform master.')
      const command = resolve(root, 'node_modules/.bin/tauri')
      const result = spawnSync(command, ['icon', resolve(root, [...sources][0]), '--output', tauriOutput], { encoding: 'utf8' })
      if (result.status !== 0) throw new Error(result.stderr || 'Tauri icon generation failed.')
      for (const derivative of platformDerivatives) {
        await copyFile(join(tauriOutput, derivative.generatedName), resolve(root, derivative.destination))
      }
    }
    for (const consumer of manifest.consumers) {
      const source = resolve(root, consumer.source)
      const destination = resolve(root, consumer.destination)
      await mkdir(dirname(destination), { recursive: true })
      if (consumer.mode === 'copy') {
        await copyFile(source, destination)
        continue
      }
      if (consumer.mode === 'tauri-icon') {
        if (tauriOutput) await copyFile(join(tauriOutput, basename(destination)), destination)
        continue
      }
      if (process.platform !== 'darwin') {
        throw new Error(`Syncing ${consumer.destination} requires macOS sips; use the committed derivative on this platform.`)
      }
      const result = spawnSync('sips', ['-z', String(consumer.size), String(consumer.size), source, '--out', destination], { encoding: 'utf8' })
      if (result.status !== 0) throw new Error(result.stderr || `sips failed for ${consumer.destination}`)
    }
  } finally {
    if (tauriOutput) await rm(tauriOutput, { recursive: true, force: true })
  }

  for (const asset of manifest.assets) {
    asset.sha256 = await sha256(asset.path)
    if (asset.path === manifest.appIcon?.destination && asset.derivation) {
      asset.derivation.sourceSha256 = await sha256(manifest.appIcon.source)
    }
  }
  for (const consumer of manifest.consumers) consumer.sha256 = await sha256(consumer.destination)
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}

async function sourceFiles(directory) {
  const entries = await readdir(resolve(root, directory), { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = `${directory}/${entry.name}`
    if (entry.isDirectory()) files.push(...await sourceFiles(path))
    else if (['.ts', '.tsx'].includes(extname(entry.name))) files.push(path)
  }
  return files
}

async function check() {
  const failures = []
  for (const asset of manifest.assets) {
    const actual = await sha256(asset.path).catch(() => 'missing')
    if (actual !== asset.sha256) failures.push(`${asset.path}: expected ${asset.sha256}, received ${actual}`)
    if (asset.role === 'runtime-derivative') {
      const derivative = await readFile(resolve(root, asset.path), 'utf8')
      if (!derivative.includes('currentColor')) {
        failures.push(`${asset.path}: currentColor derivative lost its host-controlled fill`)
      }
      const canonical = await readFile(resolve(root, asset.dependsOn), 'utf8')
      if (derivative.replaceAll('currentColor', '#000000') !== canonical) {
        failures.push(`${asset.path}: geometry differs from ${asset.dependsOn}`)
      }
    }
  }
  if (manifest.appIcon) {
    const layout = JSON.parse(await readFile(resolve(root, manifest.appIcon.source), 'utf8'))
    if (layout.symbol !== 'symbol.svg' || JSON.stringify(layout.symbolBoundsPx) !== JSON.stringify(manifest.appIcon.symbolBoundsPx)) {
      failures.push(`${manifest.appIcon.source}: canonical symbol placement differs from the declared optical bounds`)
    }
    if (process.platform === 'darwin') {
      const rendered = resolve(tmpdir(), `cutout-app-icon-check-${process.pid}.png`)
      try {
        await renderAppIcon(manifest.appIcon, rendered)
        const expected = await sha256(manifest.appIcon.destination)
        const actual = createHash('sha256').update(await readFile(rendered)).digest('hex')
        if (actual !== expected) failures.push(`${manifest.appIcon.destination}: committed master is not reproducible (${actual})`)
      } finally {
        await rm(rendered, { force: true })
      }
    }
  }
  for (const consumer of manifest.consumers) {
    const actual = await sha256(consumer.destination).catch(() => 'missing')
    if (actual !== consumer.sha256) failures.push(`${consumer.destination}: stale generated consumer (${actual})`)
    if (consumer.mode === 'copy') {
      const source = await sha256(consumer.source).catch(() => 'missing')
      if (source !== actual) failures.push(`${consumer.destination}: copy consumer differs from ${consumer.source}`)
    }
  }

  const files = await sourceFiles('src')
  for (const path of files) {
    const source = await readFile(resolve(root, path), 'utf8')
    if (/\bScissors\b/.test(source)) failures.push(`${path}: Scissors is forbidden by the Cutout brand contract`)
    if (/symbol-master\.svg|wordmark-master\.svg/.test(source)) failures.push(`${path}: consume CutoutBrandMark instead of hand-addressing a master`)
  }

  const html = await readFile(resolve(root, 'index.html'), 'utf8')
  if (!html.includes('href="/favicon.svg"')) failures.push('index.html: favicon must consume /favicon.svg')
  if (failures.length) throw new Error(`Cutout brand validation failed:\n- ${failures.join('\n- ')}`)
  console.log(`Cutout brand package valid: ${manifest.assets.length} assets, ${manifest.consumers.length} consumers.`)
}

if (mode === 'sync') await syncConsumers()
await check()

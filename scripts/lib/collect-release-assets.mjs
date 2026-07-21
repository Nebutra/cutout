import { createHash } from 'node:crypto'
import { copyFile, lstat, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, join, resolve, sep } from 'node:path'

export const releaseArtifactIds = Object.freeze([
  'release-macos-aarch64',
  'release-macos-x86_64',
  'release-windows-x86_64',
  'release-linux-x86_64',
])

const allowedSuffixes = Object.freeze([
  '.app.tar.gz', '.app.tar.gz.sig', '.dmg',
  '.msi', '.msi.zip', '.msi.zip.sig', '.exe', '.nsis.zip', '.nsis.zip.sig',
  '.AppImage', '.AppImage.tar.gz', '.AppImage.tar.gz.sig', '.deb',
])

const requiredBundles = Object.freeze({
  'release-macos-aarch64': ['.dmg', '.app.tar.gz', '.app.tar.gz.sig'],
  'release-macos-x86_64': ['.dmg', '.app.tar.gz', '.app.tar.gz.sig'],
  'release-windows-x86_64': ['.msi', '.exe', '.nsis.zip', '.nsis.zip.sig'],
  'release-linux-x86_64': ['.AppImage', '.deb', '.AppImage.tar.gz', '.AppImage.tar.gz.sig'],
})

function isWithin(parent, child) {
  const prefix = `${resolve(parent)}${sep}`
  return resolve(child).startsWith(prefix)
}

function isReleaseAsset(name) {
  return allowedSuffixes.some((suffix) => name.endsWith(suffix))
}

async function filesBelow(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    const metadata = await lstat(path)
    if (metadata.isSymbolicLink()) throw new Error(`Release artifacts cannot contain symbolic links: ${path}`)
    if (metadata.isDirectory()) files.push(...await filesBelow(root, path))
    else if (metadata.isFile() && isReleaseAsset(entry.name)) files.push(path)
  }
  return files
}

export async function collectReleaseAssets({ inputDir, outputDir, artifactIds = releaseArtifactIds }) {
  const input = resolve(inputDir)
  const output = resolve(outputDir)
  if (input === output || isWithin(input, output) || isWithin(output, input)) {
    throw new Error('Release artifact input and output directories must not contain each other.')
  }

  await rm(output, { recursive: true, force: true })
  await mkdir(output, { recursive: true })
  const collected = []

  for (const artifactId of artifactIds) {
    if (!releaseArtifactIds.includes(artifactId)) throw new Error(`Unknown release artifact id: ${artifactId}`)
    const artifactDirectory = join(input, artifactId)
    const metadata = await lstat(artifactDirectory).catch(() => null)
    if (!metadata?.isDirectory() || metadata.isSymbolicLink()) throw new Error(`Missing release artifact directory: ${artifactId}`)
    const files = await filesBelow(artifactDirectory)
    const names = files.map((file) => basename(file))
    for (const suffix of requiredBundles[artifactId]) {
      if (!names.some((name) => name.endsWith(suffix))) throw new Error(`${artifactId} is missing required ${suffix} output.`)
    }
    for (const source of files) {
      const destination = join(output, `${artifactId.replace(/^release-/, '')}-${basename(source)}`)
      if (!isWithin(output, destination)) throw new Error(`Release asset escaped output directory: ${source}`)
      if (collected.some((item) => item.destination === destination)) throw new Error(`Duplicate release asset name: ${basename(destination)}`)
      await copyFile(source, destination, 0x1)
      collected.push({ source, destination })
    }
  }

  return collected.map(({ destination }) => destination).sort()
}

export async function writeReleaseChecksums(directory, outputName = 'SHA256SUMS') {
  const root = resolve(directory)
  const entries = await readdir(root, { withFileTypes: true })
  const names = entries
    .filter((entry) => entry.isFile() && entry.name !== outputName)
    .map((entry) => entry.name)
    .sort()
  if (!names.length) throw new Error('Cannot generate checksums for an empty release directory.')
  const lines = []
  for (const name of names) {
    const digest = createHash('sha256').update(await readFile(join(root, name))).digest('hex')
    lines.push(`${digest}  ${name}`)
  }
  const path = join(root, outputName)
  await writeFile(path, `${lines.join('\n')}\n`, { flag: 'w' })
  return path
}

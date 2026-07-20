import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { collectReleaseAssets, releaseArtifactIds, writeReleaseChecksums } from './lib/collect-release-assets.mjs'

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'cutout-release-assets-'))
  const input = join(root, 'input')
  const output = join(root, 'output')
  const files: Record<string, string[]> = {
    'release-macos-aarch64': ['Cutout.app.tar.gz', 'Cutout.app.tar.gz.sig', 'Cutout.dmg'],
    'release-macos-x86_64': ['Cutout.app.tar.gz', 'Cutout.app.tar.gz.sig', 'Cutout.dmg'],
    'release-windows-x86_64': ['Cutout.msi', 'Cutout-setup.exe'],
    'release-linux-x86_64': ['Cutout.AppImage', 'Cutout.deb'],
  }
  for (const artifactId of releaseArtifactIds) {
    const directory = join(input, artifactId, 'nested')
    await mkdir(directory, { recursive: true })
    await Promise.all(files[artifactId].map((name) => writeFile(join(directory, name), `${artifactId}:${name}`)))
  }
  return { root, input, output }
}

describe('release asset collection', () => {
  it('qualifies duplicate platform basenames and writes deterministic checksums', async () => {
    const { input, output } = await fixture()
    const assets = await collectReleaseAssets({ inputDir: input, outputDir: output })
    expect(assets.map((path) => basename(path))).toEqual(expect.arrayContaining([
      'macos-aarch64-Cutout.dmg',
      'macos-x86_64-Cutout.dmg',
      'windows-x86_64-Cutout.msi',
      'linux-x86_64-Cutout.AppImage',
    ]))
    const checksumPath = await writeReleaseChecksums(output)
    const first = await readFile(checksumPath, 'utf8')
    await writeReleaseChecksums(output)
    expect(await readFile(checksumPath, 'utf8')).toBe(first)
    expect(first.trim().split('\n')).toHaveLength(assets.length)
  })

  it('fails when a required platform or bundle is missing', async () => {
    const { input, output } = await fixture()
    await rm(join(input, 'release-linux-x86_64'), { recursive: true })
    await expect(collectReleaseAssets({ inputDir: input, outputDir: output })).rejects.toThrow('Missing release artifact directory')
    const second = await fixture()
    await rm(join(second.input, 'release-windows-x86_64', 'nested', 'Cutout.msi'))
    await expect(collectReleaseAssets({ inputDir: second.input, outputDir: second.output })).rejects.toThrow('missing required .msi')
  })

  it('rejects symbolic links and nested input/output boundaries', async () => {
    const { root, input, output } = await fixture()
    await symlink(join(input, 'release-macos-aarch64', 'nested', 'Cutout.dmg'), join(input, 'release-macos-aarch64', 'linked.dmg'))
    await expect(collectReleaseAssets({ inputDir: input, outputDir: output })).rejects.toThrow('symbolic links')
    await expect(collectReleaseAssets({ inputDir: input, outputDir: join(input, 'out') })).rejects.toThrow('must not contain each other')
    await expect(collectReleaseAssets({ inputDir: input, outputDir: root })).rejects.toThrow('must not contain each other')
  })
})

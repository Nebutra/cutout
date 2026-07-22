import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateReleaseAuthority } from './validate-release-authority.mjs'

describe('single release authority', () => {
  it('accepts the repository workflow set', async () => {
    await expect(validateReleaseAuthority()).resolves.toEqual({
      workflow: 'release-update.yml',
      job: 'publish',
    })
  })

  it('rejects another workflow writer or release mutator', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cutout-release-authority-'))
    await mkdir(root, { recursive: true })
    await writeFile(join(root, 'release-update.yml'), `jobs:\n  publish:\n    permissions:\n      contents: write\n    steps:\n      - run: gh release create v1.0.0\n`)
    await writeFile(join(root, 'other.yml'), `jobs:\n  unsafe:\n    permissions:\n      contents: write\n    steps:\n      - run: gh release upload v1.0.0 asset.zip\n`)

    await expect(validateReleaseAuthority(root)).rejects.toThrow('other.yml:unsafe')
  })
})

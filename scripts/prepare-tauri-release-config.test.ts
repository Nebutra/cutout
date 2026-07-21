import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const validKey = 'untrusted comment: minisign public key: 0123456789ABCDEF\nRWT0123456789ABCDEFabcdefghijklmnopqrstuvwxyz0123456789AB='
const tauriPublicKey = Buffer.from(validKey).toString('base64')

describe('Tauri release config preparation', () => {
  it('writes a merge-only updater config from the protected public key', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cutout-tauri-config-'))
    const output = join(root, 'release.json')
    const result = spawnSync(process.execPath, ['scripts/prepare-tauri-release-config.mjs', output], {
      cwd: process.cwd(),
      env: { ...process.env, CUTOUT_UPDATER_PUBKEY: validKey.replace(/\n/g, '\r\n') },
      encoding: 'utf8',
    })

    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(await readFile(output, 'utf8'))).toEqual({
      plugins: { updater: { pubkey: tauriPublicKey } },
    })
  })

  it('accepts a base64-wrapped complete public key from GitHub variables', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cutout-tauri-config-'))
    const output = join(root, 'release.json')
    const result = spawnSync(process.execPath, ['scripts/prepare-tauri-release-config.mjs', output], {
      cwd: process.cwd(),
      env: { ...process.env, CUTOUT_UPDATER_PUBKEY: Buffer.from(`${validKey}\n`).toString('base64') },
      encoding: 'utf8',
    })

    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(await readFile(output, 'utf8'))).toEqual({
      plugins: { updater: { pubkey: tauriPublicKey } },
    })
  })

  it.each([
    ['', 'required'],
    ['RWT0123456789ABCDEFabcdefghijklmnopqrstuvwxyz0123456789AB=', 'complete two-line'],
    ['untrusted comment: key\nnot-a-minisign-key', 'complete two-line'],
    ['bm90IGEga2V5', 'complete two-line'],
  ])('fails closed for malformed key %j', (key, message) => {
    const result = spawnSync(process.execPath, ['scripts/prepare-tauri-release-config.mjs'], {
      cwd: process.cwd(),
      env: { ...process.env, CUTOUT_UPDATER_PUBKEY: key },
      encoding: 'utf8',
    })

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(message)
  })
})

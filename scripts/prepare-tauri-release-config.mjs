import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'

const output = resolve(process.cwd(), process.argv[2] ?? 'src-tauri/tauri.release.conf.json')
const publicKey = normalizePublicKey(process.env.CUTOUT_UPDATER_PUBKEY)
const temporary = `${output}.${process.pid}.tmp`

await mkdir(dirname(output), { recursive: true })
await writeFile(temporary, `${JSON.stringify({ plugins: { updater: { pubkey: publicKey } } }, null, 2)}\n`, {
  encoding: 'utf8',
  mode: 0o600,
})
await rename(temporary, output)

export function normalizePublicKey(value) {
  if (!value) throw new Error('CUTOUT_UPDATER_PUBKEY is required')

  const normalized = value.replace(/\r\n/g, '\n').trim()
  const lines = normalized.split('\n')
  if (lines.length !== 2 || !lines[0].startsWith('untrusted comment: ') || !/^RW[A-Za-z0-9+/=]+$/.test(lines[1])) {
    throw new Error('CUTOUT_UPDATER_PUBKEY must be a complete two-line minisign public key')
  }
  return normalized
}

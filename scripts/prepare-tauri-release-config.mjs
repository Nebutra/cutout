import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'

const output = resolve(process.cwd(), process.argv[2] ?? 'src-tauri/tauri.release.conf.json')
const publicKey = normalizePublicKey(process.env.CUTOUT_UPDATER_PUBKEY)
const temporary = `${output}.${process.pid}.tmp`
const config = {
  plugins: { updater: { pubkey: publicKey } },
}

await mkdir(dirname(output), { recursive: true })
await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, {
  encoding: 'utf8',
  mode: 0o600,
})
await rename(temporary, output)

export function normalizePublicKey(value) {
  if (!value) throw new Error('CUTOUT_UPDATER_PUBKEY is required')

  const input = value.replace(/\r\n/g, '\n').trim()
  const normalized = input.includes('\n') ? input : decodeBase64PublicKey(input)
  const lines = normalized.split('\n')
  if (lines.length !== 2 || !lines[0].startsWith('untrusted comment: ') || !/^RW[A-Za-z0-9+/=]+$/.test(lines[1])) {
    throw new Error('CUTOUT_UPDATER_PUBKEY must be a complete two-line minisign public key')
  }
  return Buffer.from(normalized, 'utf8').toString('base64')
}

function decodeBase64PublicKey(value) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) return value

  const bytes = Buffer.from(value, 'base64')
  if (bytes.toString('base64') !== value) return value
  return bytes.toString('utf8').replace(/\r\n/g, '\n').trim()
}

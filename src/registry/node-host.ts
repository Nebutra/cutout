import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { InstalledOriginLedger, RegistryInstallHost } from './installer'

const LEDGER = '.cutout/registry/installed.json'

export function createNodeRegistryInstallHost(projectRoot: string): RegistryInstallHost {
  const root = resolve(projectRoot)
  return {
    async read(path) {
      const target = await controlled(root, path, false)
      try { return new Uint8Array(await readFile(target)) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error }
    },
    async writeTransaction(files) {
      const staging = resolve(root, '.cutout', 'registry', `.staging-${randomUUID()}`)
      await mkdir(staging, { recursive: true })
      try {
        for (const file of files) {
          const target = await controlled(root, file.path, true)
          const staged = resolve(staging, file.path)
          await mkdir(dirname(staged), { recursive: true }); await writeFile(staged, file.bytes)
          await mkdir(dirname(target), { recursive: true })
          const temporary = `${target}.cutout-${randomUUID()}`
          await writeFile(temporary, await readFile(staged), { flag: 'wx' })
          await rename(temporary, target)
        }
      } finally { await rm(staging, { recursive: true, force: true }) }
    },
    async readLedger() {
      try { return parseLedger(JSON.parse(await readFile(resolve(root, LEDGER), 'utf8'))) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 'cutout.registry-installed.v1', items: [] }; throw error }
    },
    async writeLedger(ledger) {
      const target = resolve(root, LEDGER); await mkdir(dirname(target), { recursive: true })
      const temporary = `${target}.${randomUUID()}.tmp`; await writeFile(temporary, `${JSON.stringify(ledger, null, 2)}\n`, { flag: 'wx' }); await rename(temporary, target)
    },
  }
}

async function controlled(root: string, relative: string, writing: boolean): Promise<string> {
  if (!relative || relative.startsWith('/') || relative.includes('\0') || relative.replaceAll('\\','/').split('/').some((part) => !part || part === '.' || part === '..')) throw new Error('Registry target must be a safe relative path.')
  const target = resolve(root, relative)
  if (!target.startsWith(`${root}${sep}`) || target.startsWith(resolve(root, '.cutout') + sep)) throw new Error('Registry target escapes the controlled source root.')
  let cursor = writing ? dirname(target) : target
  while (cursor.startsWith(root) && cursor !== root) {
    try { if ((await lstat(cursor)).isSymbolicLink()) throw new Error('Registry target traverses a symbolic link.') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    cursor = dirname(cursor)
  }
  const actualRoot = await realpath(root)
  return actualRoot === root ? target : resolve(actualRoot, relative)
}
function parseLedger(value: unknown): InstalledOriginLedger { if (!value || typeof value !== 'object' || (value as {version?:unknown}).version !== 'cutout.registry-installed.v1' || !Array.isArray((value as {items?:unknown}).items)) throw new Error('Invalid registry installed-origin ledger.'); return value as InstalledOriginLedger }

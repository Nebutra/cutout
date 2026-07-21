import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { RegistryItemSchema, type RegistryItem, type RegistryItemKind } from './contracts'
import { RegistryOpenCodeInstaller, type RegistryInstallPlan, type RegistryInstallReceipt } from './installer'
import type { RegistryInstallInput } from './installer'
import { createNodeRegistryInstallHost } from './node-host'
import { createNodeFsRuntimeStore } from '../headless'

export interface RegistryQuery { readonly query?: string; readonly kind?: RegistryItemKind; readonly framework?: string }

export function createNodeRegistryService(projectRoot: string) {
  const root = resolve(projectRoot)
  const catalog = resolve(root, '.cutout', 'registry', 'items')
  const receipts = resolve(root, '.cutout', 'registry', 'receipts')
  return {
    async currentRevision() { return (await createNodeFsRuntimeStore(root).load()).ledger?.revision ?? 0 },
    async publishBundled(input: RegistryInstallInput) {
      const item = RegistryItemSchema.parse(input.item)
      const bytes = new Map(input.files.map((file) => [file.path, file.bytes]))
      for (const file of item.files) if (!bytes.has(file.path)) throw new Error(`Bundled registry file is missing: ${file.path}.`)
      await mkdir(catalog, { recursive: true })
      const base = resolve(catalog, `${safeName(`${item.id}@${item.version}`)}.files`)
      for (const file of item.files) { const target = resolve(base, file.path); await mkdir(dirnameSafe(target), { recursive: true }); await writeFile(target, bytes.get(file.path)!, { flag: 'wx' }).catch(async (error: NodeJS.ErrnoException) => { if (error.code !== 'EEXIST') throw error; const existing = new Uint8Array(await readFile(target)); if (!equalBytes(existing, bytes.get(file.path)!)) throw new Error(`Bundled registry file conflicts: ${file.path}.`) }) }
      const manifest = resolve(catalog, `${safeName(`${item.id}@${item.version}`)}.json`)
      await writeFile(manifest, `${JSON.stringify(item, null, 2)}\n`, { flag: 'wx' }).catch(async (error: NodeJS.ErrnoException) => { if (error.code !== 'EEXIST') throw error; const existing = RegistryItemSchema.parse(JSON.parse(await readFile(manifest, 'utf8'))); if (JSON.stringify(existing) !== JSON.stringify(item)) throw new Error(`Bundled registry item conflicts: ${item.id}.`) })
      return summary(item)
    },
    async list(query: RegistryQuery = {}) { return filter(await readCatalog(catalog), query).map(summary) },
    async get(id: string, version?: string) { return select(await readCatalog(catalog), id, version) },
    async planInstall(id: string, framework: string, version?: string): Promise<RegistryInstallPlan> {
      const item = select(await readCatalog(catalog), id, version)
      const files = await readItemFiles(catalog, item)
      return new RegistryOpenCodeInstaller(createNodeRegistryInstallHost(root)).plan({ item, files }, framework)
    },
    async applyInstall(id: string, framework: string, planId: string, approvalId: string, version?: string): Promise<RegistryInstallReceipt> {
      const item = select(await readCatalog(catalog), id, version)
      const files = await readItemFiles(catalog, item)
      const installer = new RegistryOpenCodeInstaller(createNodeRegistryInstallHost(root))
      const plan = await installer.plan({ item, files }, framework)
      if (plan.id !== planId) throw new Error('Registry install plan changed; preview and approve a new plan.')
      const receipt = await installer.apply(plan.id, approvalId)
      await mkdir(receipts, { recursive: true }); await writeFile(resolve(receipts, `${safeName(plan.id)}.json`), `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' }).catch(async (error: NodeJS.ErrnoException) => { if (error.code !== 'EEXIST') throw error })
      return receipt
    },
    async receipt(planId: string): Promise<RegistryInstallReceipt | undefined> { try { return JSON.parse(await readFile(resolve(receipts, `${safeName(planId)}.json`), 'utf8')) as RegistryInstallReceipt } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error } },
  }
}

async function readCatalog(directory: string): Promise<RegistryItem[]> {
  let names: string[]
  try { names = await readdir(directory) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error }
  if (names.length > 2000) throw new Error('Registry catalog exceeds the safe item limit.')
  const items: RegistryItem[] = []
  for (const name of names.sort()) {
    if (!/^[a-z0-9._-]+\.json$/.test(name)) continue
    const parsed = RegistryItemSchema.safeParse(JSON.parse(await readFile(resolve(directory, name), 'utf8')))
    if (!parsed.success) throw new Error(`Invalid registry item ${name}: ${parsed.error.issues[0]?.message ?? 'invalid'}.`)
    items.push(parsed.data)
  }
  return items
}
async function readItemFiles(catalog: string, item: RegistryItem) { const base = resolve(catalog, `${safeName(`${item.id}@${item.version}`)}.files`); return Promise.all(item.files.map(async (file) => ({ path: file.path, bytes: new Uint8Array(await readFile(resolve(base, file.path))) }))) }
function filter(items: readonly RegistryItem[], query: RegistryQuery) { const text = query.query?.trim().toLowerCase(); return items.filter((item) => (!query.kind || item.kind === query.kind) && (!query.framework || item.frameworks.some((f) => f.id === query.framework && f.role === 'target')) && (!text || `${item.id} ${item.metadata.name} ${item.metadata.description} ${item.metadata.tags.join(' ')}`.toLowerCase().includes(text))) }
function select(items: readonly RegistryItem[], id: string, version?: string) { const matches = items.filter((item) => item.id === id && (!version || item.version === version)); if (!matches.length) throw new Error(`Registry item not found: ${id}${version ? `@${version}` : ''}.`); return matches.sort((a,b) => b.version.localeCompare(a.version))[0]! }
function summary(item: RegistryItem) { return { id: item.id, version: item.version, kind: item.kind, name: item.metadata.name, description: item.metadata.description, tags: item.metadata.tags, frameworks: item.frameworks.filter((f) => f.role === 'target').map((f) => f.id), license: item.license, quality: item.qualityReceipts.map((r) => ({ gate: r.gate, status: r.status })) } }
function safeName(value: string) { return value.replace(/[^a-zA-Z0-9._-]/g, '_') }
function dirnameSafe(path: string) { return path.slice(0, path.lastIndexOf('/')) }
function equalBytes(a: Uint8Array, b: Uint8Array) { return a.byteLength === b.byteLength && a.every((value,index) => value === b[index]) }

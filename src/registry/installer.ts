import type { RegistryItem } from './contracts'

export interface InstalledFileOrigin { readonly path: string; readonly baseHash: string }
export interface InstalledOrigin {
  readonly itemId: string
  readonly version: string
  readonly installedAt: string
  readonly files: readonly InstalledFileOrigin[]
}
export interface InstalledOriginLedger { readonly version: 'cutout.registry-installed.v1'; readonly items: readonly InstalledOrigin[] }

export interface RegistryInstallHost {
  read(path: string): Promise<Uint8Array | undefined>
  writeTransaction(files: readonly { readonly path: string; readonly bytes: Uint8Array }[]): Promise<void>
  readLedger(): Promise<InstalledOriginLedger>
  writeLedger(ledger: InstalledOriginLedger): Promise<void>
}

export interface RegistryInstallDiff {
  readonly path: string
  readonly status: 'create' | 'update' | 'unchanged' | 'three-way-conflict'
  readonly beforeHash?: string
  readonly baseHash?: string
  readonly afterHash: string
}
export interface RegistryInstallPlan {
  readonly protocol: 'cutout.registry-install-plan.v1'
  readonly id: string
  readonly itemId: string
  readonly itemVersion: string
  readonly targetFramework: string
  readonly files: readonly RegistryInstallDiff[]
  readonly conflicts: readonly string[]
  readonly requiresApproval: true
}
export interface RegistryInstallReceipt {
  readonly protocol: 'cutout.registry-install-receipt.v1'
  readonly planId: string
  readonly itemId: string
  readonly itemVersion: string
  readonly status: 'succeeded' | 'no-op'
  readonly fileHashes: readonly InstalledFileOrigin[]
  readonly approvalId: string
  readonly completedAt: string
}
export interface RegistryInstallInput {
  readonly item: RegistryItem
  readonly files: readonly { readonly path: string; readonly bytes: Uint8Array }[]
}

export class RegistryOpenCodeInstaller {
  readonly #plans = new Map<string, { readonly plan: RegistryInstallPlan; readonly input: RegistryInstallInput }>()
  readonly #receipts = new Map<string, RegistryInstallReceipt>()
  readonly host: RegistryInstallHost
  readonly now: () => string
  constructor(host: RegistryInstallHost, now: () => string = () => new Date().toISOString()) { this.host = host; this.now = now }

  async plan(input: RegistryInstallInput, targetFramework: string): Promise<RegistryInstallPlan> {
    const { item } = input
    if (!item.frameworks.some((entry) => entry.id === targetFramework && entry.role === 'target')) throw new Error(`Registry item does not support ${targetFramework}.`)
    const bytesByPath = new Map(input.files.map((file) => [file.path, file.bytes]))
    const ledger = await this.host.readLedger()
    const origin = ledger.items.find((entry) => entry.itemId === item.id)
    const baseByPath = new Map(origin?.files.map((file) => [file.path, file.baseHash]))
    const files: RegistryInstallDiff[] = []
    for (const file of item.files) {
      const path = safeTargetPath(file.path)
      const bytes = bytesByPath.get(file.path)
      if (!bytes || bytes.byteLength !== file.size) throw new Error(`Registry file bytes are missing or have the wrong size: ${path}.`)
      const declared = normalizeHash(file.sha256)
      const afterHash = await sha256(bytes)
      if (afterHash !== declared) throw new Error(`Registry file hash mismatch: ${path}.`)
      const current = await this.host.read(path)
      const beforeHash = current ? await sha256(current) : undefined
      const baseHash = baseByPath.get(path)
      const status = !beforeHash ? 'create' : beforeHash === afterHash ? 'unchanged' : baseHash && beforeHash === baseHash ? 'update' : 'three-way-conflict'
      files.push({ path, status, ...(beforeHash ? { beforeHash } : {}), ...(baseHash ? { baseHash } : {}), afterHash })
    }
    const conflicts = files.filter((file) => file.status === 'three-way-conflict').map((file) => file.path)
    const id = await sha256(new TextEncoder().encode(JSON.stringify({ item: item.id, version: item.version, targetFramework, files })))
    const plan: RegistryInstallPlan = { protocol: 'cutout.registry-install-plan.v1', id: `install:${id}`, itemId: item.id, itemVersion: item.version, targetFramework, files, conflicts, requiresApproval: true }
    this.#plans.set(plan.id, { plan, input })
    return plan
  }

  async apply(planId: string, approvalId: string): Promise<RegistryInstallReceipt> {
    if (!approvalId.trim() || approvalId.length > 160) throw new Error('An opaque approval id is required.')
    const previous = this.#receipts.get(planId)
    if (previous) return previous
    const prepared = this.#plans.get(planId)
    if (!prepared) throw new Error('Install plan is missing or expired.')
    if (prepared.plan.conflicts.length) throw new Error(`Install has unresolved three-way conflicts: ${prepared.plan.conflicts.join(', ')}.`)
    // Re-plan immediately before writing so a post-preview user edit cannot be overwritten.
    const checked = await this.plan(prepared.input, prepared.plan.targetFramework)
    if (!sameDiff(prepared.plan.files, checked.files)) throw new Error('Install target changed after preview; create and approve a new plan.')
    const bytesByPath = new Map(prepared.input.files.map((file) => [file.path, file.bytes]))
    const writable = prepared.input.item.files.filter((file) => prepared.plan.files.find((diff) => diff.path === file.path)?.status !== 'unchanged')
      .map((file) => ({ path: safeTargetPath(file.path), bytes: bytesByPath.get(file.path)! }))
    if (writable.length) await this.host.writeTransaction(writable)
    const fileHashes = prepared.plan.files.map((file) => ({ path: file.path, baseHash: file.afterHash }))
    const ledger = await this.host.readLedger()
    await this.host.writeLedger({ version: 'cutout.registry-installed.v1', items: [...ledger.items.filter((entry) => entry.itemId !== prepared.input.item.id), { itemId: prepared.input.item.id, version: prepared.input.item.version, installedAt: this.now(), files: fileHashes }] })
    const receipt: RegistryInstallReceipt = { protocol: 'cutout.registry-install-receipt.v1', planId, itemId: prepared.input.item.id, itemVersion: prepared.input.item.version, status: writable.length ? 'succeeded' : 'no-op', fileHashes, approvalId, completedAt: this.now() }
    this.#receipts.set(planId, receipt)
    return receipt
  }

  receipt(planId: string): RegistryInstallReceipt | undefined { return this.#receipts.get(planId) }
}

function safeTargetPath(input: string): string {
  const path = input.replaceAll('\\', '/')
  if (!path || path.startsWith('/') || path.includes('\0') || path.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error('Registry files require safe project-relative paths.')
  if (path === '.cutout' || path.startsWith('.cutout/')) throw new Error('Registry items cannot write Cutout control state.')
  return path
}
function normalizeHash(value: string): string { const hash = value.toLowerCase().replace(/^sha256:/, ''); if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('Registry file requires a SHA-256 digest.'); return hash }
async function sha256(bytes: Uint8Array): Promise<string> { const copied = Uint8Array.from(bytes); const digest = await crypto.subtle.digest('SHA-256', copied.buffer); return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('') }
function sameDiff(a: readonly RegistryInstallDiff[], b: readonly RegistryInstallDiff[]): boolean { return JSON.stringify(a) === JSON.stringify(b) }

import { describe, expect, it } from 'vitest'
import type { RegistryItem } from './contracts'
import { RegistryOpenCodeInstaller, type InstalledOriginLedger, type RegistryInstallHost, type RegistryInstallInput } from './installer'

class Host implements RegistryInstallHost {
  files = new Map<string, Uint8Array>(); ledger: InstalledOriginLedger = { version: 'cutout.registry-installed.v1', items: [] }
  async read(path: string) { return this.files.get(path) }
  async writeTransaction(files: readonly { path: string; bytes: Uint8Array }[]) { for (const file of files) this.files.set(file.path, file.bytes) }
  async readLedger() { return this.ledger }
  async writeLedger(ledger: InstalledOriginLedger) { this.ledger = ledger }
}
const digest = '5994471abb01112afcc18159f6cc74b4f511b99806da59b3caf5a9c173cacfc5' // sha256("12345")
function item(version = '1.0.0'): RegistryItem { return { schemaVersion: 'cutout.registry-item.v1', id: 'cutout.button', kind: 'component', version, files: [{ path: 'src/components/Button.tsx', mediaType: 'text/typescript', size: 5, sha256: digest, role: 'source' }], designIrRefs: ['component:button'], tokenRefs: [], dependencies: [], frameworks: [{ id: 'vite-react', role: 'target' }, { id: 'next-app-router', role: 'target' }], provenance: [{ id: 'button-source', source: 'bundled', capturedAt: '2026-07-12T00:00:00Z', actor: 'system' }], license: { kind: 'spdx', identifier: 'Apache-2.0' }, qualityReceipts: [], previewAssets: [], metadata: { tags: ['button'], name: 'Button', description: 'Accessible button.' } } }
function input(version = '1.0.0'): RegistryInstallInput { return { item: item(version), files: [{ path: 'src/components/Button.tsx', bytes: new TextEncoder().encode('12345') }] } }

describe('open-code registry installer', () => {
  it('previews and applies owned source only after opaque approval', async () => { const host = new Host(); const installer = new RegistryOpenCodeInstaller(host, () => '2026-07-12T00:00:00Z'); const plan = await installer.plan(input(), 'vite-react'); expect(plan.files).toEqual([expect.objectContaining({ path: 'src/components/Button.tsx', status: 'create' })]); const receipt = await installer.apply(plan.id, 'approval-1'); expect(receipt).toMatchObject({ status: 'succeeded', approvalId: 'approval-1' }); expect(new TextDecoder().decode(host.files.get('src/components/Button.tsx'))).toBe('12345'); expect(host.ledger.items[0]).toMatchObject({ itemId: 'cutout.button', files: [{ baseHash: digest }] }) })
  it('does not overwrite user modifications during update', async () => { const host = new Host(); const installer = new RegistryOpenCodeInstaller(host); const first = await installer.plan(input(), 'vite-react'); await installer.apply(first.id, 'approve-first'); host.files.set('src/components/Button.tsx', new TextEncoder().encode('user edit')); const update = await installer.plan(input('1.1.0'), 'vite-react'); expect(update).toMatchObject({ conflicts: ['src/components/Button.tsx'], files: [{ status: 'three-way-conflict', baseHash: digest }] }); await expect(installer.apply(update.id, 'approve-update')).rejects.toThrow('three-way conflicts'); expect(new TextDecoder().decode(host.files.get('src/components/Button.tsx'))).toBe('user edit') })
  it('rechecks after preview and rejects traversal/control paths/hash drift', async () => { const host = new Host(); const installer = new RegistryOpenCodeInstaller(host); const plan = await installer.plan(input(), 'vite-react'); host.files.set('src/components/Button.tsx', new TextEncoder().encode('appeared')); await expect(installer.apply(plan.id, 'approve')).rejects.toThrow('changed after preview'); await expect(installer.plan({ ...input(), item: { ...item(), files: [{ ...item().files[0]!, path: '../escape' }] } }, 'vite-react')).rejects.toThrow('safe project-relative'); await expect(installer.plan({ ...input(), item: { ...item(), files: [{ ...item().files[0]!, sha256: 'a'.repeat(64) }] } }, 'vite-react')).rejects.toThrow('hash mismatch') })
})

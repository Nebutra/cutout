import { describe, expect, it } from 'vitest'
import {
  createRegistryProvenance,
  createRegistrySbom,
  registryItemDigest,
  signRegistryItem,
  verifyRegistryItemTrust,
  type RegistryRevocationList,
} from './supply-chain'
import { RegistryItemSchema, type RegistryItem } from './contracts'

const bytes = new TextEncoder().encode('export const Button = () => null\n')
const fileHash = 'b'.repeat(64)
const item: RegistryItem = RegistryItemSchema.parse({
  schemaVersion: 'cutout.registry-item.v1', id: 'button', version: '1.0.0', kind: 'component',
  metadata: { name: 'Button', description: 'A deterministic fixture.' },
  files: [{ path: 'src/Button.tsx', mediaType: 'text/typescript', size: bytes.byteLength, sha256: fileHash, role: 'source' }],
  provenance: [{ id: 'fixture', source: 'local', capturedAt: '2026-07-12T00:00:00.000Z', actor: 'user' }],
  license: { kind: 'spdx', identifier: 'MIT' },
})

describe('registry supply-chain contracts', () => {
  it('hashes canonical content independent of object key insertion order', async () => {
    const reordered = RegistryItemSchema.parse({
      license: item.license, provenance: item.provenance, previewAssets: item.previewAssets,
      qualityReceipts: item.qualityReceipts, frameworks: item.frameworks, dependencies: item.dependencies,
      tokenRefs: item.tokenRefs, designIrRefs: item.designIrRefs, files: item.files,
      metadata: { description: item.metadata.description, name: item.metadata.name, tags: item.metadata.tags },
      kind: item.kind, version: item.version, id: item.id, schemaVersion: item.schemaVersion,
    })
    expect(await registryItemDigest(item)).toBe(await registryItemDigest(reordered))
  })

  it('signs, verifies and rejects tampered or revoked registry items', async () => {
    const keys = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])
    const publicKey = await crypto.subtle.exportKey('jwk', keys.publicKey)
    const signature = await signRegistryItem(item, 'cutout.release', keys.privateKey, '2026-07-12T00:00:00.000Z')
    await expect(verifyRegistryItemTrust(item, signature, { 'cutout.release': publicKey })).resolves.toMatchObject({ trusted: true })
    await expect(verifyRegistryItemTrust({ ...item, metadata: { ...item.metadata, description: 'Tampered.' } }, signature, { 'cutout.release': publicKey })).resolves.toMatchObject({ trusted: false, reason: 'digest-mismatch' })
    const revocations: RegistryRevocationList = { schemaVersion: 'cutout.registry-revocations.v1', generatedAt: '2026-07-12T00:01:00.000Z', entries: [{ itemId: item.id, version: item.version, reason: 'compromised', revokedAt: '2026-07-12T00:01:00.000Z' }] }
    await expect(verifyRegistryItemTrust(item, signature, { 'cutout.release': publicKey }, revocations)).resolves.toMatchObject({ trusted: false, reason: 'revoked' })
  })

  it('emits deterministic offline SBOM and provenance evidence', async () => {
    const digest = await registryItemDigest(item)
    const sbom = createRegistrySbom(item, digest)
    const provenance = createRegistryProvenance(item, digest, 'cutout-ci', '2026-07-12T00:00:00.000Z')
    expect(sbom).toMatchObject({ bomFormat: 'CycloneDX', specVersion: '1.5', metadata: { component: { name: 'button', version: '1.0.0' } } })
    expect(provenance).toMatchObject({ _type: 'https://in-toto.io/Statement/v1', subject: [{ name: 'button@1.0.0', digest: { sha256: digest } }] })
  })
})

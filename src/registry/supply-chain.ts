import type { RegistryItem } from './contracts'

export interface RegistrySignatureEnvelope {
  readonly schemaVersion: 'cutout.registry-signature.v1'
  readonly algorithm: 'Ed25519'
  readonly keyId: string
  readonly itemId: string
  readonly itemVersion: string
  readonly digest: string
  readonly signature: string
  readonly signedAt: string
}
export interface RegistryRevocationList {
  readonly schemaVersion: 'cutout.registry-revocations.v1'
  readonly generatedAt: string
  readonly entries: readonly { readonly itemId: string; readonly version?: string; readonly keyId?: string; readonly reason: string; readonly revokedAt: string }[]
}

export async function registryItemDigest(item: RegistryItem): Promise<string> {
  return sha256(new TextEncoder().encode(canonicalJson(item)))
}

export async function signRegistryItem(item: RegistryItem, keyId: string, privateKey: CryptoKey, signedAt = new Date().toISOString()): Promise<RegistrySignatureEnvelope> {
  const digest = await registryItemDigest(item)
  const signature = await crypto.subtle.sign('Ed25519', privateKey, asArrayBuffer(hexBytes(digest)))
  return { schemaVersion: 'cutout.registry-signature.v1', algorithm: 'Ed25519', keyId, itemId: item.id, itemVersion: item.version, digest, signature: toBase64(new Uint8Array(signature)), signedAt }
}

export async function verifyRegistryItemTrust(item: RegistryItem, envelope: RegistrySignatureEnvelope, trustedKeys: Readonly<Record<string, JsonWebKey>>, revocations?: RegistryRevocationList): Promise<{ readonly trusted: boolean; readonly reason?: 'identity-mismatch' | 'digest-mismatch' | 'unknown-key' | 'invalid-signature' | 'revoked' }> {
  if (envelope.itemId !== item.id || envelope.itemVersion !== item.version) return { trusted: false, reason: 'identity-mismatch' }
  const digest = await registryItemDigest(item)
  if (envelope.digest !== digest) return { trusted: false, reason: 'digest-mismatch' }
  if (revocations?.entries.some((entry) => entry.itemId === item.id && (!entry.version || entry.version === item.version) && (!entry.keyId || entry.keyId === envelope.keyId))) return { trusted: false, reason: 'revoked' }
  const jwk = trustedKeys[envelope.keyId]
  if (!jwk) return { trusted: false, reason: 'unknown-key' }
  const key = await crypto.subtle.importKey('jwk', jwk, 'Ed25519', false, ['verify'])
  const valid = await crypto.subtle.verify('Ed25519', key, asArrayBuffer(fromBase64(envelope.signature)), asArrayBuffer(hexBytes(digest)))
  return valid ? { trusted: true } : { trusted: false, reason: 'invalid-signature' }
}

export function createRegistrySbom(item: RegistryItem, digest: string) {
  return { bomFormat: 'CycloneDX', specVersion: '1.5', serialNumber: `urn:sha256:${digest}`, version: 1, metadata: { component: { type: item.kind === 'starter' ? 'application' : 'library', 'bom-ref': `${item.id}@${item.version}`, name: item.id, version: item.version, hashes: [{ alg: 'SHA-256', content: digest }] } }, components: item.dependencies.map((dependency) => ({ type: 'library', name: dependency.id, version: dependency.version, scope: dependency.optional ? 'optional' : 'required' })) }
}

export function createRegistryProvenance(item: RegistryItem, digest: string, builderId: string, generatedAt = new Date().toISOString()) {
  return { _type: 'https://in-toto.io/Statement/v1', subject: [{ name: `${item.id}@${item.version}`, digest: { sha256: digest } }], predicateType: 'https://slsa.dev/provenance/v1', predicate: { buildDefinition: { buildType: 'https://cutout.design/registry-build/v1', externalParameters: { kind: item.kind }, internalParameters: {}, resolvedDependencies: item.dependencies.map((dependency) => ({ uri: `pkg:generic/${dependency.id}@${dependency.version}` })) }, runDetails: { builder: { id: builderId }, metadata: { invocationId: digest, startedOn: generatedAt, finishedOn: generatedAt } } } }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(',')}}`
}
async function sha256(bytes: Uint8Array): Promise<string> { const digest = await crypto.subtle.digest('SHA-256', asArrayBuffer(bytes)); return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('') }
function hexBytes(value: string): Uint8Array { return Uint8Array.from(value.match(/.{2}/g) ?? [], (part) => Number.parseInt(part, 16)) }
function toBase64(bytes: Uint8Array): string { return btoa(String.fromCharCode(...bytes)) }
function fromBase64(value: string): Uint8Array { return Uint8Array.from(atob(value), (character) => character.charCodeAt(0)) }
function asArrayBuffer(bytes: Uint8Array): ArrayBuffer { return Uint8Array.from(bytes).buffer }

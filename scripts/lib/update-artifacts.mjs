import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const semverPattern = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/
const channels = new Set(['stable', 'beta'])

// Authoritative updater platform vocabulary shared by the manifest generator,
// the release-asset collector, and the release workflow. `darwin-aarch64` is
// the mandatory primary anchor (first key) and the subject of the single
// SBOM/provenance/metadata artifact fields for backward compatibility.
export const updaterPlatforms = Object.freeze({
  'darwin-aarch64': { asset: 'macos-aarch64', updaterSuffix: '.app.tar.gz' },
  'darwin-x86_64': { asset: 'macos-x86_64', updaterSuffix: '.app.tar.gz' },
  'windows-x86_64': { asset: 'windows-x86_64', updaterSuffix: '.exe' },
  'linux-x86_64': { asset: 'linux-x86_64', updaterSuffix: '.AppImage' },
})
const primaryPlatform = 'darwin-aarch64'
const platformOrder = Object.freeze(Object.keys(updaterPlatforms))

export function parseVersion(value) {
  const match = semverPattern.exec(value)
  if (!match) throw new Error(`Invalid semantic version: ${value}`)
  return { major: +match[1], minor: +match[2], patch: +match[3], prerelease: match[4] ?? '' }
}

export function compareVersions(left, right) {
  const a = parseVersion(left), b = parseVersion(right)
  for (const key of ['major', 'minor', 'patch']) if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1
  if (a.prerelease === b.prerelease) return 0
  if (!a.prerelease) return 1
  if (!b.prerelease) return -1
  return a.prerelease.localeCompare(b.prerelease, 'en', { numeric: true })
}

export function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex') }

function validatePlatformEntry(key, platform, options) {
  if (!platform || typeof platform.url !== 'string' || typeof platform.signature !== 'string') throw new Error(`${key} url and signature are required.`)
  const url = new URL(platform.url)
  if (url.protocol !== 'https:') throw new Error('Update artifact URL must use HTTPS.')
  if (options.allowedHosts?.length && !options.allowedHosts.includes(url.hostname.toLowerCase())) throw new Error('Update artifact host is not allowlisted.')
  if (!platform.signature.trim() || platform.signature.length > 16_384) throw new Error('Update signature is missing or invalid.')
}

export function validateUpdateManifest(manifest, options = {}) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('Update manifest must be an object.')
  parseVersion(manifest.version)
  if (manifest.pub_date && Number.isNaN(Date.parse(manifest.pub_date))) throw new Error('pub_date must be RFC 3339.')
  const platforms = manifest.platforms
  if (!platforms || typeof platforms !== 'object' || Array.isArray(platforms)) throw new Error('darwin-aarch64 url and signature are required.')
  const primary = platforms[primaryPlatform]
  if (!primary || typeof primary.url !== 'string' || typeof primary.signature !== 'string') throw new Error('darwin-aarch64 url and signature are required.')
  for (const [key, platform] of Object.entries(platforms)) {
    if (!updaterPlatforms[key]) throw new Error(`Unknown updater platform: ${key}`)
    validatePlatformEntry(key, platform, options)
  }
  if (options.expectedSignature !== undefined && primary.signature.trim() !== options.expectedSignature.trim()) throw new Error('Update signature does not match the signed artifact sidecar.')
  if (options.channel && !channels.has(options.channel)) throw new Error('Update channel must be stable or beta.')
  return manifest
}

export function checkUpdate({ manifest, currentVersion, expectedSignature, allowedHosts }) {
  validateUpdateManifest(manifest, { expectedSignature, allowedHosts })
  const comparison = compareVersions(manifest.version, currentVersion)
  if (comparison === 0) return { status: 'no-update', reason: 'current' }
  if (comparison < 0) throw new Error('Updater manifests cannot downgrade an installed release.')
  return { status: 'update', version: manifest.version }
}

export async function readSignedArtifact(artifactPath, signaturePath) {
  const [artifact, signature] = await Promise.all([readFile(artifactPath), readFile(signaturePath, 'utf8')])
  if (!artifact.length) throw new Error('Updater artifact is empty.')
  if (!signature.trim()) throw new Error('Updater signature sidecar is empty.')
  return { artifact, signature: signature.trim(), digest: sha256(artifact) }
}

function normalizeReleasePlatforms(input) {
  const raw = Array.isArray(input.platforms) && input.platforms.length
    ? input.platforms
    : [{ key: primaryPlatform, artifactUrl: input.artifactUrl, signature: input.signature, artifactDigest: input.artifactDigest, signatureFile: input.signatureFile }]
  const seen = new Map()
  for (const entry of raw) {
    if (!updaterPlatforms[entry.key]) throw new Error(`Unknown updater platform: ${entry.key}`)
    if (seen.has(entry.key)) throw new Error(`Duplicate updater platform: ${entry.key}`)
    if (!entry.artifactUrl || !entry.signature || !entry.artifactDigest) throw new Error(`Platform ${entry.key} requires artifactUrl, signature, and artifactDigest.`)
    seen.set(entry.key, entry)
  }
  const ordered = platformOrder.filter((key) => seen.has(key)).map((key) => seen.get(key))
  if (ordered[0]?.key !== primaryPlatform) throw new Error('darwin-aarch64 is the mandatory primary updater platform.')
  return ordered
}

export function buildReleaseDocuments(input) {
  if (!channels.has(input.channel)) throw new Error('Update channel must be stable or beta.')
  if (input.rolloutPercentage !== undefined || input.previousVersion !== undefined || input.previousManifestUrl !== undefined) {
    throw new Error('Rollout and rollback metadata are not supported by the desktop updater contract.')
  }
  parseVersion(input.version)
  const platforms = normalizeReleasePlatforms(input).map((entry) => {
    const url = new URL(entry.artifactUrl)
    if (url.protocol !== 'https:') throw new Error('Update artifact URL must use HTTPS.')
    return { ...entry, href: url.href, filename: url.pathname.split('/').at(-1) }
  })
  const primary = platforms[0]
  const publishedAt = new Date(input.publishedAt).toISOString()
  const manifest = { version: input.version, notes: input.notes ?? '', pub_date: publishedAt, platforms: Object.fromEntries(platforms.map((p) => [p.key, { url: p.href, signature: p.signature }])) }
  validateUpdateManifest(manifest, { expectedSignature: primary.signature, allowedHosts: input.allowedHosts })
  const sbom = { spdxVersion: 'SPDX-2.3', dataLicense: 'CC0-1.0', SPDXID: 'SPDXRef-DOCUMENT', name: `Cutout-${input.version}`, documentNamespace: `https://cutout.local/sbom/${input.version}/${primary.artifactDigest}`, creationInfo: { created: publishedAt, creators: ['Tool: cutout-update-artifacts'] }, packages: platforms.map((p) => ({ SPDXID: p.key === primaryPlatform ? 'SPDXRef-Package-Cutout' : `SPDXRef-Package-Cutout-${p.key}`, name: 'Cutout', versionInfo: input.version, downloadLocation: p.href, checksums: [{ algorithm: 'SHA256', checksumValue: p.artifactDigest }] })) }
  const provenance = { version: 'cutout.provenance.v1', subject: platforms.map((p) => ({ name: p.filename, digest: { sha256: p.artifactDigest } })), build: { builder: 'github-actions', source: input.sourceRevision, channel: input.channel, generatedAt: publishedAt }, signing: { scheme: 'Tauri updater signature', privateKeySource: 'CI secret only' } }
  const metadata = { version: 'cutout.release-metadata.v2', releaseVersion: input.version, channel: input.channel, artifact: { url: primary.href, sha256: primary.artifactDigest, signatureFile: primary.signatureFile }, platforms: platforms.map((p) => ({ key: p.key, url: p.href, sha256: p.artifactDigest, signatureFile: p.signatureFile })), sbom: { file: 'sbom.spdx.json', sha256: sha256(JSON.stringify(sbom)) }, provenance: { file: 'provenance.json', sha256: sha256(JSON.stringify(provenance)) } }
  return { manifest, sbom, provenance, metadata }
}

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const semverPattern = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/
const channels = new Set(['stable', 'beta'])

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
export function deterministicCohort(installationId, channel, version) {
  if (!installationId) throw new Error('An opaque installation id is required for staged rollout.')
  const value = Number.parseInt(sha256(`${installationId}\0${channel}\0${version}`).slice(0, 8), 16)
  return value % 100
}
export function eligibleForRollout(input) {
  if (!Number.isInteger(input.percentage) || input.percentage < 0 || input.percentage > 100) throw new Error('Rollout percentage must be an integer from 0 to 100.')
  return deterministicCohort(input.installationId, input.channel, input.version) < input.percentage
}

export function validateUpdateManifest(manifest, options = {}) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('Update manifest must be an object.')
  parseVersion(manifest.version)
  if (manifest.pub_date && Number.isNaN(Date.parse(manifest.pub_date))) throw new Error('pub_date must be RFC 3339.')
  const platform = manifest.platforms?.['darwin-aarch64']
  if (!platform || typeof platform.url !== 'string' || typeof platform.signature !== 'string') throw new Error('darwin-aarch64 url and signature are required.')
  const url = new URL(platform.url)
  if (url.protocol !== 'https:') throw new Error('Update artifact URL must use HTTPS.')
  if (options.allowedHosts?.length && !options.allowedHosts.includes(url.hostname.toLowerCase())) throw new Error('Update artifact host is not allowlisted.')
  if (!platform.signature.trim() || platform.signature.length > 16_384) throw new Error('Update signature is missing or invalid.')
  if (options.expectedSignature !== undefined && platform.signature.trim() !== options.expectedSignature.trim()) throw new Error('Update signature does not match the signed artifact sidecar.')
  if (options.channel && !channels.has(options.channel)) throw new Error('Update channel must be stable or beta.')
  return manifest
}

export function checkUpdate({ manifest, currentVersion, expectedSignature, allowedHosts, rollback, rollout, installationId }) {
  validateUpdateManifest(manifest, { expectedSignature, allowedHosts })
  if (rollout && !eligibleForRollout({ ...rollout, installationId, version: manifest.version })) return { status: 'no-update', reason: 'outside-staged-cohort' }
  const comparison = compareVersions(manifest.version, currentVersion)
  if (comparison === 0) return { status: 'no-update', reason: 'current' }
  if (comparison < 0) {
    const allowed = rollback?.enabled === true && rollback?.targetVersion === manifest.version && rollback?.fromVersions?.includes(currentVersion)
    if (!allowed) throw new Error('Rollback is not authorized for this current version.')
    return { status: 'update', version: manifest.version, rollback: true }
  }
  return { status: 'update', version: manifest.version, rollback: false }
}

export async function readSignedArtifact(artifactPath, signaturePath) {
  const [artifact, signature] = await Promise.all([readFile(artifactPath), readFile(signaturePath, 'utf8')])
  if (!artifact.length) throw new Error('Updater artifact is empty.')
  if (!signature.trim()) throw new Error('Updater signature sidecar is empty.')
  return { artifact, signature: signature.trim(), digest: sha256(artifact) }
}

export function buildReleaseDocuments(input) {
  if (!channels.has(input.channel)) throw new Error('Update channel must be stable or beta.')
  parseVersion(input.version)
  if (!input.signingKeyPresent) throw new Error('TAURI_SIGNING_PRIVATE_KEY is required for release artifact generation.')
  const url = new URL(input.artifactUrl)
  if (url.protocol !== 'https:') throw new Error('Update artifact URL must use HTTPS.')
  const publishedAt = new Date(input.publishedAt).toISOString()
  const manifest = { version: input.version, notes: input.notes ?? '', pub_date: publishedAt, platforms: { 'darwin-aarch64': { url: url.href, signature: input.signature } } }
  validateUpdateManifest(manifest, { expectedSignature: input.signature, allowedHosts: input.allowedHosts })
  const rollout = { version: 'cutout.rollout.v1', channel: input.channel, percentage: input.rolloutPercentage, salt: 'sha256-installation-channel-version', manifest: `${input.channel}/latest.json` }
  const rollback = { version: 'cutout.rollback.v1', enabled: Boolean(input.previousVersion), targetVersion: input.previousVersion ?? null, fromVersions: input.previousVersion ? [input.version] : [], previousManifestUrl: input.previousManifestUrl ?? null }
  if (input.previousVersion && compareVersions(input.previousVersion, input.version) >= 0) throw new Error('Previous version must be older than the release version.')
  const sbom = { spdxVersion: 'SPDX-2.3', dataLicense: 'CC0-1.0', SPDXID: 'SPDXRef-DOCUMENT', name: `Cutout-${input.version}`, documentNamespace: `https://cutout.local/sbom/${input.version}/${input.artifactDigest}`, creationInfo: { created: publishedAt, creators: ['Tool: cutout-update-artifacts'] }, packages: [{ SPDXID: 'SPDXRef-Package-Cutout', name: 'Cutout', versionInfo: input.version, downloadLocation: url.href, checksums: [{ algorithm: 'SHA256', checksumValue: input.artifactDigest }] }] }
  const provenance = { version: 'cutout.provenance.v1', subject: [{ name: url.pathname.split('/').at(-1), digest: { sha256: input.artifactDigest } }], build: { builder: 'github-actions', source: input.sourceRevision, channel: input.channel, generatedAt: publishedAt }, signing: { scheme: 'Tauri updater signature', privateKeySource: 'CI secret only' } }
  const metadata = { version: 'cutout.release-metadata.v1', releaseVersion: input.version, channel: input.channel, artifact: { url: url.href, sha256: input.artifactDigest, signatureFile: input.signatureFile }, sbom: { file: 'sbom.spdx.json', sha256: sha256(JSON.stringify(sbom)) }, provenance: { file: 'provenance.json', sha256: sha256(JSON.stringify(provenance)) }, rollout, rollback }
  return { manifest, rollout, rollback, sbom, provenance, metadata }
}

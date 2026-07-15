import { generateKeyPairSync, sign } from 'node:crypto'
import { createServer } from 'node:http'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildReleaseDocuments, checkUpdate, deterministicCohort, eligibleForRollout, sha256, validateUpdateManifest } from './lib/update-artifacts.mjs'

const servers: ReturnType<typeof createServer>[] = []
afterEach(async () => { await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))) })

function fixture(version = '1.2.0') {
  // Ephemeral test-only signing material. Production code never reads this key.
  const { privateKey } = generateKeyPairSync('ed25519'), artifact = Buffer.from(`fixture-${version}`)
  const signature = sign(null, artifact, privateKey).toString('base64')
  return { artifact, signature, manifest: { version, notes: 'Fixture', pub_date: '2026-07-15T00:00:00.000Z', platforms: { 'darwin-aarch64': { url: `https://releases.example.test/Cutout-${version}.app.tar.gz`, signature } } } }
}

async function fixtureServer(routes: Record<string, { status: number; body?: unknown }>) {
  const server = createServer((request, response) => { const route = routes[request.url ?? ''] ?? { status: 404 }; response.statusCode = route.status; if (route.body) response.end(JSON.stringify(route.body)); else response.end() })
  servers.push(server); await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Fixture server did not bind.')
  return `http://127.0.0.1:${address.port}`
}

describe('signed update artifact policy', () => {
  it('checks an update and handles a local fixture 204 no-update response', async () => {
    const value = fixture()
    expect(checkUpdate({ manifest: value.manifest, currentVersion: '1.1.0', expectedSignature: value.signature, allowedHosts: ['releases.example.test'] })).toEqual({ status: 'update', version: '1.2.0', rollback: false })
    const base = await fixtureServer({ '/stable/latest.json': { status: 204 } })
    expect((await fetch(`${base}/stable/latest.json`)).status).toBe(204)
  })

  it('fails closed for a bad signature and non-HTTPS or non-allowlisted URLs', () => {
    const value = fixture()
    expect(() => validateUpdateManifest(value.manifest, { expectedSignature: 'tampered', allowedHosts: ['releases.example.test'] })).toThrow('signature does not match')
    const insecure = structuredClone(value.manifest); insecure.platforms['darwin-aarch64'].url = 'http://releases.example.test/update.tar.gz'
    expect(() => validateUpdateManifest(insecure)).toThrow('HTTPS')
    expect(() => validateUpdateManifest(value.manifest, { allowedHosts: ['cdn.example.test'] })).toThrow('allowlisted')
  })

  it('requires explicit previous-version compatibility for rollback', () => {
    const value = fixture('1.1.0')
    expect(() => checkUpdate({ manifest: value.manifest, currentVersion: '1.2.0', expectedSignature: value.signature })).toThrow('Rollback is not authorized')
    expect(checkUpdate({ manifest: value.manifest, currentVersion: '1.2.0', expectedSignature: value.signature, rollback: { enabled: true, targetVersion: '1.1.0', fromVersions: ['1.2.0'] } })).toEqual({ status: 'update', version: '1.1.0', rollback: true })
  })

  it('uses a stable deterministic cohort without changing manifest signatures', () => {
    const value = fixture(); const before = value.manifest.platforms['darwin-aarch64'].signature
    expect(deterministicCohort('installation:a', 'beta', value.manifest.version)).toBe(deterministicCohort('installation:a', 'beta', value.manifest.version))
    const percentage = deterministicCohort('installation:a', 'beta', value.manifest.version) + 1
    expect(eligibleForRollout({ installationId: 'installation:a', channel: 'beta', version: value.manifest.version, percentage })).toBe(true)
    expect(checkUpdate({ manifest: value.manifest, currentVersion: '1.1.0', expectedSignature: value.signature, rollout: { channel: 'beta', percentage: 0 }, installationId: 'installation:a' })).toEqual({ status: 'no-update', reason: 'outside-staged-cohort' })
    expect(value.manifest.platforms['darwin-aarch64'].signature).toBe(before)
  })

  it('generates hash, SBOM, provenance and rollback metadata and hard-fails without a release key', () => {
    const value = fixture(), base = { channel: 'stable', version: '1.2.0', publishedAt: '2026-07-15T00:00:00.000Z', artifactUrl: 'https://releases.example.test/Cutout.app.tar.gz', signature: value.signature, signatureFile: 'Cutout.app.tar.gz.sig', artifactDigest: sha256(value.artifact), rolloutPercentage: 100, previousVersion: '1.1.0', previousManifestUrl: 'https://releases.example.test/v1.1.0/latest.json', sourceRevision: 'abc123', allowedHosts: ['releases.example.test'] }
    expect(() => buildReleaseDocuments({ ...base, signingKeyPresent: false })).toThrow('TAURI_SIGNING_PRIVATE_KEY')
    const generated = buildReleaseDocuments({ ...base, signingKeyPresent: true })
    expect(generated).toMatchObject({ manifest: { version: '1.2.0' }, sbom: { spdxVersion: 'SPDX-2.3' }, provenance: { version: 'cutout.provenance.v1' }, rollback: { targetVersion: '1.1.0' }, rollout: { percentage: 100 } })
    expect(generated.metadata.artifact.sha256).toBe(sha256(value.artifact))
  })

  it('writes a self-consistent release directory through the production CLI', async () => {
    const value = fixture(), root = await mkdtemp(join(tmpdir(), 'cutout-update-')), artifact = join(root, 'Cutout.app.tar.gz')
    await writeFile(artifact, value.artifact); await writeFile(`${artifact}.sig`, value.signature)
    const result = spawnSync(process.execPath, ['scripts/update-artifacts.mjs', 'generate', '--artifact', artifact, '--version', '1.2.0', '--channel', 'beta', '--rollout', '25', '--artifact-url', 'https://releases.example.test/Cutout.app.tar.gz', '--allowed-hosts', 'releases.example.test', '--output', join(root, 'out')], { cwd: process.cwd(), env: { ...process.env, TAURI_SIGNING_PRIVATE_KEY: 'TEST-ONLY-NOT-A-TAURI-KEY' }, encoding: 'utf8' })
    expect(result.status, result.stderr).toBe(0)
    const directory = join(root, 'out', 'beta'), metadata = JSON.parse(await readFile(join(directory, 'release-metadata.json'), 'utf8'))
    expect(metadata.sbom.sha256).toBe(sha256(await readFile(join(directory, 'sbom.spdx.json'))))
    expect(metadata.provenance.sha256).toBe(sha256(await readFile(join(directory, 'provenance.json'))))
    const manifest = JSON.parse(await readFile(join(directory, 'latest.json'), 'utf8'))
    expect(() => validateUpdateManifest(manifest, { expectedSignature: value.signature, allowedHosts: ['releases.example.test'] })).not.toThrow()
  })
})

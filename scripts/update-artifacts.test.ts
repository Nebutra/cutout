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

const updaterSuffix: Record<string, string> = { 'darwin-aarch64': '.app.tar.gz', 'darwin-x86_64': '.app.tar.gz', 'windows-x86_64': '.nsis.zip', 'linux-x86_64': '.AppImage.tar.gz' }

function multiFixture(version = '1.2.0') {
  const { privateKey } = generateKeyPairSync('ed25519')
  const platforms = Object.keys(updaterSuffix).map((key) => {
    const artifact = Buffer.from(`fixture-${key}-${version}`)
    const signature = sign(null, artifact, privateKey).toString('base64')
    return { key, artifact, signature, artifactUrl: `https://releases.example.test/${key}-Cutout-${version}${updaterSuffix[key]}`, artifactDigest: sha256(artifact), signatureFile: `${key}-Cutout-${version}${updaterSuffix[key]}.sig` }
  })
  return { platforms }
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

  it('generates hash, SBOM, provenance and rollback metadata from verified sidecars', () => {
    const value = fixture(), base = { channel: 'stable', version: '1.2.0', publishedAt: '2026-07-15T00:00:00.000Z', artifactUrl: 'https://releases.example.test/Cutout.app.tar.gz', signature: value.signature, signatureFile: 'Cutout.app.tar.gz.sig', artifactDigest: sha256(value.artifact), rolloutPercentage: 100, previousVersion: '1.1.0', previousManifestUrl: 'https://releases.example.test/v1.1.0/latest.json', sourceRevision: 'abc123', allowedHosts: ['releases.example.test'] }
    const generated = buildReleaseDocuments(base)
    expect(generated).toMatchObject({ manifest: { version: '1.2.0' }, sbom: { spdxVersion: 'SPDX-2.3' }, provenance: { version: 'cutout.provenance.v1' }, rollback: { targetVersion: '1.1.0' }, rollout: { percentage: 100 } })
    expect(generated.metadata.artifact.sha256).toBe(sha256(value.artifact))
  })

  it('emits every built platform in the manifest and enumerates them in supply-chain metadata', () => {
    const { platforms } = multiFixture()
    const generated = buildReleaseDocuments({ channel: 'stable', version: '1.2.0', publishedAt: '2026-07-15T00:00:00.000Z', platforms: platforms.map(({ key, artifactUrl, signature, artifactDigest, signatureFile }) => ({ key, artifactUrl, signature, artifactDigest, signatureFile })), rolloutPercentage: 100, allowedHosts: ['releases.example.test'] })
    expect(Object.keys(generated.manifest.platforms)).toEqual(['darwin-aarch64', 'darwin-x86_64', 'windows-x86_64', 'linux-x86_64'])
    expect(generated.metadata.platforms.map((p: { key: string }) => p.key)).toEqual(['darwin-aarch64', 'darwin-x86_64', 'windows-x86_64', 'linux-x86_64'])
    expect(generated.sbom.packages).toHaveLength(4)
    expect(generated.provenance.subject).toHaveLength(4)
    expect(() => validateUpdateManifest(generated.manifest, { allowedHosts: ['releases.example.test'] })).not.toThrow()
  })

  it('requires darwin-aarch64 as the mandatory primary platform', () => {
    const { platforms } = multiFixture()
    const withoutPrimary = platforms.filter((p) => p.key !== 'darwin-aarch64').map(({ key, artifactUrl, signature, artifactDigest, signatureFile }) => ({ key, artifactUrl, signature, artifactDigest, signatureFile }))
    expect(() => buildReleaseDocuments({ channel: 'stable', version: '1.2.0', publishedAt: '2026-07-15T00:00:00.000Z', platforms: withoutPrimary, rolloutPercentage: 100, allowedHosts: ['releases.example.test'] })).toThrow('darwin-aarch64')
  })

  it('fails closed when a non-primary platform is insecure or unsigned', () => {
    const value = fixture()
    const insecure = structuredClone(value.manifest) as typeof value.manifest & { platforms: Record<string, { url: string; signature: string }> }
    insecure.platforms['windows-x86_64'] = { url: 'http://releases.example.test/windows.nsis.zip', signature: value.signature }
    expect(() => validateUpdateManifest(insecure, { allowedHosts: ['releases.example.test'] })).toThrow('HTTPS')
    const unsigned = structuredClone(value.manifest) as typeof insecure
    unsigned.platforms['linux-x86_64'] = { url: 'https://releases.example.test/linux.AppImage.tar.gz', signature: '   ' }
    expect(() => validateUpdateManifest(unsigned, { allowedHosts: ['releases.example.test'] })).toThrow('signature is missing')
  })

  it('generates a four-platform manifest through the production CLI', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cutout-update-multi-'))
    const { privateKey } = generateKeyPairSync('ed25519')
    const specs = [
      { key: 'darwin-aarch64', file: 'macos-aarch64-Cutout.app.tar.gz' },
      { key: 'darwin-x86_64', file: 'macos-x86_64-Cutout.app.tar.gz' },
      { key: 'windows-x86_64', file: 'windows-x86_64-Cutout-setup.nsis.zip' },
      { key: 'linux-x86_64', file: 'linux-x86_64-Cutout.AppImage.tar.gz' },
    ]
    const platformArgs: string[] = []
    for (const spec of specs) {
      const artifactPath = join(root, spec.file), artifact = Buffer.from(`fixture-${spec.key}`)
      await writeFile(artifactPath, artifact)
      await writeFile(`${artifactPath}.sig`, sign(null, artifact, privateKey).toString('base64'))
      platformArgs.push('--platform', `${spec.key}=${artifactPath}`)
    }
    const result = spawnSync(process.execPath, ['scripts/update-artifacts.mjs', 'generate', ...platformArgs, '--artifact-base-url', 'https://releases.example.test', '--version', '1.2.0', '--channel', 'stable', '--rollout', '100', '--allowed-hosts', 'releases.example.test', '--output', join(root, 'out')], { cwd: process.cwd(), encoding: 'utf8' })
    expect(result.status, result.stderr).toBe(0)
    const manifest = JSON.parse(await readFile(join(root, 'out', 'stable', 'latest.json'), 'utf8'))
    expect(Object.keys(manifest.platforms)).toEqual(['darwin-aarch64', 'darwin-x86_64', 'windows-x86_64', 'linux-x86_64'])
    expect(manifest.platforms['windows-x86_64'].url).toBe('https://releases.example.test/windows-x86_64-Cutout-setup.nsis.zip')
    expect(() => validateUpdateManifest(manifest, { allowedHosts: ['releases.example.test'] })).not.toThrow()
  })

  it('writes a self-consistent release directory through the production CLI', async () => {
    const value = fixture(), root = await mkdtemp(join(tmpdir(), 'cutout-update-')), artifact = join(root, 'Cutout.app.tar.gz')
    await writeFile(artifact, value.artifact); await writeFile(`${artifact}.sig`, value.signature)
    const result = spawnSync(process.execPath, ['scripts/update-artifacts.mjs', 'generate', '--artifact', artifact, '--version', '1.2.0', '--channel', 'beta', '--rollout', '25', '--artifact-url', 'https://releases.example.test/Cutout.app.tar.gz', '--allowed-hosts', 'releases.example.test', '--output', join(root, 'out')], { cwd: process.cwd(), encoding: 'utf8' })
    expect(result.status, result.stderr).toBe(0)
    const directory = join(root, 'out', 'beta'), metadata = JSON.parse(await readFile(join(directory, 'release-metadata.json'), 'utf8'))
    expect(metadata.sbom.sha256).toBe(sha256(await readFile(join(directory, 'sbom.spdx.json'))))
    expect(metadata.provenance.sha256).toBe(sha256(await readFile(join(directory, 'provenance.json'))))
    const manifest = JSON.parse(await readFile(join(directory, 'latest.json'), 'utf8'))
    expect(() => validateUpdateManifest(manifest, { expectedSignature: value.signature, allowedHosts: ['releases.example.test'] })).not.toThrow()
  })
})

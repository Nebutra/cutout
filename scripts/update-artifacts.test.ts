import { generateKeyPairSync, sign } from 'node:crypto'
import { createServer } from 'node:http'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildReleaseDocuments, checkUpdate, sha256, validateUpdateManifest } from './lib/update-artifacts.mjs'
import { loadReleaseNotesCatalog, projectReleaseNotesEntry, requireReleaseNotesEntry } from './lib/release-notes.mjs'

const servers: ReturnType<typeof createServer>[] = []
afterEach(async () => { await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))) })

function fixture(version = '1.2.0') {
  // Ephemeral test-only signing material. Production code never reads this key.
  const { privateKey } = generateKeyPairSync('ed25519'), artifact = Buffer.from(`fixture-${version}`)
  const signature = sign(null, artifact, privateKey).toString('base64')
  return { artifact, signature, manifest: { version, notes: 'Fixture', pub_date: '2026-07-15T00:00:00.000Z', platforms: { 'darwin-aarch64': { url: `https://releases.example.test/Cutout-${version}.app.tar.gz`, signature } } } }
}

function reviewedNotes(version = '1.2.0') {
  return projectReleaseNotesEntry({
    version,
    releasedOn: '2026-07-15',
    locales: {
      en: {
        headline: 'Reviewed fixture update',
        highlights: [{
          id: 'verified-update',
          title: 'Verified update',
          body: 'The updater fixture uses reviewed release notes.',
        }],
      },
    },
  })
}

const updaterSuffix: Record<string, string> = { 'darwin-aarch64': '.app.tar.gz', 'darwin-x86_64': '.app.tar.gz', 'windows-x86_64': '.exe', 'linux-x86_64': '.AppImage' }

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
    expect(checkUpdate({ manifest: value.manifest, currentVersion: '1.1.0', expectedSignature: value.signature, allowedHosts: ['releases.example.test'] })).toEqual({ status: 'update', version: '1.2.0' })
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

  it('rejects downgrade manifests because rollback is not implemented', () => {
    const value = fixture('1.1.0')
    expect(() => checkUpdate({ manifest: value.manifest, currentVersion: '1.2.0', expectedSignature: value.signature })).toThrow('cannot downgrade')
  })

  it('generates hash, SBOM and provenance metadata from verified sidecars', () => {
    const value = multiFixture(), base = { channel: 'stable', version: '1.2.0', publishedAt: '2026-07-15T00:00:00.000Z', platforms: value.platforms, sourceRevision: 'abc123', allowedHosts: ['releases.example.test'], releaseNotes: reviewedNotes() }
    const generated = buildReleaseDocuments(base)
    expect(generated).toMatchObject({ manifest: { version: '1.2.0' }, sbom: { spdxVersion: 'SPDX-2.3' }, provenance: { version: 'cutout.provenance.v1' }, metadata: { version: 'cutout.release-metadata.v3' } })
    expect(generated).not.toHaveProperty('rollout')
    expect(generated).not.toHaveProperty('rollback')
    expect(generated.metadata).not.toHaveProperty('artifact')
    expect(generated.metadata.platforms[0].sha256).toBe(value.platforms[0]?.artifactDigest)
  })

  it('derives readable plain text and structured updater notes from one reviewed entry', async () => {
    const value = multiFixture('0.1.19')
    const catalog = await loadReleaseNotesCatalog(undefined, { requireAllLocales: true })
    const releaseNotes = projectReleaseNotesEntry(requireReleaseNotesEntry(catalog, '0.1.19'))
    const generated = buildReleaseDocuments({ channel: 'stable', version: '0.1.19', publishedAt: '2026-08-04T00:00:00.000Z', platforms: value.platforms, allowedHosts: ['releases.example.test'], releaseNotes })
    expect(generated.manifest.notes).toContain('See what Agent preparation is doing')
    expect(generated.manifest.notes).not.toContain('cutout.release-notes')
    expect(generated.manifest.cutoutReleaseNotes).toEqual(releaseNotes)
    expect(() => validateUpdateManifest(generated.manifest, { requireReleaseNotes: true, expectedReleaseNotes: releaseNotes, allowedHosts: ['releases.example.test'] })).not.toThrow()
  })

  it('accepts base Tauri manifests only when reviewed notes are optional', async () => {
    const baseManifest = fixture().manifest
    expect(() => validateUpdateManifest(baseManifest)).not.toThrow()
    expect(() => validateUpdateManifest(baseManifest, { requireReleaseNotes: true })).toThrow('requires reviewed')
    const catalog = await loadReleaseNotesCatalog()
    const releaseNotes = projectReleaseNotesEntry(requireReleaseNotesEntry(catalog, '0.1.19'))
    // Deliberately a different version from the catalog entry above, so the
    // version check fires rather than the notes-text check.
    const mismatched = { ...fixture('0.1.20').manifest, cutoutReleaseNotes: releaseNotes }
    expect(() => validateUpdateManifest(mismatched)).toThrow('does not match')
    const unreadable = { ...fixture('0.1.19').manifest, cutoutReleaseNotes: releaseNotes, notes: JSON.stringify(releaseNotes) }
    expect(() => validateUpdateManifest(unreadable)).toThrow('reviewed English')
    const malformed = { ...fixture('0.1.19').manifest, cutoutReleaseNotes: { ...releaseNotes, remoteUrl: 'https://example.test/notes' } }
    expect(() => validateUpdateManifest(malformed)).toThrow('unknown field')
  })

  it('emits every built platform in the manifest and enumerates them in supply-chain metadata', () => {
    const { platforms } = multiFixture()
    const generated = buildReleaseDocuments({ channel: 'stable', version: '1.2.0', publishedAt: '2026-07-15T00:00:00.000Z', platforms: platforms.map(({ key, artifactUrl, signature, artifactDigest, signatureFile }) => ({ key, artifactUrl, signature, artifactDigest, signatureFile })), allowedHosts: ['releases.example.test'], releaseNotes: reviewedNotes() })
    expect(Object.keys(generated.manifest.platforms)).toEqual(['darwin-aarch64', 'darwin-x86_64', 'windows-x86_64', 'linux-x86_64'])
    expect(generated.metadata.platforms.map((p: { key: string }) => p.key)).toEqual(['darwin-aarch64', 'darwin-x86_64', 'windows-x86_64', 'linux-x86_64'])
    expect(generated.sbom.packages).toHaveLength(4)
    expect(generated.provenance.subject).toHaveLength(4)
    expect(() => validateUpdateManifest(generated.manifest, { allowedHosts: ['releases.example.test'] })).not.toThrow()
  })

  it('requires darwin-aarch64 as the mandatory primary platform', () => {
    const { platforms } = multiFixture()
    const withoutPrimary = platforms.filter((p) => p.key !== 'darwin-aarch64').map(({ key, artifactUrl, signature, artifactDigest, signatureFile }) => ({ key, artifactUrl, signature, artifactDigest, signatureFile }))
    expect(() => buildReleaseDocuments({ channel: 'stable', version: '1.2.0', publishedAt: '2026-07-15T00:00:00.000Z', platforms: withoutPrimary, allowedHosts: ['releases.example.test'], releaseNotes: reviewedNotes() })).toThrow('missing: darwin-aarch64')
  })

  it('fails closed when a non-primary platform is insecure or unsigned', () => {
    const value = fixture()
    const insecure = structuredClone(value.manifest) as typeof value.manifest & { platforms: Record<string, { url: string; signature: string }> }
    insecure.platforms['windows-x86_64'] = { url: 'http://releases.example.test/windows.exe', signature: value.signature }
    expect(() => validateUpdateManifest(insecure, { allowedHosts: ['releases.example.test'] })).toThrow('HTTPS')
    const unsigned = structuredClone(value.manifest) as typeof insecure
    unsigned.platforms['linux-x86_64'] = { url: 'https://releases.example.test/linux.AppImage', signature: '   ' }
    expect(() => validateUpdateManifest(unsigned, { allowedHosts: ['releases.example.test'] })).toThrow('signature is missing')
  })

  it('generates a four-platform manifest through the production CLI', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cutout-update-multi-'))
    const { privateKey } = generateKeyPairSync('ed25519')
    const specs = [
      { key: 'darwin-aarch64', file: 'macos-aarch64-Cutout.app.tar.gz' },
      { key: 'darwin-x86_64', file: 'macos-x86_64-Cutout.app.tar.gz' },
      { key: 'windows-x86_64', file: 'windows-x86_64-Cutout-setup.exe' },
      { key: 'linux-x86_64', file: 'linux-x86_64-Cutout.AppImage' },
    ]
    const platformArgs: string[] = []
    for (const spec of specs) {
      const artifactPath = join(root, spec.file), artifact = Buffer.from(`fixture-${spec.key}`)
      await writeFile(artifactPath, artifact)
      await writeFile(`${artifactPath}.sig`, sign(null, artifact, privateKey).toString('base64'))
      platformArgs.push('--platform', `${spec.key}=${artifactPath}`)
    }
    const commonArgs = ['scripts/update-artifacts.mjs', 'generate', ...platformArgs, '--artifact-base-url', 'https://releases.example.test', '--version', '0.1.19', '--channel', 'stable', '--allowed-hosts', 'releases.example.test']
    const missingCatalog = spawnSync(process.execPath, [...commonArgs, '--output', join(root, 'missing-catalog')], { cwd: process.cwd(), encoding: 'utf8' })
    expect(missingCatalog.status).not.toBe(0)
    expect(missingCatalog.stderr).toContain('--release-notes-catalog is required')
    const result = spawnSync(process.execPath, [...commonArgs, '--release-notes-catalog', 'src/release-notes/catalog.json', '--require-all-locales', '--output', join(root, 'out')], { cwd: process.cwd(), encoding: 'utf8' })
    expect(result.status, result.stderr).toBe(0)
    const manifest = JSON.parse(await readFile(join(root, 'out', 'stable', 'latest.json'), 'utf8'))
    const directory = join(root, 'out', 'stable')
    const metadata = JSON.parse(await readFile(join(directory, 'release-metadata.json'), 'utf8'))
    expect(Object.keys(manifest.platforms)).toEqual(['darwin-aarch64', 'darwin-x86_64', 'windows-x86_64', 'linux-x86_64'])
    expect(manifest.platforms['windows-x86_64'].url).toBe('https://releases.example.test/windows-x86_64-Cutout-setup.exe')
    expect(manifest.notes).toMatch(/^Readable preparation and honest paid-action decisions/m)
    expect(metadata).not.toHaveProperty('artifact')
    expect(metadata.platforms).toHaveLength(4)
    expect(metadata.sbom.sha256).toBe(sha256(await readFile(join(directory, 'sbom.spdx.json'))))
    expect(metadata.provenance.sha256).toBe(sha256(await readFile(join(directory, 'provenance.json'))))
    expect(() => validateUpdateManifest(manifest, { allowedHosts: ['releases.example.test'] })).not.toThrow()
  })

  it('rejects retired single-artifact generation flags', async () => {
    const value = fixture('0.1.19'), root = await mkdtemp(join(tmpdir(), 'cutout-update-')), artifact = join(root, 'Cutout.app.tar.gz')
    await writeFile(artifact, value.artifact); await writeFile(`${artifact}.sig`, value.signature)
    const result = spawnSync(process.execPath, ['scripts/update-artifacts.mjs', 'generate', '--artifact', artifact, '--version', '0.1.19', '--channel', 'beta', '--artifact-url', 'https://releases.example.test/Cutout.app.tar.gz', '--allowed-hosts', 'releases.example.test', '--release-notes-catalog', 'src/release-notes/catalog.json', '--require-all-locales', '--output', join(root, 'out')], { cwd: process.cwd(), encoding: 'utf8' })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('--artifact is retired')
  })

  it('rejects incomplete multi-platform release generation while reading old manifests', () => {
    const value = multiFixture()
    expect(() => buildReleaseDocuments({ channel: 'stable', version: '1.2.0', publishedAt: '2026-07-15T00:00:00.000Z', platforms: value.platforms.slice(0, 1), allowedHosts: ['releases.example.test'], releaseNotes: reviewedNotes() })).toThrow('All updater platforms are required')
    expect(() => validateUpdateManifest(fixture().manifest, { allowedHosts: ['releases.example.test'] })).not.toThrow()
  })

  it.each(['--rollout', '--previous-version', '--previous-manifest-url'])('rejects unsupported release policy flag %s', (flag) => {
    const result = spawnSync(process.execPath, ['scripts/update-artifacts.mjs', 'generate', flag, 'value'], { cwd: process.cwd(), encoding: 'utf8' })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('not supported')
  })
})

import { spawnSync } from 'node:child_process'
import { lstat, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Writable } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import {
  acquireJobLock,
  assertCommerceOperatorTransition,
  atomicPublish,
  atomicWrite,
  ensurePrivateDirectory,
  sanitizeFailure,
  writeNativeRequest,
} from './commerce-operator-runner'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, {
    recursive: true,
    force: true,
  })))
})

async function temporaryDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'cutout-commerce-operator-test-'))
  temporaryDirectories.push(path)
  return path
}

describe('Commerce operator private job store', () => {
  it('closes large native inputs after bounded backpressure-aware writes', async () => {
    const chunks: Buffer[] = []
    const stream = new Writable({
      highWaterMark: 1_024,
      write(chunk: Buffer, _encoding, callback) {
        chunks.push(Buffer.from(chunk))
        setImmediate(callback)
      },
    })
    const bytes = Buffer.alloc(5 * 1024 * 1024, 0x61)

    await writeNativeRequest(stream, bytes)

    expect(Buffer.concat(chunks).equals(bytes)).toBe(true)
    expect(chunks.length).toBeGreaterThan(1)
    expect(stream.writableEnded).toBe(true)
  })

  it('creates owner-only directories and atomically publishes fixed content', async () => {
    const root = await temporaryDirectory()
    const job = join(root, 'job_0123456789abcdef')
    await ensurePrivateDirectory(job)
    await atomicWrite(join(job, 'status.json'), { status: 'running' })
    await atomicPublish(join(job, 'pending.json'), { bundle: 'retained' })
    await expect(atomicPublish(join(job, 'pending.json'), { bundle: 'alternate' }))
      .rejects.toMatchObject({ code: 'EEXIST' })
    expect(JSON.parse(await readFile(join(job, 'status.json'), 'utf8'))).toEqual({ status: 'running' })
    expect(JSON.parse(await readFile(join(job, 'pending.json'), 'utf8'))).toEqual({ bundle: 'retained' })
    if (process.platform !== 'win32') {
      expect((await lstat(job)).mode & 0o777).toBe(0o700)
      expect((await lstat(join(job, 'status.json'))).mode & 0o777).toBe(0o600)
      expect((await lstat(join(job, 'pending.json'))).mode & 0o777).toBe(0o600)
    }
  })

  it('rejects symlink job storage and excludes concurrent transitions', async () => {
    const root = await temporaryDirectory()
    const target = join(root, 'target')
    const linked = join(root, 'linked')
    await ensurePrivateDirectory(target)
    await symlink(target, linked)
    await expect(ensurePrivateDirectory(linked)).rejects.toThrow(/invalid/)
    await expect(ensurePrivateDirectory(join(linked, 'nested'), root)).rejects.toThrow(/invalid/)

    const release = await acquireJobLock(target)
    await expect(acquireJobLock(target)).rejects.toThrow(/already active/)
    await release()
    const releaseAgain = await acquireJobLock(target)
    expect(releaseAgain).toBeTypeOf('function')
    await releaseAgain()
  })

  it('rejects a symlink lock instead of following it as a stale process record', async () => {
    const root = await temporaryDirectory()
    const job = join(root, 'job_0123456789abcdef')
    const target = join(root, 'pid.txt')
    await ensurePrivateDirectory(job)
    await writeFile(target, '999999', { mode: 0o600 })
    await symlink(target, join(job, '.lock'))
    await expect(acquireJobLock(job)).rejects.toThrow(/lock is invalid/)
  })

  it('redacts credential-shaped text and private paths from failures', () => {
    const diagnostic = sanitizeFailure(new Error(
      'Bearer abc.def and sk-example api_key=private-value failed at '
      + '/Users/private/operator/request.json and C:\\Users\\private\\request.json',
    ))
    expect(diagnostic).not.toContain('abc.def')
    expect(diagnostic).not.toContain('sk-example')
    expect(diagnostic).not.toContain('/Users/private')
    expect(diagnostic).not.toContain('private-value')
    expect(diagnostic).not.toContain('C:\\Users\\private')
    expect(diagnostic).toContain('[redacted]')
    expect(diagnostic).toContain('[private-path]')
  })

  it('keeps admitted and cancelled jobs terminal while limiting replay to recovery states', () => {
    expect(() => assertCommerceOperatorTransition('admit', 'pending-evaluator')).not.toThrow()
    expect(() => assertCommerceOperatorTransition('admit', 'admitted')).not.toThrow()
    expect(() => assertCommerceOperatorTransition('recover', 'running')).not.toThrow()
    expect(() => assertCommerceOperatorTransition('recover', 'failed')).not.toThrow()
    expect(() => assertCommerceOperatorTransition('recover', 'created')).toThrow(/invalid/)
    expect(() => assertCommerceOperatorTransition('recover', 'admitted')).toThrow(/invalid/)
    expect(() => assertCommerceOperatorTransition('run', 'cancelled')).toThrow(/invalid/)
    expect(() => assertCommerceOperatorTransition('preflight', 'admitted')).toThrow(/invalid/)
  })
})

describe('Commerce operator release identity', () => {
  it('keeps credential setup and native Host on one stable signed Keychain identity', async () => {
    const build = await readFile('scripts/build-commerce-operator.mjs', 'utf8')
    const identity = 'com.nebutra.cutout.commerce-credential-owner'

    expect(build).toContain(`[artifacts.credentialSetup, '${identity}']`)
    expect(build).toContain(`[artifacts.nativeHost, '${identity}']`)
    expect(build.match(new RegExp(identity.replaceAll('.', '\\.'), 'g'))).toHaveLength(2)
    expect(build).not.toMatch(/security\s+(?:unlock-keychain|set-key-partition-list)/)
  })

  it('closes the signed operator to its exact runner and native Host requirements', async () => {
    const [operator, runner] = await Promise.all([
      readFile('src-tauri/src/commerce_operator.rs', 'utf8'),
      readFile('scripts/commerce-operator-runner.ts', 'utf8'),
    ])

    expect(operator).toContain('identifier \\"com.nebutra.cutout.commerce-runner\\"')
    expect(operator).toContain('RUNNER_MACOS_REQUIREMENT')
    expect(operator).toContain('Command::new("/usr/bin/codesign")')
    expect(runner).toContain('com.nebutra.cutout.commerce-credential-owner')
    expect(runner).toContain("spawnSync('/usr/bin/codesign'")
    expect(runner).toContain('`-R=${NATIVE_HOST_MACOS_REQUIREMENT}`')
  })

  it('keeps product, Cargo, Tauri, capability, and plugin versions at 0.1.25', async () => {
    const [pkg, tauri, capabilities, bundledCapabilities, plugin, runtimeBuild, cargo] = await Promise.all([
      readFile('package.json', 'utf8').then(JSON.parse),
      readFile('src-tauri/tauri.conf.json', 'utf8').then(JSON.parse),
      readFile('cutout.agent-capabilities.json', 'utf8').then(JSON.parse),
      readFile('plugins/cutout/runtime-data/cutout.agent-capabilities.json', 'utf8').then(JSON.parse),
      readFile('plugins/cutout/.codex-plugin/plugin.json', 'utf8').then(JSON.parse),
      readFile('plugins/cutout/runtime/runtime-build.json', 'utf8').then(JSON.parse),
      readFile('src-tauri/Cargo.toml', 'utf8'),
    ])
    expect(pkg.version).toBe('0.1.25')
    expect(tauri.version).toBe(pkg.version)
    expect(capabilities.product.packageVersion).toBe(pkg.version)
    expect(bundledCapabilities).toEqual(capabilities)
    expect(plugin.version).toBe(pkg.version)
    expect(runtimeBuild.packageVersion).toBe(pkg.version)
    // Compared as an exact line rather than a regex. A literal escaped pattern
    // (`0\.1\.24`) is invisible to a version-bump search-and-replace, so it
    // silently keeps passing against the previous release; building one from
    // `pkg.version` instead needs escaping this assertion has no business doing.
    expect(cargo.split('\n')).toContain(`version = "${pkg.version}"`)
  })

  it('fails the release build before compilation when the evaluator trust root is absent', () => {
    const environment = { ...process.env }
    delete environment.CUTOUT_COMMERCE_EVALUATOR_PUBKEY
    const result = spawnSync(process.execPath, ['scripts/build-commerce-operator.mjs'], {
      cwd: process.cwd(),
      env: environment,
      encoding: 'utf8',
      shell: false,
    })
    expect(result.status).not.toBe(0)
    expect(`${result.stdout}${result.stderr}`).toContain('CUTOUT_COMMERCE_EVALUATOR_PUBKEY is required')
  })

  it('fails the release build before compilation when the evaluator trust root is malformed', () => {
    const result = spawnSync(process.execPath, ['scripts/build-commerce-operator.mjs'], {
      cwd: process.cwd(),
      env: { ...process.env, CUTOUT_COMMERCE_EVALUATOR_PUBKEY: 'x'.repeat(120) },
      encoding: 'utf8',
      shell: false,
    })
    expect(result.status).not.toBe(0)
    expect(`${result.stdout}${result.stderr}`).toContain('valid Minisign Ed25519 public key')
  })
})

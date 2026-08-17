#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { validateReleaseVersions } from './lib/release-version.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const [
  packageJson,
  tauriJson,
  cargoToml,
  capabilities,
  plugin,
  bundledCapabilities,
  runtimeBuild,
] = await Promise.all([
  readFile(resolve(root, 'package.json'), 'utf8').then(JSON.parse),
  readFile(resolve(root, 'src-tauri/tauri.conf.json'), 'utf8').then(JSON.parse),
  readFile(resolve(root, 'src-tauri/Cargo.toml'), 'utf8'),
  readFile(resolve(root, 'cutout.agent-capabilities.json'), 'utf8').then(JSON.parse),
  readFile(resolve(root, 'plugins/cutout/.codex-plugin/plugin.json'), 'utf8').then(JSON.parse),
  readFile(resolve(root, 'plugins/cutout/runtime-data/cutout.agent-capabilities.json'), 'utf8').then(JSON.parse),
  readFile(resolve(root, 'plugins/cutout/runtime/runtime-build.json'), 'utf8').then(JSON.parse),
])
const version = validateReleaseVersions({
  packageVersion: packageJson.version,
  tauriVersion: tauriJson.version,
  cargoToml,
  dependentVersions: {
    agentCapabilities: capabilities.product?.packageVersion,
    codexPlugin: plugin.version,
    bundledAgentCapabilities: bundledCapabilities.product?.packageVersion,
    bundledRuntime: runtimeBuild.packageVersion,
  },
  expected: '0.1.22',
})
if (JSON.stringify(capabilities) !== JSON.stringify(bundledCapabilities)) {
  throw new Error('Bundled Agent capability manifest drifted from the release source.')
}
const trustRoot = process.env.CUTOUT_COMMERCE_EVALUATOR_PUBKEY
if (typeof trustRoot !== 'string' || trustRoot.trim().length === 0) {
  throw new Error('CUTOUT_COMMERCE_EVALUATOR_PUBKEY is required to build the release Commerce operator.')
}
const publicKey = trustRoot.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean).at(-1)
const publicKeyBytes = publicKey && /^[A-Za-z0-9+/]{56}$/u.test(publicKey)
  ? Buffer.from(publicKey, 'base64')
  : undefined
if (!publicKeyBytes || publicKeyBytes.byteLength !== 42
  || publicKeyBytes[0] !== 0x45 || publicKeyBytes[1] !== 0x64
  || publicKeyBytes.toString('base64') !== publicKey) {
  throw new Error('CUTOUT_COMMERCE_EVALUATOR_PUBKEY must contain one valid Minisign Ed25519 public key.')
}

run('cargo', [
  'build', '--locked', '--release', '--manifest-path', 'src-tauri/Cargo.toml',
  '--bin', 'cutout-commerce-operator', '--bin', 'cutout-commerce-native-host',
  '--bin', 'cutout-commerce-credential-setup',
])
const suffix = process.platform === 'win32' ? '.exe' : ''
const output = resolve(root, `src-tauri/target/release/cutout-commerce-runner${suffix}`)
run('bun', [
  'build', 'scripts/commerce-operator-runner.ts', '--compile', '--minify',
  '--outfile', output,
  '--define', `__CUTOUT_VERSION__=${JSON.stringify(version)}`,
])
const artifacts = {
  operator: resolve(root, `src-tauri/target/release/cutout-commerce-operator${suffix}`),
  nativeHost: resolve(root, `src-tauri/target/release/cutout-commerce-native-host${suffix}`),
  credentialSetup: resolve(root, `src-tauri/target/release/cutout-commerce-credential-setup${suffix}`),
  runner: output,
}
await Promise.all(Object.values(artifacts).map((path) => access(path)))
if (process.platform === 'darwin') {
  const identity = process.env.CUTOUT_COMMERCE_CODESIGN_IDENTITY
  if (typeof identity !== 'string' || identity.trim().length === 0) {
    throw new Error('CUTOUT_COMMERCE_CODESIGN_IDENTITY is required for a non-interactive macOS Commerce operator.')
  }
  const signatures = [
    [artifacts.credentialSetup, 'com.nebutra.cutout.commerce-credential-owner'],
    [artifacts.nativeHost, 'com.nebutra.cutout.commerce-credential-owner'],
    [artifacts.operator, 'com.nebutra.cutout.commerce-operator'],
    [artifacts.runner, 'com.nebutra.cutout.commerce-runner'],
  ]
  for (const [path, identifier] of signatures) {
    run('codesign', [
      '--force', '--sign', identity, '--identifier', identifier,
      '--options', 'runtime', '--timestamp', path,
    ])
    run('codesign', ['--verify', '--strict', '--verbose=2', path])
  }
}
process.stdout.write(`Built closed Commerce operator ${version}.\n`)

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    stdio: 'inherit',
    shell: false,
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

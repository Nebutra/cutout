#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { validateReleaseVersions } from './lib/release-version.mjs'

const args = process.argv.slice(2)
const expectedIndex = args.indexOf('--expected')
const expected = expectedIndex >= 0 ? args[expectedIndex + 1] : undefined

if (expectedIndex >= 0 && !expected) {
  throw new Error('--expected requires a semantic version without a leading v.')
}

const [packageJson, tauriJson, cargoToml, capabilitiesJson, pluginJson] = await Promise.all([
  readFile(new URL('../package.json', import.meta.url), 'utf8'),
  readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
  readFile(new URL('../src-tauri/Cargo.toml', import.meta.url), 'utf8'),
  readFile(new URL('../cutout.agent-capabilities.json', import.meta.url), 'utf8'),
  readFile(new URL('../plugins/cutout/.codex-plugin/plugin.json', import.meta.url), 'utf8'),
])

const packageManifest = JSON.parse(packageJson)
const capabilities = JSON.parse(capabilitiesJson)
const plugin = JSON.parse(pluginJson)

const version = validateReleaseVersions({
  packageVersion: packageManifest.version,
  tauriVersion: JSON.parse(tauriJson).version,
  cargoToml,
  dependentVersions: {
    agentCapabilities: capabilities.product?.packageVersion,
    codexPlugin: plugin.version,
  },
  expected,
})

process.stdout.write(`Release version ${version} is synchronized${expected ? ' with the selected tag' : ''}.\n`)

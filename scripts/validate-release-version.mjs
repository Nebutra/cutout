#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { validateReleaseVersions } from './lib/release-version.mjs'

const args = process.argv.slice(2)
const expectedIndex = args.indexOf('--expected')
const expected = expectedIndex >= 0 ? args[expectedIndex + 1] : undefined

if (expectedIndex >= 0 && !expected) {
  throw new Error('--expected requires a semantic version without a leading v.')
}

const [packageJson, tauriJson, cargoToml] = await Promise.all([
  readFile(new URL('../package.json', import.meta.url), 'utf8'),
  readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
  readFile(new URL('../src-tauri/Cargo.toml', import.meta.url), 'utf8'),
])

const version = validateReleaseVersions({
  packageVersion: JSON.parse(packageJson).version,
  tauriVersion: JSON.parse(tauriJson).version,
  cargoToml,
  expected,
})

process.stdout.write(`Release version ${version} is synchronized${expected ? ' with the selected tag' : ''}.\n`)

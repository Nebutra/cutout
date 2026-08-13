#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const allowedAdvisory = Object.freeze({
  id: 'RUSTSEC-2024-0429',
  package: 'glib',
  version: '0.18.5',
  ghsa: 'GHSA-wrw7-89jp-8q8g',
})

export function validateRustAdvisoryReport(report) {
  const vulnerabilities = report?.vulnerabilities
  if (!vulnerabilities || !Array.isArray(vulnerabilities.list)) {
    throw new Error('cargo-audit did not return its expected vulnerability report.')
  }
  if (vulnerabilities.count !== vulnerabilities.list.length) {
    throw new Error('cargo-audit vulnerability count does not match its advisory list.')
  }

  if (vulnerabilities.list.length) {
    const labels = vulnerabilities.list.map((entry) => `${entry?.advisory?.id ?? 'unknown'} (${entry?.package?.name ?? 'unknown'}@${entry?.package?.version ?? 'unknown'})`)
    throw new Error(`Unreviewed Rust security advisories: ${labels.join(', ')}`)
  }

  const unsound = report?.warnings?.unsound ?? []
  if (!Array.isArray(unsound)) throw new Error('cargo-audit returned malformed unsoundness warnings.')
  const unexpectedUnsound = unsound.filter((entry) => (
    entry?.advisory?.id !== allowedAdvisory.id
    || entry?.package?.name !== allowedAdvisory.package
    || entry?.package?.version !== allowedAdvisory.version
  ))
  if (unexpectedUnsound.length) {
    const labels = unexpectedUnsound.map((entry) => `${entry?.advisory?.id ?? 'unknown'} (${entry?.package?.name ?? 'unknown'}@${entry?.package?.version ?? 'unknown'})`)
    throw new Error(`Unreviewed Rust unsoundness advisories: ${labels.join(', ')}`)
  }
  if (unsound.length > 1) throw new Error(`The reviewed ${allowedAdvisory.id} exception appeared more than once.`)

  const securityMessage = unsound.length === 1
    ? `Recognized upstream exception ${allowedAdvisory.id} / ${allowedAdvisory.ghsa} for ${allowedAdvisory.package}@${allowedAdvisory.version}.`
    : 'No Rust security advisories found.'
  const unmaintained = report?.warnings?.unmaintained ?? []
  if (!Array.isArray(unmaintained)) throw new Error('cargo-audit returned malformed maintenance warnings.')
  if (!unmaintained.length) return securityMessage
  const labels = unmaintained.map((entry) => `${entry?.advisory?.id ?? 'unknown'} (${entry?.package?.name ?? 'unknown'}@${entry?.package?.version ?? 'unknown'})`)
  return `${securityMessage}\nNon-blocking upstream maintenance warnings: ${labels.join(', ')}`
}

export function runCargoAudit() {
  const result = spawnSync('cargo', ['audit', '--json', '--file', 'src-tauri/Cargo.lock'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  if (result.error) throw result.error
  let report
  try {
    report = JSON.parse(result.stdout)
  } catch {
    throw new Error(`cargo-audit did not produce JSON${result.stderr ? `: ${result.stderr.trim()}` : '.'}`)
  }
  const message = validateRustAdvisoryReport(report)
  if (result.status !== 0 && report.vulnerabilities.list.length === 0) {
    throw new Error(`cargo-audit failed without reporting an advisory${result.stderr ? `: ${result.stderr.trim()}` : '.'}`)
  }
  return message
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.stdout.write(`${runCargoAudit()}\n`)
}

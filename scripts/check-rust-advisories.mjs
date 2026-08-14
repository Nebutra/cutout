#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { validateRustAdvisoryReport } from './rust-advisory-report.mjs'

export { validateRustAdvisoryReport }

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

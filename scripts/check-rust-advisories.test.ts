import { describe, expect, it } from 'vitest'
import { validateRustAdvisoryReport } from './check-rust-advisories.mjs'

function report(list: unknown[]) {
  return { vulnerabilities: { count: list.length, found: list.length > 0, list }, warnings: {} }
}

const reviewed = {
  advisory: { id: 'RUSTSEC-2024-0429' },
  package: { name: 'glib', version: '0.18.5' },
}

describe('Rust advisory gate', () => {
  it('passes a clean report and prints the exact reviewed upstream exception', () => {
    expect(validateRustAdvisoryReport(report([]))).toBe('No Rust security advisories found.')
    expect(validateRustAdvisoryReport({ ...report([]), warnings: { unsound: [reviewed] } })).toContain('RUSTSEC-2024-0429 / GHSA-wrw7-89jp-8q8g')
  })

  it('keeps non-blocking maintenance warnings visible', () => {
    const value = validateRustAdvisoryReport({
      ...report([]),
      warnings: { unmaintained: [{ advisory: { id: 'RUSTSEC-2099-0002' }, package: { name: 'old-crate', version: '1.0.0' } }] },
    })
    expect(value).toContain('Non-blocking upstream maintenance warnings: RUSTSEC-2099-0002 (old-crate@1.0.0)')
  })

  it('fails for another advisory or a changed package/version tuple', () => {
    expect(() => validateRustAdvisoryReport(report([{ advisory: { id: 'RUSTSEC-2099-0001' }, package: { name: 'other', version: '1.0.0' } }]))).toThrow('Unreviewed Rust security advisories')
    expect(() => validateRustAdvisoryReport({ ...report([]), warnings: { unsound: [{ ...reviewed, package: { name: 'glib', version: '0.18.6' } }] } })).toThrow('Unreviewed Rust unsoundness advisories')
  })

  it('fails malformed and internally inconsistent audit output', () => {
    expect(() => validateRustAdvisoryReport({})).toThrow('expected vulnerability report')
    expect(() => validateRustAdvisoryReport({ vulnerabilities: { count: 2, list: [reviewed] } })).toThrow('count does not match')
  })
})

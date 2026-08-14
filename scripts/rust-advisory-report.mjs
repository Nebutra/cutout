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

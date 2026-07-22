const semanticVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/

export function validateReleaseVersions({ packageVersion, tauriVersion, cargoToml, dependentVersions = {}, expected }) {
  const cargoVersion = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1]
  const versions = { package: packageVersion, tauri: tauriVersion, cargo: cargoVersion ?? 'missing' }

  if (!cargoVersion || packageVersion !== tauriVersion || packageVersion !== cargoVersion) {
    throw new Error(`Release version drift: package=${versions.package}, tauri=${versions.tauri}, cargo=${versions.cargo}.`)
  }
  if (!semanticVersion.test(packageVersion)) {
    throw new Error(`Release version is not valid semantic versioning: ${packageVersion}.`)
  }
  const dependentDrift = Object.entries(dependentVersions).filter(([, version]) => version !== packageVersion)
  if (dependentDrift.length) {
    throw new Error(`Release version drift: ${dependentDrift.map(([name, version]) => `${name}=${version}`).join(', ')}, package=${packageVersion}.`)
  }
  if (expected !== undefined && !semanticVersion.test(expected)) {
    throw new Error(`Expected release version is not valid semantic versioning: ${expected}.`)
  }
  if (expected !== undefined && packageVersion !== expected) {
    throw new Error(`Release tag version ${expected} does not match source version ${packageVersion}.`)
  }
  return packageVersion
}

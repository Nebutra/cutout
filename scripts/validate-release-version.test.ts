import { describe, expect, it } from 'vitest'
import { validateReleaseVersions } from './lib/release-version.mjs'

const cargo = (version: string) => `[package]\nname = "app"\nversion = "${version}"\n`

describe('release version contract', () => {
  it('accepts a synchronized source version that matches the selected tag', () => {
    expect(validateReleaseVersions({ packageVersion: '1.2.3-beta.4', tauriVersion: '1.2.3-beta.4', cargoToml: cargo('1.2.3-beta.4'), expected: '1.2.3-beta.4' })).toBe('1.2.3-beta.4')
  })

  it('rejects source manifest drift', () => {
    expect(() => validateReleaseVersions({ packageVersion: '1.2.3', tauriVersion: '1.2.4', cargoToml: cargo('1.2.3') })).toThrow('Release version drift')
  })

  it('rejects a tag that does not match the reviewed source version', () => {
    expect(() => validateReleaseVersions({ packageVersion: '1.2.3', tauriVersion: '1.2.3', cargoToml: cargo('1.2.3'), expected: '1.2.4' })).toThrow('does not match source version')
  })

  it('rejects malformed source and expected versions', () => {
    expect(() => validateReleaseVersions({ packageVersion: '01.2.3', tauriVersion: '01.2.3', cargoToml: cargo('01.2.3') })).toThrow('not valid semantic versioning')
    expect(() => validateReleaseVersions({ packageVersion: '1.2.3', tauriVersion: '1.2.3', cargoToml: cargo('1.2.3'), expected: 'v1.2.3' })).toThrow('Expected release version')
  })
})

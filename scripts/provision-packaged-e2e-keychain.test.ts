import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('packaged E2E Keychain provisioning boundary', () => {
  it('streams a fixed-service Provider secret without argv, files, or broad ACLs', async () => {
    const script = await readFile('scripts/provision-packaged-e2e-keychain.sh', 'utf8')

    expect(script).toContain('service="com.nebutra.cutout"')
    expect(script).toContain('account="provider:${provider_id}"')
    expect(script).toContain('security find-generic-password -s "$service" -a "$account" -w')
    expect(script).toContain("printf '%s\\n' \"$remote_keychain_password\"")
    expect(script).toContain("'$remote_helper_binary' provision '$provider_id' '$remote_binary'")
    expect(script).toContain('BatchMode=yes')
    expect(script).toContain('CUTOUT_PACKAGED_E2E_KEYCHAIN_PASSWORD')
    expect(script).toContain('codesign --verify --deep --strict')
    expect(script).toContain("'$remote_helper_binary' delete '$provider_id' '$remote_binary'")
    expect(script).not.toContain(' -A ')
    expect(script).not.toMatch(/-(?:p|w)\s+["']?\$/u)
    expect(script).not.toMatch(/mktemp|base64|providers\.json/u)

    const helper = await readFile('scripts/macos-packaged-e2e-keychain.swift', 'utf8')
    expect(helper).toContain('FileHandle.standardInput.readDataToEndOfFile()')
    expect(helper).toContain('SecKeychainUnlock')
    expect(helper).toContain('secret.last == 0x0A || secret.last == 0x0D')
    expect(helper).toContain('SecTrustedApplicationCreateFromPath')
    expect(helper).toContain('SecAccessCreate')
    expect(helper).toContain('kSecAttrAccess')
    expect(helper).toContain('set-generic-password-partition-list')
    expect(helper).toContain('"-S", "apple-tool:,apple:,teamid:\\(teamId)"')
    expect(helper).toContain('process.standardInput = input')
    expect(helper).not.toContain('"-k"')
    expect(helper).not.toContain('print(secret')
  })
})

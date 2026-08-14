import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('packaged macOS E2E signing boundary', () => {
  it('builds only with a Developer ID identity matching trusted production Cutout', async () => {
    const [packageJson, buildScript] = await Promise.all([
      readFile('package.json', 'utf8').then(JSON.parse),
      readFile('scripts/build-packaged-e2e-macos.sh', 'utf8'),
    ])

    expect(packageJson.scripts['tauri:e2e:build']).toBe(
      'bash scripts/build-packaged-e2e-macos.sh',
    )
    expect(buildScript).toContain('/Applications/Cutout.app')
    expect(buildScript).toContain('APPLE_SIGNING_IDENTITY')
    expect(buildScript).toContain('security find-identity -v -p codesigning')
    expect(buildScript).toContain('codesign --verify --deep --strict')
    expect(buildScript).toContain('com.nebutra.cutout.packaged-e2e')
    expect(buildScript).toContain('TeamIdentifier')
    expect(buildScript).not.toContain('\\${')
    expect(buildScript).not.toContain('mapfile')
    expect(buildScript).not.toMatch(/find-generic-password|dump-keychain|-w\b|-g\b/)
  })

  it('refuses to launch an unsigned, wrong-id, or wrong-Team E2E bundle', async () => {
    const smoke = await readFile('scripts/smoke-packaged-macos.sh', 'utf8')

    expect(smoke).toContain('codesign --verify --deep --strict')
    expect(smoke).toContain('com.nebutra.cutout.packaged-e2e')
    expect(smoke).toContain('CUTOUT_PACKAGED_E2E_TEAM_ID')
    expect(smoke).toContain('/Applications/Cutout.app')
    expect(smoke).toContain('stage-packaged-e2e-provider-registry.mjs')
    expect(smoke).toContain('lsappinfo front')
    expect(smoke).toContain('foregroundOwnershipPreserved')
    expect(smoke).toContain('baselineBundleIdSha256')
    expect(smoke).toContain('security show-keychain-info "$login_keychain"')
    expect(smoke).toContain('login Keychain must already be unlocked')
    expect(smoke).not.toContain('security unlock-keychain')
    expect(smoke).not.toContain('open --background --new')
    expect(smoke).toContain(
      'exec env -u HTTPS_PROXY -u https_proxy -u ALL_PROXY -u all_proxy',
    )
    expect(smoke).toContain('CUTOUT_PACKAGED_E2E_HTTPS_PROXY')
    expect(smoke).toContain('unset CUTOUT_PACKAGED_E2E_IMAGE_MODEL')
    expect(smoke).toContain('^http://127\\.0\\.0\\.1:([0-9]{1,5})$')
    expect(smoke).toContain('"CUTOUT_PACKAGED_E2E_HTTPS_PROXY=$packaged_e2e_https_proxy"')
    expect(smoke).not.toContain('"HTTPS_PROXY=$packaged_e2e_https_proxy"')
    expect(smoke).not.toContain('"https_proxy=$packaged_e2e_https_proxy"')
    expect(smoke).toContain('10#$packaged_e2e_proxy_port > 65535')
    expect(smoke).not.toContain('--env "HTTP_PROXY=$packaged_e2e_https_proxy"')
    expect(smoke).toContain('app="$(cd "$app" && pwd -P)"')
    expect(smoke).toContain('pgrep -f -x -- "$binary"')
    expect(smoke).toContain('validate-packaged-e2e-evidence.mjs')
    expect(smoke).toContain('$result_root/captures/$capture_id.png')
    expect(smoke).not.toContain('three independently generated route suites')
    expect(smoke).not.toMatch(/find-generic-password|dump-keychain|-w\b|-g\b/)
  })

  it('keeps cross-VM credential provisioning outside the app and renderer', async () => {
    const provision = await readFile('scripts/provision-packaged-e2e-keychain.sh', 'utf8')

    expect(provision).toContain('com.nebutra.cutout')
    expect(provision).toContain('provider:${provider_id}')
    expect(provision).toContain('macos-packaged-e2e-keychain.swift')
    expect(provision).toContain("'$remote_helper_binary' provision '$provider_id' '$remote_binary'")
    expect(provision).not.toContain('CUTOUT_PACKAGED_E2E_PROVIDER_KEY')
    expect(provision).not.toContain('providers.json')
  })
})

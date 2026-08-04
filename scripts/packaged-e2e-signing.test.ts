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
    expect(smoke).not.toMatch(/find-generic-password|dump-keychain|-w\b|-g\b/)
  })
})

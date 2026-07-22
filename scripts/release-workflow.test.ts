import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import YAML from 'yaml'

describe('cross-platform release workflow', () => {
  it('gates one writer behind the complete native build matrix', async () => {
    const source = await readFile('.github/workflows/release-update.yml', 'utf8')
    const workflow = YAML.parse(source)
    const matrix = workflow.jobs.build.strategy.matrix.include

    expect(matrix.map((entry: { artifact: string }) => entry.artifact)).toEqual([
      'release-macos-aarch64',
      'release-macos-x86_64',
      'release-windows-x86_64',
      'release-linux-x86_64',
    ])
    expect(workflow.permissions).toEqual({ contents: 'read' })
    expect(workflow.jobs.build.needs).toBe('validate')
    expect(workflow.jobs.publish.needs).toEqual(['validate', 'build'])
    expect(workflow.jobs.publish.permissions).toEqual({ contents: 'write' })
  })

  it('keeps matrix builders isolated from GitHub Release mutation', async () => {
    const source = await readFile('.github/workflows/release-update.yml', 'utf8')
    const workflow = YAML.parse(source)
    const buildActions = workflow.jobs.build.steps.filter((step: { uses?: string }) => step.uses?.startsWith('tauri-apps/tauri-action@'))
    const artifactUpload = workflow.jobs.build.steps.find((step: { uses?: string }) => step.uses?.startsWith('actions/upload-artifact@'))
    const configInjection = workflow.jobs.build.steps.find((step: { name?: string }) => step.name === 'Inject updater public key into release-only Tauri config')
    const publishScript = workflow.jobs.publish.steps.at(-1).run

    expect(buildActions).toHaveLength(2)
    for (const buildAction of buildActions) {
      expect(buildAction.with).toMatchObject({
        uploadUpdaterJson: false,
        uploadWorkflowArtifacts: false,
        uploadUpdaterSignatures: false,
      })
      expect(buildAction.with).not.toHaveProperty('tagName')
      expect(buildAction.with).not.toHaveProperty('releaseId')
      expect(buildAction.with.args).toContain('--config src-tauri/tauri.release.conf.json')
    }
    expect(artifactUpload.with).toMatchObject({
      name: '${{ matrix.artifact }}',
      path: 'src-tauri/target/${{ matrix.target }}/release/bundle',
      'if-no-files-found': 'error',
    })
    expect(configInjection.run).toBe('node scripts/prepare-tauri-release-config.mjs')
    expect(workflow.jobs.build.env.CUTOUT_UPDATER_STABLE_ENDPOINTS).toContain('releases/latest/download/latest.json')
    expect(workflow.jobs.build.env.CUTOUT_UPDATER_ALLOWED_HOSTS).toContain('github.com')
    expect(publishScript).toContain('gh release create')
    expect(publishScript).toContain('--draft')
    expect(publishScript).toContain('gh release edit')
  })

  it('scopes Apple credentials to the macOS preparation, build, and DMG notarization steps', async () => {
    const source = await readFile('.github/workflows/release-update.yml', 'utf8')
    const workflow = YAML.parse(source)
    const buildSteps = workflow.jobs.build.steps
    const preparation = buildSteps.find((step: { name?: string }) => step.name === 'Prepare Apple signing and notarization credentials')
    const macBuild = buildSteps.find((step: { name?: string }) => step.name === 'Build signed and notarized macOS bundles')
    const nonMacBuild = buildSteps.find((step: { name?: string }) => step.name === 'Build non-macOS bundles')
    const dmgNotarization = buildSteps.find((step: { name?: string }) => step.name === 'Notarize and staple macOS DMG')
    const appleNames = [
      'APPLE_CERTIFICATE',
      'APPLE_CERTIFICATE_PASSWORD',
      'APPLE_SIGNING_IDENTITY',
      'APPLE_API_KEY',
      'APPLE_API_ISSUER',
      'APPLE_API_PRIVATE_KEY',
    ]
    const appleSecretConsumers = buildSteps
      .filter((step: { env?: Record<string, string> }) => JSON.stringify(step.env ?? {}).includes('secrets.APPLE_'))
      .map((step: { name?: string }) => step.name)

    expect(preparation.if).toBe("runner.os == 'macOS'")
    expect(macBuild.if).toBe("runner.os == 'macOS'")
    expect(nonMacBuild.if).toBe("runner.os != 'macOS'")
    expect(dmgNotarization.if).toBe("runner.os == 'macOS'")
    expect(appleSecretConsumers).toEqual([
      'Prepare Apple signing and notarization credentials',
      'Build signed and notarized macOS bundles',
      'Notarize and staple macOS DMG',
    ])
    expect(JSON.stringify(workflow.jobs.validate)).not.toContain('secrets.APPLE_')
    expect(JSON.stringify(workflow.jobs.publish)).not.toContain('secrets.APPLE_')
    for (const name of appleNames) {
      expect(workflow.jobs.build.env).not.toHaveProperty(name)
      expect(nonMacBuild.env).not.toHaveProperty(name)
    }
    expect(Object.keys(preparation.env)).toEqual(appleNames)
    expect(Object.keys(macBuild.env)).toEqual([
      'GITHUB_TOKEN',
      'APPLE_CERTIFICATE',
      'APPLE_CERTIFICATE_PASSWORD',
      'APPLE_SIGNING_IDENTITY',
      'APPLE_API_KEY',
      'APPLE_API_ISSUER',
    ])
    expect(Object.keys(dmgNotarization.env)).toEqual(['APPLE_API_KEY', 'APPLE_API_ISSUER'])
    expect(Object.keys(nonMacBuild.env)).toEqual(['GITHUB_TOKEN'])
    expect(JSON.stringify(nonMacBuild)).not.toContain('APPLE_')
  })

  it('hard-fails missing credentials and materializes the notarization key under runner temp', async () => {
    const source = await readFile('.github/workflows/release-update.yml', 'utf8')
    const workflow = YAML.parse(source)
    const buildSteps = workflow.jobs.build.steps
    const preparationIndex = buildSteps.findIndex((step: { name?: string }) => step.name === 'Prepare Apple signing and notarization credentials')
    const macBuildIndex = buildSteps.findIndex((step: { name?: string }) => step.name === 'Build signed and notarized macOS bundles')
    const updaterGate = buildSteps.find((step: { name?: string }) => step.name === 'Require protected updater configuration')
    const preparation = buildSteps[preparationIndex]
    const cleanup = buildSteps.find((step: { name?: string }) => step.name === 'Remove temporary Apple notarization key')

    expect(updaterGate.run).toContain('TAURI_SIGNING_PRIVATE_KEY_PASSWORD is required')
    expect(macBuildIndex).toBeGreaterThan(preparationIndex)
    for (const name of Object.keys(preparation.env)) {
      expect(preparation.run).toContain(`${name} is required`)
    }
    expect(preparation.run).toContain('^[A-Za-z0-9]+$')
    expect(preparation.run).toContain('$RUNNER_TEMP/AuthKey_${APPLE_API_KEY}.p8')
    expect(preparation.run).toContain('umask 077')
    expect(preparation.run).toContain('chmod 0600')
    expect(preparation.run).toContain('APPLE_API_KEY_PATH=')
    expect(preparation.run).toContain('$GITHUB_ENV')
    expect(cleanup.if).toBe("always() && runner.os == 'macOS'")
    expect(cleanup.run).toContain('rm -f -- "$APPLE_API_KEY_PATH"')
  })

  it('verifies Developer ID signatures, Gatekeeper acceptance, and stapled tickets before upload', async () => {
    const source = await readFile('.github/workflows/release-update.yml', 'utf8')
    const workflow = YAML.parse(source)
    const buildSteps = workflow.jobs.build.steps
    const macBuildIndex = buildSteps.findIndex((step: { name?: string }) => step.name === 'Build signed and notarized macOS bundles')
    const dmgNotarizationIndex = buildSteps.findIndex((step: { name?: string }) => step.name === 'Notarize and staple macOS DMG')
    const verificationIndex = buildSteps.findIndex((step: { name?: string }) => step.name === 'Verify signed and notarized macOS bundles')
    const cleanupIndex = buildSteps.findIndex((step: { name?: string }) => step.name === 'Remove temporary Apple notarization key')
    const uploadIndex = buildSteps.findIndex((step: { uses?: string }) => step.uses?.startsWith('actions/upload-artifact@'))
    const macBuild = buildSteps[macBuildIndex]
    const dmgNotarization = buildSteps[dmgNotarizationIndex]
    const verification = buildSteps[verificationIndex]

    expect(dmgNotarization.if).toBe("runner.os == 'macOS'")
    expect(dmgNotarizationIndex).toBeGreaterThan(macBuildIndex)
    expect(verification.if).toBe("runner.os == 'macOS'")
    expect(verificationIndex).toBeGreaterThan(dmgNotarizationIndex)
    expect(cleanupIndex).toBeGreaterThan(verificationIndex)
    expect(uploadIndex).toBeGreaterThan(verificationIndex)
    expect(uploadIndex).toBeGreaterThan(cleanupIndex)
    expect(macBuild.with.args).not.toContain('--skip-stapling')
    expect(macBuild.with.args).not.toContain('--no-sign')
    expect(dmgNotarization.run).toContain('$bundle_root/dmg/')
    expect(dmgNotarization.run).toContain('xcrun notarytool submit "${dmgs[0]}"')
    expect(dmgNotarization.run).toContain('--key "$APPLE_API_KEY_PATH"')
    expect(dmgNotarization.run).toContain('--key-id "$APPLE_API_KEY"')
    expect(dmgNotarization.run).toContain('--issuer "$APPLE_API_ISSUER"')
    expect(dmgNotarization.run).toContain('--wait')
    expect(dmgNotarization.run).toContain('xcrun stapler staple "${dmgs[0]}"')
    expect(dmgNotarization.run.indexOf('xcrun stapler staple')).toBeGreaterThan(dmgNotarization.run.indexOf('xcrun notarytool submit'))
    expect(verification.run).toContain('$bundle_root/macos/')
    expect(verification.run).toContain('$bundle_root/dmg/')
    expect(verification.run.match(/codesign --verify/g)).toHaveLength(2)
    expect(verification.run).toContain('spctl --assess --type execute')
    expect(verification.run).toContain('spctl --assess --type open')
    expect(verification.run.match(/xcrun stapler validate/g)).toHaveLength(2)
  })

  it('tests a safe workspace read and launches the host-native packaged app before publishing', async () => {
    const source = await readFile('.github/workflows/release-update.yml', 'utf8')
    const workflow = YAML.parse(source)
    const buildSteps = workflow.jobs.build.steps
    const workspaceSmoke = buildSteps.find((step: { name?: string }) => step.name === 'Exercise safe local workspace bridge')
    const packageSmoke = buildSteps.find((step: { name?: string }) => step.name === 'Launch host-native packaged application')

    expect(workspaceSmoke.run).toContain('reads_authoritative_design_ir_from_cutout_manifest')
    expect(packageSmoke.if).toBe("runner.os == 'macOS'")
    expect(packageSmoke.run).toContain('scripts/smoke-packaged-macos.sh')
  })
})

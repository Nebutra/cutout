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
    expect(workflow.jobs.quality).toMatchObject({
      needs: 'validate',
      uses: './.github/workflows/ci.yml',
      with: { source_sha: '${{ needs.validate.outputs.sha }}' },
    })
    expect(workflow.jobs.build.needs).toEqual(['validate', 'quality'])
    expect(workflow.jobs.build.permissions).toEqual({ actions: 'read', contents: 'read' })
    expect(workflow.jobs.publish.needs).toEqual(['validate', 'quality', 'build'])
    expect(workflow.jobs.publish.permissions).toEqual({ contents: 'write', 'id-token': 'write', attestations: 'write' })
  })

  it('keeps matrix builders isolated from GitHub Release mutation', async () => {
    const source = await readFile('.github/workflows/release-update.yml', 'utf8')
    const workflow = YAML.parse(source)
    const buildActions = workflow.jobs.build.steps.filter((step: { uses?: string }) => step.uses?.startsWith('tauri-apps/tauri-action@'))
    const artifactUpload = workflow.jobs.build.steps.find((step: { name?: string }) => step.name === 'Upload platform release artifacts')
    const configInjection = workflow.jobs.build.steps.find((step: { name?: string }) => step.name === 'Inject updater public key into release-only Tauri config')
    const publishScript = workflow.jobs.publish.steps.at(-1).run

    expect(buildActions).toHaveLength(2)
    for (const buildAction of buildActions) {
      expect(buildAction.uses).toBe('tauri-apps/tauri-action@1deb371b0cd8bd54025b384f1cd735e725c4060f')
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

  it('pins every action and toolchain dependency to an immutable commit', async () => {
    for (const path of ['.github/workflows/ci.yml', '.github/workflows/release-update.yml']) {
      const source = await readFile(path, 'utf8')
      const uses = [...source.matchAll(/^\s*- uses:\s*([^\s#]+)/gm)].map((match) => match[1])
      expect(uses.length).toBeGreaterThan(0)
      for (const action of uses) expect(action, path).toMatch(/@[a-f0-9]{40}$/)
    }
  })

  it('keeps JavaScript actions on approved Node 24 revisions', async () => {
    const approved = new Map([
      ['actions/checkout', '3d3c42e5aac5ba805825da76410c181273ba90b1'],
      ['actions/setup-node', '820762786026740c76f36085b0efc47a31fe5020'],
      ['pnpm/action-setup', '0ebf47130e4866e96fce0953f49152a61190b271'],
      ['actions/upload-artifact', '043fb46d1a93c77aae656e7c1c64a875d1fc6a0a'],
      ['actions/download-artifact', '3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c'],
      ['actions/attest-build-provenance', '0f67c3f4856b2e3261c31976d6725780e5e4c373'],
      ['SignPath/github-action-submit-signing-request', 'b9d91eadd323de506c0c81cf0c7fe7438f3360fd'],
    ])

    const paths = ['.github/workflows/ci.yml', '.github/workflows/release-update.yml']
    const sources = await Promise.all(paths.map(async (path) => `${path}\n${await readFile(path, 'utf8')}`))
    const source = sources.join('\n')
    for (const [action, revision] of approved) {
      const references = [...source.matchAll(new RegExp(`${action}@([a-f0-9]{40})`, 'g'))]
      expect(references.length, action).toBeGreaterThan(0)
      for (const reference of references) expect(reference[1], action).toBe(revision)
    }
  })

  it('makes manual releases main-line, immutable, and policy-free', async () => {
    const source = await readFile('.github/workflows/release-update.yml', 'utf8')
    const workflow = YAML.parse(source)
    const inputs = workflow.on.workflow_dispatch.inputs
    const authority = workflow.jobs.validate.steps.find((step: { id?: string }) => step.id === 'authority')
    const generate = workflow.jobs.publish.steps.find((step: { name?: string }) => step.name === 'Generate and validate updater metadata')

    expect(Object.keys(inputs)).toEqual(['tag'])
    expect(authority.run).toContain('git merge-base --is-ancestor')
    expect(authority.run).toContain('validate-release-authority.mjs')
    expect(authority.run).toContain('Could not prove that release')
    expect(generate.run).not.toMatch(/rollout|rollback|previous-version|previous-manifest/i)
  })

  it('feeds every platform updater artifact into the manifest generator', async () => {
    const source = await readFile('.github/workflows/release-update.yml', 'utf8')
    const workflow = YAML.parse(source)
    const generateStep = workflow.jobs.publish.steps.find((step: { name?: string }) => step.name === 'Generate and validate updater metadata')

    for (const key of ['darwin-aarch64', 'darwin-x86_64', 'windows-x86_64', 'linux-x86_64']) {
      expect(generateStep.run).toContain(key)
    }
    expect(generateStep.run).toContain('windows-x86_64-*.exe')
    expect(generateStep.run).toContain('linux-x86_64-*.AppImage')
    expect(generateStep.run).toContain('--platform')
    expect(generateStep.run).toContain('--artifact-base-url')
    expect(generateStep.run).toContain('mapfile -t artifacts')
    expect(generateStep.run).toContain('Expected exactly one updater artifact for')
  })

  it('scopes updater signing secrets only to the pinned signing actions', async () => {
    const source = await readFile('.github/workflows/release-update.yml', 'utf8')
    const workflow = YAML.parse(source)
    const buildSteps = workflow.jobs.build.steps
    const publishSteps = workflow.jobs.publish.steps
    const allSteps = [...workflow.jobs.validate.steps, ...buildSteps, ...publishSteps]
    const signingSecretConsumers = allSteps
      .filter((step: { env?: Record<string, string> }) => JSON.stringify(step.env ?? {}).includes('secrets.TAURI_SIGNING_PRIVATE_KEY'))
      .map((step: { name?: string }) => step.name)
    const metadataGeneration = publishSteps.find((step: { name?: string }) => step.name === 'Generate and validate updater metadata')

    expect(workflow.jobs.build.env).not.toHaveProperty('TAURI_SIGNING_PRIVATE_KEY')
    expect(workflow.jobs.build.env).not.toHaveProperty('TAURI_SIGNING_PRIVATE_KEY_PASSWORD')
    expect(workflow.jobs.publish.env).not.toHaveProperty('TAURI_SIGNING_PRIVATE_KEY')
    expect(workflow.jobs.publish.env).not.toHaveProperty('TAURI_SIGNING_PRIVATE_KEY_PASSWORD')
    expect(signingSecretConsumers).toEqual([
      'Build signed and notarized macOS bundles',
      'Build non-macOS bundles',
      'Re-sign SignPath-signed Windows updater artifact',
    ])
    expect(metadataGeneration.env).not.toHaveProperty('TAURI_SIGNING_PRIVATE_KEY')
    expect(metadataGeneration.env).not.toHaveProperty('TAURI_SIGNING_PRIVATE_KEY_PASSWORD')
  })

  it('scopes Apple credentials to the macOS preparation, build, and DMG notarization steps', async () => {
    const source = await readFile('.github/workflows/release-update.yml', 'utf8')
    const workflow = YAML.parse(source)
    const buildSteps = workflow.jobs.build.steps
    const preparation = buildSteps.find((step: { name?: string }) => step.name === 'Prepare Apple signing and notarization credentials')
    const macBuild = buildSteps.find((step: { name?: string }) => step.name === 'Build signed and notarized macOS bundles')
    const dmgNotarization = buildSteps.find((step: { name?: string }) => step.name === 'Notarize and staple macOS DMG')
    const nonMacBuild = buildSteps.find((step: { name?: string }) => step.name === 'Build non-macOS bundles')
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
    expect(dmgNotarization.if).toBe("runner.os == 'macOS'")
    expect(nonMacBuild.if).toBe("runner.os != 'macOS'")
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
      'TAURI_SIGNING_PRIVATE_KEY',
      'TAURI_SIGNING_PRIVATE_KEY_PASSWORD',
      'APPLE_CERTIFICATE',
      'APPLE_CERTIFICATE_PASSWORD',
      'APPLE_SIGNING_IDENTITY',
      'APPLE_API_KEY',
      'APPLE_API_ISSUER',
    ])
    expect(Object.keys(nonMacBuild.env)).toEqual([
      'GITHUB_TOKEN',
      'TAURI_SIGNING_PRIVATE_KEY',
      'TAURI_SIGNING_PRIVATE_KEY_PASSWORD',
    ])
    expect(Object.keys(dmgNotarization.env)).toEqual([
      'APPLE_API_KEY',
      'APPLE_API_ISSUER',
    ])
    expect(JSON.stringify(nonMacBuild)).not.toContain('APPLE_')
  })

  it('hard-fails missing credentials and materializes the notarization key under runner temp', async () => {
    const source = await readFile('.github/workflows/release-update.yml', 'utf8')
    const workflow = YAML.parse(source)
    const buildSteps = workflow.jobs.build.steps
    const preparationIndex = buildSteps.findIndex((step: { name?: string }) => step.name === 'Prepare Apple signing and notarization credentials')
    const macBuildIndex = buildSteps.findIndex((step: { name?: string }) => step.name === 'Build signed and notarized macOS bundles')
    const updaterGate = buildSteps.find((step: { name?: string }) => step.name === 'Require protected updater public configuration')
    const preparation = buildSteps[preparationIndex]
    const cleanup = buildSteps.find((step: { name?: string }) => step.name === 'Remove temporary Apple notarization key')

    expect(updaterGate.run).toContain('CUTOUT_UPDATER_PUBKEY is required')
    expect(updaterGate.run).not.toContain('TAURI_SIGNING_PRIVATE_KEY')
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
    const uploadIndex = buildSteps.findIndex((step: { name?: string }) => step.name === 'Upload platform release artifacts')
    const macBuild = buildSteps[macBuildIndex]
    const dmgNotarization = buildSteps[dmgNotarizationIndex]
    const verification = buildSteps[verificationIndex]

    expect(verification.if).toBe("runner.os == 'macOS'")
    expect(dmgNotarizationIndex).toBeGreaterThan(macBuildIndex)
    expect(verificationIndex).toBeGreaterThan(dmgNotarizationIndex)
    expect(verificationIndex).toBeGreaterThan(macBuildIndex)
    expect(cleanupIndex).toBeGreaterThan(verificationIndex)
    expect(uploadIndex).toBeGreaterThan(verificationIndex)
    expect(uploadIndex).toBeGreaterThan(cleanupIndex)
    expect(macBuild.with.args).not.toContain('--skip-stapling')
    expect(macBuild.with.args).not.toContain('--no-sign')
    expect(dmgNotarization.run).toContain('Expected exactly one macOS DMG')
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

  it('cryptographically verifies one updater artifact per matrix entry before upload', async () => {
    const source = await readFile('.github/workflows/release-update.yml', 'utf8')
    const workflow = YAML.parse(source)
    const buildSteps = workflow.jobs.build.steps
    const verificationIndex = buildSteps.findIndex((step: { name?: string }) => step.name === 'Verify updater artifact signature')
    const uploadIndex = buildSteps.findIndex((step: { name?: string }) => step.name === 'Upload platform release artifacts')
    const verification = buildSteps[verificationIndex]

    expect(verificationIndex).toBeGreaterThan(-1)
    expect(uploadIndex).toBeGreaterThan(verificationIndex)
    expect(verification.run).toContain('*.app.tar.gz')
    expect(verification.run).toContain('*.exe')
    expect(verification.run).toContain('*.AppImage')
    expect(verification.run).toContain('Expected exactly one updater artifact')
    expect(verification.run).toContain('--bin verify-updater-signature')
    expect(verification.run).toContain('"$updater_artifact.sig"')
    expect(verification.env).not.toHaveProperty('TAURI_SIGNING_PRIVATE_KEY')
  })

  it('uses SignPath without repository-held Windows certificate material and preserves both signature layers', async () => {
    const source = await readFile('.github/workflows/release-update.yml', 'utf8')
    const artifactConfiguration = await readFile('.signpath/artifact-configurations/windows-installers.xml', 'utf8')
    const workflow = YAML.parse(source)
    const steps = workflow.jobs.build.steps
    const configuration = steps.find((step: { name?: string }) => step.name === 'Require protected SignPath configuration')
    const preparationIndex = steps.findIndex((step: { name?: string }) => step.name === 'Prepare unsigned Windows installers for SignPath')
    const unsignedUploadIndex = steps.findIndex((step: { name?: string }) => step.name === 'Upload unsigned Windows installers for SignPath')
    const signIndex = steps.findIndex((step: { name?: string }) => step.name === 'Sign Windows installers with SignPath')
    const installIndex = steps.findIndex((step: { name?: string }) => step.name === 'Install SignPath-signed Windows installers')
    const updaterSignIndex = steps.findIndex((step: { name?: string }) => step.name === 'Re-sign SignPath-signed Windows updater artifact')
    const updaterVerifyIndex = steps.findIndex((step: { name?: string }) => step.name === 'Verify updater artifact signature')
    const sign = steps[signIndex]
    const updaterSign = steps[updaterSignIndex]
    const verification = steps.find((step: { name?: string }) => step.name === 'Verify Windows Authenticode signatures')

    expect(preparationIndex).toBeGreaterThan(-1)
    expect(configuration.if).toBe("runner.os == 'Windows'")
    expect(Object.keys(configuration.env)).toEqual([
      'SIGNPATH_ORGANIZATION_ID',
      'SIGNPATH_PROJECT_SLUG',
      'SIGNPATH_SIGNING_POLICY_SLUG',
      'SIGNPATH_ARTIFACT_CONFIGURATION_SLUG',
      'SIGNPATH_WINDOWS_CERTIFICATE_THUMBPRINT',
    ])
    for (const name of Object.keys(configuration.env)) expect(configuration.run).toContain(name)
    expect(configuration.run).toContain('$name is required')
    expect(configuration.run).not.toContain('SIGNPATH_API_TOKEN')
    expect(unsignedUploadIndex).toBeGreaterThan(preparationIndex)
    expect(signIndex).toBeGreaterThan(unsignedUploadIndex)
    expect(installIndex).toBeGreaterThan(signIndex)
    expect(updaterSignIndex).toBeGreaterThan(installIndex)
    expect(updaterVerifyIndex).toBeGreaterThan(updaterSignIndex)
    expect(sign.uses).toBe('SignPath/github-action-submit-signing-request@b9d91eadd323de506c0c81cf0c7fe7438f3360fd')
    expect(sign.with).toMatchObject({
      'api-token': '${{ secrets.SIGNPATH_API_TOKEN }}',
      'organization-id': '${{ vars.SIGNPATH_ORGANIZATION_ID }}',
      'project-slug': '${{ vars.SIGNPATH_PROJECT_SLUG }}',
      'signing-policy-slug': '${{ vars.SIGNPATH_SIGNING_POLICY_SLUG }}',
      'artifact-configuration-slug': '${{ vars.SIGNPATH_ARTIFACT_CONFIGURATION_SLUG }}',
      'wait-for-completion': true,
    })
    expect(source).not.toContain('WINDOWS_CERTIFICATE_PASSWORD')
    expect(source).not.toContain('secrets.WINDOWS_CERTIFICATE')
    expect(artifactConfiguration).toContain('<pe-file path="Cutout-setup.exe">')
    expect(artifactConfiguration).toContain('<msi-file path="Cutout.msi">')
    expect(artifactConfiguration.match(/<authenticode-sign \/>/g)).toHaveLength(2)
    expect(updaterSign.env).toEqual({
      BUNDLE_ROOT: 'src-tauri/target/${{ matrix.target }}/release/bundle',
      TAURI_SIGNING_PRIVATE_KEY: '${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}',
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD: '${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}',
    })
    expect(updaterSign.run).toContain('pnpm tauri signer sign')
    expect(updaterSign.run).toContain('signature sidecar was not regenerated')
    expect(verification.run).toContain('Get-AuthenticodeSignature')
    expect(verification.run).toContain("Status -ne 'Valid'")
    expect(verification.run).toContain('SignerCertificate.Thumbprint')
    expect(verification.run).toContain('SIGNPATH_WINDOWS_CERTIFICATE_THUMBPRINT')
    expect(verification.run).toContain('1.3.6.1.5.5.7.3.3')
    expect(verification.run).toContain('TimeStamperCertificate')
  })

  it('attests the complete release asset set before the single publisher runs', async () => {
    const source = await readFile('.github/workflows/release-update.yml', 'utf8')
    const workflow = YAML.parse(source)
    const steps = workflow.jobs.publish.steps
    const checksumIndex = steps.findIndex((step: { name?: string }) => step.name === 'Generate and validate updater metadata')
    const attestationIndex = steps.findIndex((step: { name?: string }) => step.name === 'Attest release assets')
    const publishIndex = steps.findIndex((step: { name?: string }) => step.name === 'Create draft release, upload verified assets, and publish')

    expect(steps[attestationIndex].uses).toMatch(/^actions\/attest-build-provenance@[a-f0-9]{40}$/)
    expect(steps[attestationIndex].with['subject-path']).toBe('dist/release-assets/*')
    expect(attestationIndex).toBeGreaterThan(checksumIndex)
    expect(publishIndex).toBeGreaterThan(attestationIndex)
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

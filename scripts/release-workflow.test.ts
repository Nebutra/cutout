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
    const buildAction = workflow.jobs.build.steps.find((step: { uses?: string }) => step.uses?.startsWith('tauri-apps/tauri-action@'))
    const configInjection = workflow.jobs.build.steps.find((step: { name?: string }) => step.name === 'Inject updater public key into release-only Tauri config')
    const publishScript = workflow.jobs.publish.steps.at(-1).run

    expect(buildAction.with).toMatchObject({
      uploadUpdaterJson: false,
      uploadWorkflowArtifacts: true,
      workflowArtifactNamePattern: '${{ matrix.artifact }}',
    })
    expect(buildAction.with).not.toHaveProperty('tagName')
    expect(buildAction.with).not.toHaveProperty('releaseId')
    expect(configInjection.run).toBe('node scripts/prepare-tauri-release-config.mjs')
    expect(buildAction.with.args).toContain('--config src-tauri/tauri.release.conf.json')
    expect(workflow.jobs.build.env.CUTOUT_UPDATER_STABLE_ENDPOINTS).toContain('releases/latest/download/latest.json')
    expect(workflow.jobs.build.env.CUTOUT_UPDATER_ALLOWED_HOSTS).toContain('github.com')
    expect(publishScript).toContain('gh release create')
    expect(publishScript).toContain('--draft')
    expect(publishScript).toContain('gh release edit')
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

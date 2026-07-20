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
    const publishScript = workflow.jobs.publish.steps.at(-1).run

    expect(buildAction.with).toMatchObject({
      uploadUpdaterJson: false,
      uploadWorkflowArtifacts: true,
      workflowArtifactNamePattern: '${{ matrix.artifact }}',
    })
    expect(buildAction.with).not.toHaveProperty('tagName')
    expect(buildAction.with).not.toHaveProperty('releaseId')
    expect(workflow.jobs.build.env.CUTOUT_UPDATER_STABLE_ENDPOINTS).toContain('releases/latest/download/latest.json')
    expect(workflow.jobs.build.env.CUTOUT_UPDATER_ALLOWED_HOSTS).toContain('github.com')
    expect(publishScript).toContain('gh release create')
    expect(publishScript).toContain('--draft')
    expect(publishScript).toContain('gh release edit')
  })
})

import { describe, expect, it, vi } from 'vitest'
import { migrateLegacySlicesToAssetProduction } from './migration'

const legacy = (id: string, patch: Record<string, unknown> = {}) => ({
  id,
  name: `${id}.png`,
  blob: new Blob([id], { type: 'image/png' }),
  width: 20,
  height: 30,
  box: { x: 1, y: 2, width: 20, height: 30 },
  ...patch,
})

describe('legacy asset production migration', () => {
  it('is deterministic, honest about missing evidence, and remains consumable', async () => {
    const input = {
      projectId: 'project:1',
      projectRevisionId: 'revision:legacy',
      slices: [legacy('slice:one', {
        pageId: 'home', regionId: 'hero', assetManifestItemId: 'asset:hero',
      })],
      createdAt: 10,
    }
    const first = await migrateLegacySlicesToAssetProduction(input)
    const second = await migrateLegacySlicesToAssetProduction(input)
    const run = Object.values(first.runs)[0]!
    const task = Object.values(run.tasks)[0]!

    expect(second).toEqual(first)
    expect(run.status).toBe('completed')
    expect(task).toMatchObject({
      status: 'legacy-ready',
      origin: 'legacy-imported',
      issues: [{ code: 'legacy-unverified', kind: 'warning' }],
    })
    expect(task.output?.artifactId).toMatch(/^artifact:sha256:[a-f0-9]{64}$/)
    expect(task.decision).toBeUndefined()
  })

  it('writes legacy bytes through the supplied content-addressed boundary', async () => {
    const writeArtifact = vi.fn().mockResolvedValue(`artifact:sha256:${'a'.repeat(64)}`)
    const snapshot = await migrateLegacySlicesToAssetProduction({
      projectId: 'project:1', projectRevisionId: 'revision:legacy',
      slices: [legacy('slice:one')], createdAt: 10, writeArtifact,
    })
    expect(writeArtifact).toHaveBeenCalledWith(expect.objectContaining({
      mediaType: 'image/png', runId: expect.stringMatching(/^legacy-run:/),
    }))
    expect(Object.values(Object.values(snapshot.runs)[0]!.tasks)[0]?.output?.artifactId)
      .toBe(`artifact:sha256:${'a'.repeat(64)}`)
  })

  it('leaves an empty project without invented plans or runs', async () => {
    const snapshot = await migrateLegacySlicesToAssetProduction({
      projectId: 'empty', projectRevisionId: 'revision:empty', slices: [], createdAt: 1,
    })
    expect(snapshot.plans).toEqual({})
    expect(snapshot.runs).toEqual({})
  })
})


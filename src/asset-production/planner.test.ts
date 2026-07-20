import { describe, expect, it } from 'vitest'
import { compileAssetProductionPlan } from './planner'

const sourceRevision = {
  projectRevisionId: 'revision:1',
  designSystemArtifactId: 'artifact:design',
  pageArtifacts: [{
    pageId: 'home',
    artifactId: 'artifact:home',
    sha256: 'a'.repeat(64),
  }],
}

describe('asset production planner', () => {
  it('creates stable identities independent of input order and creation time', async () => {
    const items = [
      { manifestItemId: 'asset:hero', pageId: 'home', regionId: 'hero', route: 'direct-generate' as const },
      { manifestItemId: 'asset:icon', pageId: 'home', regionId: 'tools', route: 'board-cutout' as const },
      { manifestItemId: 'asset:code-ui', pageId: 'home', regionId: 'nav', route: 'ignore-code-ui' as const },
    ]
    const first = await compileAssetProductionPlan({ sourceRevision, items, createdAt: 10 })
    const second = await compileAssetProductionPlan({ sourceRevision, items: [...items].reverse(), createdAt: 20 })

    expect(second.planHash).toBe(first.planHash)
    expect(second.planId).toBe(first.planId)
    expect(second.tasks.map((task) => task.taskId)).toEqual(first.tasks.map((task) => task.taskId))
    expect(first.ignoredManifestItemIds).toEqual(['asset:code-ui'])
    expect(first.tasks.find((task) => task.manifestItemId === 'asset:hero')).toMatchObject({
      route: 'direct-generate',
      boardGroupId: undefined,
    })
  })

  it('keeps numbered board slots in natural order beyond nine assets', async () => {
    const plan = await compileAssetProductionPlan({
      sourceRevision: { projectRevisionId: 'revision:1', pageArtifacts: [] },
      items: Array.from({ length: 12 }, (_, index) => ({
        manifestItemId: `home-icons-${index + 1}`,
        pageId: 'home',
        regionId: 'icons',
        route: 'board-cutout' as const,
      })),
      createdAt: 1,
    })
    const taskById = new Map(plan.tasks.map((task) => [task.taskId, task]))
    expect(plan.boardLayouts[0]?.taskIds.map(
      (taskId) => taskById.get(taskId)?.manifestItemId,
    )).toEqual(Array.from({ length: 12 }, (_, index) => `home-icons-${index + 1}`))
  })

  it('creates a complete deterministic slot manifest for board tasks', async () => {
    const plan = await compileAssetProductionPlan({
      sourceRevision,
      items: [
        { manifestItemId: 'asset:one', pageId: 'home', regionId: 'grid', route: 'board-cutout' },
        { manifestItemId: 'asset:two', pageId: 'home', regionId: 'grid', route: 'board-cutout' },
      ],
      createdAt: 10,
    })

    expect(plan.boardLayouts).toHaveLength(1)
    expect(plan.boardLayouts[0]?.slots.map((slot) => slot.taskId)).toEqual(
      plan.boardLayouts[0]?.taskIds,
    )
    expect(plan.tasks.every((task) => task.boardGroupId === plan.boardLayouts[0]?.boardGroupId)).toBe(true)
  })

  it('rejects duplicate manifest identity instead of assigning by position', async () => {
    await expect(compileAssetProductionPlan({
      sourceRevision,
      items: [
        { manifestItemId: 'asset:one', pageId: 'home', regionId: 'a', route: 'board-cutout' },
        { manifestItemId: 'asset:one', pageId: 'home', regionId: 'b', route: 'direct-generate' },
      ],
    })).rejects.toThrow('Duplicate asset manifest item')
  })
})

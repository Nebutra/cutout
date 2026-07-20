import { describe, expect, it } from 'vitest'
import { compileAssetProductionPlan } from '../planner'
import { assignBoardCandidates } from './board'

const artifact = (id: string) => ({
  artifactId: `artifact:${id}`,
  sha256: id.repeat(64).slice(0, 64),
  mediaType: 'image/png',
  width: 40,
  height: 40,
})

async function boardPlan() {
  return compileAssetProductionPlan({
    sourceRevision: { projectRevisionId: 'revision:1', pageArtifacts: [] },
    items: [
      { manifestItemId: 'asset:left', pageId: 'home', regionId: 'icons', route: 'board-cutout' },
      { manifestItemId: 'asset:right', pageId: 'home', regionId: 'icons', route: 'board-cutout' },
    ],
    createdAt: 1,
  })
}

describe('board asset executor', () => {
  it('binds candidates by declared spatial slot instead of candidate array order', async () => {
    const plan = await boardPlan()
    const layout = plan.boardLayouts[0]!
    const assignment = assignBoardCandidates(layout, {
      width: 200,
      height: 100,
      candidates: [
        { box: { x: 125, y: 20, width: 40, height: 40 }, artifact: artifact('b') },
        { box: { x: 25, y: 20, width: 40, height: 40 }, artifact: artifact('a') },
      ],
    }, 10)
    expect(assignment.issues).toEqual([])
    expect(assignment.byTaskId.get(layout.slots[0]!.taskId)?.artifact.artifactId).toBe('artifact:a')
    expect(assignment.byTaskId.get(layout.slots[1]!.taskId)?.artifact.artifactId).toBe('artifact:b')
  })

  it('fails closed on ambiguous, empty, or cross-slot candidates', async () => {
    const plan = await boardPlan()
    const layout = plan.boardLayouts[0]!
    const assignment = assignBoardCandidates(layout, {
      width: 200,
      height: 100,
      candidates: [
        { box: { x: 20, y: 10, width: 20, height: 20 }, artifact: artifact('a') },
        { box: { x: 50, y: 10, width: 20, height: 20 }, artifact: artifact('b') },
        { box: { x: 90, y: 10, width: 30, height: 20 }, artifact: artifact('c') },
      ],
    }, 10)
    expect(assignment.byTaskId.size).toBe(0)
    expect(assignment.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'board-slot-ambiguous',
      'board-slot-empty',
      'board-candidate-crosses-slot',
    ]))
    expect(assignment.issues.every((issue) => issue.kind === 'integrity' && !issue.waivable)).toBe(true)
  })
})

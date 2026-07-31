import { describe, expect, it } from 'vitest'
import { compileAssetProductionPlan } from '../planner'
import { assignBoardCandidates, isBoardCandidateMergeRequest } from './board'

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

async function singleSlotBoardPlan() {
  return compileAssetProductionPlan({
    sourceRevision: { projectRevisionId: 'revision:1', pageArtifacts: [] },
    items: [
      { manifestItemId: 'asset:hero', pageId: 'home', regionId: 'hero', route: 'board-cutout' },
    ],
    createdAt: 1,
  })
}

describe('board asset executor', () => {
  it('fails a single-slot board when slicing produces no candidates', async () => {
    const plan = await singleSlotBoardPlan()
    const layout = plan.boardLayouts[0]!
    const assignment = assignBoardCandidates(layout, {
      width: 200,
      height: 100,
      candidates: [],
    }, 10)

    expect(assignment.byTaskId.size).toBe(0)
    expect(assignment.issues).toMatchObject([{
      code: 'board-slot-empty',
      kind: 'integrity',
      waivable: false,
    }])
  })

  it('keeps one single-slot candidate unchanged', async () => {
    const plan = await singleSlotBoardPlan()
    const layout = plan.boardLayouts[0]!
    const candidate = {
      box: { x: 25, y: 20, width: 40, height: 40 },
      artifact: artifact('a'),
    }
    const assignment = assignBoardCandidates(layout, {
      width: 200,
      height: 100,
      candidates: [candidate],
    }, 10)

    expect(assignment.issues).toEqual([])
    expect(assignment.byTaskId.get(layout.slots[0]!.taskId)).toBe(candidate)
  })

  it('represents multiple single-slot foregrounds as one spatial merge request', async () => {
    const plan = await singleSlotBoardPlan()
    const layout = plan.boardLayouts[0]!
    const first = {
      box: { x: 25, y: 30, width: 40, height: 20 },
      artifact: artifact('a'),
    }
    const second = {
      box: { x: 90, y: 10, width: 30, height: 35 },
      artifact: artifact('b'),
    }
    const assignment = assignBoardCandidates(layout, {
      width: 200,
      height: 100,
      candidates: [first, second],
    }, 10)
    const input = assignment.byTaskId.get(layout.slots[0]!.taskId)

    expect(assignment.issues).toEqual([])
    expect(input && isBoardCandidateMergeRequest(input)).toBe(true)
    if (!input || !isBoardCandidateMergeRequest(input)) return
    expect(input.box).toEqual({ x: 25, y: 10, width: 95, height: 40 })
    expect(input.placements).toEqual([
      { candidate: first, offset: { x: 0, y: 20 } },
      { candidate: second, offset: { x: 65, y: 0 } },
    ])
  })

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
    const left = assignment.byTaskId.get(layout.slots[0]!.taskId)
    const right = assignment.byTaskId.get(layout.slots[1]!.taskId)
    expect(left && isBoardCandidateMergeRequest(left)).toBe(false)
    expect(right && isBoardCandidateMergeRequest(right)).toBe(false)
    if (!left || !right || isBoardCandidateMergeRequest(left) || isBoardCandidateMergeRequest(right)) return
    expect(left.artifact.artifactId).toBe('artifact:a')
    expect(right.artifact.artifactId).toBe('artifact:b')
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

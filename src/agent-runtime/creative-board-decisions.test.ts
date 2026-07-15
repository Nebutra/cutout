import { describe, expect, it } from 'vitest'
import { decideVariant, emptyCreativeBoard, requestMoreLikeThis, updateCreativeBranch } from './creative-board-decisions'
describe('Creative Board decisions', () => {
  it('records one current decision per real material and locks references independently', () => {
    const first = decideVariant(emptyCreativeBoard(), { materialId: 'page:a', version: 'v1', decision: 'favorite', referenceGroup: 'launch', referenceLocked: true }, 1)
    const second = decideVariant(first, { materialId: 'page:a', version: 'v1', decision: 'rejected', referenceGroup: 'launch', referenceLocked: false }, 2)
    expect(second.decisions).toEqual([{ materialId: 'page:a', version: 'v1', decision: 'rejected', referenceGroup: 'launch', referenceLocked: false, updatedAt: 2 }])
  })
  it('returns a completed branch to the board with its real result material id', () => {
    const requested = requestMoreLikeThis(emptyCreativeBoard(), { materialId: 'page:a', version: 'v7' }, 4)
    const completed = updateCreativeBranch(requested, requested.branches[0]!.id, { status: 'completed', resultMaterialId: 'page:a.variant:1' })
    expect(completed.branches[0]).toMatchObject({ status: 'completed', resultMaterialId: 'page:a.variant:1' })
  })
  it('creates only a requested branch bound to the source revision', () => {
    const state = requestMoreLikeThis(emptyCreativeBoard(), { materialId: 'page:a', version: 'v7' }, 4)
    expect(state.branches).toEqual([{ id: 'branch:page:a:v7:4', baseMaterialId: 'page:a', baseVersion: 'v7', status: 'requested', instruction: 'more-like-this', createdAt: 4 }])
  })
})

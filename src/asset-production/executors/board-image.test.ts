import { describe, expect, it, vi } from 'vitest'
import type { ProductionArtifactRef } from '../contracts'
import type { BoardCandidate, BoardCandidateMergeRequest } from './board'
import { renderBoardCandidateMerge } from './board-image'

const artifact = (id: string): ProductionArtifactRef => ({
  artifactId: `artifact:${id}`,
  sha256: id.repeat(64).slice(0, 64),
  mediaType: 'image/png',
  width: 10,
  height: 10,
})

const candidate = (id: string, x: number, y: number): BoardCandidate => ({
  box: { x, y, width: 10, height: 10 },
  artifact: artifact(id),
})

describe('board candidate image merge', () => {
  it('renders every crop at its union-relative offset and closes decoded images', async () => {
    const first = candidate('a', 20, 30)
    const second = candidate('b', 45, 10)
    const request: BoardCandidateMergeRequest = {
      kind: 'merge',
      box: { x: 20, y: 10, width: 35, height: 30 },
      placements: [
        { candidate: first, offset: { x: 0, y: 20 } },
        { candidate: second, offset: { x: 25, y: 0 } },
      ],
    }
    const close = vi.fn()
    const draw = vi.fn()
    const encoded = new Blob([Uint8Array.of(9)], { type: 'image/png' })
    const merged = await renderBoardCandidateMerge(request, [
      { candidate: first, slice: slice('first') },
      { candidate: second, slice: slice('second') },
    ], {
      decode: async () => ({ width: 10, height: 10, close }),
      createSurface: (width, height) => {
        expect({ width, height }).toEqual({ width: 35, height: 30 })
        return { draw, encode: async () => encoded }
      },
    })

    expect(draw.mock.calls.map((call) => call.slice(1))).toEqual([[0, 20], [25, 0]])
    expect(close).toHaveBeenCalledTimes(2)
    expect(merged).toMatchObject({
      id: 'first',
      box: request.box,
      width: 35,
      height: 30,
      blob: encoded,
    })
  })

  it('fails closed when a declared component has no crop source', async () => {
    const first = candidate('a', 0, 0)
    const second = candidate('b', 20, 0)
    const request: BoardCandidateMergeRequest = {
      kind: 'merge',
      box: { x: 0, y: 0, width: 30, height: 10 },
      placements: [
        { candidate: first, offset: { x: 0, y: 0 } },
        { candidate: second, offset: { x: 20, y: 0 } },
      ],
    }

    await expect(renderBoardCandidateMerge(request, [
      { candidate: first, slice: slice('first') },
    ], {
      decode: async () => ({ width: 10, height: 10, close() {} }),
      createSurface: () => ({ draw() {}, encode: async () => new Blob() }),
    })).rejects.toThrow('source is unavailable')
  })

  it('fails closed when decoded pixels do not match the persisted crop bounds', async () => {
    const first = candidate('a', 0, 0)
    const second = candidate('b', 20, 0)
    const request: BoardCandidateMergeRequest = {
      kind: 'merge',
      box: { x: 0, y: 0, width: 30, height: 10 },
      placements: [
        { candidate: first, offset: { x: 0, y: 0 } },
        { candidate: second, offset: { x: 20, y: 0 } },
      ],
    }
    const close = vi.fn()

    await expect(renderBoardCandidateMerge(request, [
      { candidate: first, slice: slice('first') },
      { candidate: second, slice: slice('second') },
    ], {
      decode: async () => ({ width: 11, height: 10, close }),
      createSurface: () => ({
        draw() {},
        encode: async () => new Blob([Uint8Array.of(1)], { type: 'image/png' }),
      }),
    })).rejects.toThrow('decoded crop dimensions changed')
    expect(close).toHaveBeenCalledOnce()
  })

  it('fails closed when the compositor cannot encode a non-empty PNG', async () => {
    const first = candidate('a', 0, 0)
    const second = candidate('b', 20, 0)
    const request: BoardCandidateMergeRequest = {
      kind: 'merge',
      box: { x: 0, y: 0, width: 30, height: 10 },
      placements: [
        { candidate: first, offset: { x: 0, y: 0 } },
        { candidate: second, offset: { x: 20, y: 0 } },
      ],
    }

    await expect(renderBoardCandidateMerge(request, [
      { candidate: first, slice: slice('first') },
      { candidate: second, slice: slice('second') },
    ], {
      decode: async () => ({ width: 10, height: 10, close() {} }),
      createSurface: () => ({ draw() {}, encode: async () => new Blob() }),
    })).rejects.toThrow('merged PNG is invalid')
  })
})

function slice(id: string) {
  return {
    id,
    index: 0,
    box: { x: 0, y: 0, width: 10, height: 10 },
    blob: new Blob([Uint8Array.of(1)], { type: 'image/png' }),
    width: 10,
    height: 10,
    regionId: 'region',
    pageId: 'page',
  }
}

import { describe, it, expect } from 'vitest'
import { composeFromLibrary, MAX_COMPOSE_ASSETS } from './library-compose'
import type { GenerateInput, GeneratedAsset, GenerationService } from './types'
import type { AssetRepository, Result } from '@/services/types'
import { err, ok } from '@/services/types'

const pngBlob = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })

const oneAsset = (): GeneratedAsset[] => [
  { mediaType: 'image/png', bytes: new Uint8Array([9]) },
]

/** A `load` that resolves ids present in `map`, errors otherwise. */
function fakeLoad(map: Record<string, Blob>): AssetRepository['load'] {
  return async (id): Promise<Result<Blob>> =>
    map[id] ? ok<Blob>(map[id]) : err<Blob>(`missing ${id}`)
}

/** Records every generateImages call so we can assert the request shape. */
function recordingGeneration() {
  const calls: GenerateInput[] = []
  const generation: Pick<GenerationService, 'generateImages'> = {
    generateImages: async (input) => {
      calls.push(input)
      return ok<GeneratedAsset[]>(oneAsset())
    },
  }
  return { calls, generation }
}

const imageParts = (input: GenerateInput) =>
  (input.input ?? []).filter((p) => p.type === 'image')

describe('composeFromLibrary', () => {
  it('feeds brief + one image part per asset to ui-mockup-composition', async () => {
    const { calls, generation } = recordingGeneration()
    const load = fakeLoad({ a: pngBlob(), b: pngBlob() })

    const res = await composeFromLibrary(
      { generation, load },
      { providerId: 'p', model: 'm', assetIds: ['a', 'b'], brief: 'a login screen' },
    )

    expect(res.ok).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0].promptRef).toEqual({ id: 'ui-mockup-composition' })
    expect(calls[0].providerId).toBe('p')
    expect(calls[0].model).toBe('m')
    expect(calls[0].input?.[0]).toEqual({ type: 'text', text: 'a login screen' })
    expect(imageParts(calls[0])).toHaveLength(2)
  })

  it('omits the text part when no brief is given', async () => {
    const { calls, generation } = recordingGeneration()
    const res = await composeFromLibrary(
      { generation, load: fakeLoad({ a: pngBlob() }) },
      { providerId: 'p', model: 'm', assetIds: ['a'] },
    )
    expect(res.ok).toBe(true)
    expect((calls[0].input ?? []).every((p) => p.type === 'image')).toBe(true)
  })

  it('errors on an empty selection without calling the model', async () => {
    let called = false
    const generation: Pick<GenerationService, 'generateImages'> = {
      generateImages: async () => {
        called = true
        return ok<GeneratedAsset[]>(oneAsset())
      },
    }
    const res = await composeFromLibrary(
      { generation, load: fakeLoad({}) },
      { providerId: 'p', model: 'm', assetIds: [] },
    )
    expect(res.ok).toBe(false)
    expect(called).toBe(false)
  })

  it('propagates a load failure', async () => {
    const { generation } = recordingGeneration()
    const res = await composeFromLibrary(
      { generation, load: fakeLoad({}) },
      { providerId: 'p', model: 'm', assetIds: ['missing'] },
    )
    expect(res.ok).toBe(false)
  })

  it('caps the request at MAX_COMPOSE_ASSETS images', async () => {
    const { calls, generation } = recordingGeneration()
    const map: Record<string, Blob> = {}
    const ids: string[] = []
    for (let i = 0; i < MAX_COMPOSE_ASSETS + 5; i += 1) {
      const id = `id${i}`
      map[id] = pngBlob()
      ids.push(id)
    }

    const res = await composeFromLibrary(
      { generation, load: fakeLoad(map) },
      { providerId: 'p', model: 'm', assetIds: ids },
    )

    expect(res.ok).toBe(true)
    expect(imageParts(calls[0])).toHaveLength(MAX_COMPOSE_ASSETS)
  })
})

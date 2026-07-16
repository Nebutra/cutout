import { describe, it, expect, vi } from 'vitest'
import { nameSlices, sliceNamesSchema } from './naming'
import { ok, err, type Result } from '@/services/types'
import type { GenerateInput, GenerationService } from './types'
import type { Box } from '@/algorithm/types'

const box = (x: number): Box => ({ x, y: 0, width: 10, height: 10 })

/** The structured-output shape the naming call resolves. */
type NamesResult = Result<{ names: { index: number; name: string }[] }>

/** A typed stand-in for `generateObject` so `.mock.calls` keeps its arg types. */
type GenObjectFn = (input: GenerateInput, schema: unknown) => Promise<NamesResult>

/** A GenerationService whose only exercised method is `generateObject`. */
function fakeGeneration(generateObject: unknown): GenerationService {
  return {
    generateText: vi.fn(),
    streamText: vi.fn(),
    generateImages: vi.fn(),
    generateObject,
  } as unknown as GenerationService
}

describe('nameSlices', () => {
  it('short-circuits with an empty list when there are no slices', async () => {
    const generateObject = vi.fn<GenObjectFn>()
    const gen = fakeGeneration(generateObject)
    const result = await nameSlices(gen, {
      providerId: 'p',
      model: 'm',
      imageBytes: new Uint8Array([1]),
      slices: [],
    })
    expect(result).toEqual(ok([]))
    expect(generateObject).not.toHaveBeenCalled()
  })

  it('sends the board image + boxes and maps names back to their indices', async () => {
    const generateObject = vi.fn<GenObjectFn>().mockResolvedValue(
      ok({
        names: [
          { index: 1, name: 'search-icon' },
          { index: 0, name: 'primary-button' },
        ],
      }),
    )
    const gen = fakeGeneration(generateObject)
    const bytes = new Uint8Array([9, 9, 9])
    const result = await nameSlices(gen, {
      providerId: 'p',
      model: 'm',
      imageBytes: bytes,
      slices: [
        { index: 0, box: box(0) },
        { index: 1, box: box(20) },
      ],
    })
    expect(result).toEqual(
      ok([
        { index: 1, name: 'search-icon' },
        { index: 0, name: 'primary-button' },
      ]),
    )
    // The call carries the promptRef, the image part and a JSON boxes text part.
    const [input, schema] = generateObject.mock.calls[0]
    expect(input.promptRef).toEqual({ id: 'ui-slice-naming' })
    expect(input.input?.[0]).toEqual({ type: 'image', image: bytes })
    const second = input.input?.[1]
    expect(second?.type === 'text' && second.text).toContain('"index":1')
    expect(schema).toBe(sliceNamesSchema)
  })

  it('drops indices the model made up or repeated', async () => {
    const generateObject = vi.fn<GenObjectFn>().mockResolvedValue(
      ok({
        names: [
          { index: 0, name: 'a' },
          { index: 0, name: 'dup' },
          { index: 5, name: 'phantom' },
        ],
      }),
    )
    const gen = fakeGeneration(generateObject)
    const result = await nameSlices(gen, {
      providerId: 'p',
      model: 'm',
      imageBytes: new Uint8Array([1]),
      slices: [{ index: 0, box: box(0) }],
    })
    expect(result).toEqual(ok([{ index: 0, name: 'a' }]))
  })

  it('propagates a generation failure', async () => {
    const generateObject = vi.fn<GenObjectFn>().mockResolvedValue(err('boom'))
    const gen = fakeGeneration(generateObject)
    const result = await nameSlices(gen, {
      providerId: 'p',
      model: 'm',
      imageBytes: new Uint8Array([1]),
      slices: [{ index: 0, box: box(0) }],
    })
    expect(result).toEqual(err('boom'))
  })

  it('retries a transient upstream failure and succeeds', async () => {
    const generateObject = vi
      .fn<GenObjectFn>()
      .mockResolvedValueOnce(err('Upstream request failed'))
      .mockResolvedValueOnce(ok({ names: [{ index: 0, name: 'primary-button' }] }))
    const gen = fakeGeneration(generateObject)
    const result = await nameSlices(gen, {
      providerId: 'p',
      model: 'm',
      imageBytes: new Uint8Array([1]),
      slices: [{ index: 0, box: box(0) }],
    })
    expect(result).toEqual(ok([{ index: 0, name: 'primary-button' }]))
    expect(generateObject).toHaveBeenCalledTimes(2)
  })

  it('gives up after retrying a persistent transient failure (3 attempts)', async () => {
    const generateObject = vi
      .fn<GenObjectFn>()
      .mockResolvedValue(err('Upstream request failed'))
    const gen = fakeGeneration(generateObject)
    const result = await nameSlices(gen, {
      providerId: 'p',
      model: 'm',
      imageBytes: new Uint8Array([1]),
      slices: [{ index: 0, box: box(0) }],
    })
    expect(result).toEqual(err('Upstream request failed'))
    expect(generateObject).toHaveBeenCalledTimes(3)
  })

  it('does not retry a non-transient failure', async () => {
    const generateObject = vi.fn<GenObjectFn>().mockResolvedValue(err('invalid schema'))
    const gen = fakeGeneration(generateObject)
    await nameSlices(gen, {
      providerId: 'p',
      model: 'm',
      imageBytes: new Uint8Array([1]),
      slices: [{ index: 0, box: box(0) }],
    })
    expect(generateObject).toHaveBeenCalledTimes(1)
  })

  it('errors when the model returns no usable names', async () => {
    const generateObject = vi
      .fn<GenObjectFn>()
      .mockResolvedValue(ok({ names: [] }))
    const gen = fakeGeneration(generateObject)
    const result = await nameSlices(gen, {
      providerId: 'p',
      model: 'm',
      imageBytes: new Uint8Array([1]),
      slices: [{ index: 0, box: box(0) }],
    })
    expect(result.ok).toBe(false)
  })
})

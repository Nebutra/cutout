import { describe, expect, it, vi } from 'vitest'
import { collectBoundedGeneratedText } from './bounded-text-generation'

describe('collectBoundedGeneratedText', () => {
  it('bounds the stream and does not start a second full request after the deadline', async () => {
    vi.useFakeTimers()
    try {
      const generate = vi.fn(async () => ({ ok: true as const, data: 'late fallback' }))
      const resultPromise = collectBoundedGeneratedText({
        parentSignal: new AbortController().signal,
        timeoutMs: 100,
        stream: async function* (signal) {
          await new Promise<void>((_, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason), { once: true })
          })
          yield 'unreachable'
        },
        generate,
      })

      await vi.advanceTimersByTimeAsync(100)
      await expect(resultPromise).resolves.toEqual({ text: null, failure: 'deadline' })
      expect(generate).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('uses one buffered fallback within the same deadline after an immediate stream error', async () => {
    const result = await collectBoundedGeneratedText({
      parentSignal: new AbortController().signal,
      timeoutMs: 1_000,
      stream: () => ({
        [Symbol.asyncIterator]: () => ({
          next: async (): Promise<IteratorResult<string>> => {
            throw new Error('streaming unsupported')
          },
        }),
      }),
      generate: async () => ({ ok: true, data: 'bounded fallback' }),
    })

    expect(result).toEqual({ text: 'bounded fallback', failure: null })
  })

  it('propagates cancellation from the owning run', async () => {
    const parent = new AbortController()
    const resultPromise = collectBoundedGeneratedText({
      parentSignal: parent.signal,
      timeoutMs: 10_000,
      stream: async function* (signal) {
        await new Promise<void>((_, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        })
        yield 'unreachable'
      },
      generate: async () => ({ ok: true, data: 'unreachable' }),
    })
    parent.abort(new DOMException('Stopped by owner.', 'AbortError'))

    await expect(resultPromise).rejects.toMatchObject({ name: 'AbortError' })
  })
})

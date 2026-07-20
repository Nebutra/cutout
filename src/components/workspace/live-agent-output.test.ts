import { describe, expect, it, vi } from 'vitest'
import { createLiveTextBatcher } from './live-agent-output'

describe('createLiveTextBatcher', () => {
  it('preserves long streamed output exactly and batches visible updates', () => {
    const published: string[] = []
    const frames: FrameRequestCallback[] = []
    const batcher = createLiveTextBatcher((text) => published.push(text), (callback) => (frames.push(callback), frames.length), vi.fn())
    const expected = '# Beginning\n\n' + 'content '.repeat(300) + '\n\nEnd.'
    batcher.append('# Beginning\n\n')
    batcher.append('content '.repeat(300))
    batcher.append('\n\nEnd.')
    expect(published).toEqual([])
    expect(frames).toHaveLength(1)
    frames[0](0)
    expect(published).toEqual([expected])
    expect(published[0].length).toBeGreaterThan(1400)
  })

  it('keeps partial markdown prefixes intact until the final flush', () => {
    const published: string[] = []
    const batcher = createLiveTextBatcher((text) => published.push(text), () => 1, vi.fn())
    for (const delta of ['#', '# Heading\n', '- fir', 'st\n```t', 's\nconst x = 1\n', '```']) {
      expect(() => batcher.append(delta)).not.toThrow()
    }
    const expected = '## Heading\n- first\n```ts\nconst x = 1\n```'
    expect(batcher.flush()).toBe(expected)
    expect(published.at(-1)).toBe(expected)
  })
})

import { describe, expect, it } from 'vitest'
import { recognizeGameAssetIntent } from './intent'

describe('Game Asset intent recognition', () => {
  it('extracts a natural-language sprite action without a model call', () => {
    expect(recognizeGameAssetIntent('给这个角色做 6 帧向右跑步素材')).toMatchObject({
      reason: 'compound-domain-intent',
      intent: {
        kind: 'player',
        view: 'side',
        action: 'run',
        direction: 'right',
        frameCount: 6,
      },
    })
  })

  it('recognizes explicit English deliverables and extracts domain controls', () => {
    expect(recognizeGameAssetIntent('Create an 8 frame top-down creature attack sprite sheet facing left')).toMatchObject({
      reason: 'explicit-deliverable',
      intent: {
        kind: 'creature',
        view: 'topdown',
        action: 'attack',
        direction: 'left',
        frameCount: 8,
      },
    })
  })

  it('does not hijack game-adjacent product or website requests', () => {
    expect(recognizeGameAssetIntent('Design a landing page for a mobile game')).toBeUndefined()
    expect(recognizeGameAssetIntent('分析游戏行业的增长趋势')).toBeUndefined()
  })
})

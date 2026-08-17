import { describe, expect, it } from 'vitest'
import { recognizeGameAssetIntent } from './intent'

describe('Game Asset intent recognition', () => {
  it('extracts a natural-language sprite action without a model call', () => {
    expect(recognizeGameAssetIntent('给这个角色做 6 帧向右跑步素材')).toMatchObject({
      reason: 'compound-domain-intent',
      intent: {
        scope: 'single-action',
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
        scope: 'single-action',
        kind: 'creature',
        view: 'topdown',
        action: 'attack',
        direction: 'left',
        frameCount: 8,
      },
    })
  })

  it('recognizes a multi-action character request as an action family without a mode selector', () => {
    expect(recognizeGameAssetIntent('给这个角色做一套待机、跑步和带刀光的攻击动作素材')).toMatchObject({
      intent: {
        scope: 'action-family',
        kind: 'player',
      },
    })
  })

  it('routes explicit map outcomes without asking for a map implementation mode', () => {
    expect(recognizeGameAssetIntent('做一张可玩的横版地图，包含碰撞、出生点和出口')).toMatchObject({
      reason: 'explicit-deliverable',
      intent: {
        scope: 'map',
        sourceText: '做一张可玩的横版地图，包含碰撞、出生点和出口',
      },
    })
    expect(recognizeGameAssetIntent('Create a tilemap for a tactical game level')).toMatchObject({
      intent: { scope: 'map' },
    })
  })

  it('does not hijack game-adjacent product or website requests', () => {
    expect(recognizeGameAssetIntent('Design a landing page for a mobile game')).toBeUndefined()
    expect(recognizeGameAssetIntent('分析游戏行业的增长趋势')).toBeUndefined()
    expect(recognizeGameAssetIntent('设计一个游戏场景概念图')).toBeUndefined()
  })
})

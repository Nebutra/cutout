import { describe, expect, it } from 'vitest'
import { createGameAssetLaunchRequest, routeWorkspaceSubmission } from './scenario-launch'

describe('workspace scenario launch', () => {
  it('projects the same request the GUI submits for an explicit Game Asset intent', () => {
    const route = routeWorkspaceSubmission('给这个角色做 4 帧向右跑步素材')
    expect(route).toMatchObject({
      kind: 'game-assets',
      intent: { action: 'run', direction: 'right', frameCount: 4 },
    })
  })

  it('keeps non-Game work on the existing Agent route', () => {
    expect(routeWorkspaceSubmission('设计一个游戏官网首页')).toEqual({ kind: 'agent' })
  })

  it('binds exactly one image reference and never guesses among multiple images', () => {
    const route = routeWorkspaceSubmission('Create a run sprite sheet')
    if (route.kind !== 'game-assets') throw new Error('Expected a Game Asset route')
    const first = { name: 'a.png', mediaType: 'image/png', bytes: new Uint8Array([1]) }
    const second = { name: 'b.png', mediaType: 'image/png', bytes: new Uint8Array([2]) }
    expect(createGameAssetLaunchRequest(route.intent, [first])).toMatchObject({ reference: first })
    expect(createGameAssetLaunchRequest(route.intent, [first, second])).not.toHaveProperty('reference')
  })
})

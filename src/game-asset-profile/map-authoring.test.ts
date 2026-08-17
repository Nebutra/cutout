import { describe, expect, it } from 'vitest'
import { canonicalJson } from '@/design-ir/fingerprint'
import {
  GAME_MAP_MODE_NODE_ROLES,
  fingerprintGameMapProductionPlan,
  type GameMapMode,
} from './map'
import { compileGameMapProductionPlan } from './map-authoring'

describe('Game Map natural-language planning contract (contract-only)', () => {
  const cases: readonly { sourceText: string, mode: GameMapMode }[] = [
    {
      sourceText: 'Build a playable tileset tilemap level with collision, one spawn, and exits.',
      mode: 'tile',
    },
    {
      sourceText: 'Create a playable hand-painted scene map with authored collision and exits.',
      mode: 'scene',
    },
    {
      sourceText: '制作一个可玩的横版视差卷轴关卡，包含平台、危险区、出生点和出口。',
      mode: 'side-scroll',
    },
    {
      sourceText: 'Create a tactical grid map with cell terrain, collision, spawn, and exit data.',
      mode: 'grid',
    },
    {
      sourceText: 'Build a modular dungeon room-chunk map with sockets, collision, spawns and exits.',
      mode: 'room-chunk',
    },
    {
      sourceText: 'Create a static background-only scene map that is explicitly non-playable.',
      mode: 'baked-scene',
    },
  ]

  it.each(cases)('compiles a complete $mode graph without a mode selector', async ({ sourceText, mode }) => {
    const plan = await compileGameMapProductionPlan({ sourceText, mapName: `${mode} proof` })
    const roles = plan.nodes.map(({ role }) => role)
    const planningIds = new Set(plan.nodes
      .filter(({ authority }) => authority === 'planning-reference')
      .map(({ id }) => id))

    expect(plan.mode).toBe(mode)
    expect(roles).toEqual(GAME_MAP_MODE_NODE_ROLES[mode])
    expect(new Set(plan.nodes.map(({ id }) => id)).size).toBe(plan.nodes.length)
    expect(plan.nodes.flatMap(({ dependencies }) => dependencies)
      .every((dependency) => plan.nodes.some(({ id }) => id === dependency))).toBe(true)
    expect(plan.nodes
      .filter(({ role }) => ['runtime-manifest', 'preview', 'debug-overlay', 'bundle'].includes(role))
      .flatMap(({ dependencies }) => dependencies)
      .some((dependency) => planningIds.has(dependency))).toBe(false)
    expect(plan.playable).toBe(mode !== 'baked-scene')
    expect(plan.runtimeSemantics).toBe(mode === 'baked-scene' ? 'visual-only' : 'full')
  })

  it('rejects a baked-only deliverable when the same request requires gameplay semantics', async () => {
    await expect(compileGameMapProductionPlan({
      sourceText: 'Create a baked-scene map that is playable and has collision, spawn points, and exits.',
    })).rejects.toThrow(/playable map cannot be compiled as a baked scene/)
  })

  it('rejects caller-authored node authority and dependency drift', async () => {
    const plan = await compileGameMapProductionPlan({
      sourceText: 'Create a playable scene map with collision, spawn, and exit data.',
    })
    const collisionIndex = plan.nodes.findIndex(({ role }) => role === 'collision')
    const manifestIndex = plan.nodes.findIndex(({ role }) => role === 'runtime-manifest')
    const forgedAuthority = {
      ...plan,
      nodes: plan.nodes.map((node, index) => index === collisionIndex
        ? { ...node, authority: 'planning-reference' as const }
        : node),
    }
    const missingDependency = {
      ...plan,
      nodes: plan.nodes.map((node, index) => index === manifestIndex
        ? { ...node, dependencies: node.dependencies.slice(1) }
        : node),
    }

    await expect(fingerprintGameMapProductionPlan(forgedAuthority))
      .rejects.toThrow(/invalid kind or authority/)
    await expect(fingerprintGameMapProductionPlan(missingDependency))
      .rejects.toThrow(/exact dependency closure/)
  })

  it('defaults a generic playable map to scene and rejects non-map product intent', async () => {
    await expect(compileGameMapProductionPlan({
      sourceText: 'Create a playable forest map with collision and an exit.',
    })).resolves.toMatchObject({ mode: 'scene', playable: true })
    await expect(compileGameMapProductionPlan({
      sourceText: 'Design a landing page for a game studio.',
    })).rejects.toThrow(/map or level request/)
  })

  it('produces stable canonical plans and preserves array order as graph authority', async () => {
    const input = {
      sourceText: 'Build a 2048x2048 tactical grid map with collision, spawn, and exits.',
      mapName: 'Citadel Grid',
    }
    const first = await compileGameMapProductionPlan(input)
    const second = await compileGameMapProductionPlan(input)
    expect(canonicalJson(first)).toBe(canonicalJson(second))
    expect(await fingerprintGameMapProductionPlan(first))
      .toBe(await fingerprintGameMapProductionPlan(second))

    const reordered = { ...first, nodes: [...first.nodes].reverse() }
    await expect(fingerprintGameMapProductionPlan(reordered))
      .rejects.toThrow(/exact required node closure/)
  })
})

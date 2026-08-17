import { fingerprint } from '@/design-ir/fingerprint'
import {
  GAME_MAP_MODE_NODE_ROLES,
  GAME_MAP_PLAN_NODE_POLICY,
  GAME_MAP_PRODUCTION_PLAN_PROTOCOL,
  expectedGameMapPlanNodeDependencies,
  gameMapProductionPlanSchema,
  type GameMapCoordinateSystem,
  type GameMapMode,
  type GameMapPlanNode,
  type GameMapPlanNodeRole,
  type GameMapProductionPlan,
} from './map'

export interface GameMapAuthoringInput {
  readonly sourceText: string
  readonly mapName?: string
  readonly canvas?: Readonly<{ width: number, height: number }>
}

const MAP_LANGUAGE = /(?:\bmap\b|\blevel\b|\bscene\b|\bdungeon\b|\bworld\b|tilemap|tileset|side[- ]scroll|platformer|room[- ]chunk|地图|关卡|场景|地牢|世界|瓦片|横版|房间块)/iu
const BAKED_LANGUAGE = /(?:baked[- ]scene|background[- ]only|static background|non[- ]playable|仅背景|静态背景|非可玩)/iu
const PLAYABLE_LANGUAGE = /(?:playable|collision|spawn|exit|runtime|editable|interaction|gameplay|可玩|碰撞|出生点|出口|运行时|可编辑|交互)/iu

const MODE_CUES: Readonly<Record<Exclude<GameMapMode, 'baked-scene'>, readonly RegExp[]>> = {
  tile: [/(?:tilemap|tile map|tileset|tile set)/iu, /(?:瓦片|图块|地块图集)/iu],
  scene: [/(?:scene map|handcrafted scene|painted scene)/iu, /(?:场景地图|手工场景|绘制场景)/iu],
  'side-scroll': [/(?:side[- ]scroll|platformer|parallax)/iu, /(?:横版|横向卷轴|视差)/iu],
  grid: [/(?:grid map|tactical grid|board map|strategy grid)/iu, /(?:网格|战棋|棋盘)/iu],
  'room-chunk': [/(?:room[- ]chunk|modular rooms?|dungeon rooms?)/iu, /(?:房间块|模块化房间|地牢房间)/iu],
}

const MODE_TIE_BREAK: readonly Exclude<GameMapMode, 'baked-scene'>[] = [
  'room-chunk', 'side-scroll', 'grid', 'tile', 'scene',
]

function inferMapMode(sourceText: string): GameMapMode {
  const baked = BAKED_LANGUAGE.test(sourceText)
  const playableSource = sourceText.replace(/(?:non[- ]playable|非可玩)/giu, '')
  const playable = PLAYABLE_LANGUAGE.test(playableSource)
  if (baked && playable) {
    throw new Error('A playable map cannot be compiled as a baked scene; runtime geometry is required.')
  }
  if (baked) return 'baked-scene'
  const scores = MODE_TIE_BREAK.map((mode) => ({
    mode,
    score: MODE_CUES[mode].filter((pattern) => pattern.test(sourceText)).length,
  }))
  const maximum = Math.max(...scores.map(({ score }) => score))
  return maximum === 0 ? 'scene' : scores.find(({ score }) => score === maximum)!.mode
}

function dimensionsFromText(sourceText: string): { width: number, height: number } | undefined {
  const match = /(?:^|\D)(\d{2,5})\s*[x×]\s*(\d{2,5})(?:\D|$)/iu.exec(sourceText)
  if (!match) return undefined
  return { width: Number(match[1]), height: Number(match[2]) }
}

function defaultWorld(mode: GameMapMode): { width: number, height: number } {
  switch (mode) {
    case 'side-scroll': return { width: 4_096, height: 1_152 }
    case 'room-chunk': return { width: 1_536, height: 1_536 }
    case 'baked-scene': return { width: 1_920, height: 1_080 }
    case 'tile':
    case 'grid':
    case 'scene': return { width: 2_048, height: 2_048 }
  }
}

function coordinateSystem(
  mode: GameMapMode,
  world: Readonly<{ width: number, height: number }>,
): GameMapCoordinateSystem {
  if (mode === 'tile' || mode === 'grid') {
    const cell = mode === 'tile' ? 32 : 64
    if (world.width % cell !== 0 || world.height % cell !== 0) {
      throw new Error(`${mode} map dimensions must be divisible by ${cell} pixels.`)
    }
    return {
      kind: 'orthogonal-grid',
      origin: 'top-left',
      columns: world.width / cell,
      rows: world.height / cell,
      cellWidth: cell,
      cellHeight: cell,
    }
  }
  if (mode === 'room-chunk') {
    const chunk = 384
    if (world.width % chunk !== 0 || world.height % chunk !== 0) {
      throw new Error(`room-chunk map dimensions must be divisible by ${chunk} pixels.`)
    }
    return {
      kind: 'chunk-grid',
      origin: 'top-left',
      columns: world.width / chunk,
      rows: world.height / chunk,
      chunkWidth: chunk,
      chunkHeight: chunk,
    }
  }
  return { kind: 'pixel-2d', origin: 'top-left', unit: 'pixel' }
}

function cameraFor(
  mode: GameMapMode,
  world: Readonly<{ width: number, height: number }>,
): GameMapProductionPlan['camera'] {
  const viewport = {
    width: Math.min(world.width, 1_280),
    height: Math.min(world.height, 720),
  }
  const behavior = mode === 'baked-scene'
    ? 'fixed'
    : mode === 'side-scroll'
      ? 'horizontal-follow'
      : mode === 'tile' || mode === 'grid'
        ? 'grid-bounded'
        : mode === 'room-chunk'
          ? 'chunk-bounded'
          : 'bounded'
  return { behavior, viewport, bounds: { x: 0, y: 0, ...world } }
}

function safeMapKey(value: string): string {
  const normalized = value.normalize('NFKD').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized.slice(0, 80) || 'untitled'
}

function compileNodes(mode: GameMapMode, mapKey: string): readonly GameMapPlanNode[] {
  const roles = GAME_MAP_MODE_NODE_ROLES[mode]
  const idFor = (role: GameMapPlanNodeRole) => `node:game-map:${mapKey}:${role}`
  const skeleton = roles.map((role) => ({
    id: idFor(role),
    role,
    ...GAME_MAP_PLAN_NODE_POLICY[role],
    dependencies: [] as string[],
  }))
  return skeleton.map((node) => ({
    ...node,
    dependencies: [...expectedGameMapPlanNodeDependencies(skeleton, node.role)],
  }))
}

export async function compileGameMapProductionPlan(
  input: GameMapAuthoringInput,
): Promise<GameMapProductionPlan> {
  const sourceText = input.sourceText.trim()
  const title = input.mapName?.trim() || 'Untitled map'
  if (!sourceText || sourceText.length > 20_000 || !MAP_LANGUAGE.test(sourceText)) {
    throw new Error('Game Map authoring requires a bounded natural-language map or level request.')
  }
  const mode = inferMapMode(sourceText)
  const world = input.canvas ?? dimensionsFromText(sourceText) ?? defaultWorld(mode)
  const intentDigest = await fingerprint({ sourceText, title, world })
  const mapKey = `${safeMapKey(title)}-${intentDigest.slice(0, 12)}`
  return gameMapProductionPlanSchema.parse({
    version: GAME_MAP_PRODUCTION_PLAN_PROTOCOL,
    id: `plan:game-map:${mapKey}`,
    mapId: `map:${mapKey}`,
    intentDigest,
    title,
    mode,
    playable: mode !== 'baked-scene',
    runtimeSemantics: mode === 'baked-scene' ? 'visual-only' : 'full',
    world,
    coordinateSystem: coordinateSystem(mode, world),
    camera: cameraFor(mode, world),
    nodes: compileNodes(mode, mapKey),
    delivery: {
      runtimeManifest: { id: 'game-map.runtime-manifest', version: 1 },
      previewReceipt: { id: 'game-map.preview-receipt', version: 1 },
      bundle: { id: 'game-map.bundle', version: 1 },
    },
  })
}

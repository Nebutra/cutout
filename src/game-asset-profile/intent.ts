import type { DesignScenarioIntentRecognizer } from '@/design-profile-platform/scenario-routing'
import { GAME_ASSET_PROFILE_ID } from './contracts'

export interface GameSpriteAssetIntent {
  readonly sourceText: string
  readonly scope: 'single-action' | 'action-family'
  readonly kind: 'player' | 'npc' | 'creature' | 'prop' | 'fx'
  readonly view: 'side' | 'topdown' | 'three-quarter'
  readonly action: 'single' | 'idle' | 'walk' | 'run' | 'attack' | 'cast' | 'jump' | 'hurt' | 'death'
  readonly direction: 'none' | 'down' | 'left' | 'right' | 'up'
  readonly frameCount: number
}

export interface GameMapIntent {
  readonly sourceText: string
  readonly scope: 'map'
}

export type GameAssetIntent = GameSpriteAssetIntent | GameMapIntent

export interface GameAssetLaunchReference {
  readonly name: string
  readonly mediaType: string
  readonly bytes: Uint8Array
}

export interface GameSpriteAssetLaunchRequest {
  readonly intent: GameSpriteAssetIntent
  readonly reference?: GameAssetLaunchReference
}

export interface GameMapLaunchRequest {
  readonly intent: GameMapIntent
  readonly reference?: GameAssetLaunchReference
}

export type GameAssetLaunchRequest = GameSpriteAssetLaunchRequest | GameMapLaunchRequest

const explicitDeliverable = /(?:game\s*assets?|sprite(?:\s*sheet)?s?|游戏素材|游戏美术素材|精灵图|角色动画|动作帧|帧动画)/iu
const gameSubject = /(?:角色|人物|玩家|npc|怪物|生物|道具|特效|character|player|creature|monster|prop|effect)/iu
const actionLanguage = /(?:待机|行走|走路|跑步|奔跑|攻击|施法|射击|跳跃|受伤|死亡|idle|walk|run|attack|cast|shoot|jump|hurt|death)/iu
const frameLanguage = /(?:\d{1,3}\s*(?:帧|frames?)|逐帧|frame\s*animation)/iu
const assetLanguage = /(?:素材|动画|序列|图集|asset|animation|sequence|atlas|sheet)/iu
const familyLanguage = /(?:一套|全套|完整(?:的)?动作|动作集|动作族|多(?:个|组)?动作|action\s*(?:set|family|pack)|animation\s*(?:set|pack)|complete\s+sprite)/iu
const explicitMapDeliverable = /(?:game\s*(?:map|level)|level\s*map|tilemap|tileset|side[- ]scroll(?:ing)?\s*(?:map|level)|room[- ]chunk\s*(?:map|level)|游戏地图|游戏关卡|关卡地图|地图素材|瓦片地图|横版地图|房间块地图|可玩(?:地图|关卡|场景))/iu
const authoredMapRequest = /(?:创建|生成|制作|设计|做|create|generate|make|build|design)[\s\S]{0,80}(?:地图|关卡|game\s*map|level\s*map|tilemap|tileset|side[- ]scroll(?:ing)?\s*(?:map|level)|room[- ]chunk)/iu
const actionPatterns = [
  /(?:待机|idle)/iu,
  /(?:行走|走路|walk)/iu,
  /(?:跑步|奔跑|run)/iu,
  /(?:攻击|射击|attack|shoot)/iu,
  /(?:施法|cast)/iu,
  /(?:跳跃|jump)/iu,
  /(?:受伤|hurt)/iu,
  /(?:死亡|death)/iu,
] as const

function action(input: string): GameSpriteAssetIntent['action'] {
  if (/(?:死亡|death)/iu.test(input)) return 'death'
  if (/(?:受伤|hurt)/iu.test(input)) return 'hurt'
  if (/(?:跳跃|jump)/iu.test(input)) return 'jump'
  if (/(?:施法|cast)/iu.test(input)) return 'cast'
  if (/(?:攻击|射击|attack|shoot)/iu.test(input)) return 'attack'
  if (/(?:跑步|奔跑|run)/iu.test(input)) return 'run'
  if (/(?:行走|走路|walk)/iu.test(input)) return 'walk'
  if (/(?:待机|idle)/iu.test(input)) return 'idle'
  return 'single'
}

function direction(input: string): GameSpriteAssetIntent['direction'] {
  if (/(?:向右|朝右|right[- ]?facing|facing\s+right)/iu.test(input)) return 'right'
  if (/(?:向左|朝左|left[- ]?facing|facing\s+left)/iu.test(input)) return 'left'
  if (/(?:向上|朝上|up[- ]?facing|facing\s+up)/iu.test(input)) return 'up'
  if (/(?:向下|朝下|down[- ]?facing|facing\s+down)/iu.test(input)) return 'down'
  return 'none'
}

function kind(input: string): GameSpriteAssetIntent['kind'] {
  if (/(?:特效|effect|\bfx\b)/iu.test(input)) return 'fx'
  if (/(?:道具|prop)/iu.test(input)) return 'prop'
  if (/(?:怪物|生物|creature|monster)/iu.test(input)) return 'creature'
  if (/(?:\bnpc\b)/iu.test(input)) return 'npc'
  return 'player'
}

function view(input: string): GameSpriteAssetIntent['view'] {
  if (/(?:俯视|top[- ]?down)/iu.test(input)) return 'topdown'
  if (/(?:四分之三|3\/4|three[- ]quarter)/iu.test(input)) return 'three-quarter'
  return 'side'
}

function frameCount(input: string): number {
  const parsed = /(?:^|\D)(\d{1,3})\s*(?:帧|frames?)/iu.exec(input)?.[1]
  return parsed ? Number(parsed) : 4
}

function scope(input: string): GameSpriteAssetIntent['scope'] {
  const requestedActions = actionPatterns.filter((pattern) => pattern.test(input)).length
  return familyLanguage.test(input) || requestedActions >= 2
    ? 'action-family'
    : 'single-action'
}

export function recognizeGameAssetIntent(input: string) {
  const sourceText = input.trim()
  if (!sourceText || sourceText.length > 20_000) return undefined
  if (explicitMapDeliverable.test(sourceText) || authoredMapRequest.test(sourceText)) {
    return {
      scenarioId: GAME_ASSET_PROFILE_ID,
      reason: 'explicit-deliverable' as const,
      intent: { sourceText, scope: 'map' as const },
    }
  }
  const explicit = explicitDeliverable.test(sourceText)
  const compound = gameSubject.test(sourceText)
    && actionLanguage.test(sourceText)
    && (frameLanguage.test(sourceText) || assetLanguage.test(sourceText))
  if (!explicit && !compound) return undefined

  return {
    scenarioId: GAME_ASSET_PROFILE_ID,
    reason: explicit ? 'explicit-deliverable' as const : 'compound-domain-intent' as const,
    intent: {
      sourceText,
      scope: scope(sourceText),
      kind: kind(sourceText),
      view: view(sourceText),
      action: action(sourceText),
      direction: direction(sourceText),
      frameCount: frameCount(sourceText),
    },
  }
}

export const gameAssetIntentRecognizer: DesignScenarioIntentRecognizer<GameAssetIntent> = {
  scenarioId: GAME_ASSET_PROFILE_ID,
  recognize: recognizeGameAssetIntent,
}

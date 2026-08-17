import { describe, expect, it } from 'vitest'
import { fingerprint } from '@/design-ir/fingerprint'
import {
  compileDefaultGameAssetFamilyPlan,
  compileGameAssetGroundedNormalizationSuccessorPlan,
  gameAssetFamilyPlanSchema,
  type GameAssetFamilyAuthoringInput,
} from './family'
import {
  GAME_ASSET_GROUNDED_NORMALIZATION_PROCESSOR,
  GAME_ASSET_GROUNDED_NORMALIZATION_SCALE_POLICY,
} from './generation'

const HASHES = {
  identity: '1'.repeat(64),
  artDirection: '2'.repeat(64),
  identityLock: '3'.repeat(64),
  scaleLock: '4'.repeat(64),
  bodyAnchor: '5'.repeat(64),
  fxAnchor: '6'.repeat(64),
} as const

function evidence(id: string, contentHash: string) {
  return {
    id,
    revision: `revision:sha256:${contentHash}`,
    contentHash,
  }
}

function authoringInput(): GameAssetFamilyAuthoringInput {
  return {
    sourceText: '为这个角色制作一套可直接用于游戏的待机、跑步和带独立刀光的攻击动作。',
    assetName: 'Crimson Ranger',
    kind: 'player',
    view: 'side',
    direction: 'right',
    frame: { width: 512, height: 512 },
    bodyAlphaTarget: { width: 300, height: 420 },
    fxAlphaTarget: { width: 420, height: 260 },
    identityReference: evidence('artifact:identity-reference', HASHES.identity),
    artDirectionEvidence: evidence('evidence:art-direction', HASHES.artDirection),
    identityLock: evidence('evidence:identity-lock', HASHES.identityLock),
    provisionalScaleLock: evidence('evidence:provisional-scale-lock', HASHES.scaleLock),
    bodyAnchorLock: evidence('evidence:body-anchor-lock', HASHES.bodyAnchor),
    fxAnchorLock: evidence('evidence:fx-anchor-lock', HASHES.fxAnchor),
  }
}

describe('Game Asset family plan contracts', () => {
  it('compiles one coherent source call per default action group with detached attack FX', async () => {
    const input = authoringInput()
    const plan = await compileDefaultGameAssetFamilyPlan(input)

    expect(plan.groups.map(({ label }) => label)).toEqual([
      'Idle', 'Run', 'Attack', 'Attack FX',
    ])
    expect(plan.groups.map(({ action }) => action)).toEqual([
      'idle', 'run', 'attack', 'impact',
    ])
    expect(plan.groups.every(({ source }) => source.strategy === 'coherent-grid')).toBe(true)
    expect(plan.groups.reduce((total, group) => total + group.source.initialProviderCallBudget, 0)).toBe(4)
    expect(plan.groups.every((group) => !group.sourceBrief.includes(input.sourceText))).toBe(true)
    expect(plan.groups[0]?.sourceBrief).toContain('This group is IDLE only')
    expect(plan.groups[0]?.sourceBrief).toContain('ground-contact baseline stable')
    expect(plan.groups[1]?.sourceBrief).toContain('This group is RUN only')
    expect(plan.groups[2]?.sourceBrief).toContain('This group is ATTACK only')
    expect(plan.groups[3]?.sourceBrief).toContain('explicitly requested DETACHED VISUAL')
    expect(plan.groups[2]?.sourceBrief).toContain('explicitly requested bladed implement')
    expect(plan.groups[2]?.sourceBrief).toContain('belongs only in its dedicated detached-visual group')
    expect(plan.groups[3]?.sourceBrief).toContain('blade-shaped slash arc')
    expect(plan.groups.every((group) => group.sourceBrief.includes('safety margin of at least 32 pixels'))).toBe(true)
    expect(plan.groups.every((group) => group.sourceBrief.includes('ground plane, floor line, contact shadow'))).toBe(true)
    expect(plan.groups.every((group) => group.sourceBrief.includes('nothing may cross a cell boundary'))).toBe(true)
    expect(plan.groups[0]?.sourceBrief).not.toContain('bladed weapon')
    expect(plan.groups[1]?.sourceBrief).not.toContain('slash arc')
    expect(plan.groups.map(({ source, plan: atomic }) => (
      source.strategy === 'coherent-grid'
        ? source.rows * source.columns === atomic.roles.length
        : false
    ))).toEqual([true, true, true, true])

    const attackBody = plan.groups.find(({ label }) => label === 'Attack')!
    const attackFx = plan.groups.find(({ label }) => label === 'Attack FX')!
    expect(attackFx.component).toBe('detached-fx')
    expect(attackFx.dependencies).toEqual([attackBody.id])
    expect(attackFx.synchronizedBodyGroupId).toBe(attackBody.id)
    expect(attackFx.sourceBrief).toContain('Do not include the primary subject.')

    expect(plan.masterSelection.priorityGroupIds).toEqual([
      plan.groups[0]!.id,
      plan.groups[1]!.id,
    ])
    expect(plan.groups.every(({ plan: atomic }) => (
      atomic.assetId === plan.assetId
      && atomic.view === plan.view
      && atomic.referenceArtifacts[0]?.contentHash === HASHES.identity
      && atomic.artDirectionEvidence[0]?.contentHash === HASHES.artDirection
    ))).toBe(true)
  })

  it('is deterministic for the same intent, identity, locks, and geometry', async () => {
    const input = authoringInput()
    const [first, second] = await Promise.all([
      compileDefaultGameAssetFamilyPlan(input),
      compileDefaultGameAssetFamilyPlan(input),
    ])

    expect(second).toEqual(first)
  })

  it('derives a topology-neutral creature program without sample weapon or FX leakage', async () => {
    const plan = await compileDefaultGameAssetFamilyPlan({
      ...authoringInput(),
      sourceText: '为四足岩石兽制作待机、行走和扑咬攻击循环。',
      assetName: 'Stone Grazer',
      kind: 'creature',
    })

    expect(plan.groups.map(({ action }) => action)).toEqual(['idle', 'walk', 'attack'])
    expect(plan.groups.every(({ component }) => component === 'body')).toBe(true)
    expect(plan.groups.flatMap(({ plan: atomic }) => atomic.roles).every(({ anchor }) => anchor === 'feet')).toBe(true)
    const briefs = plan.groups.map(({ sourceBrief }) => sourceBrief).join('\n').toLowerCase()
    expect(briefs).not.toMatch(/blade|weapon|effect|character|humanoid/)
  })

  it('derives a bottom-anchored prop program and synchronizes explicit muzzle visuals to shoot', async () => {
    const plan = await compileDefaultGameAssetFamilyPlan({
      ...authoringInput(),
      sourceText: '为自动炮塔制作待机、充能、开火和独立炮口火焰。',
      assetName: 'Copper Turret',
      kind: 'prop',
    })

    expect(plan.groups.map(({ action }) => action)).toEqual(['idle', 'shoot', 'charge', 'impact'])
    const shoot = plan.groups.find(({ action }) => action === 'shoot')!
    const detached = plan.groups.find(({ component }) => component === 'detached-fx')!
    expect(detached.synchronizedBodyGroupId).toBe(shoot.id)
    expect(detached.dependencies).toEqual([shoot.id])
    expect(shoot.sourceBrief).toContain('belongs only in its dedicated detached-visual group')
    expect(plan.groups
      .filter(({ component }) => component === 'body')
      .flatMap(({ plan: atomic }) => atomic.roles)
      .every(({ anchor }) => anchor === 'bottom')).toBe(true)
    const briefs = plan.groups.map(({ sourceBrief }) => sourceBrief).join('\n').toLowerCase()
    expect(briefs).toContain('bottom anchor')
    expect(briefs).not.toMatch(/blade|weapon|feet|character|humanoid/)
  })

  it('adds the owning action when a detached visual names it without repeating the action verb', async () => {
    const plan = await compileDefaultGameAssetFamilyPlan({
      ...authoringInput(),
      sourceText: '为自动炮塔制作独立炮口火焰。',
      assetName: 'Copper Turret',
      kind: 'prop',
    })

    expect(plan.groups.map(({ action }) => action)).toEqual(['idle', 'shoot', 'impact'])
    const shoot = plan.groups.find(({ action }) => action === 'shoot')!
    const detached = plan.groups.find(({ component }) => component === 'detached-fx')!
    expect(detached.synchronizedBodyGroupId).toBe(shoot.id)
  })

  it('authors a new processor-bound grounded envelope without changing detached FX geometry', async () => {
    const parent = await compileDefaultGameAssetFamilyPlan(authoringInput())
    const [successor, repeated] = await Promise.all([
      compileGameAssetGroundedNormalizationSuccessorPlan(parent),
      compileGameAssetGroundedNormalizationSuccessorPlan(parent),
    ])

    expect(repeated).toEqual(successor)
    expect(successor.id).not.toBe(parent.id)
    expect(successor.assetId).not.toBe(parent.assetId)
    for (const [index, group] of successor.groups.entries()) {
      const parentGroup = parent.groups[index]!
      expect(group.id).not.toBe(parentGroup.id)
      expect(group.action).toBe(parentGroup.action)
      expect(group.timing).toEqual(parentGroup.timing)
      for (const [roleIndex, role] of group.plan.roles.entries()) {
        const parentRole = parentGroup.plan.roles[roleIndex]!
        if (group.compatibilityClass === 'grounded-body') {
          expect(group.sourceBrief).toBe(parentGroup.sourceBrief)
          expect(role.expectedAlphaSize).toEqual({ width: 448, height: 420 })
          expect(role.scaleLock.id).toMatch(/^evidence:game-asset-grounded-normalization-lock:/)
          expect(role.scaleLock).not.toEqual(parentRole.scaleLock)
        } else {
          expect(group.sourceBrief).toContain(parentGroup.sourceBrief)
          expect(group.sourceBrief).toContain('Do not render a ground plane')
          expect(group.sourceBrief).toContain('nothing may cross a cell boundary')
          expect(role.expectedAlphaSize).toEqual(parentRole.expectedAlphaSize)
          expect(role.scaleLock).toEqual(parentRole.scaleLock)
        }
      }
    }
    const parentRole = parent.groups[0]!.plan.roles[0]!
    const successorRole = successor.groups[0]!.plan.roles[0]!
    const expectedLockHash = await fingerprint({
      version: 'game-asset.grounded-normalization-lock.v1',
      parentScaleLock: parentRole.scaleLock,
      expectedAlphaSize: successorRole.expectedAlphaSize,
      processorImplementation: GAME_ASSET_GROUNDED_NORMALIZATION_PROCESSOR,
      scalePolicy: GAME_ASSET_GROUNDED_NORMALIZATION_SCALE_POLICY,
    })
    expect(successorRole.scaleLock.contentHash).toBe(expectedLockHash)
  })

  it('rejects dependency cycles instead of treating regeneration as graph repair', async () => {
    const plan = await compileDefaultGameAssetFamilyPlan(authoringInput())
    const run = plan.groups[1]!
    const cycled = {
      ...plan,
      groups: plan.groups.map((group) => (
        group.id === plan.groups[0]!.id
          ? { ...group, dependencies: [run.id] }
          : group
      )),
    }

    expect(gameAssetFamilyPlanSchema.safeParse(cycled).success).toBe(false)
  })

  it('rejects a requested coherent grid that does not close the atomic role set', async () => {
    const plan = await compileDefaultGameAssetFamilyPlan(authoringInput())
    const malformed = {
      ...plan,
      groups: plan.groups.map((group, index) => (
        index === 0
          ? { ...group, source: { ...group.source, rows: 1, columns: 3 } }
          : group
      )),
    }

    expect(gameAssetFamilyPlanSchema.safeParse(malformed).success).toBe(false)
  })

  it('rejects family actions that drift from the shared identity reference', async () => {
    const plan = await compileDefaultGameAssetFamilyPlan(authoringInput())
    const malformed = {
      ...plan,
      groups: plan.groups.map((group, index) => (
        index === 2
          ? {
              ...group,
              plan: {
                ...group.plan,
                referenceArtifacts: [evidence('artifact:other-reference', 'a'.repeat(64))],
              },
            }
          : group
      )),
    }

    expect(gameAssetFamilyPlanSchema.safeParse(malformed).success).toBe(false)
  })
})

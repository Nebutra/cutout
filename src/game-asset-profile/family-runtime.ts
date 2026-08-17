import { fingerprint } from '@/design-ir/fingerprint'
import {
  gameAssetActionClipSchema,
  gameAssetActionSheetApplyResultSchema,
  gameAssetActionSheetPartialAuthorizationSchema,
  gameAssetActionSheetPartialRepairApplyResultSchema,
  gameAssetActionSheetPartialReprocessApplyResultSchema,
  gameAssetActionSheetPartialSchema,
  gameAssetActionSheetRepairApplyResultSchema,
  gameAssetActionSheetAuthorizationSchema,
  gameAssetActionSourceSchema,
  gameAssetFamilyPlanSchema,
  gameAssetScaleProfileSchema,
  type GameAssetActionClip,
  type GameAssetActionSheetApplyResult,
  type GameAssetActionSheetAuthorization,
  type GameAssetActionSheetPartial,
  type GameAssetActionSheetPartialAuthorization,
  type GameAssetActionSheetPartialRepairApplyResult,
  type GameAssetActionSheetPartialReprocessApplyResult,
  type GameAssetActionSheetRepairApplyResult,
  type GameAssetActionSource,
  type GameAssetFamilyActionGroup,
  type GameAssetFamilyPlan,
  type GameAssetScaleProfile,
} from './family'

export type GameAssetFamilyActionState = {
  readonly group: GameAssetFamilyActionGroup
  readonly result: GameAssetActionSheetApplyResult
  readonly clip?: GameAssetActionClip
  readonly source?: GameAssetActionSource
  readonly authorization?: GameAssetActionSheetAuthorization
  readonly partial?: GameAssetActionSheetPartial
  readonly partialAuthorization?: GameAssetActionSheetPartialAuthorization
  readonly error?: string
  readonly repairedRoleIds: readonly string[]
}

/**
 * Align native results to the frozen family plan without inferring completion
 * from a result count. The native result order is meaningful for a failed
 * prefix, while successful results carry their own group identity.
 */
export function projectGameAssetFamilyActionStates(
  planValue: GameAssetFamilyPlan,
  results: readonly GameAssetActionSheetApplyResult[],
  repairedRoleIdsByGroup: ReadonlyMap<string, readonly string[]> = new Map(),
  clipOverridesByGroup: ReadonlyMap<string, GameAssetActionClip> = new Map(),
): readonly GameAssetFamilyActionState[] {
  const plan = gameAssetFamilyPlanSchema.parse(planValue)
  if (results.length > plan.groups.length) {
    throw new Error('Game Asset family results exceed the frozen action-group closure.')
  }
  return plan.groups.map((group, index) => {
    const result = results[index] ?? gameAssetActionSheetApplyResultSchema.parse({
      status: 'failed',
      error: 'Action group has not produced a native result.',
    })
    const source = result.source ? gameAssetActionSourceSchema.parse(result.source) : undefined
    const clipValue = clipOverridesByGroup.get(group.id) ?? result.clip
    const clip = clipValue ? gameAssetActionClipSchema.parse(clipValue) : undefined
    const authorization = result.authorization
      ? gameAssetActionSheetAuthorizationSchema.parse(result.authorization)
      : undefined
    const partial = result.partial
      ? gameAssetActionSheetPartialSchema.parse(result.partial)
      : undefined
    const partialAuthorization = result.partialAuthorization
      ? gameAssetActionSheetPartialAuthorizationSchema.parse(result.partialAuthorization)
      : undefined
    if (source && source.groupId !== group.id) {
      throw new Error(`Game Asset family source ${source.id} belongs to a different action group.`)
    }
    if (clip && clip.groupId !== group.id) {
      throw new Error(`Game Asset family clip ${clip.id} belongs to a different action group.`)
    }
    if (authorization && authorization.groupId !== group.id) {
      throw new Error(`Game Asset family authorization ${authorization.receiptId} belongs to a different action group.`)
    }
    if (partial && partial.groupId !== group.id) {
      throw new Error(`Game Asset family partial ${partial.id} belongs to a different action group.`)
    }
    if (partialAuthorization && partialAuthorization.groupId !== group.id) {
      throw new Error(`Game Asset family partial authorization ${partialAuthorization.receiptId} belongs to a different action group.`)
    }
    const repairedRoleIds = repairedRoleIdsByGroup.get(group.id) ?? []
    return {
      group,
      result,
      source,
      clip,
      authorization,
      partial,
      partialAuthorization,
      error: result.error,
      repairedRoleIds: [...new Set(repairedRoleIds)],
    }
  })
}

export interface MergedGameAssetActionSheetRepair {
  readonly clip: GameAssetActionClip
  readonly replacedRoleIds: readonly string[]
  readonly preservedRoleIds: readonly string[]
  readonly authorization: NonNullable<GameAssetActionSheetRepairApplyResult['authorization']>
  readonly outputs: GameAssetActionSheetRepairApplyResult['outputs']
}

/**
 * Merge only the isolated replacement outputs into a verified parent clip.
 * The parent source remains authoritative for untouched cells; replacement
 * source ids are retained on their frame records and in the repair receipt.
 */
export async function mergeGameAssetActionSheetRepair(
  parent: {
    readonly source: GameAssetActionSource
    readonly clip: GameAssetActionClip
    readonly authorization: GameAssetActionSheetAuthorization
  },
  value: GameAssetActionSheetRepairApplyResult,
): Promise<MergedGameAssetActionSheetRepair> {
  const source = gameAssetActionSourceSchema.parse(parent.source)
  const clip = gameAssetActionClipSchema.parse(parent.clip)
  const authorization = gameAssetActionSheetAuthorizationSchema.parse(parent.authorization)
  const repair = gameAssetActionSheetRepairApplyResultSchema.parse(value)
  if (repair.status !== 'succeeded' || !repair.authorization
    || repair.parentSourceId !== source.id || repair.parentClipId !== clip.id) {
    throw new Error(repair.error ?? 'Game Asset action-sheet repair did not settle.')
  }
  const replacement = new Map(repair.outputs.map((output) => [output.roleId, output]))
  const replacedRoleIds = repair.authorization.replacementRoleIds
  if (replacement.size !== replacedRoleIds.length
    || replacedRoleIds.some((roleId) => !replacement.has(roleId))) {
    throw new Error('Game Asset action-sheet repair output closure is incomplete.')
  }
  const nextFrames = clip.frames.map((frame) => {
    const output = replacement.get(frame.roleId)
    if (!output) return frame
    return {
      ...frame,
      sourceArtifactId: output.receipt.artifact.artifactId,
      artifactId: output.processingEvidence.outputArtifactId,
      artifactSha256: output.processingEvidence.outputArtifactSha256,
      artifactBytesBase64: output.artifactBytesBase64,
      processingEvidence: output.processingEvidence,
      pixelEvidence: output.pixelEvidence,
    }
  })
  const identity = await fingerprint({
    parentClipId: clip.id,
    parentAuthorizationReceiptHash: authorization.receiptHash,
    repairAuthorizationReceiptHash: repair.authorization.receiptHash,
    frames: nextFrames,
  })
  const mergedClip = gameAssetActionClipSchema.parse({
    ...clip,
    id: `clip:game-asset-action-sheet-repair:${identity}`,
    frames: nextFrames,
  })
  return {
    clip: mergedClip,
    replacedRoleIds: [...replacedRoleIds],
    preservedRoleIds: clip.frames
      .map(({ roleId }) => roleId)
      .filter((roleId) => !replacement.has(roleId)),
    authorization: repair.authorization,
    outputs: repair.outputs,
  }
}

export interface MergedGameAssetActionSheetPartialRepair {
  readonly clip: GameAssetActionClip
  readonly replacedRoleIds: readonly string[]
  readonly preservedRoleIds: readonly string[]
  readonly authorization: NonNullable<GameAssetActionSheetPartialRepairApplyResult['authorization']>
  readonly outputs: GameAssetActionSheetPartialRepairApplyResult['outputs']
}

export interface MergedGameAssetActionSheetPartialReprocess {
  readonly clip: GameAssetActionClip
  readonly replacedRoleIds: readonly string[]
  readonly preservedRoleIds: readonly string[]
  readonly authorization: NonNullable<GameAssetActionSheetPartialReprocessApplyResult['authorization']>
}

/**
 * Project the native-reconstructed complete clip. The native verifier, not this
 * renderer projection, reproduces every frame from the signed parent bytes.
 */
export function mergeGameAssetActionSheetPartialReprocess(
  parent: {
    readonly source: GameAssetActionSource
    readonly partial: GameAssetActionSheetPartial
    readonly authorization: GameAssetActionSheetPartialAuthorization
  },
  value: GameAssetActionSheetPartialReprocessApplyResult,
): MergedGameAssetActionSheetPartialReprocess {
  const source = gameAssetActionSourceSchema.parse(parent.source)
  const partial = gameAssetActionSheetPartialSchema.parse(parent.partial)
  const parentAuthorization = gameAssetActionSheetPartialAuthorizationSchema.parse(parent.authorization)
  const reprocess = gameAssetActionSheetPartialReprocessApplyResultSchema.parse(value)
  if (reprocess.status !== 'succeeded' || !reprocess.authorization || !reprocess.clip
    || reprocess.parentSourceId !== source.id || reprocess.parentPartialId !== partial.id
    || reprocess.authorization.parentAuthorizationReceiptHash !== parentAuthorization.receiptHash) {
    throw new Error(reprocess.error ?? 'Game Asset local partial reprocess did not settle.')
  }
  const clip = gameAssetActionClipSchema.parse(reprocess.clip)
  const replacedRoleIds = reprocess.authorization.reprocessedRoleIds
  const preservedRoleIds = partial.frames.map(({ roleId }) => roleId)
  if (clip.frames.length !== replacedRoleIds.length + preservedRoleIds.length
    || clip.frames.some((frame, index) => frame.roleId !== reprocess.authorization?.cells[index]?.roleId)) {
    throw new Error('Game Asset local partial reprocess clip closure is incomplete.')
  }
  return {
    clip,
    replacedRoleIds: [...replacedRoleIds],
    preservedRoleIds,
    authorization: reprocess.authorization,
  }
}

/**
 * Close a signed partial sheet with isolated outputs for exactly its failed
 * roles. Successful parent frames are reused byte-for-byte and retain order
 * from the frozen atomic plan.
 */
export async function mergeGameAssetActionSheetPartialRepair(
  parent: {
    readonly source: GameAssetActionSource
    readonly partial: GameAssetActionSheetPartial
    readonly authorization: GameAssetActionSheetPartialAuthorization
    readonly plan: GameAssetFamilyActionGroup['plan']
  },
  value: GameAssetActionSheetPartialRepairApplyResult,
): Promise<MergedGameAssetActionSheetPartialRepair> {
  const source = gameAssetActionSourceSchema.parse(parent.source)
  const partial = gameAssetActionSheetPartialSchema.parse(parent.partial)
  const authorization = gameAssetActionSheetPartialAuthorizationSchema.parse(parent.authorization)
  const repair = gameAssetActionSheetPartialRepairApplyResultSchema.parse(value)
  if (repair.status !== 'succeeded' || !repair.authorization
    || repair.parentSourceId !== source.id || repair.parentPartialId !== partial.id) {
    throw new Error(repair.error ?? 'Game Asset partial action-sheet repair did not settle.')
  }
  const replacement = new Map(repair.outputs.map((output) => [output.roleId, output]))
  const replacedRoleIds = partial.failures.map(({ roleId }) => roleId)
  if (replacement.size !== replacedRoleIds.length
    || replacedRoleIds.some((roleId) => !replacement.has(roleId))
    || repair.authorization.replacementRoleIds.some((roleId, index) => roleId !== replacedRoleIds[index])) {
    throw new Error('Game Asset partial action-sheet repair output closure is incomplete.')
  }
  const preserved = new Map(partial.frames.map((frame) => [frame.roleId, frame]))
  const frames = parent.plan.roles.map((role) => {
    const frame = preserved.get(role.id)
    if (frame) return frame
    const output = replacement.get(role.id)
    if (!output) throw new Error(`Game Asset repaired action clip is missing ${role.id}.`)
    return {
      roleId: role.id,
      sourceArtifactId: output.receipt.artifact.artifactId,
      artifactId: output.processingEvidence.outputArtifactId,
      artifactSha256: output.processingEvidence.outputArtifactSha256,
      artifactBytesBase64: output.artifactBytesBase64,
      durationMs: partial.frameDurationMs,
      anchor: output.pixelEvidence.anchor,
      processingEvidence: output.processingEvidence,
      pixelEvidence: output.pixelEvidence,
    }
  })
  const identity = await fingerprint({
    parentPartialId: partial.id,
    parentAuthorizationReceiptHash: authorization.receiptHash,
    repairAuthorizationReceiptHash: repair.authorization.receiptHash,
    frames,
  })
  const clip = gameAssetActionClipSchema.parse({
    version: 'game-asset.action-clip.v1',
    id: `clip:game-asset-action-sheet-partial-repair:${identity}`,
    familyPlanId: partial.familyPlanId,
    groupId: partial.groupId,
    atomicPlanId: partial.atomicPlanId,
    atomicPlanHash: partial.atomicPlanHash,
    sourceId: source.id,
    frames,
  })
  return {
    clip,
    replacedRoleIds,
    preservedRoleIds: partial.frames.map(({ roleId }) => roleId),
    authorization: repair.authorization,
    outputs: repair.outputs,
  }
}

export async function deriveGameAssetScaleProfile(input: {
  readonly familyPlan: GameAssetFamilyPlan
  readonly masterGroup: GameAssetFamilyActionGroup
  readonly masterClip: GameAssetActionClip
}): Promise<GameAssetScaleProfile> {
  const familyPlan = gameAssetFamilyPlanSchema.parse(input.familyPlan)
  const group = familyPlan.groups.find(({ id }) => id === input.masterGroup.id)
  if (!group || group.compatibilityClass !== 'grounded-body'
    || !familyPlan.masterSelection.priorityGroupIds.includes(group.id)) {
    throw new Error('Game Asset scale profile masters must be an accepted grounded body priority group.')
  }
  const clip = gameAssetActionClipSchema.parse(input.masterClip)
  if (clip.familyPlanId !== familyPlan.id || clip.groupId !== group.id || clip.frames.length === 0) {
    throw new Error('Game Asset scale profile master clip is stale or belongs to another family group.')
  }
  const first = clip.frames[0]!
  const frameSize = 'frameSize' in first.processingEvidence
    ? first.processingEvidence.frameSize
    : { width: first.pixelEvidence.decodedWidth, height: first.pixelEvidence.decodedHeight }
  const measured = clip.frames.map((frame) => {
    const evidence = frame.processingEvidence
    const bounds = 'outputAlphaBounds' in evidence
      ? evidence.outputAlphaBounds
      : frame.pixelEvidence.alphaBounds
    const size = 'frameSize' in evidence
      ? evidence.frameSize
      : { width: frame.pixelEvidence.decodedWidth, height: frame.pixelEvidence.decodedHeight }
    if (size.width !== frameSize.width || size.height !== frameSize.height) {
      throw new Error('Game Asset master clip has inconsistent frame dimensions.')
    }
    return { width: bounds.width, height: bounds.height, anchor: frame.anchor }
  })
  const anchor = measured[0]!.anchor
  if (measured.some(({ anchor: candidate }) => (
    Math.abs(candidate.x - anchor.x) > 0.5 || Math.abs(candidate.y - anchor.y) > 0.5
  ))) {
    throw new Error('Game Asset master clip has unexplained anchor drift.')
  }
  const measuredAlphaSize = measured.reduce(
    (largest, current) => ({
      width: Math.max(largest.width, current.width),
      height: Math.max(largest.height, current.height),
    }),
    { width: 0, height: 0 },
  )
  const masterClipHash = await fingerprint(clip)
  const profilePayload = {
    version: 'game-asset.scale-profile.v1' as const,
    familyPlanId: familyPlan.id,
    masterClipId: clip.id,
    masterClipHash,
    compatibleClasses: ['grounded-body'] as const,
    canvas: frameSize,
    measuredAlphaSize,
    anchorPolicy: group.plan.roles[0]!.anchor,
    measuredAnchor: anchor,
    identityLock: group.plan.roles[0]!.identityLock,
    measurementImplementation: 'rgba-alpha-bounds-v1' as const,
  }
  const profileHash = await fingerprint(profilePayload)
  return gameAssetScaleProfileSchema.parse({
    ...profilePayload,
    id: `scale-profile:${profileHash}`,
  })
}

export interface GameAssetFamilyClosureProjection {
  readonly status: 'blocked' | 'ready'
  readonly blockers: readonly string[]
  readonly acceptedGroupIds: readonly string[]
  readonly scaleProfile: GameAssetScaleProfile | null
}

export async function projectGameAssetFamilyClosure(input: {
  readonly familyPlan: GameAssetFamilyPlan
  readonly actions: readonly GameAssetFamilyActionState[]
  readonly acceptedGroupIds: readonly string[]
  readonly scaleProfile?: GameAssetScaleProfile
}): Promise<GameAssetFamilyClosureProjection> {
  const plan = gameAssetFamilyPlanSchema.parse(input.familyPlan)
  const blockers: string[] = []
  const actionById = new Map(input.actions.map((action) => [action.group.id, action]))
  for (const group of plan.groups) {
    const action = actionById.get(group.id)
    if (!action?.clip || !action.source || !action.authorization) {
      blockers.push(`${group.label}: native generation is incomplete`)
      continue
    }
    if (action.clip.familyPlanId !== plan.id || action.authorization.familyPlanId !== plan.id) {
      blockers.push(`${group.label}: stale family lineage`)
    }
  }
  const accepted = [...new Set(input.acceptedGroupIds)]
  if (accepted.length !== plan.groups.length || plan.groups.some(({ id }) => !accepted.includes(id))) {
    blockers.push('Every action group requires an explicit semantic review decision.')
  }
  const masterGroup = plan.groups.find(({ id }) => input.scaleProfile?.masterClipId === actionById.get(id)?.clip?.id)
  if (!input.scaleProfile) {
    blockers.push('An accepted grounded master is required before family delivery.')
  } else {
    try {
      gameAssetScaleProfileSchema.parse(input.scaleProfile)
      if (input.scaleProfile.familyPlanId !== plan.id || !masterGroup) {
        blockers.push('Scale profile is stale or not derived from an accepted master clip.')
      }
    } catch {
      blockers.push('Scale profile evidence is malformed.')
    }
  }
  return {
    status: blockers.length === 0 ? 'ready' : 'blocked',
    blockers,
    acceptedGroupIds: accepted,
    scaleProfile: input.scaleProfile ?? null,
  }
}

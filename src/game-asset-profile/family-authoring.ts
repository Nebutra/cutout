import { fingerprint } from '@/design-ir/fingerprint'
import {
  compareGameAssetEvidenceIdentity,
  type GameAssetEvidenceReference,
} from './contracts'
import {
  authorGameAssetActionRun,
  type GameAssetActionAuthoringInput,
} from './authoring'
import {
  compileDefaultGameAssetFamilyPlan,
  familySafeMargin,
  gameAssetActionSheetPreviewInputSchema,
  type GameAssetActionSheetPreviewInput,
  type GameAssetFamilyActionGroup,
  type GameAssetFamilyPlan,
} from './family'
import type { GameAssetGenerationPreviewInput } from './generation'

export interface GameAssetFamilyRunAuthoringInput {
  readonly assetName: string
  readonly sourceText: string
  readonly kind: 'player' | 'npc' | 'creature' | 'prop'
  readonly view: 'topdown' | 'side' | 'three-quarter'
  readonly direction: 'none' | 'down' | 'left' | 'right' | 'up'
  readonly referenceFile: File
  readonly providerId: string
  readonly model: 'qwen-image-3.0' | 'qwen-image-3.0-pro'
  readonly frameSize?: number
  readonly bodyAlphaSize?: Readonly<{ width: number, height: number }>
  readonly fxAlphaSize?: Readonly<{ width: number, height: number }>
}

export interface AuthoredGameAssetFamilyRun {
  readonly plan: GameAssetFamilyPlan
  readonly previews: readonly GameAssetActionSheetPreviewInput[]
}

type RetainedEvidence = GameAssetGenerationPreviewInput['retainedEvidence'][number]

export function compileGameAssetActionSheetRepairPrompt(input: {
  readonly role: GameAssetFamilyActionGroup['plan']['roles'][number]
  readonly component: GameAssetFamilyActionGroup['component']
  readonly failed: boolean
  readonly excludeDetachedVisual: boolean
}): string {
  const { role } = input
  const subject = input.component === 'detached-fx'
    ? 'detached visual'
    : input.component === 'body'
      ? 'primary subject'
      : input.component
  return [
    `Repair only ${input.failed ? 'failed ' : ''}${role.action} ${role.direction}-facing frame ${role.frameIndex} from the supplied action sheet and deliberately inset composition reference.`,
    'Return exactly one isolated frame, not a sheet, comparison, or neighboring frame.',
    'Use a flat, uniform pure magenta (#FF00FF) background extending to all four image edges.',
    'Treat the second reference as the required spatial composition: preserve its centered canvas occupancy and do not enlarge the subject toward an edge.',
    `Keep the complete ${subject} inside the planned ${role.expectedAlphaSize.width}x${role.expectedAlphaSize.height} normalization envelope and preserve uninterrupted magenta beyond every visible edge.`,
    'Remove any floor line, ground plane, contact shadow, horizontal baseline, border, gutter, or grid line.',
    input.component === 'detached-fx'
      ? 'Preserve only the retained detached visual, palette, ignition origin, and exact animation phase. Do not include the primary subject, scenery, or unrelated visuals.'
      : 'Preserve the retained primary-subject identity, view, palette, visible details, action phase, and proportions.',
    ...(input.excludeDetachedVisual ? [
      'This is the primary-subject motion layer only. Keep every detached-visual origin empty: no flash, smoke, glow, energy arc, projectile, tracer, spark, debris, or other detached visual.',
      role.action === 'shoot'
        ? 'Express this phase only through aiming and mechanical recoil; keep the emission point completely empty.'
        : 'Express this phase only through the primary subject pose, articulation, deformation, or motion supported by the retained reference.',
    ] : []),
  ].join('\n')
}

function evidenceIdentity(reference: GameAssetEvidenceReference): string {
  return `${reference.id}@${reference.revision}`
}

function exactPlanReferences(plan: GameAssetFamilyPlan['groups'][number]['plan']) {
  const references = [
    ...plan.artDirectionEvidence,
    ...plan.referenceArtifacts,
    ...plan.roles.flatMap((role) => [role.identityLock, role.scaleLock, role.anchorLock]),
  ]
  const unique = new Map<string, GameAssetEvidenceReference>()
  for (const reference of references) {
    const key = evidenceIdentity(reference)
    const prior = unique.get(key)
    if (prior && prior.contentHash !== reference.contentHash) {
      throw new Error(`Game Asset family evidence conflicts at ${key}.`)
    }
    unique.set(key, reference)
  }
  return [...unique.values()].sort((left, right) => compareGameAssetEvidenceIdentity(
    evidenceIdentity(left),
    evidenceIdentity(right),
  ))
}

function retainedEvidenceIndex(
  inputs: readonly GameAssetGenerationPreviewInput[],
): ReadonlyMap<string, RetainedEvidence> {
  const retained = new Map<string, RetainedEvidence>()
  for (const input of inputs) {
    for (const item of input.retainedEvidence) {
      const key = evidenceIdentity(item.reference)
      const prior = retained.get(key)
      if (prior && (prior.reference.contentHash !== item.reference.contentHash
        || prior.mediaType !== item.mediaType
        || prior.artifactBytesBase64 !== item.artifactBytesBase64)) {
        throw new Error(`Game Asset retained evidence conflicts at ${key}.`)
      }
      retained.set(key, item)
    }
  }
  return retained
}

function retainedEvidenceForPlan(
  plan: GameAssetFamilyPlan['groups'][number]['plan'],
  retained: ReadonlyMap<string, RetainedEvidence>,
): RetainedEvidence[] {
  return exactPlanReferences(plan).map((reference) => {
    const item = retained.get(evidenceIdentity(reference))
    if (!item || item.reference.contentHash !== reference.contentHash) {
      throw new Error(`Game Asset family retained evidence is missing ${evidenceIdentity(reference)}.`)
    }
    return item
  })
}

export async function authorGameAssetFamilyRun(
  value: GameAssetFamilyRunAuthoringInput,
): Promise<AuthoredGameAssetFamilyRun> {
  const assetName = value.assetName.trim()
  const sourceText = value.sourceText.trim()
  const frameSize = value.frameSize ?? 512
  const safeMargin = familySafeMargin({ width: frameSize, height: frameSize })
  const safeSpan = frameSize - safeMargin * 2
  const bodyAlphaSize = value.bodyAlphaSize ?? { width: safeSpan, height: safeSpan }
  const fxAlphaSize = value.fxAlphaSize ?? { width: safeSpan, height: safeSpan }
  const primaryAnchor = value.kind === 'prop' ? 'bottom' as const : 'feet' as const
  const common = {
    assetName,
    view: value.view,
    direction: value.direction,
    frameWidth: frameSize,
    frameHeight: frameSize,
    referenceFile: value.referenceFile,
    providerId: value.providerId,
    model: value.model,
  } as const
  const bodySeedInput = {
    ...common,
    kind: value.kind,
    action: 'idle',
    frameCount: 1,
    prompt: sourceText,
    expectedAlphaWidth: bodyAlphaSize.width,
    expectedAlphaHeight: bodyAlphaSize.height,
    anchor: primaryAnchor,
  } satisfies GameAssetActionAuthoringInput
  const fxSeedInput = {
    ...common,
    kind: 'fx',
    action: 'impact',
    frameCount: 1,
    prompt: sourceText,
    expectedAlphaWidth: fxAlphaSize.width,
    expectedAlphaHeight: fxAlphaSize.height,
    anchor: 'ignition-baseline',
  } satisfies GameAssetActionAuthoringInput
  const [bodySeed, fxSeed] = await Promise.all([
    authorGameAssetActionRun(bodySeedInput),
    authorGameAssetActionRun(fxSeedInput),
  ])
  const bodyRole = bodySeed.plan.roles[0]
  const fxRole = fxSeed.plan.roles[0]
  const identityReference = bodySeed.plan.referenceArtifacts[0]
  const artDirectionEvidence = bodySeed.plan.artDirectionEvidence[0]
  if (!bodyRole || !fxRole || !identityReference || !artDirectionEvidence) {
    throw new Error('Game Asset family seed authoring did not close its evidence references.')
  }
  const plan = await compileDefaultGameAssetFamilyPlan({
    sourceText,
    assetName,
    kind: value.kind,
    view: value.view,
    direction: value.direction,
    frame: { width: frameSize, height: frameSize },
    bodyAlphaTarget: bodyAlphaSize,
    fxAlphaTarget: fxAlphaSize,
    identityReference,
    artDirectionEvidence,
    identityLock: bodyRole.identityLock,
    provisionalScaleLock: bodyRole.scaleLock,
    bodyAnchorLock: bodyRole.anchorLock,
    fxAnchorLock: fxRole.anchorLock,
  })
  const familyPlanHash = await fingerprint(plan)
  const retained = retainedEvidenceIndex([bodySeed, fxSeed])
  const previews = plan.groups.map((group) => {
    if (group.source.strategy !== 'coherent-grid') {
      throw new Error(`Initial Game Asset family group ${group.id} is not a coherent action sheet.`)
    }
    return gameAssetActionSheetPreviewInputSchema.parse({
      identity: {
        id: `rehearsal:${group.id}`,
        revision: `revision:sha256:${familyPlanHash}`,
      },
      runId: `run:game-family:${crypto.randomUUID()}`,
      providerId: value.providerId,
      model: value.model,
      familyPlanId: plan.id,
      familyPlanHash,
      groupId: group.id,
      plan: group.plan,
      retainedEvidence: retainedEvidenceForPlan(group.plan, retained),
      sourceBrief: group.sourceBrief,
      grid: {
        rows: group.source.rows,
        columns: group.source.columns,
      },
      frameDurationMs: group.timing.frameDurationMs,
      looping: group.timing.looping,
    })
  })
  return { plan, previews }
}

import { canonicalJson } from '@/design-ir/fingerprint'
import {
  createGameAssetDesktopGenerationRunner,
  GAME_ASSET_RASTER_PROCESSOR,
  gameAssetGenerationApplyResultSchema,
  gameAssetGenerationRepairPreviewSchema,
  gameAssetGenerationPreviewSchema,
  normalizeGameAssetGenerationRepairPreviewInput,
  normalizeGameAssetGenerationPreviewInput,
  retainedGameAssetRoleOutputSchema,
  type GameAssetDesktopGenerationRunner,
  type GameAssetGenerationPreview,
  type GameAssetGenerationPreviewInput,
  type GameAssetGenerationRepairPreview,
  type GameAssetGenerationRepairPreviewInput,
  type GameAssetSemanticAcceptance,
  type GameAssetSemanticAcceptanceDecision,
  type GameAssetSemanticAcceptancePreview,
  type RetainedGameAssetRoleOutput,
} from './generation'
import {
  gameAssetProductionRehearsalBundleSchema,
  verifyGameAssetProductionRehearsalBundle,
  type GameAssetProductionRehearsalBundle,
  type VerifiedGameAssetProductionRehearsal,
} from './rehearsal'

export interface PreparedGameAssetProductionRehearsal {
  readonly input: GameAssetGenerationPreviewInput
  readonly preview: GameAssetGenerationPreview
}

export interface PreparedGameAssetProductionRepair {
  readonly parent: Extract<AppliedGameAssetProductionRehearsal, { status: 'deterministic-evidence-verified' }>
  readonly input: GameAssetGenerationRepairPreviewInput
  readonly preview: GameAssetGenerationRepairPreview
}

type GameAssetProductionPreview = GameAssetGenerationPreview | GameAssetGenerationRepairPreview

export type AppliedGameAssetProductionRehearsal = {
  readonly status: 'partial'
  readonly preview: GameAssetProductionPreview
  readonly outputs: readonly RetainedGameAssetRoleOutput[]
  readonly error: string
} | {
  readonly status: 'deterministic-evidence-verified'
  readonly preview: GameAssetProductionPreview
  readonly bundle: GameAssetProductionRehearsalBundle
  readonly verified: VerifiedGameAssetProductionRehearsal
}

export interface AcceptedGameAssetProductionRehearsal {
  readonly status: 'semantic-evidence-verified'
  readonly preview: GameAssetProductionPreview
  readonly bundle: GameAssetProductionRehearsalBundle
  readonly verified: VerifiedGameAssetProductionRehearsal
  readonly acceptance: GameAssetSemanticAcceptance
}

export interface PreparedGameAssetSemanticAcceptance {
  readonly applied: Extract<AppliedGameAssetProductionRehearsal, { status: 'deterministic-evidence-verified' }>
  readonly decisions: readonly GameAssetSemanticAcceptanceDecision[]
  readonly preview: GameAssetSemanticAcceptancePreview
}

function retainedOutputs(
  bundle: GameAssetProductionRehearsalBundle,
): readonly RetainedGameAssetRoleOutput[] {
  return bundle.frames.map((frame) => retainedGameAssetRoleOutputSchema.parse({
    roleId: frame.roleId,
    receipt: frame.receipt,
    sourceMediaType: frame.receipt.artifact.mediaType,
    sourceArtifactBytesBase64: frame.sourceArtifactBytesBase64,
    mediaType: 'image/png',
    artifactBytesBase64: frame.artifactBytesBase64,
    processingEvidence: frame.processingEvidence,
    pixelEvidence: frame.pixelEvidence,
  }))
}

function rehearsalBundleFromOutputs(input: {
  readonly identity: GameAssetProductionRehearsalBundle['identity']
  readonly runId: string
  readonly plan: GameAssetProductionRehearsalBundle['plan']
  readonly authorization: GameAssetProductionRehearsalBundle['authorization']
  readonly retainedEvidence: GameAssetProductionRehearsalBundle['retainedEvidence']
  readonly outputs: readonly RetainedGameAssetRoleOutput[]
}): GameAssetProductionRehearsalBundle {
  return gameAssetProductionRehearsalBundleSchema.parse({
    schema: 'game-asset.production-rehearsal.v1',
    identity: input.identity,
    runId: input.runId,
    plan: input.plan,
    authorization: input.authorization,
    retainedEvidence: input.retainedEvidence,
    frames: input.outputs.map((output) => ({
      roleId: output.roleId,
      receipt: output.receipt,
      sourceArtifactBytesBase64: output.sourceArtifactBytesBase64,
      artifactBytesBase64: output.artifactBytesBase64,
      processingEvidence: output.processingEvidence,
      pixelEvidence: output.pixelEvidence,
    })),
  })
}

export async function prepareGameAssetProductionRehearsal(
  input: GameAssetGenerationPreviewInput,
  runner: GameAssetDesktopGenerationRunner = createGameAssetDesktopGenerationRunner(),
): Promise<PreparedGameAssetProductionRehearsal> {
  const normalized = normalizeGameAssetGenerationPreviewInput(input)
  const preview = gameAssetGenerationPreviewSchema.parse(await runner.preview(normalized))
  if (preview.runId !== normalized.runId
    || preview.gamePlanId !== normalized.plan.id
    || preview.providerId !== normalized.providerId
    || preview.model !== normalized.model
    || preview.processorImplementation !== GAME_ASSET_RASTER_PROCESSOR
    || preview.outputSize !== `${normalized.plan.delivery.frameWidth}x${normalized.plan.delivery.frameHeight}`
    || canonicalJson(preview.roleIds) !== canonicalJson(normalized.plan.roles.map(({ id }) => id))
    || canonicalJson(preview.referenceArtifactIds) !== canonicalJson(normalized.plan.referenceArtifacts.map(({ id }) => id))) {
    throw new Error('Native Game Asset preview does not bind the exact requested run closure.')
  }
  return { input: normalized, preview }
}

export async function applyPreparedGameAssetProductionRehearsal(
  preparedInput: PreparedGameAssetProductionRehearsal,
  options: {
    readonly runner?: GameAssetDesktopGenerationRunner
    readonly signal?: AbortSignal
  } = {},
): Promise<AppliedGameAssetProductionRehearsal> {
  const runner = options.runner ?? createGameAssetDesktopGenerationRunner()
  const input = normalizeGameAssetGenerationPreviewInput(preparedInput.input)
  const preview = gameAssetGenerationPreviewSchema.parse(preparedInput.preview)
  const result = gameAssetGenerationApplyResultSchema.parse(
    await runner.apply(preview.planId, options.signal),
  )
  if (result.status === 'partial') {
    return {
      status: 'partial',
      preview,
      outputs: result.outputs,
      error: result.error,
    }
  }
  const bundle = rehearsalBundleFromOutputs({
    identity: input.identity,
    runId: input.runId,
    plan: input.plan,
    authorization: result.authorization,
    retainedEvidence: input.retainedEvidence,
    outputs: result.outputs,
  })
  const verified = await verifyGameAssetProductionRehearsalBundle(bundle)
  return {
    status: 'deterministic-evidence-verified',
    preview,
    bundle,
    verified,
  }
}

export async function prepareGameAssetProductionRepair(
  parent: Extract<AppliedGameAssetProductionRehearsal, { status: 'deterministic-evidence-verified' }>,
  roles: readonly { readonly roleId: string, readonly prompt: string }[],
  options: {
    readonly runId?: string
    readonly runner?: GameAssetDesktopGenerationRunner
  } = {},
): Promise<PreparedGameAssetProductionRepair> {
  const runner = options.runner ?? createGameAssetDesktopGenerationRunner()
  const input = normalizeGameAssetGenerationRepairPreviewInput({
    parentAuthorization: parent.bundle.authorization,
    parentOutputs: [...retainedOutputs(parent.bundle)],
    runId: options.runId ?? `run:game-asset-repair:${globalThis.crypto.randomUUID()}`,
    plan: parent.bundle.plan,
    retainedEvidence: parent.bundle.retainedEvidence,
    roles: [...roles],
  })
  const preview = gameAssetGenerationRepairPreviewSchema.parse(await runner.previewRepair(input))
  const replacementRoleIds = input.roles.map(({ roleId }) => roleId)
  if (preview.runId !== input.runId
    || preview.gamePlanId !== input.plan.id
    || preview.providerId !== input.parentAuthorization.providerId
    || preview.model !== input.parentAuthorization.model
    || preview.processorImplementation !== GAME_ASSET_RASTER_PROCESSOR
    || preview.outputSize !== `${input.plan.delivery.frameWidth}x${input.plan.delivery.frameHeight}`
    || preview.parentAuthorizationReceiptId !== input.parentAuthorization.receiptId
    || preview.parentAuthorizationReceiptHash !== input.parentAuthorization.receiptHash
    || canonicalJson(preview.roleIds) !== canonicalJson(input.plan.roles.map(({ id }) => id))
    || canonicalJson(preview.replacementRoleIds) !== canonicalJson(replacementRoleIds)
    || canonicalJson(preview.referenceArtifactIds) !== canonicalJson(input.plan.referenceArtifacts.map(({ id }) => id))) {
    throw new Error('Native Game Asset repair preview does not bind the exact parent and replacement closure.')
  }
  return { parent, input, preview }
}

export async function applyPreparedGameAssetProductionRepair(
  prepared: PreparedGameAssetProductionRepair,
  options: {
    readonly runner?: GameAssetDesktopGenerationRunner
    readonly signal?: AbortSignal
  } = {},
): Promise<AppliedGameAssetProductionRehearsal> {
  const runner = options.runner ?? createGameAssetDesktopGenerationRunner()
  const result = gameAssetGenerationApplyResultSchema.parse(
    await runner.apply(prepared.preview.planId, options.signal),
  )
  if (result.status === 'partial') {
    return {
      status: 'partial',
      preview: prepared.preview,
      outputs: result.outputs,
      error: result.error,
    }
  }
  const lineage = result.authorization.repairLineage
  if (!lineage
    || lineage.parentReceiptId !== prepared.parent.bundle.authorization.receiptId
    || lineage.parentReceiptHash !== prepared.parent.bundle.authorization.receiptHash
    || canonicalJson(lineage.replacedRoleIds) !== canonicalJson(prepared.preview.replacementRoleIds)) {
    throw new Error('Native Game Asset repair authorization does not bind its parent preview.')
  }
  const bundle = rehearsalBundleFromOutputs({
    identity: prepared.parent.bundle.identity,
    runId: prepared.input.runId,
    plan: prepared.parent.bundle.plan,
    authorization: result.authorization,
    retainedEvidence: prepared.parent.bundle.retainedEvidence,
    outputs: result.outputs,
  })
  const replaced = new Set(prepared.preview.replacementRoleIds)
  for (const [index, parentFrame] of prepared.parent.bundle.frames.entries()) {
    if (!replaced.has(parentFrame.roleId)
      && canonicalJson(parentFrame) !== canonicalJson(bundle.frames[index])) {
      throw new Error(`Game Asset repair mutated preserved sibling ${parentFrame.roleId}.`)
    }
  }
  const verified = await verifyGameAssetProductionRehearsalBundle(bundle)
  return {
    status: 'deterministic-evidence-verified',
    preview: prepared.preview,
    bundle,
    verified,
  }
}

export async function prepareGameAssetSemanticAcceptance(
  applied: Extract<AppliedGameAssetProductionRehearsal, { status: 'deterministic-evidence-verified' }>,
  decisions: readonly GameAssetSemanticAcceptanceDecision[],
  runner: GameAssetDesktopGenerationRunner = createGameAssetDesktopGenerationRunner(),
): Promise<PreparedGameAssetSemanticAcceptance> {
  const outputs = retainedOutputs(applied.bundle)
  const preview = await runner.previewAcceptance({
    authorization: applied.bundle.authorization,
    outputs,
    decisions,
  })
  if (preview.generationReceiptId !== applied.bundle.authorization.receiptId
    || preview.generationReceiptHash !== applied.bundle.authorization.receiptHash
    || preview.planId !== applied.bundle.authorization.planId
    || preview.runId !== applied.bundle.runId
    || canonicalJson(preview.roleIds) !== canonicalJson(applied.bundle.plan.roles.map(({ id }) => id))
    || canonicalJson(preview.artifactIds) !== canonicalJson(applied.bundle.authorization.outputs.map(({ artifactId }) => artifactId))) {
    throw new Error('Native Game Asset semantic acceptance preview does not bind the displayed retained output closure.')
  }
  return { applied, decisions, preview }
}

export async function applyPreparedGameAssetSemanticAcceptance(
  prepared: PreparedGameAssetSemanticAcceptance,
  runner: GameAssetDesktopGenerationRunner = createGameAssetDesktopGenerationRunner(),
): Promise<AcceptedGameAssetProductionRehearsal> {
  const acceptance = await runner.applyAcceptance(prepared.preview.previewId)
  const bundle = gameAssetProductionRehearsalBundleSchema.parse({
    ...prepared.applied.bundle,
    semanticAcceptance: acceptance,
  })
  const verified = await verifyGameAssetProductionRehearsalBundle(bundle)
  if (verified.semanticAcceptanceClosure.status !== 'complete') {
    throw new Error('Native Game Asset semantic acceptance did not close the exact retained rehearsal.')
  }
  return {
    status: 'semantic-evidence-verified',
    preview: prepared.applied.preview,
    bundle,
    verified,
    acceptance,
  }
}

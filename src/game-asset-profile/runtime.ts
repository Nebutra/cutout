import { canonicalJson } from '@/design-ir/fingerprint'
import {
  createGameAssetDesktopGenerationRunner,
  GAME_ASSET_RASTER_PROCESSOR,
  gameAssetGenerationApplyResultSchema,
  gameAssetGenerationPreviewSchema,
  normalizeGameAssetGenerationPreviewInput,
  retainedGameAssetRoleOutputSchema,
  type GameAssetDesktopGenerationRunner,
  type GameAssetGenerationPreview,
  type GameAssetGenerationPreviewInput,
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

export type AppliedGameAssetProductionRehearsal = {
  readonly status: 'partial'
  readonly preview: GameAssetGenerationPreview
  readonly outputs: readonly RetainedGameAssetRoleOutput[]
  readonly error: string
} | {
  readonly status: 'deterministic-evidence-verified'
  readonly preview: GameAssetGenerationPreview
  readonly bundle: GameAssetProductionRehearsalBundle
  readonly verified: VerifiedGameAssetProductionRehearsal
}

export interface AcceptedGameAssetProductionRehearsal {
  readonly status: 'semantic-evidence-verified'
  readonly preview: GameAssetGenerationPreview
  readonly bundle: GameAssetProductionRehearsalBundle
  readonly verified: VerifiedGameAssetProductionRehearsal
  readonly acceptance: GameAssetSemanticAcceptance
}

export interface PreparedGameAssetSemanticAcceptance {
  readonly applied: Extract<AppliedGameAssetProductionRehearsal, { status: 'deterministic-evidence-verified' }>
  readonly decisions: readonly GameAssetSemanticAcceptanceDecision[]
  readonly preview: GameAssetSemanticAcceptancePreview
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
  const bundle = gameAssetProductionRehearsalBundleSchema.parse({
    schema: 'game-asset.production-rehearsal.v1',
    identity: input.identity,
    runId: input.runId,
    plan: input.plan,
    authorization: result.authorization,
    retainedEvidence: input.retainedEvidence,
    frames: result.outputs.map((output) => ({
      roleId: output.roleId,
      receipt: output.receipt,
      sourceArtifactBytesBase64: output.sourceArtifactBytesBase64,
      artifactBytesBase64: output.artifactBytesBase64,
      processingEvidence: output.processingEvidence,
      pixelEvidence: output.pixelEvidence,
    })),
  })
  const verified = await verifyGameAssetProductionRehearsalBundle(bundle)
  return {
    status: 'deterministic-evidence-verified',
    preview,
    bundle,
    verified,
  }
}

export async function prepareGameAssetSemanticAcceptance(
  applied: Extract<AppliedGameAssetProductionRehearsal, { status: 'deterministic-evidence-verified' }>,
  decisions: readonly GameAssetSemanticAcceptanceDecision[],
  runner: GameAssetDesktopGenerationRunner = createGameAssetDesktopGenerationRunner(),
): Promise<PreparedGameAssetSemanticAcceptance> {
  const outputs = applied.bundle.frames.map((frame) => retainedGameAssetRoleOutputSchema.parse({
    roleId: frame.roleId,
    receipt: frame.receipt,
    sourceMediaType: frame.receipt.artifact.mediaType,
    sourceArtifactBytesBase64: frame.sourceArtifactBytesBase64,
    mediaType: 'image/png',
    artifactBytesBase64: frame.artifactBytesBase64,
    processingEvidence: frame.processingEvidence,
    pixelEvidence: frame.pixelEvidence,
  }))
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

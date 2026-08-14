import {
  GAME_ASSET_PROFILE_ID,
  compareGameAssetEvidenceIdentity,
  gameAssetEvaluationSchema,
  gameAssetEvaluationInputSchema,
  gameAssetPlanSchema,
  observedGameAssetFrameSchema,
  type GameAssetEvaluation,
  type GameAssetEvaluationInput,
  type ObservedGameAssetFrame,
} from './contracts'
import { canonicalJson } from '@/design-ir/fingerprint'

export function evaluateGameAssetFrames(inputValue: GameAssetEvaluationInput): GameAssetEvaluation {
  const input = gameAssetEvaluationInputSchema.parse(inputValue)
  const plan = gameAssetPlanSchema.parse(input.plan)
  const frames = input.frames.map((frame) => observedGameAssetFrameSchema.parse(frame))
  const findings: Array<{ code: 'missing-role' | 'duplicate-role' | 'dimension-mismatch' | 'edge-contact' | 'identity-lock-mismatch' | 'scale-lock-mismatch' | 'anchor-lock-mismatch' | 'scale-geometry-mismatch' | 'anchor-position-mismatch' | 'reference-lineage-mismatch' | 'unknown-role' | 'reused-artifact', roleId: string, message: string }> = []
  const frameByRole = new Map<string, ObservedGameAssetFrame[]>()
  for (const frame of frames) frameByRole.set(frame.roleId, [...(frameByRole.get(frame.roleId) ?? []), frame])
  const plannedRoleIds = new Set(plan.roles.map(({ id }) => id))
  for (const frame of frames) {
    if (!plannedRoleIds.has(frame.roleId)) {
      findings.push({ code: 'unknown-role', roleId: frame.roleId, message: `Observed frame is not declared by the Game Asset plan: ${frame.roleId}` })
    }
  }
  const frameIdentities = new Map<string, ObservedGameAssetFrame[]>()
  const framesByContentHash = new Map<string, ObservedGameAssetFrame[]>()
  for (const frame of frames) {
    const identity = frame.artifactId
    frameIdentities.set(identity, [...(frameIdentities.get(identity) ?? []), frame])
    framesByContentHash.set(frame.contentHash, [...(framesByContentHash.get(frame.contentHash) ?? []), frame])
  }
  for (const reused of [...frameIdentities.values(), ...framesByContentHash.values()]) {
    if (reused.length > 1) {
      for (const frame of reused) {
        findings.push({ code: 'reused-artifact', roleId: frame.roleId, message: `Artifact evidence is reused across semantic Game Asset roles: ${frame.artifactId}` })
      }
    }
  }
  for (const role of plan.roles) {
    const candidates = frameByRole.get(role.id) ?? []
    if (candidates.length === 0) {
      findings.push({ code: 'missing-role', roleId: role.id, message: `Required Game Asset role is missing: ${role.id}` })
      continue
    }
    if (candidates.length > 1) findings.push({ code: 'duplicate-role', roleId: role.id, message: `Game Asset role has duplicate frames: ${role.id}` })
    for (const frame of candidates) {
      if (frame.decodedWidth !== plan.delivery.frameWidth || frame.decodedHeight !== plan.delivery.frameHeight) {
        findings.push({ code: 'dimension-mismatch', roleId: role.id, message: `Observed dimensions do not match the delivery contract for ${role.id}.` })
      }
      if (frame.edgeContact) findings.push({ code: 'edge-contact', roleId: role.id, message: `Frame ${role.id} touches its delivery cell edge.` })
      if (canonicalJson(frame.identityLock) !== canonicalJson(role.identityLock)) findings.push({ code: 'identity-lock-mismatch', roleId: role.id, message: `Frame ${role.id} consumes a stale identity lock.` })
      if (canonicalJson(frame.scaleLock) !== canonicalJson(role.scaleLock)) findings.push({ code: 'scale-lock-mismatch', roleId: role.id, message: `Frame ${role.id} consumes a stale scale lock.` })
      if (canonicalJson(frame.anchorLock) !== canonicalJson(role.anchorLock)) findings.push({ code: 'anchor-lock-mismatch', roleId: role.id, message: `Frame ${role.id} consumes a stale anchor lock.` })
      if (frame.alphaBounds.width !== role.expectedAlphaSize.width
        || frame.alphaBounds.height !== role.expectedAlphaSize.height) {
        findings.push({ code: 'scale-geometry-mismatch', roleId: role.id, message: `Frame ${role.id} does not match its planned alpha occupancy.` })
      }
      if (frame.anchor.x !== role.expectedAnchor.x || frame.anchor.y !== role.expectedAnchor.y) {
        findings.push({ code: 'anchor-position-mismatch', roleId: role.id, message: `Frame ${role.id} does not match its planned ${role.anchor} anchor.` })
      }
      if (plan.referenceArtifacts.some((reference) => !frame.sourceArtifacts.some((source) => (
        canonicalJson(source) === canonicalJson(reference)
      )))) {
        findings.push({ code: 'reference-lineage-mismatch', roleId: role.id, message: `Frame ${role.id} does not close over required reference artifacts.` })
      }
    }
  }
  const failedRoleIds = [...new Set(findings.map(({ roleId }) => roleId))]
    .sort(compareGameAssetEvidenceIdentity)
  const acceptedArtifacts = frames
    .filter(({ roleId }) => !failedRoleIds.includes(roleId))
    .map(({ roleId, artifactId, artifactRevision, contentHash }) => ({ roleId, artifactId, artifactRevision, contentHash }))
    .sort((left, right) => compareGameAssetEvidenceIdentity(left.roleId, right.roleId))
  return gameAssetEvaluationSchema.parse({
    version: 'game-asset.evaluation.v1',
    profileId: GAME_ASSET_PROFILE_ID,
    planId: plan.id,
    status: failedRoleIds.length === 0 ? 'passed' : acceptedArtifacts.length > 0 ? 'needs-repair' : 'blocked',
    acceptedArtifacts,
    failedRoleIds,
    findings,
  })
}

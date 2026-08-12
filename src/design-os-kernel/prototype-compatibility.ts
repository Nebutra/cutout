import { assetProductionSnapshotSchema, type AssetProductionSnapshot } from '@/asset-production/contracts'
import { sha256Bytes } from '@/asset-production/hash'
import { jsonValueSchema, recordIdSchema, sha256Schema, type JsonValue } from './contracts'
import { z } from 'zod'

export interface LegacyPrototypeArtifact {
  readonly artifactId: string
  readonly sha256: string
  readonly bytes: Uint8Array
}

export interface PrototypeCompatibilityInput {
  readonly snapshot: AssetProductionSnapshot
  readonly runId: string
  readonly artifacts: readonly LegacyPrototypeArtifact[]
  readonly provenance: JsonValue
  readonly recovery: JsonValue
  readonly exportResult: JsonValue
}

export interface PrototypeCompatibilityProjection {
  readonly planId: string
  readonly planHash: string
  readonly runId: string
  readonly lifecycle: readonly { readonly taskId: string, readonly status: string, readonly attempt: number }[]
  readonly acceptedArtifacts: readonly LegacyPrototypeArtifact[]
  readonly provenance: JsonValue
  readonly recovery: JsonValue
  readonly exportResult: JsonValue
}

export async function projectPrototypeCompatibility(
  input: PrototypeCompatibilityInput,
): Promise<PrototypeCompatibilityProjection> {
  const snapshot = assetProductionSnapshotSchema.parse(input.snapshot)
  const runId = recordIdSchema.parse(input.runId)
  const artifacts = z.array(z.object({
    artifactId: recordIdSchema,
    sha256: sha256Schema,
    bytes: z.instanceof(Uint8Array),
  }).strict()).max(20_000).parse(input.artifacts)
  const provenance = jsonValueSchema.parse(input.provenance)
  const recovery = jsonValueSchema.parse(input.recovery)
  const exportResult = jsonValueSchema.parse(input.exportResult)
  const run = snapshot.runs[runId]
  if (!run) throw new Error(`Legacy prototype run is unavailable: ${runId}`)
  const plan = snapshot.plans[run.planId]
  if (!plan || plan.planHash !== run.planHash) throw new Error('Legacy prototype Plan identity is inconsistent.')
  const artifactById = new Map(artifacts.map((artifact) => [artifact.artifactId, artifact]))
  if (artifactById.size !== artifacts.length) throw new Error('Legacy artifact ids must be unique.')
  const acceptedArtifacts: LegacyPrototypeArtifact[] = []
  for (const task of Object.values(run.tasks)) {
    if (task.status !== 'ready' && task.status !== 'waived') continue
    const output = task.output
    if (!output) throw new Error(`Consumable legacy task has no output: ${task.taskId}`)
    const artifact = artifactById.get(output.artifactId)
    if (!artifact || artifact.sha256 !== output.sha256 || await sha256Bytes(artifact.bytes) !== output.sha256) {
      throw new Error(`Legacy prototype bytes do not match CAS evidence: ${output.artifactId}`)
    }
    acceptedArtifacts.push({ ...artifact, bytes: Uint8Array.from(artifact.bytes) })
  }
  return {
    planId: plan.planId,
    planHash: plan.planHash,
    runId: run.runId,
    lifecycle: Object.values(run.tasks).map((task) => ({
      taskId: task.taskId,
      status: task.status,
      attempt: task.attempt,
    })),
    acceptedArtifacts,
    provenance,
    recovery,
    exportResult,
  }
}

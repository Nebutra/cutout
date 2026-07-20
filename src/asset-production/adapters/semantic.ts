import type {
  SemanticSliceArtifact,
  SemanticSlicePlan,
  SemanticSliceSpec,
} from '@/services/ai/semantic-slices'
import {
  type AssetProductionPlan,
  type AssetProductionRun,
  type AssetProductionSnapshot,
  type ProductionArtifactRef,
  type ProductionIssue,
} from '../contracts'
import {
  beginAssetProduction,
  failAssetProductionTask,
  finalizeAssetProduction,
  publishAssetProductionTask,
} from '../coordinator'
import { compileAssetProductionPlan } from '../planner'
import { integrityIssue, qualityIssue } from '../quality-policy'

export interface MaterializedSemanticArtifact {
  readonly artifact: ProductionArtifactRef
  readonly blob: Blob
}

export interface SemanticProductionProjection {
  readonly taskId: string
  readonly runId: string
  readonly manifestItemId: string
  readonly pageId: string
  readonly regionId: string
  readonly name: string
  readonly blob: Blob
  readonly width: number
  readonly height: number
  readonly outputArtifactId: string
  readonly readiness: 'ready' | 'needs-review'
  readonly reviewIssues: readonly string[]
}

export interface SemanticProductionResult {
  readonly snapshot: AssetProductionSnapshot
  readonly plan: AssetProductionPlan
  readonly run: AssetProductionRun
  readonly projections: readonly SemanticProductionProjection[]
}

export async function publishSemanticSliceProduction(input: {
  readonly snapshot: AssetProductionSnapshot
  readonly semanticPlan: SemanticSlicePlan
  readonly artifacts: readonly SemanticSliceArtifact[]
  readonly projectRevisionId: string
  readonly source?: {
    readonly artifactId: string
    readonly sha256: string
  }
  readonly runId: string
  readonly providerRoute: string
  readonly materialize: (
    artifact: SemanticSliceArtifact & { readonly asset: NonNullable<SemanticSliceArtifact['asset']> },
    runId: string,
  ) => Promise<MaterializedSemanticArtifact>
  readonly at?: number
}): Promise<SemanticProductionResult> {
  const at = input.at ?? Date.now()
  const pageId = input.source ? 'semantic-reference' : 'semantic-brief'
  const plan = await compileAssetProductionPlan({
    sourceRevision: {
      projectRevisionId: input.projectRevisionId,
      pageArtifacts: input.source
        ? [{ pageId, artifactId: input.source.artifactId, sha256: input.source.sha256 }]
        : [],
    },
    items: input.semanticPlan.slices.map((spec) => ({
      manifestItemId: semanticManifestItemId(spec),
      pageId,
      regionId: spec.id,
      route: 'semantic-repair' as const,
      required: spec.priority === 'required',
      transparent: true,
      label: spec.name,
      description: spec.description,
    })),
    createdAt: at,
  })
  let snapshot = beginAssetProduction({
    snapshot: input.snapshot,
    plan,
    runId: input.runId,
    at,
  })
  const projections: SemanticProductionProjection[] = []

  for (const task of plan.tasks) {
    const spec = input.semanticPlan.slices.find(
      (item) => semanticManifestItemId(item) === task.manifestItemId,
    )
    if (!spec) {
      snapshot = failAssetProductionTask({
        snapshot,
        runId: input.runId,
        taskId: task.taskId,
        issues: [integrityIssue('semantic-spec-missing', `Semantic spec is unavailable for ${task.manifestItemId}.`, at)],
        at,
      })
      continue
    }
    const candidates = input.artifacts.filter((artifact) => artifact.spec.id === spec.id)
    const selected = candidates.find((artifact) => artifact.accepted && artifact.asset)
      ?? candidates.find((artifact) => artifact.asset)
    if (!selected?.asset) {
      const detail = candidates.map((artifact) => artifact.error).find(Boolean)
        ?? `No semantic asset was generated for ${spec.name}.`
      snapshot = failAssetProductionTask({
        snapshot,
        runId: input.runId,
        taskId: task.taskId,
        issues: [integrityIssue('semantic-output-missing', detail, at)],
        at,
      })
      continue
    }

    try {
      const materialized = await input.materialize(
        selected as SemanticSliceArtifact & { readonly asset: NonNullable<SemanticSliceArtifact['asset']> },
        input.runId,
      )
      const reviewIssues = semanticReviewIssues(selected, at)
      snapshot = publishAssetProductionTask({
        snapshot,
        runId: input.runId,
        taskId: task.taskId,
        artifact: materialized.artifact,
        reviewIssues,
        evidence: {
          sourceArtifactId: input.source?.artifactId,
          bounds: {
            x: 0,
            y: 0,
            width: materialized.artifact.width,
            height: materialized.artifact.height,
          },
          qaVerdict: selected.validation
            ? {
                pass: selected.validation.verdict === 'pass',
                failures: selected.validation.issues,
              }
            : undefined,
          providerRoute: `${input.providerRoute}:${selected.route}`,
        },
        at,
      })
      const state = snapshot.runs[input.runId]!.tasks[task.taskId]!
      if (state.status === 'ready' || state.status === 'needs-review') {
        projections.push({
          taskId: task.taskId,
          runId: input.runId,
          manifestItemId: task.manifestItemId,
          pageId: task.pageId,
          regionId: task.regionId,
          name: task.label ?? task.manifestItemId,
          blob: materialized.blob,
          width: materialized.artifact.width,
          height: materialized.artifact.height,
          outputArtifactId: materialized.artifact.artifactId,
          readiness: state.status,
          reviewIssues: state.issues.map((issue) => issue.message),
        })
      }
    } catch (error) {
      snapshot = failAssetProductionTask({
        snapshot,
        runId: input.runId,
        taskId: task.taskId,
        issues: [integrityIssue(
          'semantic-publication-failed',
          error instanceof Error ? error.message : String(error),
          at,
        )],
        at,
      })
    }
  }

  snapshot = finalizeAssetProduction(snapshot, input.runId, at)
  return { snapshot, plan, run: snapshot.runs[input.runId]!, projections }
}

function semanticManifestItemId(spec: SemanticSliceSpec): string {
  return `semantic:${spec.id}`
}

function semanticReviewIssues(
  artifact: SemanticSliceArtifact,
  at: number,
): readonly ProductionIssue[] {
  if (artifact.accepted && artifact.validation?.verdict === 'pass') return []
  if (artifact.error) {
    return [qualityIssue('semantic-qa-unavailable', artifact.error, 'model-review', at)]
  }
  if (!artifact.validation) {
    return [qualityIssue(
      'semantic-qa-missing',
      'Semantic QA was skipped or returned no verdict.',
      'model-review',
      at,
    )]
  }
  return [qualityIssue(
    `semantic-qa-${artifact.validation.verdict}`,
    artifact.validation.issues.join(' ') || `Semantic QA returned ${artifact.validation.verdict}.`,
    'model-review',
    at,
  )]
}

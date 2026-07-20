import type { AssetProductionExecutor, AssetProductionExecutionResult } from '../runtime'
import type { AssetProductionPlan, AssetProductionTask, ProductionArtifactRef, ProductionIssue, ProductionTaskEvidence } from '../contracts'

export interface DirectProducedAsset {
  readonly artifact: ProductionArtifactRef
  readonly evidence?: ProductionTaskEvidence
}

export interface DirectAssetProducer {
  produce(input: {
    readonly plan: AssetProductionPlan
    readonly task: AssetProductionTask
    readonly runId: string
    readonly attempt: number
    readonly signal?: AbortSignal
  }): Promise<ProductionArtifactRef | DirectProducedAsset>
}

export interface DirectAssetReviewer {
  review(input: {
    readonly plan: AssetProductionPlan
    readonly task: AssetProductionTask
    readonly artifact: ProductionArtifactRef
    readonly signal?: AbortSignal
  }): Promise<readonly ProductionIssue[]>
}

export interface DirectAssetVerifier {
  verify(input: {
    readonly task: AssetProductionTask
    readonly artifact: ProductionArtifactRef
    readonly signal?: AbortSignal
  }): Promise<readonly ProductionIssue[]>
}

export function createDirectAssetExecutor(input: {
  readonly producer: DirectAssetProducer
  readonly reviewer: DirectAssetReviewer
  readonly verifier: DirectAssetVerifier
}): AssetProductionExecutor {
  return {
    async execute(context): Promise<AssetProductionExecutionResult> {
      const produced = await input.producer.produce(context)
      const candidate = 'artifact' in produced ? produced.artifact : produced
      const evidence = 'artifact' in produced ? produced.evidence : undefined
      const reviewIssues = await input.reviewer.review({
        plan: context.plan,
        task: context.task,
        artifact: candidate,
        signal: context.signal,
      })
      const verificationIssues = await input.verifier.verify({
        task: context.task,
        artifact: candidate,
        signal: context.signal,
      })
      return { candidate, output: candidate, reviewIssues, verificationIssues, evidence }
    },
  }
}

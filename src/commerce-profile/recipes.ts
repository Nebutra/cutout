import {
  compileExecutionPlan,
  compileOutcomeContract,
  type Budget,
  type EvidenceGraph,
  type ExecutionPlan,
  type OutcomeContract,
  type OutcomeGraph,
  type RecipeCompiler,
} from '@/design-os-kernel'
import {
  COMMERCE_CAPABILITY_IDS,
  COMMERCE_CONSTRAINT_IDS,
  COMMERCE_RECIPE_ID,
  COMMERCE_RECIPE_VERSION,
  COMMERCE_TARGET_ID,
  commerceOutcomePayloadSchema,
} from './profile'

export const COMMERCE_RUN_BUDGET: Budget = Object.freeze({
  attempts: 24,
  artifacts: 24,
  bytes: 260 * 1024 * 1024,
  timeMs: 25 * 60 * 1_000,
  spendUnits: 100,
})

const copyBudget: Budget = Object.freeze({
  attempts: 2,
  artifacts: 2,
  bytes: 2 * 1024 * 1024,
  timeMs: 2 * 60 * 1_000,
  spendUnits: 5,
})

const imageBudget: Budget = Object.freeze({
  attempts: 2,
  artifacts: 2,
  bytes: 10 * 1024 * 1024,
  timeMs: 4 * 60 * 1_000,
  spendUnits: 10,
})

const videoBudget: Budget = Object.freeze({
  attempts: 2,
  artifacts: 2,
  bytes: 200 * 1024 * 1024,
  timeMs: 8 * 60 * 1_000,
  spendUnits: 25,
})

const strategyBudget: Budget = Object.freeze({
  attempts: 2,
  artifacts: 2,
  bytes: 2 * 1024 * 1024,
  timeMs: 2 * 60 * 1_000,
  spendUnits: 5,
})

const transientFailureCodes = ['provider-timeout', 'rate-limit', 'host-recovery-interrupted'] as const

const artifactIdPattern = /^artifact:sha256:[a-f0-9]{64}$/

export function createCommerceRecipeCompiler(
  sourceImageArtifactIds: readonly string[],
): RecipeCompiler {
  if (sourceImageArtifactIds.length < 1 || sourceImageArtifactIds.length > 3
    || new Set(sourceImageArtifactIds).size !== sourceImageArtifactIds.length
    || sourceImageArtifactIds.some((artifactId) => !artifactIdPattern.test(artifactId))) {
    throw new Error('Commerce production requires one to three unique content-addressed source images.')
  }
  return {
    id: COMMERCE_RECIPE_ID,
    version: COMMERCE_RECIPE_VERSION,
    compile: (node) => {
      const payload = commerceOutcomePayloadSchema.parse(node.payload)
      const capabilityId = payload.kind === 'localized-description'
        ? COMMERCE_CAPABILITY_IDS.localizedCopy
        : payload.kind === 'strategy'
          ? COMMERCE_CAPABILITY_IDS.strategy
          : payload.mediaKind === 'image'
            ? COMMERCE_CAPABILITY_IDS.image
            : COMMERCE_CAPABILITY_IDS.video
      const outputSchema = payload.kind === 'localized-description'
        ? { id: 'commerce.localized-description', version: 1 as const }
        : payload.kind === 'strategy'
          ? { id: 'commerce.strategy-document', version: 1 as const }
          : { id: 'commerce.media-artifact', version: 1 as const }
      const budget = payload.kind === 'localized-description'
        ? copyBudget
        : payload.kind === 'strategy'
          ? strategyBudget
          : payload.mediaKind === 'image'
            ? imageBudget
            : videoBudget
      return [{
        capabilityId,
        targetId: COMMERCE_TARGET_ID,
        dependencyNodeIds: [],
        inputArtifactIds: payload.kind === 'media' && payload.mediaKind === 'image'
          ? payload.semanticRole === 'main-image'
            ? [...sourceImageArtifactIds]
            : [sourceImageArtifactIds[0]!]
          : [],
        outputSchema,
        constraints: [
          ...COMMERCE_CONSTRAINT_IDS,
          payload.marketPolicyId,
          payload.identityLockId,
          payload.creativeDirectionId,
          `role:${payload.semanticRole}`,
        ],
        transientFailureCodes: [...transientFailureCodes],
        budget,
        maxAttempts: 2,
        deadlineMs: budget.timeMs,
      }]
    },
  }
}
export async function compileCommerceProduction(input: {
  readonly evidenceGraph: EvidenceGraph
  readonly outcomeGraph: OutcomeGraph
  readonly contractId?: string
  readonly contractRevision?: string
  readonly planId?: string
  readonly planRevision?: string
  readonly budget?: Budget
  readonly sourceImageArtifactIds: readonly string[]
}): Promise<{ readonly contract: OutcomeContract, readonly plan: ExecutionPlan }> {
  const budget = input.budget ?? COMMERCE_RUN_BUDGET
  const contract = await compileOutcomeContract({
    id: input.contractId ?? 'contract:commerce-production',
    revision: input.contractRevision ?? 'contract:commerce-production:revision:1',
    evidenceGraph: input.evidenceGraph.identity,
    evidenceGraphValue: input.evidenceGraph,
    outcomeGraph: input.outcomeGraph,
    allowedCapabilityIds: Object.values(COMMERCE_CAPABILITY_IDS),
    allowedTargetIds: [COMMERCE_TARGET_ID],
    constraintIds: [
      ...COMMERCE_CONSTRAINT_IDS,
      ...input.outcomeGraph.body.nodes.flatMap((node) => {
        const payload = commerceOutcomePayloadSchema.parse(node.payload)
        return [payload.marketPolicyId, payload.identityLockId, payload.creativeDirectionId, `role:${payload.semanticRole}`]
      }),
    ].filter((value, index, values) => values.indexOf(value) === index),
    budget,
    provenance: [{
      sourceId: 'profile:commerce-materials',
      revision: '1.1.0',
      relation: 'compiled-from-profile',
    }],
  })
  const plan = await compileExecutionPlan({
    id: input.planId ?? 'plan:commerce-production',
    revision: input.planRevision ?? 'plan:commerce-production:revision:1',
    contract,
    outcomeGraph: input.outcomeGraph,
    recipes: [createCommerceRecipeCompiler(input.sourceImageArtifactIds)],
    budget,
    provenance: [{
      sourceId: 'profile:commerce-materials',
      revision: '1.1.0',
      relation: 'compiled-from-profile',
    }],
  })
  return { contract, plan }
}

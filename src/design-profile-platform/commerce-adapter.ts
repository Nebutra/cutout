import { fingerprint } from '@/design-ir/fingerprint'
import { z } from 'zod'
import {
  COMMERCE_CAPABILITY_IDS,
  COMMERCE_CONSTRAINT_IDS,
  COMMERCE_CREATIVE_DIRECTION_ID,
  COMMERCE_IDENTITY_LOCK_ID,
  COMMERCE_PROFILE_ID,
  COMMERCE_PROFILE_VERSION,
  COMMERCE_RECIPE_ID,
  COMMERCE_RECIPE_VERSION,
  COMMERCE_SEMANTIC_ROLES,
  commerceProfileBenchmarkReportSchema,
  decodeCommerceProfileBenchmarkReport,
  validationFindingSchema,
  compileCommerceProduction,
  type CommerceEvaluationResult,
} from '@/commerce-profile'
import type { EvidenceGraph, ExecutionPlan, OutcomeContract, OutcomeGraph } from '@/design-os-kernel'
import {
  DESIGN_PROFILE_MANIFEST_PROTOCOL,
  createDesignProfileManifest,
  type DesignProfileManifest,
  type ProfileManifestContent,
  type RegisteredProfileBinding,
} from './contracts'
import type { ProfileBindingRegistries } from './registries'

export interface CommerceProfileAdapterPackage {
  readonly manifest: DesignProfileManifest
  readonly registrations: readonly RegisteredProfileBinding[]
  readonly registerTrustedBindings: (registries: Pick<ProfileBindingRegistries, 'evidenceBenchmarkAdapters' | 'outcomeScorecardAdapters'>) => void
}

const commerceEvaluationResultSchema = z.object({
  ready: z.boolean(),
  findings: z.array(validationFindingSchema).max(100_000),
  validArtifactIds: z.array(z.string().min(1).max(240)).max(20_000),
  failedOutcomeNodeIds: z.array(z.string().min(1).max(240)).max(20_000),
  repairPlanNodeIds: z.array(z.string().min(1).max(240)).max(20_000),
  imageUsability: z.object({
    usable: z.number().int().nonnegative(),
    required: z.number().int().nonnegative(),
    ratio: z.number().finite().min(0).max(1),
  }).strict(),
}).strict().superRefine((evaluation, context) => {
  for (const [label, ids] of [
    ['valid artifact', evaluation.validArtifactIds],
    ['failed Outcome', evaluation.failedOutcomeNodeIds],
    ['repair Plan node', evaluation.repairPlanNodeIds],
  ] as const) {
    if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', message: `Commerce ${label} ids must be unique.` })
  }
  if (evaluation.ready !== (evaluation.findings.length === 0 && evaluation.failedOutcomeNodeIds.length === 0)) {
    context.addIssue({ code: 'custom', message: 'Commerce Outcome readiness must be derived from findings.' })
  }
  const expectedRatio = evaluation.imageUsability.required === 0
    ? 0
    : evaluation.imageUsability.usable / evaluation.imageUsability.required
  if (evaluation.imageUsability.usable > evaluation.imageUsability.required
    || evaluation.imageUsability.ratio !== expectedRatio) {
    context.addIssue({ code: 'custom', message: 'Commerce image usability must be derived from its counts.' })
  }
})

const bindingSources = {
  schemas: 'commerce.profile.schemas.v1',
  compiler: 'commerce.profile.compiler.v1',
  recipe: `commerce.profile.recipe.${COMMERCE_RECIPE_VERSION}`,
  policy: 'commerce.profile.policy.v1',
  evaluator: 'commerce.profile.evaluator.v1',
  renderer: 'commerce.profile.renderer.v1',
  inspector: 'commerce.profile.inspector.v1',
  action: 'commerce.profile.repair-action.v1',
  delivery: 'commerce.profile.delivery.v1',
  evidence: 'commerce.profile.evidence-adapter.v1',
  scorecard: 'commerce.profile.outcome-scorecard.v1',
} as const

export async function createCommerceProfileAdapterPackage(): Promise<CommerceProfileAdapterPackage> {
  const hashes = Object.fromEntries(await Promise.all(Object.entries(bindingSources)
    .map(async ([key, source]) => [key, await fingerprint(source)]))) as Record<keyof typeof bindingSources, string>
  const binding = <Kind extends RegisteredProfileBinding['kind']>(kind: Kind, id: string, implementationHash: string, required = true) => ({
    kind, id, version: '1.0.0', implementationHash, required,
  }) as const
  const references = {
    schemas: binding('schema', 'schema-set:commerce', hashes.schemas),
    compiler: binding('compiler', 'compiler:commerce-production', hashes.compiler),
    recipe: binding('recipe', COMMERCE_RECIPE_ID, hashes.recipe),
    policy: binding('policy', 'policy:commerce-marketplace', hashes.policy),
    evaluator: binding('evaluator', 'evaluator:commerce-production', hashes.evaluator),
    renderer: binding('renderer', 'renderer:commerce-material', hashes.renderer, false),
    inspector: binding('inspector', 'inspector:commerce-material', hashes.inspector),
    action: binding('semantic-action', 'action:commerce-repair', hashes.action),
    delivery: binding('delivery', 'delivery:commerce-materials', hashes.delivery),
    evidence: binding('evidence-benchmark-adapter', 'benchmark-adapter:commerce', hashes.evidence),
    scorecard: binding('outcome-scorecard-adapter', 'scorecard:commerce-outcome', hashes.scorecard),
  }
  const content: ProfileManifestContent = {
    protocol: DESIGN_PROFILE_MANIFEST_PROTOCOL,
    id: COMMERCE_PROFILE_ID,
    version: COMMERCE_PROFILE_VERSION,
    kernelCompatibility: '^1.0.0',
    dependencies: [],
    schemas: [references.schemas],
    compilers: [references.compiler],
    recipes: [references.recipe],
    policies: [references.policy],
    evaluators: [references.evaluator],
    renderers: [references.renderer],
    inspectors: [references.inspector],
    semanticActions: [references.action],
    deliveries: [references.delivery],
    migrations: [],
    evidenceBenchmarkAdapters: [references.evidence],
    outcomeScorecardAdapters: [references.scorecard],
    capabilityRequirements: Object.values(COMMERCE_CAPABILITY_IDS).map((capabilityId) => ({
      capabilityId,
      required: true,
      reason: 'Required by the existing Commerce production Contract and Plan.',
    })),
    libraryRequirements: [],
    requiredRoleClosures: [{
      id: 'roles:commerce-delivery',
      roles: COMMERCE_SEMANTIC_ROLES.map((roleId) => ({
        roleId,
        outputSchema: roleId.startsWith('localized-description')
          ? { id: 'commerce.localized-description', version: 1 }
          : roleId === 'strategy-document'
            ? { id: 'commerce.strategy-document', version: 1 }
            : { id: 'commerce.media-artifact', version: 1 },
        cardinality: { minimum: 1, maximum: 1 },
        constraintIds: [...COMMERCE_CONSTRAINT_IDS],
      })),
    }],
    identityBindings: [
      {
        id: COMMERCE_IDENTITY_LOCK_ID,
        kind: 'identity',
        sourceKind: 'project-evidence',
        requiredRoleIds: [...COMMERCE_SEMANTIC_ROLES],
        evaluatorBindingId: references.evaluator.id,
      },
      {
        id: COMMERCE_CREATIVE_DIRECTION_ID,
        kind: 'continuity',
        sourceKind: 'project-evidence',
        requiredRoleIds: [...COMMERCE_SEMANTIC_ROLES],
        evaluatorBindingId: references.evaluator.id,
      },
    ],
    fixtures: [],
  }
  const manifest = await createDesignProfileManifest(content)
  const registrations = Object.values(references).map((reference) => ({
    kind: reference.kind,
    id: reference.id,
    version: reference.version,
    implementationHash: reference.implementationHash,
    ownerId: 'cutout:commerce-profile',
  }))
  const registrationFor = (kind: RegisteredProfileBinding['kind']): RegisteredProfileBinding => {
    const registration = registrations.find((candidate) => candidate.kind === kind)
    if (!registration) throw new Error(`Missing trusted Commerce registration: ${kind}`)
    return registration
  }
  return {
    manifest,
    registrations,
    registerTrustedBindings(registries) {
      registries.evidenceBenchmarkAdapters.register({
        ...registrationFor('evidence-benchmark-adapter'),
        kind: 'evidence-benchmark-adapter',
        implementation: {
          profileId: COMMERCE_PROFILE_ID,
          ruler: { id: 'ruler:commerce-evidence', version: 1, digest: hashes.evidence },
          sourceSchema: commerceProfileBenchmarkReportSchema,
          project: (source) => {
            const report = decodeCommerceProfileBenchmarkReport(source)
            return {
              profileId: COMMERCE_PROFILE_ID,
              ruler: { id: 'ruler:commerce-evidence', version: 1, digest: hashes.evidence },
              metrics: report.metrics.map((metric) => ({
                id: metric.id,
                status: metric.status,
                evidenceIds: metric.evidenceReferences.map(({ id }) => id),
              })),
            }
          },
        },
      })
      registries.outcomeScorecardAdapters.register({
        ...registrationFor('outcome-scorecard-adapter'),
        kind: 'outcome-scorecard-adapter',
        implementation: {
          profileId: COMMERCE_PROFILE_ID,
          ruler: { id: 'ruler:commerce-outcome', version: 1, digest: hashes.scorecard },
          sourceSchema: commerceEvaluationResultSchema,
          project: (source) => {
            const evaluation = commerceEvaluationResultSchema.parse(source)
            const total = evaluation.validArtifactIds.length + evaluation.failedOutcomeNodeIds.length
            return {
              profileId: COMMERCE_PROFILE_ID,
              ruler: { id: 'ruler:commerce-outcome', version: 1, digest: hashes.scorecard },
              criteria: [{
                id: 'criterion:role-closure',
                score: evaluation.validArtifactIds.length,
                maximumScore: Math.max(1, total),
                evidenceIds: [...new Set([
                  ...evaluation.validArtifactIds,
                  ...evaluation.failedOutcomeNodeIds,
                ])].sort(),
              }],
            }
          },
        },
      })
    },
  }
}

export async function compileCommerceThroughProfileAdapter(input: {
  readonly evidenceGraph: EvidenceGraph
  readonly outcomeGraph: OutcomeGraph
  readonly sourceImageArtifactIds: readonly string[]
}): Promise<{ readonly contract: OutcomeContract, readonly plan: ExecutionPlan }> {
  return compileCommerceProduction(input)
}

export function projectCommerceOutcomeScore(evaluation: CommerceEvaluationResult) {
  const parsed = commerceEvaluationResultSchema.parse(evaluation)
  const total = parsed.validArtifactIds.length + parsed.failedOutcomeNodeIds.length
  return {
    profileId: COMMERCE_PROFILE_ID,
    rulerId: 'ruler:commerce-outcome:v1',
    score: parsed.validArtifactIds.length,
    maximumScore: total,
    ready: parsed.ready,
  } as const
}

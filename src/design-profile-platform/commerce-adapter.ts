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
  attributeIndexSchema,
  capabilityReceiptSchema,
  categoryIndexSchema,
  commerceMaterialPublicationSchema,
  commerceOutcomePayloadSchema,
  commerceProductionRehearsalBundleSchema,
  compileCommerceProduction,
  createCommerceOutcomeFragments,
  evaluateCommerceProduction,
  installCommerceProfileSchemas,
  productFactsSchema,
  validationFindingSchema,
  verifyNativeCommerceSourceIngestReceipt,
  verifyCommerceProductionRehearsalBundle,
  type CommerceEvaluationResult,
} from '@/commerce-profile'
import { canonicalJson, fingerprint } from '@/design-ir/fingerprint'
import {
  executionPlanSchema,
  outcomeGraphSchema,
  type EvidenceGraph,
  type ExecutionPlan,
  type OutcomeContract,
  type OutcomeGraph,
} from '@/design-os-kernel/contracts'
import type { SchemaRegistry } from '@/design-os-kernel/registry'
import { verifyNativeMultimodalHostArtifact } from '@/multimodal-host/desktop-host'
import {
  DESIGN_OS_BENCHMARK_ID,
  DESIGN_OS_BENCHMARK_RULER,
  DESIGN_OS_BENCHMARK_VERSION,
} from '@/design-os-benchmark/contracts'
import {
  DESIGN_PROFILE_MANIFEST_PROTOCOL,
  createDesignProfileManifest,
  type DesignProfileManifest,
  type ProfileManifestContent,
  type RegisteredProfileBinding,
} from './contracts'
import {
  fingerprintTrustedImplementation,
  type ProfileBindingRegistries,
  type ProfileCompilerInput,
  type ProfileEvaluator,
  type PresentationProjection,
  type SemanticActionRequest,
} from './registries'

const COMMERCE_FACTS_SCHEMA = { id: 'commerce.product-facts', version: 1 } as const
const COMMERCE_RECIPE = { id: COMMERCE_RECIPE_ID, version: COMMERCE_RECIPE_VERSION } as const
const COMMERCE_OUTPUT_SCHEMAS = Object.freeze([
  { id: 'commerce.localized-description', version: 1 },
  { id: 'commerce.media-artifact', version: 1 },
  { id: 'commerce.strategy-document', version: 1 },
] as const)

const supportingReceiptSchema = z.object({
  id: z.string().min(1).max(240),
  routeId: z.string().min(1).max(240),
}).strict()

export const commerceProfileEvaluationInputSchema = z.object({
  facts: productFactsSchema,
  categoryIndex: categoryIndexSchema,
  attributeIndex: attributeIndexSchema,
  outcomeGraph: outcomeGraphSchema,
  plan: executionPlanSchema,
  publications: z.array(commerceMaterialPublicationSchema).max(20_000),
  receipts: z.array(capabilityReceiptSchema).max(20_000),
  supportingReceipts: z.array(supportingReceiptSchema).max(20_000).optional(),
  validationHistory: z.array(validationFindingSchema).max(100_000).optional(),
}).strict()
export type CommerceProfileEvaluationInput = z.infer<typeof commerceProfileEvaluationInputSchema>

export interface CommerceProfileAdapterPackage {
  readonly manifest: DesignProfileManifest
  readonly registrations: readonly RegisteredProfileBinding[]
  readonly registerTrustedSchemas: (registry: SchemaRegistry) => void
  readonly registerTrustedBindings: (registries: Pick<
    ProfileBindingRegistries,
    | 'compilers'
    | 'evaluators'
    | 'renderers'
    | 'inspectors'
    | 'semanticActions'
    | 'delivery'
    | 'evidenceBenchmarkAdapters'
    | 'outcomeScorecardAdapters'
  >) => void
}

function isCommerceOutputSchema(schema: { readonly id: string; readonly version: number } | undefined): boolean {
  return schema !== undefined && COMMERCE_OUTPUT_SCHEMAS.some((candidate) => (
    candidate.id === schema.id && candidate.version === schema.version
  ))
}

async function compileCommerceBrief(input: ProfileCompilerInput) {
  const deliverables = input.brief.deliverables.filter(({ schema }) => isCommerceOutputSchema(schema))
  if (deliverables.length === 0) return []
  const evidence = input.brief.evidence.filter(({ schema }) => (
    schema.id === COMMERCE_FACTS_SCHEMA.id && schema.version === COMMERCE_FACTS_SCHEMA.version
  ))
  if (evidence.length !== 1) {
    throw new Error('Commerce proposal compilation requires exactly one typed product-facts evidence node.')
  }
  const factsEvidence = evidence[0]!
  const facts = productFactsSchema.parse(factsEvidence.value)
  const factsHash = await fingerprint(facts)
  if (!factsEvidence.provenance.some(({ contentHash }) => contentHash === factsHash)) {
    throw new Error('Commerce product-facts evidence does not bind its exact normalized content hash.')
  }
  await assertCommerceBriefEvidenceClosure(facts, input.brief.evidence)
  const briefUnknownIds = new Set(input.brief.unknowns.map(({ id }) => id))
  const unresolvedFactIds = facts.requiredUnknownFactIds.filter((id) => briefUnknownIds.has(id))
  if (unresolvedFactIds.length !== facts.requiredUnknownFactIds.length) {
    throw new Error('Commerce required unknown facts must remain explicit in the Universal Brief.')
  }
  const provenance = {
    sourceId: factsEvidence.id,
    revision: factsEvidence.revision,
    relation: 'compiled-from-product-facts',
    contentHash: factsHash,
  }
  const fragments = createCommerceOutcomeFragments(facts).map((fragment) => ({
    id: fragment.id,
    precedence: fragment.precedence,
    nodes: fragment.nodes.map((node) => ({
      ...node,
      provenance: [...node.provenance, provenance],
    })),
  }))
  return [{
    id: 'proposal:commerce-production',
    score: unresolvedFactIds.length === 0 ? 1 : 0.5,
    scoreReasons: unresolvedFactIds.length === 0
      ? ['The requested Commerce deliverables have normalized product facts with an exact evidence hash.']
      : ['The Commerce role closure is available, but required product facts remain unresolved.'],
    requiredUnknownIds: unresolvedFactIds,
    capabilities: Object.values(COMMERCE_CAPABILITY_IDS).map((id) => ({
      id,
      required: true,
      reason: 'Required by the existing Commerce production Contract and Plan.',
    })),
    deliverables,
    compatibleRecipes: [COMMERCE_RECIPE],
    fragments,
    provenance: [provenance],
  }]
}

async function assertCommerceBriefEvidenceClosure(
  facts: CommerceProfileEvaluationInput['facts'],
  evidenceNodes: ProfileCompilerInput['brief']['evidence'],
): Promise<void> {
  for (const fact of facts.facts) {
    const contentHash = await fingerprint(fact)
    const evidence = evidenceNodes.find((candidate) => (
      candidate.id === fact.id
      && candidate.revision === `${fact.id}:revision:1`
      && candidate.schema.id === 'commerce.product-fact'
      && candidate.schema.version === 1
      && canonicalJson(candidate.value) === canonicalJson(fact)
      && candidate.provenance.some((reference) => reference.contentHash === contentHash)
    ))
    if (!evidence) throw new Error(`Commerce Brief fact evidence is missing or stale: ${fact.id}`)
  }
}

function assertCommerceEvidenceClosure(
  facts: CommerceProfileEvaluationInput['facts'],
  evidenceGraph: EvidenceGraph,
): void {
  for (const fact of facts.facts) {
    const node = evidenceGraph.body.nodes.find((candidate) => candidate.id === fact.id)
    if (!node
      || node.revision !== `${fact.id}:revision:1`
      || node.schema.id !== 'commerce.product-fact'
      || node.schema.version !== 1
      || canonicalJson(node.value) !== canonicalJson(fact)) {
      throw new Error(`Commerce evaluation evidence is missing or stale: ${fact.id}`)
    }
  }
}

function evaluateCommerceProfile(
  input: Parameters<ProfileEvaluator['evaluate']>[0],
) {
  const parameters = commerceProfileEvaluationInputSchema.parse(input.parameters)
  const declaredOutcome = parameters.outcomeGraph.body.nodes.find(({ id }) => id === input.outcome.id)
  if (!declaredOutcome || canonicalJson(declaredOutcome) !== canonicalJson(input.outcome)) {
    throw new Error(`Commerce evaluator Outcome is absent or stale: ${input.outcome.id}`)
  }
  assertCommerceEvidenceClosure(parameters.facts, input.evidenceGraph)
  const evaluation = evaluateCommerceProduction(parameters)
  const publication = parameters.publications.find(({ outcomeNodeId }) => outcomeNodeId === input.outcome.id)
  const relevantFindings = evaluation.findings.filter(({ outcomeNodeId }) => (
    outcomeNodeId === input.outcome.id || outcomeNodeId === 'outcome:commerce:profile'
  ))
  const reasons = relevantFindings.map((finding) => ({
    code: finding.code,
    message: finding.message,
    nodeId: input.outcome.id,
    dependencyPath: finding.outcomeNodeId === input.outcome.id
      ? [input.outcome.id]
      : [input.outcome.id, finding.outcomeNodeId],
    evidence: finding.factIds.map((factId) => ({ key: 'factId', value: factId })),
  }))
  const artifact = publication
    ? input.artifactGraph.body.nodes.find(({ id }) => id === publication.artifactId)
    : undefined
  const expectedHash = publication?.artifactId.startsWith('artifact:sha256:')
    ? publication.artifactId.slice('artifact:sha256:'.length)
    : undefined
  const artifactMatches = artifact !== undefined
    && artifact.accepted
    && artifact.contentHash === expectedHash
    && canonicalJson(artifact.schema) === canonicalJson(input.outcome.schema)
  if (publication && evaluation.validArtifactIds.includes(publication.artifactId) && !artifactMatches) {
    reasons.push({
      code: 'artifact-graph-binding-mismatch',
      message: `Commerce publication ${publication.artifactId} does not match its authoritative ArtifactGraph node.`,
      nodeId: input.outcome.id,
      dependencyPath: [input.outcome.id, publication.artifactId],
      evidence: [{ key: 'artifactId', value: publication.artifactId }],
    })
  }
  const artifactIds = artifactMatches && publication ? [publication.artifactId] : []
  return {
    status: reasons.length === 0 && artifactIds.length > 0
      ? 'passed' as const
      : artifactIds.length > 0
        ? 'repairable' as const
        : 'blocked' as const,
    artifactIds,
    reasons,
  }
}

function projectCommerceOutcome(input: unknown): PresentationProjection {
  const payload = commerceOutcomePayloadSchema.parse(input)
  return {
    title: payload.semanticRole,
    summary: `AliExpress ${payload.kind} outcome`,
    metadata: {
      channel: payload.channel,
      marketPolicyId: payload.marketPolicyId,
      identityLockId: payload.identityLockId,
      creativeDirectionId: payload.creativeDirectionId,
    },
    actionIds: ['action:commerce-repair'],
  }
}

function compileCommerceRepair(request: SemanticActionRequest) {
  const parameters = z.object({
    failedOutcomeNodeIds: z.array(z.string().min(1).max(240)).min(1).max(20_000),
    acceptedArtifactIds: z.array(z.string().min(1).max(240)).max(20_000),
  }).strict().superRefine((value, context) => {
    if (new Set(value.failedOutcomeNodeIds).size !== value.failedOutcomeNodeIds.length) {
      context.addIssue({ code: 'custom', message: 'Commerce repair Outcome ids must be unique.' })
    }
    if (new Set(value.acceptedArtifactIds).size !== value.acceptedArtifactIds.length) {
      context.addIssue({ code: 'custom', message: 'Commerce retained artifact ids must be unique.' })
    }
  }).parse(request.parameters)
  return [{
    id: 'command:repair-commerce-outcomes',
    kind: 'request-repair' as const,
    subject: request.subject,
    parameters,
    requiredCapabilityIds: Object.values(COMMERCE_CAPABILITY_IDS),
  }]
}

function evaluateCommerceOutcomeScore(source: unknown): CommerceEvaluationResult {
  return evaluateCommerceProduction(commerceProfileEvaluationInputSchema.parse(source))
}

function projectCommerceOutcomeScorecard(source: unknown, rulerDigest: string) {
  const evaluation = evaluateCommerceOutcomeScore(source)
  return {
    profileId: COMMERCE_PROFILE_ID,
    ruler: { id: 'ruler:commerce-outcome', version: 1, digest: rulerDigest },
    criteria: [{
      id: 'criterion:role-closure',
      score: evaluation.validArtifactIds.length,
      maximumScore: COMMERCE_SEMANTIC_ROLES.length,
      evidenceIds: [...new Set([
        ...evaluation.validArtifactIds,
        ...evaluation.failedOutcomeNodeIds,
        ...evaluation.findings.map(({ outcomeNodeId }) => outcomeNodeId),
      ])].sort(),
    }],
  }
}

async function verifyCommerceMaturityEvidence(source: unknown, rulerDigest: string) {
  const rehearsal = await verifyCommerceProductionRehearsalBundle(source)
  const commonEvidenceIds = [
    rehearsal.identity.id,
    rehearsal.identity.revision,
    rehearsal.runId,
    rehearsal.bundleHash,
  ]
  const retainedEvidenceIds = rehearsal.artifacts.flatMap((artifact) => [
    artifact.receipt.receiptId,
    ...artifact.retainedBytes.flatMap((retained) => [retained.receiptId, retained.artifactId]),
    ...(artifact.semanticQa
      ? [artifact.semanticQa.receipt.receiptId, artifact.semanticQa.retainedBytes.artifactId]
      : []),
  ])
  return {
    profileId: COMMERCE_PROFILE_ID,
    ruler: {
      id: DESIGN_OS_BENCHMARK_ID,
      version: DESIGN_OS_BENCHMARK_VERSION,
      digest: rulerDigest,
    },
    metrics: DESIGN_OS_BENCHMARK_RULER.metrics.map((metric) => ({
      id: metric.id,
      // Ruler v2 scores deterministic Contract proof and verified real Host
      // execution only. This bundle cannot prove independent unseen-input
      // rehearsal acceptance, so that final stage remains blocked.
      status: metric.stage === 'real-host' ? 'passed' as const : 'blocked' as const,
      evidenceIds: [...new Set([
        ...commonEvidenceIds,
        ...(metric.stage === 'real-host' || metric.stage === 'production-rehearsal'
          ? retainedEvidenceIds
          : []),
      ])],
    })),
  }
}

function createCommerceMaturityVerifier(rulerDigest: string) {
  return async (source: unknown) => verifyCommerceMaturityEvidence(source, rulerDigest)
}

function createCommerceOutcomeScorecardProjector(rulerDigest: string) {
  return (source: unknown) => projectCommerceOutcomeScorecard(source, rulerDigest)
}

export async function createCommerceProfileAdapterPackage(): Promise<CommerceProfileAdapterPackage> {
  const maturityRulerDigest = await fingerprint(DESIGN_OS_BENCHMARK_RULER)
  const hashes = {
    schemas: await fingerprintTrustedImplementation({
      id: 'implementation:commerce-schema-set',
      functions: [installCommerceProfileSchemas],
      schemas: [productFactsSchema, commerceOutcomePayloadSchema],
      constants: [COMMERCE_OUTPUT_SCHEMAS, COMMERCE_RECIPE],
    }),
    compiler: await fingerprintTrustedImplementation({
      id: 'implementation:commerce-brief-compiler',
      functions: [compileCommerceBrief, assertCommerceBriefEvidenceClosure, createCommerceOutcomeFragments],
      schemas: [productFactsSchema],
      constants: [COMMERCE_FACTS_SCHEMA, COMMERCE_OUTPUT_SCHEMAS, COMMERCE_CAPABILITY_IDS],
    }),
    evaluator: await fingerprintTrustedImplementation({
      id: 'implementation:commerce-evaluator',
      functions: [evaluateCommerceProfile, evaluateCommerceProduction, assertCommerceEvidenceClosure],
      schemas: [commerceProfileEvaluationInputSchema],
      constants: [COMMERCE_OUTPUT_SCHEMAS],
    }),
    renderer: await fingerprintTrustedImplementation({
      id: 'implementation:commerce-renderer',
      functions: [projectCommerceOutcome],
      schemas: [commerceOutcomePayloadSchema],
    }),
    inspector: await fingerprintTrustedImplementation({
      id: 'implementation:commerce-inspector',
      functions: [projectCommerceOutcome],
      schemas: [commerceOutcomePayloadSchema],
    }),
    action: await fingerprintTrustedImplementation({
      id: 'implementation:commerce-repair-action',
      functions: [compileCommerceRepair],
      constants: [COMMERCE_CAPABILITY_IDS],
    }),
    delivery: await fingerprintTrustedImplementation({
      id: 'implementation:commerce-delivery-description',
      constants: [{
        formatId: 'commerce.material-family.v1',
        mediaType: 'application/json',
        artifactSchemas: COMMERCE_OUTPUT_SCHEMAS,
        requiredTargetAdapterIds: [],
      }],
    }),
    maturity: await fingerprintTrustedImplementation({
      id: 'implementation:commerce-maturity-verifier',
      functions: [
        createCommerceMaturityVerifier,
        verifyCommerceMaturityEvidence,
        verifyCommerceProductionRehearsalBundle,
        verifyNativeMultimodalHostArtifact,
        verifyNativeCommerceSourceIngestReceipt,
      ],
      schemas: [
        commerceProductionRehearsalBundleSchema,
      ],
      constants: [DESIGN_OS_BENCHMARK_RULER, maturityRulerDigest],
    }),
    scorecard: await fingerprintTrustedImplementation({
      id: 'implementation:commerce-outcome-scorecard',
      functions: [
        createCommerceOutcomeScorecardProjector,
        projectCommerceOutcomeScorecard,
        evaluateCommerceOutcomeScore,
        evaluateCommerceProduction,
      ],
      schemas: [commerceProfileEvaluationInputSchema],
      constants: [COMMERCE_SEMANTIC_ROLES],
    }),
  }
  const binding = <Kind extends RegisteredProfileBinding['kind']>(
    kind: Kind,
    id: string,
    implementationHash: string,
    required = true,
  ) => ({ kind, id, version: '1.0.0', implementationHash, required }) as const
  const references = {
    schemas: binding('schema', 'schema-set:commerce', hashes.schemas),
    compiler: binding('compiler', 'compiler:commerce-production', hashes.compiler),
    evaluator: binding('evaluator', 'evaluator:commerce-production', hashes.evaluator),
    renderer: binding('renderer', 'renderer:commerce-material', hashes.renderer, false),
    inspector: binding('inspector', 'inspector:commerce-material', hashes.inspector),
    action: binding('semantic-action', 'action:commerce-repair', hashes.action),
    delivery: binding('delivery', 'delivery:commerce-materials', hashes.delivery),
    maturity: binding('evidence-benchmark-adapter', 'benchmark:commerce-maturity', hashes.maturity),
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
    recipes: [],
    policies: [],
    evaluators: [references.evaluator],
    renderers: [references.renderer],
    inspectors: [references.inspector],
    semanticActions: [references.action],
    deliveries: [references.delivery],
    migrations: [],
    evidenceBenchmarkAdapters: [references.maturity],
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
  }
  const manifest = await createDesignProfileManifest(content)
  const registrations = Object.values(references).map((reference) => ({
    kind: reference.kind,
    id: reference.id,
    version: reference.version,
    implementationHash: reference.implementationHash,
    ownerId: 'cutout:commerce-profile',
  })) satisfies RegisteredProfileBinding[]
  const registrationFor = (reference: typeof references[keyof typeof references]): RegisteredProfileBinding => {
    const registration = registrations.find((candidate) => (
      candidate.kind === reference.kind
      && candidate.id === reference.id
      && candidate.version === reference.version
      && candidate.implementationHash === reference.implementationHash
    ))
    if (!registration) throw new Error(`Missing trusted Commerce registration: ${reference.kind}:${reference.id}`)
    return registration
  }
  const presentation = {
    schema: { id: 'commerce.outcome-payload', version: 1 },
    fallbackPriority: 10,
    inputSchema: commerceOutcomePayloadSchema,
    project: projectCommerceOutcome,
  }
  const delivery = {
    formatId: 'commerce.material-family.v1',
    mediaType: 'application/json',
    artifactSchemas: [...COMMERCE_OUTPUT_SCHEMAS],
    requiredTargetAdapterIds: [] as string[],
  }
  return {
    manifest,
    registrations,
    registerTrustedSchemas(registry) {
      installCommerceProfileSchemas(registry)
    },
    registerTrustedBindings(registries) {
      registries.compilers.register({
        ...registrationFor(references.compiler),
        kind: 'compiler',
        implementation: { compile: compileCommerceBrief },
      })
      registries.evaluators.register({
        ...registrationFor(references.evaluator),
        kind: 'evaluator',
        implementation: {
          outcomeSchemas: COMMERCE_OUTPUT_SCHEMAS,
          artifactSchemas: COMMERCE_OUTPUT_SCHEMAS,
          inputSchema: commerceProfileEvaluationInputSchema,
          evaluate: evaluateCommerceProfile,
        },
      })
      registries.renderers.register({
        ...registrationFor(references.renderer),
        kind: 'renderer',
        implementation: presentation,
      })
      registries.inspectors.register({
        ...registrationFor(references.inspector),
        kind: 'inspector',
        implementation: presentation,
      })
      registries.semanticActions.register({
        ...registrationFor(references.action),
        kind: 'semantic-action',
        implementation: { compile: compileCommerceRepair },
      })
      registries.delivery.register({
        ...registrationFor(references.delivery),
        kind: 'delivery',
        implementation: delivery,
      })
      registries.evidenceBenchmarkAdapters.register({
        ...registrationFor(references.maturity),
        kind: 'evidence-benchmark-adapter',
        implementation: {
          profileId: COMMERCE_PROFILE_ID,
          ruler: {
            id: DESIGN_OS_BENCHMARK_ID,
            version: DESIGN_OS_BENCHMARK_VERSION,
            digest: maturityRulerDigest,
          },
          sourceSchema: commerceProductionRehearsalBundleSchema,
          verifyAndProject: createCommerceMaturityVerifier(maturityRulerDigest),
        },
      })
      registries.outcomeScorecardAdapters.register({
        ...registrationFor(references.scorecard),
        kind: 'outcome-scorecard-adapter',
        implementation: {
          profileId: COMMERCE_PROFILE_ID,
          ruler: { id: 'ruler:commerce-outcome', version: 1, digest: hashes.scorecard },
          sourceSchema: commerceProfileEvaluationInputSchema,
          project: createCommerceOutcomeScorecardProjector(hashes.scorecard),
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

export function projectCommerceOutcomeScore(input: CommerceProfileEvaluationInput) {
  const evaluation = evaluateCommerceOutcomeScore(input)
  return {
    profileId: COMMERCE_PROFILE_ID,
    rulerId: 'ruler:commerce-outcome:v1',
    score: evaluation.validArtifactIds.length,
    maximumScore: COMMERCE_SEMANTIC_ROLES.length,
    ready: evaluation.ready,
  } as const
}

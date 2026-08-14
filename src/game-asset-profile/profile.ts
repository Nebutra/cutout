import { z } from 'zod'
import { canonicalJson, fingerprint } from '@/design-ir/fingerprint'
import type { ArtifactGraph, EvidenceGraph, OutcomeNode } from '@/design-os-kernel/contracts'
import { registerDomainSchema, type SchemaRegistry } from '@/design-os-kernel/registry'
import type { ProfileProposalDraft } from '@/design-profile-platform/brief'
import {
  DESIGN_PROFILE_MANIFEST_PROTOCOL,
  createDesignProfileManifest,
  type DesignProfileManifest,
  type ProfileManifestContent,
  type RegisteredProfileBinding,
} from '@/design-profile-platform/contracts'
import {
  fingerprintTrustedImplementation,
  type PresentationProjection,
  type ProfileBindingRegistries,
  type ProfileCompilerInput,
  type SemanticActionRequest,
} from '@/design-profile-platform/registries'
import {
  GAME_ASSET_PROFILE_ID,
  GAME_ASSET_PROFILE_VERSION,
  acceptedGameAssetArtifactSchema,
  compareGameAssetEvidenceIdentity,
  gameAssetEvaluationInputSchema,
  gameAssetEvaluationSchema,
  gameAssetPlanSchema,
  layeredGameMapManifestSchema,
  observedGameAssetFrameSchema,
  type GameAssetPlan,
} from './contracts'
import { evaluateGameAssetFrames } from './evaluation'
import {
  fingerprintGameAssetRehearsalVerifier,
  gameAssetProductionRehearsalBundleSchema,
  verifyGameAssetProductionRehearsalBundle,
} from './rehearsal'

const GAME_ASSET_RECIPE = { id: 'game-asset.production-recipe', version: 1 } as const
const GAME_ASSET_PLAN_SCHEMA = { id: 'game-asset.plan', version: 1 } as const
const GAME_ASSET_FRAME_SCHEMA = { id: 'game-asset.frame', version: 1 } as const
const GAME_ASSET_EVALUATION_SCHEMA = { id: 'game-asset.evaluation', version: 1 } as const
const GAME_ASSET_LAYERED_MAP_SCHEMA = { id: 'game-asset.layered-map', version: 1 } as const
const GAME_ASSET_REPAIR_ACTION_ID = 'action:game-asset-repair' as const
const GAME_ASSET_CAPABILITY_ID = 'capability:image-generation' as const
const GAME_ASSET_SCORECARD_RULER = { id: 'ruler:game-asset-quality', version: 1 } as const

const gameAssetRepairParametersSchema = z.object({
  failedRoleIds: z.array(z.string().min(1)).min(1).max(20_000),
  acceptedArtifacts: z.array(acceptedGameAssetArtifactSchema).max(20_000),
}).strict().superRefine((parameters, context) => {
  if (new Set(parameters.failedRoleIds).size !== parameters.failedRoleIds.length) {
    context.addIssue({ code: 'custom', message: 'Game Asset repair role ids must be unique.' })
  }
  if (new Set(parameters.acceptedArtifacts.map(({ roleId }) => roleId)).size !== parameters.acceptedArtifacts.length) {
    context.addIssue({ code: 'custom', message: 'Accepted Game Asset repair siblings must have unique role ids.' })
  }
  const acceptedRoleIds = new Set(parameters.acceptedArtifacts.map(({ roleId }) => roleId))
  if (parameters.failedRoleIds.some((roleId) => acceptedRoleIds.has(roleId))) {
    context.addIssue({ code: 'custom', message: 'A failed Game Asset role cannot also be retained as an accepted sibling.' })
  }
})

async function compileGameAssetBrief(input: ProfileCompilerInput): Promise<readonly ProfileProposalDraft[]> {
  const requested = input.brief.deliverables.filter((deliverable) => (
    deliverable.schema?.id === GAME_ASSET_PLAN_SCHEMA.id
    && deliverable.schema.version === GAME_ASSET_PLAN_SCHEMA.version
  ))
  if (requested.length === 0) return []
  const planEvidence = input.brief.evidence.filter((evidence) => (
    evidence.schema.id === GAME_ASSET_PLAN_SCHEMA.id
    && evidence.schema.version === GAME_ASSET_PLAN_SCHEMA.version
  ))
  return Promise.all(planEvidence.map(async (evidence) => {
    const plan = gameAssetPlanSchema.parse(evidence.value)
    const planHash = await fingerprint(plan)
    assertGameAssetPlanEvidenceClosure(plan, evidence, input.brief.evidence, planHash)
    return {
      id: `proposal:${plan.id}`,
      score: 1,
      scoreReasons: ['The requested Game Asset deliverable has an exact typed plan and evidence closure.'],
      requiredUnknownIds: [],
      capabilities: [{
        id: GAME_ASSET_CAPABILITY_ID,
        required: true,
        reason: 'Produces candidate frames for deterministic evaluation and atlas assembly.',
      }],
      deliverables: requested,
      compatibleRecipes: [GAME_ASSET_RECIPE],
      fragments: [{
        id: `fragment:${plan.id}`,
        precedence: 10,
        nodes: [{
          id: `outcome:${plan.id}`,
          revision: `outcome:${plan.id}:revision:1`,
          schema: GAME_ASSET_PLAN_SCHEMA,
          recipe: GAME_ASSET_RECIPE,
          payload: plan,
          dependencies: exactGameAssetReferences(plan).map((reference) => ({
            kind: 'evidence' as const,
            id: reference.id,
            revision: reference.revision,
          })),
          state: 'proposed' as const,
          provenance: [{
            sourceId: evidence.id,
            revision: evidence.revision,
            relation: 'compiled-from-plan',
            contentHash: planHash,
          }],
        }],
      }],
      provenance: [{
        sourceId: evidence.id,
        revision: evidence.revision,
        relation: 'compiled-from-plan',
        contentHash: planHash,
      }],
    }
  }))
}

function exactGameAssetReferences(plan: GameAssetPlan) {
  const references = [
    ...plan.artDirectionEvidence,
    ...plan.referenceArtifacts,
    ...plan.roles.flatMap((role) => [role.identityLock, role.scaleLock, role.anchorLock]),
  ]
  const byIdentity = new Map<string, typeof references[number]>()
  for (const reference of references) {
    const key = `${reference.id}@${reference.revision}`
    const existing = byIdentity.get(key)
    if (existing && existing.contentHash !== reference.contentHash) {
      throw new Error(`Game Asset plan has conflicting evidence hashes for ${key}.`)
    }
    byIdentity.set(key, reference)
  }
  return [...byIdentity.values()].sort((left, right) => compareGameAssetEvidenceIdentity(
    `${left.id}@${left.revision}`,
    `${right.id}@${right.revision}`,
  ))
}

function hasExactGameAssetEvidenceReference(
  reference: ReturnType<typeof exactGameAssetReferences>[number],
  evidenceNodes: EvidenceGraph['body']['nodes'],
): boolean {
  return evidenceNodes.some((candidate) => (
    candidate.id === reference.id
    && candidate.revision === reference.revision
    && candidate.provenance.some(({ contentHash }) => contentHash === reference.contentHash)
  ))
}

function missingGameAssetEvidenceReferences(
  plan: GameAssetPlan,
  evidenceNodes: EvidenceGraph['body']['nodes'],
) {
  return exactGameAssetReferences(plan).filter((reference) => (
    !hasExactGameAssetEvidenceReference(reference, evidenceNodes)
  ))
}

function hasExactGameAssetPlanEvidence(
  plan: GameAssetPlan,
  outcome: OutcomeNode,
  evidenceNodes: EvidenceGraph['body']['nodes'],
): boolean {
  const sources = outcome.provenance.filter(({ relation }) => relation === 'compiled-from-plan')
  if (sources.length !== 1 || !sources[0]?.contentHash) return false
  const source = sources[0]
  return evidenceNodes.some((candidate) => (
    candidate.id === source.sourceId
    && candidate.revision === source.revision
    && canonicalJson(candidate.schema) === canonicalJson(GAME_ASSET_PLAN_SCHEMA)
    && canonicalJson(candidate.value) === canonicalJson(plan)
    && candidate.provenance.some(({ contentHash }) => contentHash === source.contentHash)
  ))
}

function assertGameAssetPlanEvidenceClosure(
  plan: GameAssetPlan,
  planEvidence: ProfileCompilerInput['brief']['evidence'][number],
  evidenceNodes: ProfileCompilerInput['brief']['evidence'],
  planHash: string,
): void {
  if (!planEvidence.provenance.some(({ contentHash }) => contentHash === planHash)) {
    throw new Error(`Game Asset plan evidence does not retain the exact plan hash: ${planEvidence.id}@${planEvidence.revision}`)
  }
  for (const reference of missingGameAssetEvidenceReferences(plan, evidenceNodes)) {
    throw new Error(`Game Asset plan evidence is missing or stale: ${reference.id}@${reference.revision}`)
  }
}

function evaluateGameAssetProfile(
  input: {
    readonly parameters: unknown
    readonly outcome: OutcomeNode
    readonly evidenceGraph: EvidenceGraph
    readonly artifactGraph: ArtifactGraph
  },
) {
  const parameters = gameAssetEvaluationInputSchema.parse(input.parameters)
  const evaluation = evaluateGameAssetFrames(parameters)
  const outcomePlan = gameAssetPlanSchema.safeParse(input.outcome.payload)
  const outcomeBound = outcomePlan.success
    && canonicalJson(outcomePlan.data) === canonicalJson(parameters.plan)
  const planEvidenceBound = hasExactGameAssetPlanEvidence(
    parameters.plan,
    input.outcome,
    input.evidenceGraph.body.nodes,
  )
  const missingEvidence = missingGameAssetEvidenceReferences(parameters.plan, input.evidenceGraph.body.nodes)
  const evidenceBound = missingEvidence.length === 0
  const artifactById = new Map(input.artifactGraph.body.nodes.map((artifact) => [artifact.id, artifact]))
  const artifactBound = evaluation.acceptedArtifacts.filter((candidate) => {
    const artifact = artifactById.get(candidate.artifactId)
    return artifact?.accepted === true
      && artifact.revision === candidate.artifactRevision
      && artifact.contentHash === candidate.contentHash
      && canonicalJson(artifact.schema) === canonicalJson(GAME_ASSET_FRAME_SCHEMA)
  })
  const accepted = outcomeBound && planEvidenceBound && evidenceBound ? artifactBound : []
  const bindingFailures = evaluation.acceptedArtifacts.filter((candidate) => (
    !artifactBound.some(({ roleId }) => roleId === candidate.roleId)
  ))
  const reasons = [
    ...(!outcomeBound ? [{
      code: 'outcome-plan-binding-mismatch',
      message: `Game Asset evaluation input is not the exact plan carried by Outcome ${input.outcome.id}.`,
      nodeId: input.outcome.id,
      dependencyPath: [input.outcome.id],
      evidence: [{ key: 'planId', value: evaluation.planId }],
    }] : []),
    ...(!planEvidenceBound ? [{
      code: 'plan-evidence-graph-binding-mismatch',
      message: `Game Asset plan evidence is missing or stale in the authoritative EvidenceGraph for ${input.outcome.id}.`,
      nodeId: input.outcome.id,
      dependencyPath: [input.outcome.id],
      evidence: [{ key: 'planId', value: evaluation.planId }],
    }] : []),
    ...missingEvidence.map((reference) => ({
      code: 'evidence-graph-binding-mismatch',
      message: `Game Asset evidence is missing or stale in the authoritative EvidenceGraph: ${reference.id}@${reference.revision}.`,
      nodeId: input.outcome.id,
      dependencyPath: [input.outcome.id, reference.id],
      evidence: [
        { key: 'evidenceId', value: reference.id },
        { key: 'evidenceRevision', value: reference.revision },
        { key: 'evidenceContentHash', value: reference.contentHash },
      ],
    })),
    ...evaluation.findings.map((finding) => ({
      code: finding.code,
      message: finding.message,
      nodeId: input.outcome.id,
      dependencyPath: [input.outcome.id, finding.roleId],
      evidence: [{ key: 'roleId', value: finding.roleId }],
    })),
    ...bindingFailures.map((failure) => ({
      code: 'artifact-graph-binding-mismatch',
      message: `Observed frame ${failure.roleId} does not match an accepted authoritative ArtifactGraph revision and hash.`,
      nodeId: input.outcome.id,
      dependencyPath: [input.outcome.id, failure.roleId],
      evidence: [{ key: 'artifactId', value: failure.artifactId }],
    })),
  ]
  return {
    status: reasons.length === 0 ? 'passed' as const : accepted.length > 0 ? 'repairable' as const : 'blocked' as const,
    artifactIds: accepted.map(({ artifactId }) => artifactId),
    reasons,
  }
}

function projectGameAssetPlan(input: unknown): PresentationProjection {
  const plan = gameAssetPlanSchema.parse(input)
  return {
    title: plan.assetId,
    summary: `${plan.roles.length} declared game asset roles`,
    metadata: { kind: plan.kind, view: plan.view, roles: plan.roles.length },
    actionIds: [GAME_ASSET_REPAIR_ACTION_ID],
  }
}

function compileGameAssetRepair(request: SemanticActionRequest) {
  const parameters = gameAssetRepairParametersSchema.parse(request.parameters)
  return [{
    id: 'command:game-asset-repair',
    kind: 'request-repair' as const,
    subject: request.subject,
    parameters,
    requiredCapabilityIds: [GAME_ASSET_CAPABILITY_ID],
  }]
}

function projectGameAssetOutcomeScore(source: unknown, rulerDigest: string) {
  const input = gameAssetEvaluationInputSchema.parse(source)
  const evaluation = evaluateGameAssetFrames(input)
  const evidenceIds = [...new Set([
    input.plan.id,
    ...input.frames.map(({ artifactRevision }) => artifactRevision),
    ...exactGameAssetReferences(input.plan).map(({ revision }) => revision),
  ])].sort()
  return {
    profileId: GAME_ASSET_PROFILE_ID,
    ruler: { ...GAME_ASSET_SCORECARD_RULER, digest: rulerDigest },
    criteria: [{
      id: 'criterion:role-closure',
      score: evaluation.acceptedArtifacts.length,
      maximumScore: input.plan.roles.length,
      evidenceIds,
    }],
  }
}

function createGameAssetScorecardProjector(rulerDigest: string) {
  return (source: unknown) => projectGameAssetOutcomeScore(source, rulerDigest)
}

function registerGameAssetSchemas(registry: SchemaRegistry): void {
  registerDomainSchema(registry, {
    reference: GAME_ASSET_PLAN_SCHEMA,
    category: 'outcome',
    schema: gameAssetPlanSchema,
    canonicalOwner: 'cutout:game-asset-profile',
  })
  registerDomainSchema(registry, {
    reference: GAME_ASSET_FRAME_SCHEMA,
    category: 'outcome',
    schema: observedGameAssetFrameSchema,
    canonicalOwner: 'cutout:game-asset-profile',
  })
  registerDomainSchema(registry, {
    reference: GAME_ASSET_EVALUATION_SCHEMA,
    category: 'evaluator',
    schema: gameAssetEvaluationSchema,
    canonicalOwner: 'cutout:game-asset-profile',
  })
  registerDomainSchema(registry, {
    reference: GAME_ASSET_LAYERED_MAP_SCHEMA,
    category: 'outcome',
    schema: layeredGameMapManifestSchema,
    canonicalOwner: 'cutout:game-asset-profile',
  })
}

const gameAssetCompilerImplementation = { compile: compileGameAssetBrief }
const gameAssetEvaluatorImplementation = {
  outcomeSchemas: [GAME_ASSET_PLAN_SCHEMA],
  artifactSchemas: [GAME_ASSET_FRAME_SCHEMA],
  inputSchema: gameAssetEvaluationInputSchema,
  evaluate: evaluateGameAssetProfile,
}
const gameAssetPresentationImplementation = {
  schema: GAME_ASSET_PLAN_SCHEMA,
  fallbackPriority: 10,
  inputSchema: gameAssetPlanSchema,
  project: projectGameAssetPlan,
}
const gameAssetSemanticActionImplementation = { compile: compileGameAssetRepair }
const gameAssetDeliveryImplementation = {
  formatId: 'game-asset.atlas-manifest.v1',
  mediaType: 'application/json',
  artifactSchemas: [GAME_ASSET_FRAME_SCHEMA, GAME_ASSET_LAYERED_MAP_SCHEMA],
  requiredTargetAdapterIds: [],
}

interface GameAssetImplementationHashes {
  readonly schemas: string
  readonly compiler: string
  readonly evaluator: string
  readonly renderer: string
  readonly inspector: string
  readonly action: string
  readonly delivery: string
  readonly scorecard: string
  readonly retainedEvidenceVerifier: string
}

async function fingerprintGameAssetImplementations(): Promise<GameAssetImplementationHashes> {
  const [schemas, compiler, evaluator, renderer, inspector, action, delivery, scorecard, retainedEvidenceVerifier] = await Promise.all([
    fingerprintTrustedImplementation({
      id: 'implementation:game-asset-schemas',
      functions: [registerGameAssetSchemas],
      schemas: [gameAssetPlanSchema, observedGameAssetFrameSchema, gameAssetEvaluationSchema, layeredGameMapManifestSchema],
      constants: [GAME_ASSET_PLAN_SCHEMA, GAME_ASSET_FRAME_SCHEMA, GAME_ASSET_EVALUATION_SCHEMA, GAME_ASSET_LAYERED_MAP_SCHEMA],
    }),
    fingerprintTrustedImplementation({
      id: 'implementation:game-asset-compiler',
      functions: [
        compileGameAssetBrief,
        compareGameAssetEvidenceIdentity,
        exactGameAssetReferences,
        hasExactGameAssetEvidenceReference,
        missingGameAssetEvidenceReferences,
        assertGameAssetPlanEvidenceClosure,
      ],
      schemas: [gameAssetPlanSchema],
      constants: [GAME_ASSET_RECIPE, GAME_ASSET_PLAN_SCHEMA, GAME_ASSET_CAPABILITY_ID],
    }),
    fingerprintTrustedImplementation({
      id: 'implementation:game-asset-evaluator',
      functions: [
        evaluateGameAssetProfile,
        compareGameAssetEvidenceIdentity,
        exactGameAssetReferences,
        hasExactGameAssetEvidenceReference,
        missingGameAssetEvidenceReferences,
        hasExactGameAssetPlanEvidence,
        evaluateGameAssetFrames,
      ],
      schemas: [gameAssetEvaluationInputSchema, gameAssetEvaluationSchema, gameAssetPlanSchema, observedGameAssetFrameSchema],
      constants: [GAME_ASSET_PLAN_SCHEMA, GAME_ASSET_FRAME_SCHEMA],
    }),
    fingerprintTrustedImplementation({
      id: 'implementation:game-asset-renderer',
      functions: [projectGameAssetPlan],
      schemas: [gameAssetPlanSchema],
      constants: [GAME_ASSET_PLAN_SCHEMA, GAME_ASSET_REPAIR_ACTION_ID],
    }),
    fingerprintTrustedImplementation({
      id: 'implementation:game-asset-inspector',
      functions: [projectGameAssetPlan],
      schemas: [gameAssetPlanSchema],
      constants: [GAME_ASSET_PLAN_SCHEMA, GAME_ASSET_REPAIR_ACTION_ID],
    }),
    fingerprintTrustedImplementation({
      id: 'implementation:game-asset-repair-action',
      functions: [compileGameAssetRepair],
      schemas: [gameAssetRepairParametersSchema],
      constants: [GAME_ASSET_CAPABILITY_ID],
    }),
    fingerprintTrustedImplementation({
      id: 'implementation:game-asset-delivery',
      schemas: [observedGameAssetFrameSchema, layeredGameMapManifestSchema],
      constants: [gameAssetDeliveryImplementation],
    }),
    fingerprintTrustedImplementation({
      id: 'implementation:game-asset-scorecard',
      functions: [
        createGameAssetScorecardProjector,
        projectGameAssetOutcomeScore,
        compareGameAssetEvidenceIdentity,
        exactGameAssetReferences,
        evaluateGameAssetFrames,
      ],
      schemas: [gameAssetEvaluationInputSchema, gameAssetEvaluationSchema],
      constants: [GAME_ASSET_SCORECARD_RULER],
    }),
    fingerprintGameAssetRehearsalVerifier(),
  ])
  return { schemas, compiler, evaluator, renderer, inspector, action, delivery, scorecard, retainedEvidenceVerifier }
}

export interface GameAssetProfilePackage {
  readonly manifest: DesignProfileManifest
  readonly registrations: readonly RegisteredProfileBinding[]
  readonly registerTrustedSchemas: (registry: SchemaRegistry) => void
  readonly registerTrustedBindings: (registries: ProfileBindingRegistries) => void
  readonly retainedEvidenceVerifier: {
    readonly implementationHash: string
    readonly sourceSchema: typeof gameAssetProductionRehearsalBundleSchema
    readonly verify: typeof verifyGameAssetProductionRehearsalBundle
  }
}

export async function createGameAssetProfilePackage(): Promise<GameAssetProfilePackage> {
  const hashes = await fingerprintGameAssetImplementations()
  const reference = <Kind extends RegisteredProfileBinding['kind']>(
    kind: Kind,
    id: string,
    implementationHash: string,
  ) => ({ kind, id, version: '1.0.0', implementationHash, required: true }) as const
  const refs = {
    schemas: reference('schema', 'schema-set:game-asset', hashes.schemas),
    compiler: reference('compiler', 'compiler:game-asset', hashes.compiler),
    evaluator: reference('evaluator', 'evaluator:game-asset', hashes.evaluator),
    renderer: reference('renderer', 'renderer:game-asset', hashes.renderer),
    inspector: reference('inspector', 'inspector:game-asset', hashes.inspector),
    action: reference('semantic-action', GAME_ASSET_REPAIR_ACTION_ID, hashes.action),
    delivery: reference('delivery', 'delivery:game-asset-atlas', hashes.delivery),
    scorecard: reference('outcome-scorecard-adapter', 'scorecard:game-asset', hashes.scorecard),
  }
  const content: ProfileManifestContent = {
    protocol: DESIGN_PROFILE_MANIFEST_PROTOCOL,
    id: GAME_ASSET_PROFILE_ID,
    version: GAME_ASSET_PROFILE_VERSION,
    kernelCompatibility: '^1.0.0',
    dependencies: [],
    schemas: [refs.schemas],
    compilers: [refs.compiler],
    recipes: [],
    policies: [],
    evaluators: [refs.evaluator],
    renderers: [refs.renderer],
    inspectors: [refs.inspector],
    semanticActions: [refs.action],
    deliveries: [refs.delivery],
    migrations: [],
    evidenceBenchmarkAdapters: [],
    outcomeScorecardAdapters: [refs.scorecard],
    capabilityRequirements: [{
      capabilityId: GAME_ASSET_CAPABILITY_ID,
      required: true,
      reason: 'Produces raw visual candidates; deterministic post-processing remains a separate graph stage.',
    }],
    libraryRequirements: [],
    requiredRoleClosures: [{
      id: 'roles:game-asset-frame-family',
      roles: [{
        roleId: 'role:game-asset-frame',
        outputSchema: GAME_ASSET_FRAME_SCHEMA,
        cardinality: { minimum: 1, maximum: 10_000 },
        constraintIds: ['constraint:identity', 'constraint:scale', 'constraint:anchor', 'constraint:reference-lineage'],
      }],
    }],
    identityBindings: [{
      id: 'lock:game-asset-identity',
      kind: 'identity',
      sourceKind: 'artifact-revision',
      requiredRoleIds: ['role:game-asset-frame'],
      evaluatorBindingId: refs.evaluator.id,
    }, {
      id: 'lock:game-asset-scale',
      kind: 'continuity',
      sourceKind: 'project-evidence',
      requiredRoleIds: ['role:game-asset-frame'],
      evaluatorBindingId: refs.evaluator.id,
    }, {
      id: 'lock:game-asset-anchor',
      kind: 'continuity',
      sourceKind: 'project-evidence',
      requiredRoleIds: ['role:game-asset-frame'],
      evaluatorBindingId: refs.evaluator.id,
    }],
  }
  const manifest = await createDesignProfileManifest(content)
  const registrations = Object.values(refs).map((binding) => ({
    kind: binding.kind,
    id: binding.id,
    version: binding.version,
    implementationHash: binding.implementationHash,
    ownerId: 'cutout:game-asset-profile',
  })) satisfies RegisteredProfileBinding[]
  const registrationFor = (binding: typeof refs[keyof typeof refs]): RegisteredProfileBinding => {
    const registration = registrations.find((candidate) => candidate.kind === binding.kind
      && candidate.id === binding.id && candidate.version === binding.version)
    if (!registration || registration.implementationHash !== binding.implementationHash) {
      throw new Error(`Trusted Game Asset registration does not match ${binding.kind}:${binding.id}@${binding.version}.`)
    }
    return registration
  }

  return {
    manifest,
    registrations,
    retainedEvidenceVerifier: {
      implementationHash: hashes.retainedEvidenceVerifier,
      sourceSchema: gameAssetProductionRehearsalBundleSchema,
      verify: verifyGameAssetProductionRehearsalBundle,
    },
    registerTrustedSchemas: registerGameAssetSchemas,
    registerTrustedBindings(registries) {
      registries.compilers.register({
        ...registrationFor(refs.compiler),
        kind: 'compiler',
        implementation: gameAssetCompilerImplementation,
      })
      registries.evaluators.register({
        ...registrationFor(refs.evaluator),
        kind: 'evaluator',
        implementation: gameAssetEvaluatorImplementation,
      })
      registries.renderers.register({
        ...registrationFor(refs.renderer),
        kind: 'renderer',
        implementation: gameAssetPresentationImplementation,
      })
      registries.inspectors.register({
        ...registrationFor(refs.inspector),
        kind: 'inspector',
        implementation: gameAssetPresentationImplementation,
      })
      registries.semanticActions.register({
        ...registrationFor(refs.action),
        kind: 'semantic-action',
        implementation: gameAssetSemanticActionImplementation,
      })
      registries.delivery.register({
        ...registrationFor(refs.delivery),
        kind: 'delivery',
        implementation: gameAssetDeliveryImplementation,
      })
      registries.outcomeScorecardAdapters.register({
        ...registrationFor(refs.scorecard),
        kind: 'outcome-scorecard-adapter',
        implementation: {
          profileId: GAME_ASSET_PROFILE_ID,
          ruler: { ...GAME_ASSET_SCORECARD_RULER, digest: hashes.scorecard },
          sourceSchema: gameAssetEvaluationInputSchema,
          project: createGameAssetScorecardProjector(hashes.scorecard),
        },
      })
    },
  }
}

export const gameAssetProfileSchemas = Object.freeze({
  plan: gameAssetPlanSchema,
  frame: observedGameAssetFrameSchema,
  evaluation: gameAssetEvaluationSchema,
  layeredMap: layeredGameMapManifestSchema,
})

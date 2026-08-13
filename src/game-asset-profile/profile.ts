import { z } from 'zod'
import { fingerprint } from '@/design-ir/fingerprint'
import { canonicalJson } from '@/design-ir/fingerprint'
import { registerDomainSchema, type SchemaRegistry } from '@/design-os-kernel/registry'
import type { ArtifactGraph } from '@/design-os-kernel/contracts'
import {
  DESIGN_PROFILE_MANIFEST_PROTOCOL,
  createDesignProfileManifest,
  type DesignProfileManifest,
  type ProfileManifestContent,
  type RegisteredProfileBinding,
} from '@/design-profile-platform/contracts'
import {
  fingerprintTrustedImplementation,
  type ProfileCompilerInput,
  type ProfileEvaluator,
  type ProfileBindingRegistries,
  type PresentationProjection,
  type SemanticActionRequest,
} from '@/design-profile-platform/registries'
import {
  GAME_ASSET_PROFILE_ID,
  GAME_ASSET_PROFILE_VERSION,
  gameAssetEvaluationSchema,
  gameAssetEvaluationInputSchema,
  gameAssetPlanSchema,
  observedGameAssetFrameSchema,
  layeredGameMapManifestSchema,
  type GameAssetEvaluationInput,
  type GameAssetPlan,
} from './contracts'
import { evaluateGameAssetFrames } from './evaluation'

const GAME_ASSET_RECIPE = { id: 'game-asset.production-recipe', version: 1 } as const
const GAME_ASSET_PLAN_SCHEMA = { id: 'game-asset.plan', version: 1 } as const
const GAME_ASSET_FRAME_SCHEMA = { id: 'game-asset.frame', version: 1 } as const

async function compileGameAssetBrief(input: ProfileCompilerInput) {
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
    assertGameAssetPlanEvidenceClosure(plan, input.brief.evidence)
    const planHash = await fingerprint(plan)
    return {
      id: `proposal:${plan.id}`,
      score: 1,
      scoreReasons: ['The requested Game Asset deliverable has an exact typed plan and evidence closure.'],
      requiredUnknownIds: [],
      capabilities: [{
        id: 'capability:image-generation',
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
  return [...byIdentity.values()].sort((left, right) => (
    `${left.id}@${left.revision}`.localeCompare(`${right.id}@${right.revision}`)
  ))
}

function assertGameAssetPlanEvidenceClosure(
  plan: GameAssetPlan,
  evidenceNodes: ProfileCompilerInput['brief']['evidence'],
): void {
  for (const reference of exactGameAssetReferences(plan)) {
    const evidence = evidenceNodes.find((candidate) => (
      candidate.id === reference.id
      && candidate.revision === reference.revision
      && candidate.provenance.some(({ contentHash }) => contentHash === reference.contentHash)
    ))
    if (!evidence) {
      throw new Error(`Game Asset plan evidence is missing or stale: ${reference.id}@${reference.revision}`)
    }
  }
}

function evaluateGameAssetProfile(input: Parameters<ProfileEvaluator<GameAssetEvaluationInput>['evaluate']>[0]) {
  const evaluation = evaluateGameAssetFrames(input.parameters)
  const artifactById = new Map(input.artifactGraph.body.nodes.map((artifact) => [artifact.id, artifact]))
  const accepted = evaluation.acceptedArtifacts.filter((candidate) => {
    const artifact = artifactById.get(candidate.artifactId)
    return artifact
      && artifact.revision === candidate.artifactRevision
      && artifact.contentHash === candidate.contentHash
      && canonicalJson(artifact.schema) === canonicalJson(GAME_ASSET_FRAME_SCHEMA)
  })
  const bindingFailures = evaluation.acceptedArtifacts.filter((candidate) => (
    !accepted.some(({ roleId }) => roleId === candidate.roleId)
  ))
  const reasons = [
    ...evaluation.findings.map((finding) => ({
      code: finding.code,
      message: finding.message,
      nodeId: input.outcome.id,
      dependencyPath: [input.outcome.id, finding.roleId],
      evidence: [{ key: 'roleId', value: finding.roleId }],
    })),
    ...bindingFailures.map((failure) => ({
      code: 'artifact-graph-binding-mismatch',
      message: `Observed frame ${failure.roleId} does not match its authoritative ArtifactGraph revision and hash.`,
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
    actionIds: ['action:game-asset-repair'],
  }
}

function compileGameAssetRepair(request: SemanticActionRequest) {
  const parameters = z.object({ failedRoleIds: z.array(z.string().min(1)).min(1) }).strict()
    .parse(request.parameters)
  return [{
    id: 'command:repair-game-asset-role',
    kind: 'request-repair' as const,
    subject: request.subject,
    parameters,
    requiredCapabilityIds: ['capability:image-generation'],
  }]
}

function projectGameAssetOutcomeScore(source: unknown) {
  const evaluation = evaluateGameAssetFrames(gameAssetEvaluationInputSchema.parse(source))
  const total = evaluation.acceptedArtifacts.length + evaluation.failedRoleIds.length
  return {
    profileId: GAME_ASSET_PROFILE_ID,
    ruler: { id: 'ruler:game-asset-quality', version: 1, digest: '' },
    criteria: [{
      id: 'criterion:role-closure',
      score: evaluation.acceptedArtifacts.length,
      maximumScore: Math.max(1, total),
      evidenceIds: [evaluation.planId],
    }],
  }
}

export interface GameAssetProfilePackage {
  readonly manifest: DesignProfileManifest
  readonly registrations: readonly RegisteredProfileBinding[]
  readonly registerTrustedSchemas: (registry: SchemaRegistry) => void
  readonly registerTrustedBindings: (registries: ProfileBindingRegistries) => void
}

export async function createGameAssetProfilePackage(): Promise<GameAssetProfilePackage> {
  const hashes = Object.fromEntries(await Promise.all(Object.entries(implementationSources)
    .map(async ([key, value]) => [key, await fingerprint(value)]))) as Record<keyof typeof implementationSources, string>
  const reference = <Kind extends 'schema' | 'compiler' | 'evaluator' | 'renderer' | 'inspector' | 'semantic-action' | 'delivery' | 'evidence-benchmark-adapter' | 'outcome-scorecard-adapter'>(
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
    action: reference('semantic-action', 'action:game-asset-repair', hashes.action),
    delivery: reference('delivery', 'delivery:game-asset-atlas', hashes.delivery),
    evidence: reference('evidence-benchmark-adapter', 'benchmark-adapter:game-asset', hashes.evidence),
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
    evidenceBenchmarkAdapters: [refs.evidence],
    outcomeScorecardAdapters: [refs.scorecard],
    capabilityRequirements: [{
      capabilityId: 'capability:image-generation',
      required: true,
      reason: 'Produces raw visual candidates; deterministic post-processing remains a separate graph stage.',
    }],
    libraryRequirements: [],
    requiredRoleClosures: [{
      id: 'roles:game-asset-frame-family',
      roles: [{
        roleId: 'role:game-asset-frame',
        outputSchema: { id: 'game-asset.frame', version: 1 },
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
    fixtures: [],
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
    registerTrustedSchemas(registry) {
      registerDomainSchema(registry, {
        reference: { id: 'game-asset.plan', version: 1 },
        category: 'outcome',
        schema: gameAssetPlanSchema,
        canonicalOwner: 'cutout:game-asset-profile',
      })
      registerDomainSchema(registry, {
        reference: { id: 'game-asset.evaluation', version: 1 },
        category: 'evaluator',
        schema: gameAssetEvaluationSchema,
        canonicalOwner: 'cutout:game-asset-profile',
      })
      registerDomainSchema(registry, {
        reference: { id: 'game-asset.layered-map', version: 1 },
        category: 'outcome',
        schema: layeredGameMapManifestSchema,
        canonicalOwner: 'cutout:game-asset-profile',
      })
    },
    registerTrustedBindings(registries) {
      registries.compilers.register({
        ...registrationFor(refs.compiler),
        kind: 'compiler',
        implementation: { compile: () => [] },
      })
      registries.evaluators.register({
        ...registrationFor(refs.evaluator),
        kind: 'evaluator',
        implementation: {
          outcomeSchemas: [{ id: 'game-asset.plan', version: 1 }],
          artifactSchemas: [{ id: 'game-asset.frame', version: 1 }],
          inputSchema: gameAssetEvaluationInputSchema,
          evaluate: ({ parameters, outcome }) => {
            const parsed = gameAssetEvaluationInputSchema.parse(parameters)
            const evaluation = evaluateGameAssetFrames(parsed)
            return {
              status: evaluation.status === 'passed' ? 'passed' : evaluation.status === 'needs-repair' ? 'repairable' : 'blocked',
              artifactIds: evaluation.acceptedArtifacts.map(({ artifactId }) => artifactId),
              reasons: evaluation.findings.map((finding) => ({
                code: finding.code,
                message: finding.message,
                nodeId: outcome.id,
                dependencyPath: [outcome.id, finding.roleId],
                evidence: [{ key: 'roleId', value: finding.roleId }],
              })),
            }
          },
        },
      })
      const presentation = {
        schema: { id: 'game-asset.plan', version: 1 },
        fallbackPriority: 10,
        inputSchema: gameAssetPlanSchema,
        project: (input: unknown) => {
          const plan = gameAssetPlanSchema.parse(input)
          return {
            title: plan.assetId,
            summary: `${plan.roles.length} declared game asset roles`,
            metadata: { kind: plan.kind, view: plan.view, roles: plan.roles.length },
            actionIds: [refs.action.id],
          }
        },
      }
      registries.renderers.register({ ...registrationFor(refs.renderer), kind: 'renderer', implementation: presentation })
      registries.inspectors.register({ ...registrationFor(refs.inspector), kind: 'inspector', implementation: presentation })
      registries.semanticActions.register({
        ...registrationFor(refs.action),
        kind: 'semantic-action',
        implementation: { compile: (request) => [{
          id: 'command:repair-game-asset-role',
          kind: 'request-repair',
          subject: request.subject,
          parameters: request.parameters,
          requiredCapabilityIds: ['capability:image-generation'],
        }] },
      })
      registries.delivery.register({
        ...registrationFor(refs.delivery),
        kind: 'delivery',
        implementation: {
          formatId: 'game-asset.atlas-manifest.v1',
          mediaType: 'application/json',
          artifactSchemas: [
            { id: 'game-asset.frame', version: 1 },
            { id: 'game-asset.layered-map', version: 1 },
          ],
          requiredTargetAdapterIds: [],
        },
      })
      registries.outcomeScorecardAdapters.register({
        ...registrationFor(refs.scorecard),
        kind: 'outcome-scorecard-adapter',
        implementation: {
          profileId: GAME_ASSET_PROFILE_ID,
          ruler: { id: 'ruler:game-asset-quality', version: 1, digest: hashes.scorecard },
          sourceSchema: gameAssetEvaluationInputSchema,
          project: (source) => {
            const evaluation = evaluateGameAssetFrames(gameAssetEvaluationInputSchema.parse(source))
            const total = evaluation.acceptedArtifacts.length + evaluation.failedRoleIds.length
            return {
              profileId: GAME_ASSET_PROFILE_ID,
              ruler: { id: 'ruler:game-asset-quality', version: 1, digest: hashes.scorecard },
              criteria: [{
                id: 'criterion:role-closure',
                score: evaluation.acceptedArtifacts.length,
                maximumScore: Math.max(1, total),
                evidenceIds: [evaluation.planId],
              }],
            }
          },
        },
      })
      registries.evidenceBenchmarkAdapters.register({
        ...registrationFor(refs.evidence),
        kind: 'evidence-benchmark-adapter',
        implementation: {
          profileId: GAME_ASSET_PROFILE_ID,
          ruler: { id: 'ruler:game-asset-maturity', version: 1, digest: hashes.evidence },
          sourceSchema: gameAssetMaturityEvidenceSchema,
          project: (source) => {
            const evidence = gameAssetMaturityEvidenceSchema.parse(source)
            return {
              profileId: GAME_ASSET_PROFILE_ID,
              ruler: { id: 'ruler:game-asset-maturity', version: 1, digest: hashes.evidence },
              metrics: [{
                id: 'metric:contract-closure',
                status: 'blocked' as const,
                evidenceIds: [evidence.reportId],
              }, {
                id: 'metric:cross-host-conformance',
                status: 'blocked' as const,
                evidenceIds: [evidence.reportId],
              }, {
                id: 'metric:sibling-preserving-repair',
                status: 'blocked' as const,
                evidenceIds: [evidence.reportId],
              }],
            }
          },
        },
      })
    },
  }
}

export const gameAssetProfileSchemas = Object.freeze({
  plan: gameAssetPlanSchema,
  evaluation: gameAssetEvaluationSchema,
  layeredMap: layeredGameMapManifestSchema,
  deliveryProjection: z.object({ manifestId: z.string().min(1), contentHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
})

import { describe, expect, it } from 'vitest'
import { canonicalJson, fingerprint } from '@/design-ir/fingerprint'
import {
  artifactGraphSchema,
  evidenceGraphSchema,
  type ArtifactGraph,
  type EvidenceGraph,
} from '@/design-os-kernel/contracts'
import { SchemaRegistry } from '@/design-os-kernel/registry'
import { collectProfileProposals, universalBriefSchema } from '@/design-profile-platform/brief'
import { createCommerceProfileAdapterPackage } from '@/design-profile-platform/commerce-adapter'
import { resolveProfileClosure } from '@/design-profile-platform/closure'
import {
  assertProfileLifecycleChangeSet,
  previewProfileLifecycle,
} from '@/design-profile-platform/lifecycle'
import {
  createProfileBindingRegistries,
  inspectUnknownArtifact,
} from '@/design-profile-platform/registries'
import {
  GAME_ASSET_PROFILE_ID,
  compareGameAssetEvidenceIdentity,
  gameAssetPlanSchema,
  layeredGameMapManifestSchema,
  observedGameAssetFrameSchema,
  type GameAssetEvidenceReference,
  type GameAssetPlan,
  type ObservedGameAssetFrame,
} from './contracts'
import { evaluateGameAssetFrames } from './evaluation'
import { createGameAssetProfilePackage } from './profile'

const artDirection = reference('evidence:art-direction', '1')
const masterFrame = reference('artifact:master-frame', '2')
const identityLock = reference('artifact:hero-identity', 'a')
const scaleLock = reference('evidence:hero-scale', 'b')
const anchorLock = reference('evidence:hero-anchor', 'c')
const historicalFrameHash = 'd'.repeat(64)

function reference(id: string, hashCharacter: string): GameAssetEvidenceReference {
  return {
    id,
    revision: `${id}:revision:1`,
    contentHash: hashCharacter.repeat(64),
  }
}

function plan(): GameAssetPlan {
  return gameAssetPlanSchema.parse({
    version: 'game-asset.plan.v1',
    id: 'plan:hero-run',
    assetId: 'asset:hero',
    kind: 'player',
    view: 'side',
    artDirectionEvidence: [artDirection],
    referenceArtifacts: [masterFrame],
    roles: [0, 1, 2, 3].map((frameIndex) => ({
      id: `role:run:right:${frameIndex}`,
      assetId: 'asset:hero',
      action: 'run',
      direction: 'right',
      frameIndex,
      outputSchema: { id: 'game-asset.frame', version: 1 },
      identityLock,
      scaleLock,
      expectedAlphaSize: { width: 80, height: 104 },
      anchorLock,
      anchor: 'feet',
      expectedAnchor: { x: 64, y: 116 },
    })),
    delivery: {
      formatId: 'game-asset.atlas-manifest.v1',
      frameWidth: 128,
      frameHeight: 128,
      columns: 2,
      rows: 2,
    },
  })
}

function frame(frameIndex: number, overrides: Partial<ObservedGameAssetFrame> = {}): ObservedGameAssetFrame {
  return observedGameAssetFrameSchema.parse({
    roleId: `role:run:right:${frameIndex}`,
    artifactId: `artifact:run:right:${frameIndex}`,
    artifactRevision: `artifact:run:right:${frameIndex}:revision:1`,
    contentHash: (frameIndex + 4).toString(16).repeat(64),
    decodedWidth: 128,
    decodedHeight: 128,
    alphaBounds: { x: 24, y: 16, width: 80, height: 104 },
    edgeContact: false,
    anchor: { x: 64, y: 116 },
    identityLock,
    scaleLock,
    anchorLock,
    sourceArtifacts: [masterFrame],
    ...overrides,
  })
}

async function gameBrief(inputPlan = plan(), options: {
  readonly planHash?: string
  readonly referenceHash?: string
} = {}) {
  const planHash = options.planHash ?? await fingerprint(inputPlan)
  const evidenceReferences = [artDirection, masterFrame, identityLock, scaleLock, anchorLock]
    .map((evidenceReference) => evidenceReference.id === masterFrame.id && options.referenceHash
      ? { ...evidenceReference, contentHash: options.referenceHash }
      : evidenceReference)
  return universalBriefSchema.parse({
    version: 'design-profile.universal-brief.v1',
    id: 'brief:hero-run',
    revision: 'brief:hero-run:revision:1',
    goal: {
      statement: 'Create a complete evidence-bound hero run cycle.',
      successCriteria: ['Every declared frame closes over exact identity, scale, anchor, and reference evidence.'],
    },
    audience: [{
      id: 'audience:game-team',
      description: 'The game implementation team.',
      needs: ['A reviewable sprite family.'],
    }],
    desiredExperience: [{ id: 'experience:coherent-motion', description: 'Coherent readable motion.' }],
    evidence: [{
      id: 'evidence:game-plan',
      revision: 'evidence:game-plan:revision:1',
      schema: { id: 'game-asset.plan', version: 1 },
      value: inputPlan,
      provenance: [{
        sourceId: 'source:retained-game-plan',
        revision: 'source:retained-game-plan:revision:1',
        relation: 'retained-plan-bytes',
        contentHash: planHash,
      }],
    }, ...evidenceReferences.map((evidenceReference) => ({
      id: evidenceReference.id,
      revision: evidenceReference.revision,
      schema: { id: 'game-asset.source-evidence', version: 1 },
      value: { retained: true, subjectId: evidenceReference.id },
      provenance: [{
        sourceId: `source:${evidenceReference.id}`,
        revision: `source:${evidenceReference.id}:revision:1`,
        relation: 'retained-evidence-bytes',
        contentHash: evidenceReference.contentHash,
      }],
    }))],
    unknowns: [],
    invariants: [{
      id: 'invariant:hero-identity',
      description: 'Preserve the accepted hero identity.',
      evidenceIds: [identityLock.id],
    }],
    rights: {
      declarations: [{
        id: 'right:transform-master-frame',
        description: 'The retained master frame may be transformed.',
        subjectId: masterFrame.id,
        scope: 'transform',
        evidenceIds: [masterFrame.id],
      }],
      unresolved: [],
    },
    deliverables: [{
      id: 'deliverable:hero-run-plan',
      description: 'A typed Game Asset plan and frame-family Outcome.',
      required: true,
      schema: { id: 'game-asset.plan', version: 1 },
    }],
    budgets: { attempts: 8, artifacts: 8, bytes: 1_000_000, timeMs: 60_000, spendUnits: 8 },
    risk: { tolerance: 'low', items: [] },
  })
}

function artifactGraph(frames: readonly ObservedGameAssetFrame[], overrides: {
  readonly contentHashByArtifactId?: Readonly<Record<string, string>>
  readonly acceptedByArtifactId?: Readonly<Record<string, boolean>>
} = {}): ArtifactGraph {
  return artifactGraphSchema.parse({
    protocol: 'design-os.protocol.v1',
    kind: 'artifact-graph',
    schema: { id: 'design-os.artifact-graph', version: 1 },
    identity: { id: 'artifacts:hero-run', revision: 'artifacts:hero-run:revision:1' },
    provenance: [],
    body: {
      nodes: frames.map((candidate) => ({
        id: candidate.artifactId,
        revision: candidate.artifactRevision,
        schema: { id: 'game-asset.frame', version: 1 },
        mediaType: 'image/png',
        byteLength: 1_024,
        contentHash: overrides.contentHashByArtifactId?.[candidate.artifactId] ?? candidate.contentHash,
        producerNodeId: `node:${candidate.roleId}`,
        attemptId: `attempt:${candidate.roleId}:1`,
        accepted: overrides.acceptedByArtifactId?.[candidate.artifactId] ?? true,
        provenance: [{
          sourceId: candidate.sourceArtifacts[0]!.id,
          revision: candidate.sourceArtifacts[0]!.revision,
          relation: 'generated-from-reference',
          contentHash: candidate.sourceArtifacts[0]!.contentHash,
        }],
      })),
      dependencies: [],
    },
  })
}

function evidenceGraph(brief: Awaited<ReturnType<typeof gameBrief>>, overrides: {
  readonly omittedEvidenceId?: string
  readonly revisionByEvidenceId?: Readonly<Record<string, string>>
  readonly contentHashByEvidenceId?: Readonly<Record<string, string>>
} = {}): EvidenceGraph {
  return evidenceGraphSchema.parse({
    protocol: 'design-os.protocol.v1',
    kind: 'evidence-graph',
    schema: { id: 'design-os.evidence-graph', version: 1 },
    identity: { id: 'evidence:hero-run-graph', revision: 'evidence:hero-run-graph:revision:1' },
    provenance: [],
    body: {
      nodes: brief.evidence
        .filter(({ id }) => id !== overrides.omittedEvidenceId)
        .map((node) => ({
          ...node,
          revision: overrides.revisionByEvidenceId?.[node.id] ?? node.revision,
          provenance: node.provenance.map((reference) => ({
            ...reference,
            contentHash: overrides.contentHashByEvidenceId?.[node.id] ?? reference.contentHash,
          })),
        })),
      edges: [],
    },
  })
}

async function installGameProfile() {
  const profile = await createGameAssetProfilePackage()
  const registries = createProfileBindingRegistries()
  profile.registerTrustedBindings(registries)
  const closure = await resolveProfileClosure({
    kernelVersion: '1.2.0',
    rootProfiles: [{
      profileId: profile.manifest.id,
      version: profile.manifest.version,
      contentHash: profile.manifest.contentHash,
    }],
    availableManifests: [profile.manifest],
    registrations: profile.registrations,
    libraryLocks: [],
  })
  return { profile, registries, closure }
}

async function compileInstalledGameProfile() {
  const installed = await installGameProfile()
  const brief = await gameBrief()
  const compiler = installed.profile.manifest.compilers[0]!
  const collection = await collectProfileProposals({
    brief,
    profiles: [{
      profileId: installed.profile.manifest.id,
      profileVersion: installed.profile.manifest.version,
      manifestDigest: installed.profile.manifest.contentHash,
      compiler,
      source: {
        sourceId: installed.profile.manifest.id,
        revision: 'manifest:game-asset:revision:1',
        relation: 'profile-proposal',
        contentHash: installed.profile.manifest.contentHash,
      },
    }],
    compilers: installed.registries.compilers,
    closure: installed.closure,
  })
  return { ...installed, brief, proposal: collection.proposals[0]! }
}

describe('Game Asset Profile', () => {
  it('compiles a Universal Brief through the installed closure with exact plan and dependency hashes', async () => {
    const { profile, registries, closure, brief, proposal } = await compileInstalledGameProfile()
    const inputPlan = plan()
    const planHash = await fingerprint(inputPlan)
    const node = proposal.fragments[0]!.nodes[0]!
    const expectedDependencies = [artDirection, masterFrame, identityLock, scaleLock, anchorLock]
      .map(({ id, revision }) => ({ kind: 'evidence', id, revision }))
      .sort((left, right) => compareGameAssetEvidenceIdentity(
        `${left.id}@${left.revision}`,
        `${right.id}@${right.revision}`,
      ))

    expect(closure.manifests[0]?.id).toBe(GAME_ASSET_PROFILE_ID)
    expect(proposal.disposition).toEqual({ rankingOnly: true, installs: false, authorizes: false, executes: false })
    expect(node.payload).toEqual(inputPlan)
    expect(node.dependencies).toEqual(expectedDependencies)
    expect(node.provenance).toContainEqual(expect.objectContaining({
      sourceId: 'evidence:game-plan',
      contentHash: planHash,
    }))
    expect(brief.evidence.find(({ id }) => id === 'evidence:game-plan')?.provenance[0]?.contentHash).toBe(planHash)
    expect(registries.compilers.registrations()).toHaveLength(1)
    expect(profile.manifest.recipes).toEqual([])
    expect(profile.registrations.some(({ kind }) => kind === 'recipe')).toBe(false)
    expect(proposal.compatibleRecipes).toEqual([{ id: 'game-asset.production-recipe', version: 1 }])
  })

  it('rejects stale retained plan bytes and stale exact dependency hashes during real compilation', async () => {
    const { profile, registries, closure } = await installGameProfile()
    const compiler = profile.manifest.compilers[0]!
    const compile = async (brief: Awaited<ReturnType<typeof gameBrief>>) => collectProfileProposals({
      brief,
      profiles: [{
        profileId: profile.manifest.id,
        profileVersion: profile.manifest.version,
        manifestDigest: profile.manifest.contentHash,
        compiler,
        source: {
          sourceId: profile.manifest.id,
          revision: 'manifest:game-asset:revision:1',
          relation: 'profile-proposal',
          contentHash: profile.manifest.contentHash,
        },
      }],
      compilers: registries.compilers,
      closure,
    })

    await expect(compile(await gameBrief(plan(), { planHash: 'f'.repeat(64) })))
      .rejects.toThrow(/does not retain the exact plan hash/)
    await expect(compile(await gameBrief(plan(), { referenceHash: 'f'.repeat(64) })))
      .rejects.toThrow(/missing or stale: artifact:master-frame/)
  })

  it('registers every runtime schema and executes presentation, delivery, and strict repair commands', async () => {
    const { profile, registries } = await installGameProfile()
    const schemas = new SchemaRegistry()
    profile.registerTrustedSchemas(schemas)
    const retained = [frame(0), frame(1), frame(3)].map(({ roleId, artifactId, artifactRevision, contentHash }) => ({
      roleId, artifactId, artifactRevision, contentHash,
    }))
    const command = registries.semanticActions.compile(profile.manifest.semanticActions[0]!, {
      subject: { kind: 'outcome', id: 'outcome:plan:hero-run', revision: 'outcome:plan:hero-run:revision:1' },
      parameters: { failedRoleIds: ['role:run:right:2'], acceptedArtifacts: retained },
    })[0]!

    expect(schemas.parse({ id: 'game-asset.plan', version: 1 }, plan())).toEqual(plan())
    expect(schemas.parse({ id: 'game-asset.frame', version: 1 }, frame(0))).toEqual(frame(0))
    expect(schemas.registrations().map(({ reference }) => reference.id)).toEqual([
      'game-asset.bundle', 'game-asset.evaluation', 'game-asset.frame', 'game-asset.layered-map', 'game-asset.plan',
      'game-map.bundle', 'game-map.object-library', 'game-map.preview-receipt', 'game-map.production-plan',
      'game-map.runtime-manifest',
    ])
    expect(registries.renderers.project(profile.manifest.renderers[0]!, plan())).toEqual(expect.objectContaining({
      title: 'asset:hero',
      actionIds: ['action:game-asset-repair'],
    }))
    expect(registries.delivery.require(profile.manifest.deliveries[0]!).implementation.formatId)
      .toBe('game-asset.bundle.v1')
    expect(command).toEqual(expect.objectContaining({
      id: 'command:game-asset-repair',
      kind: 'request-repair',
      effect: 'command-only',
      requiredCapabilityIds: ['capability:image-generation'],
      parameters: { failedRoleIds: ['role:run:right:2'], acceptedArtifacts: retained },
    }))
    expect(() => registries.semanticActions.compile(profile.manifest.semanticActions[0]!, {
      subject: { kind: 'outcome', id: 'outcome:plan:hero-run' },
      parameters: { failedRoleIds: ['role:run:right:2'], acceptedArtifacts: [], approved: true },
    })).toThrow()
  })

  it('evaluates only exact accepted ArtifactGraph nodes through the installed evaluator', async () => {
    const { profile, registries, brief, proposal } = await compileInstalledGameProfile()
    const frames = [0, 1, 2, 3].map((index) => frame(index))
    const outcome = proposal.fragments[0]!.nodes[0]!
    const evaluator = profile.manifest.evaluators[0]!
    const exact = registries.evaluators.evaluate(evaluator, {
      parameters: { plan: plan(), frames },
      outcome,
      evidenceGraph: evidenceGraph(brief),
      artifactGraph: artifactGraph(frames),
    })
    const stale = registries.evaluators.evaluate(evaluator, {
      parameters: { plan: plan(), frames },
      outcome,
      evidenceGraph: evidenceGraph(brief),
      artifactGraph: artifactGraph(frames, {
        contentHashByArtifactId: { [frames[2]!.artifactId]: 'f'.repeat(64) },
      }),
    })

    expect(exact).toEqual({
      status: 'passed',
      artifactIds: frames.map(({ artifactId }) => artifactId),
      reasons: [],
    })
    expect(stale.status).toBe('repairable')
    expect(stale.artifactIds).not.toContain(frames[2]!.artifactId)
    expect(stale.reasons).toContainEqual(expect.objectContaining({
      code: 'artifact-graph-binding-mismatch',
      evidence: [{ key: 'artifactId', value: frames[2]!.artifactId }],
    }))
  })

  it.each([artDirection, masterFrame, identityLock, scaleLock, anchorLock])(
    'blocks evaluation when exact EvidenceGraph binding is missing or stale for $id',
    async (evidenceReference) => {
      const { profile, registries, brief, proposal } = await compileInstalledGameProfile()
      const frames = [0, 1, 2, 3].map((index) => frame(index))
      const outcome = proposal.fragments[0]!.nodes[0]!
      const evaluate = (graph: EvidenceGraph) => registries.evaluators.evaluate(profile.manifest.evaluators[0]!, {
        parameters: { plan: plan(), frames },
        outcome,
        evidenceGraph: graph,
        artifactGraph: artifactGraph(frames),
      })
      const missing = evaluate(evidenceGraph(brief, { omittedEvidenceId: evidenceReference.id }))
      const staleRevision = evaluate(evidenceGraph(brief, {
        revisionByEvidenceId: { [evidenceReference.id]: `${evidenceReference.id}:revision:stale` },
      }))
      const staleHash = evaluate(evidenceGraph(brief, {
        contentHashByEvidenceId: { [evidenceReference.id]: 'f'.repeat(64) },
      }))

      for (const result of [missing, staleRevision, staleHash]) {
        expect(result.status).toBe('blocked')
        expect(result.artifactIds).toEqual([])
        expect(result.reasons).toContainEqual(expect.objectContaining({
          code: 'evidence-graph-binding-mismatch',
          dependencyPath: [outcome.id, evidenceReference.id],
          evidence: [
            { key: 'evidenceId', value: evidenceReference.id },
            { key: 'evidenceRevision', value: evidenceReference.revision },
            { key: 'evidenceContentHash', value: evidenceReference.contentHash },
          ],
        }))
      }
    },
  )

  it('blocks evaluation when exact plan evidence is missing or stale in the EvidenceGraph', async () => {
    const { profile, registries, brief, proposal } = await compileInstalledGameProfile()
    const frames = [0, 1, 2, 3].map((index) => frame(index))
    const outcome = proposal.fragments[0]!.nodes[0]!
    const evaluate = (graph: EvidenceGraph) => registries.evaluators.evaluate(profile.manifest.evaluators[0]!, {
      parameters: { plan: plan(), frames },
      outcome,
      evidenceGraph: graph,
      artifactGraph: artifactGraph(frames),
    })
    const missing = evaluate(evidenceGraph(brief, { omittedEvidenceId: 'evidence:game-plan' }))
    const staleRevision = evaluate(evidenceGraph(brief, {
      revisionByEvidenceId: { 'evidence:game-plan': 'evidence:game-plan:revision:stale' },
    }))
    const staleHash = evaluate(evidenceGraph(brief, {
      contentHashByEvidenceId: { 'evidence:game-plan': 'f'.repeat(64) },
    }))

    for (const result of [missing, staleRevision, staleHash]) {
      expect(result.status).toBe('blocked')
      expect(result.artifactIds).toEqual([])
      expect(result.reasons).toContainEqual(expect.objectContaining({
        code: 'plan-evidence-graph-binding-mismatch',
        nodeId: outcome.id,
        dependencyPath: [outcome.id],
        evidence: [{ key: 'planId', value: plan().id }],
      }))
    }
  })

  it('blocks an evaluator call whose parameters do not match the Outcome plan', async () => {
    const { profile, registries, brief, proposal } = await compileInstalledGameProfile()
    const frames = [0, 1, 2, 3].map((index) => frame(index))
    const changedPlan = gameAssetPlanSchema.parse({ ...plan(), assetId: 'asset:other-hero', roles: plan().roles.map((role) => ({ ...role, assetId: 'asset:other-hero' })) })
    const result = registries.evaluators.evaluate(profile.manifest.evaluators[0]!, {
      parameters: { plan: changedPlan, frames },
      outcome: proposal.fragments[0]!.nodes[0]!,
      evidenceGraph: evidenceGraph(brief),
      artifactGraph: artifactGraph(frames),
    })

    expect(result.status).toBe('blocked')
    expect(result.artifactIds).toEqual([])
    expect(result.reasons).toContainEqual(expect.objectContaining({ code: 'outcome-plan-binding-mismatch' }))
  })

  it('projects a real derived scorecard and exposes no maturity adapter or readiness claim', async () => {
    const { profile, registries } = await installGameProfile()
    const frames = [frame(0), frame(1), frame(2, { edgeContact: true }), frame(3)]
    const scorecard = registries.outcomeScorecardAdapters.project(
      profile.manifest.outcomeScorecardAdapters[0]!,
      { plan: plan(), frames },
    )
    const expectedEvidenceIds = [...new Set([
      plan().id,
      ...frames.map(({ artifactRevision }) => artifactRevision),
      artDirection.revision,
      masterFrame.revision,
      identityLock.revision,
      scaleLock.revision,
      anchorLock.revision,
    ])].sort()

    expect(scorecard.criteria[0]).toEqual({
      id: 'criterion:role-closure',
      score: 3,
      maximumScore: 4,
      evidenceIds: expectedEvidenceIds,
    })
    expect(scorecard).not.toHaveProperty('productionReady')
    expect(profile.manifest.evidenceBenchmarkAdapters).toEqual([])
    expect(profile.registrations.some(({ kind }) => kind === 'evidence-benchmark-adapter')).toBe(false)
    expect(registries.evidenceBenchmarkAdapters.registrations()).toEqual([])
  })

  it('uses stable content fingerprints for the exact trusted implementation closure', async () => {
    const first = await createGameAssetProfilePackage()
    const second = await createGameAssetProfilePackage()

    expect(canonicalJson(first.registrations)).toBe(canonicalJson(second.registrations))
    expect(first.manifest.contentHash).toBe(second.manifest.contentHash)
    expect(first.retainedEvidenceVerifier.implementationHash)
      .toBe(second.retainedEvidenceVerifier.implementationHash)
    expect(first.retainedEvidenceVerifier.implementationHash).toMatch(/^[a-f0-9]{64}$/)
    expect(new Set(first.registrations.map(({ implementationHash }) => implementationHash)).size)
      .toBe(first.registrations.length)
    expect(first.registrations).toHaveLength(8)
  })

  it('repairs only failed frames and preserves exact accepted sibling revisions and hashes', () => {
    const frames = [0, 1, 2, 3].map((index) => frame(index))
    const result = evaluateGameAssetFrames({
      plan: plan(),
      frames: frames.map((candidate, index) => index === 2 ? { ...candidate, edgeContact: true } : candidate),
    })

    expect(result.status).toBe('needs-repair')
    expect(result.failedRoleIds).toEqual(['role:run:right:2'])
    expect(result.acceptedArtifacts).toEqual([0, 1, 3].map((index) => ({
      roleId: frames[index]!.roleId,
      artifactId: frames[index]!.artifactId,
      artifactRevision: frames[index]!.artifactRevision,
      contentHash: frames[index]!.contentHash,
    })))
  })

  it('accepts aspect-preserving alpha envelopes and only raster-quantized anchor drift', () => {
    const normalized = frame(0, {
      alphaBounds: { x: 30, y: 12, width: 68, height: 104 },
      anchor: { x: 64.5, y: 116 },
    })
    const accepted = evaluateGameAssetFrames({
      plan: { ...plan(), roles: [plan().roles[0]!] },
      frames: [normalized],
    })
    const undersized = evaluateGameAssetFrames({
      plan: { ...plan(), roles: [plan().roles[0]!] },
      frames: [{
        ...normalized,
        alphaBounds: { x: 34, y: 18, width: 60, height: 96 },
      }],
    })

    expect(accepted.status).toBe('passed')
    expect(undersized.findings.map(({ code }) => code)).toContain('scale-geometry-mismatch')
  })

  it('rejects stale locks, incomplete lineage, reused artifacts, and invalid geometry', () => {
    const stale = evaluateGameAssetFrames({
      plan: plan(),
      frames: [
        frame(0, { identityLock: { ...identityLock, contentHash: historicalFrameHash } }),
        frame(1, { scaleLock: { ...scaleLock, contentHash: historicalFrameHash } }),
        frame(2, { anchorLock: { ...anchorLock, contentHash: historicalFrameHash } }),
        frame(3, { sourceArtifacts: [artDirection] }),
      ],
    })
    const reused = evaluateGameAssetFrames({
      plan: plan(),
      frames: [
        frame(0),
        frame(1, {
          artifactId: frame(0).artifactId,
          artifactRevision: frame(0).artifactRevision,
          contentHash: frame(0).contentHash,
        }),
        frame(2),
        frame(3),
      ],
    })

    expect(stale.findings.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'identity-lock-mismatch', 'scale-lock-mismatch', 'anchor-lock-mismatch', 'reference-lineage-mismatch',
    ]))
    expect(reused.findings.map(({ code }) => code)).toContain('reused-artifact')
    expect(() => observedGameAssetFrameSchema.parse({
      ...frame(0),
      alphaBounds: { x: 100, y: 0, width: 40, height: 40 },
    })).toThrow(/alpha bounds exceed/)
    expect(() => gameAssetPlanSchema.parse({
      ...plan(),
      roles: plan().roles.map((role, index) => index === 1
        ? { ...role, action: 'run', direction: 'right', frameIndex: 0 }
        : role),
    })).toThrow(/tuples must be unique/)
  })

  it('keeps layered map preview non-authoritative and collision/zones structured', () => {
    const map = layeredGameMapManifestSchema.parse({
      version: 'game-asset.layered-map.v1',
      id: 'map:shrine',
      width: 1672,
      height: 941,
      layers: [
        { kind: 'base', artifactId: 'artifact:base', authoritative: true },
        { kind: 'props', artifactId: 'artifact:props', authoritative: true },
        { kind: 'collision', artifactId: 'artifact:collision-json', authoritative: true },
        { kind: 'zones', artifactId: 'artifact:zones-json', authoritative: true },
        { kind: 'preview', artifactId: 'artifact:flattened-preview', authoritative: false },
      ],
    })
    expect(map.layers.find(({ kind }) => kind === 'preview')?.authoritative).toBe(false)
    expect(() => layeredGameMapManifestSchema.parse({
      ...map,
      layers: map.layers.map((layer) => layer.kind === 'preview' ? { ...layer, authoritative: true } : layer),
    })).toThrow(/preview cannot be authoritative/)
    expect(() => layeredGameMapManifestSchema.parse({
      ...map,
      layers: map.layers.filter(({ kind }) => kind !== 'collision'),
    })).toThrow(/missing collision/)
  })

  it('removes Game Asset while preserving Commerce and historical game artifacts read-only', async () => {
    const game = await createGameAssetProfilePackage()
    const commerce = await createCommerceProfileAdapterPackage()
    const current = await resolveProfileClosure({
      kernelVersion: '1.2.0',
      rootProfiles: [game.manifest, commerce.manifest].map((manifest) => ({
        profileId: manifest.id,
        version: manifest.version,
        contentHash: manifest.contentHash,
      })),
      availableManifests: [game.manifest, commerce.manifest],
      registrations: [...game.registrations, ...commerce.registrations],
      libraryLocks: [],
    })
    const next = await resolveProfileClosure({
      kernelVersion: '1.2.0',
      rootProfiles: [{
        profileId: commerce.manifest.id,
        version: commerce.manifest.version,
        contentHash: commerce.manifest.contentHash,
      }],
      availableManifests: [commerce.manifest],
      registrations: commerce.registrations,
      libraryLocks: [],
    })
    const preview = await previewProfileLifecycle({
      operation: 'remove',
      projectId: 'project:commerce-and-game',
      expectedProjectRevision: 'project:revision:1',
      profileIds: [game.manifest.id],
      currentClosure: current,
      nextClosure: next,
    })

    await expect(assertProfileLifecycleChangeSet({
      preview,
      previewHash: preview.previewHash,
      projectRevision: 'project:revision:1',
      nextClosureHash: next.closureHash,
    })).resolves.toEqual(preview)
    expect(next.rootProfiles).toEqual([expect.objectContaining({
      profileId: commerce.manifest.id,
      contentHash: commerce.manifest.contentHash,
    })])
    expect(inspectUnknownArtifact({
      identity: {
        id: 'artifact:run:right:accepted',
        revision: 'artifact:run:right:accepted:revision:1',
        schema: { id: 'game-asset.frame', version: 1 },
        contentHash: historicalFrameHash,
      },
      provenance: [{
        sourceId: game.manifest.id,
        revision: game.manifest.version,
        relation: 'historical-profile-artifact',
        contentHash: game.manifest.contentHash,
      }],
      rawMetadata: { action: 'run', direction: 'right', frameIndex: 2 },
    })).toEqual(expect.objectContaining({
      status: 'unknown-schema',
      readOnly: true,
      identity: expect.objectContaining({ contentHash: historicalFrameHash }),
    }))
  })
})

import { describe, expect, it } from 'vitest'
import { canonicalJson } from '@/design-ir/fingerprint'
import { fixtureOutcomeGraph } from '@/design-os-kernel/test-fixture'
import type { OutcomeNode } from '@/design-os-kernel/contracts'
import {
  ProfileCompilerRegistry,
  type ProfileCompiler,
} from './registries'
import {
  collectProfileProposals,
  composeProfileProposals,
  universalBriefSchema,
  type ProfileCompilerSelection,
  type ProfileCompilerBindingReference,
  type ProfileProposalDraft,
  type UniversalBrief,
} from './brief'
import { createDesignProfileManifest } from './contracts'
import { resolveProfileClosure } from './closure'

const digestA = 'a'.repeat(64)
const digestB = 'b'.repeat(64)

function brief(): UniversalBrief {
  return universalBriefSchema.parse({
    version: 'design-profile.universal-brief.v1',
    id: 'brief:fixture',
    revision: 'brief:1',
    goal: {
      statement: 'Create a coherent, evidence-bound design outcome.',
      successCriteria: ['The declared deliverables satisfy their invariants.'],
    },
    audience: [{
      id: 'audience:primary',
      description: 'People who use the resulting design.',
      needs: ['Clarity and continuity.'],
    }],
    desiredExperience: [{ id: 'experience:coherent', description: 'Coherent and legible.' }],
    evidence: [{
      id: 'evidence:brief',
      revision: 'evidence:1',
      schema: { id: 'fixture.evidence', version: 1 },
      value: { observation: 'A source observation.' },
      provenance: [{ sourceId: 'source:brief', revision: 'source:1', relation: 'normalized-from' }],
    }],
    unknowns: [
      { id: 'unknown:locale', question: 'Which locale is required?', blocking: false },
      { id: 'unknown:format', question: 'Which final format is required?', blocking: true },
    ],
    invariants: [{
      id: 'invariant:identity',
      description: 'Preserve the supplied identity.',
      evidenceIds: ['evidence:brief'],
    }],
    rights: {
      declarations: [{
        id: 'right:transform',
        description: 'The supplied evidence may be transformed.',
        subjectId: 'evidence:brief',
        scope: 'transform',
        evidenceIds: ['evidence:brief'],
      }],
      unresolved: [],
    },
    deliverables: [{
      id: 'deliverable:primary',
      description: 'A reviewable structured design outcome.',
      required: true,
      schema: { id: 'fixture.outcome', version: 1 },
    }],
    budgets: {
      attempts: 4,
      artifacts: 10,
      bytes: 10_000,
      timeMs: 20_000,
      spendUnits: 5,
    },
    risk: {
      tolerance: 'low',
      items: [{
        id: 'risk:rights',
        description: 'Rights evidence may be incomplete.',
        severity: 'high',
        mitigation: 'Block delivery until resolved.',
      }],
    },
  })
}

function node(id: string, payload: Record<string, string>, state: OutcomeNode['state'] = 'proposed'): OutcomeNode {
  return {
    id,
    revision: `${id}:1`,
    schema: { id: 'fixture.outcome', version: 1 },
    recipe: { id: 'fixture.recipe', version: 1 },
    payload,
    dependencies: [{ kind: 'evidence', id: 'evidence:brief', revision: 'evidence:1' }],
    state,
    provenance: [],
  }
}

function compilerReference(
  id: string,
  digest: string,
): ProfileCompilerBindingReference {
  return {
    kind: 'compiler',
    id,
    version: '1.0.0',
    implementationHash: digest,
    required: true,
  }
}

function selection(profileId: string, compilerId: string, digest: string, manifestDigest = digest): ProfileCompilerSelection {
  return {
    profileId,
    profileVersion: '1.0.0',
    manifestDigest,
    compiler: compilerReference(compilerId, digest),
    source: {
      sourceId: profileId,
      revision: 'manifest:1',
      relation: 'profile-proposal',
      contentHash: manifestDigest,
    },
  }
}

async function installedProfiles(entries: readonly {
  readonly profileId: string
  readonly compilerId: string
  readonly implementationHash: string
}[]) {
  const manifests = await Promise.all(entries.map((entry) => createDesignProfileManifest({
    protocol: 'design-profile.manifest.v1',
    id: entry.profileId,
    version: '1.0.0',
    kernelCompatibility: '^1.0.0',
    dependencies: [], schemas: [],
    compilers: [compilerReference(entry.compilerId, entry.implementationHash)],
    recipes: [], policies: [], evaluators: [], renderers: [], inspectors: [], semanticActions: [],
    deliveries: [], migrations: [], evidenceBenchmarkAdapters: [], outcomeScorecardAdapters: [],
    capabilityRequirements: [], libraryRequirements: [], requiredRoleClosures: [], identityBindings: [],
  })))
  const closure = await resolveProfileClosure({
    kernelVersion: '1.2.0',
    rootProfiles: manifests.map((manifest) => ({
      profileId: manifest.id, version: manifest.version, contentHash: manifest.contentHash,
    })),
    availableManifests: manifests,
    registrations: entries.map((entry) => ({
      kind: 'compiler', id: entry.compilerId, version: '1.0.0',
      implementationHash: entry.implementationHash, ownerId: `cutout:${entry.compilerId}`,
    })),
    libraryLocks: [],
  })
  const byId = new Map(manifests.map((manifest) => [manifest.id, manifest]))
  return {
    closure,
    selection(profileId: string): ProfileCompilerSelection {
      const entry = entries.find((candidate) => candidate.profileId === profileId)!
      const manifest = byId.get(profileId)!
      return selection(profileId, entry.compilerId, entry.implementationHash, manifest.contentHash)
    },
  }
}

function proposal(input: {
  readonly id: string
  readonly fragmentId: string
  readonly score: number
  readonly node: OutcomeNode
  readonly precedence?: number
  readonly unknownId: string
  readonly capabilityId: string
  readonly deliverableId: string
}): ProfileProposalDraft {
  return {
    id: input.id,
    score: input.score,
    scoreReasons: ['The brief matches the registered Profile constraints.'],
    requiredUnknownIds: [input.unknownId],
    capabilities: [{
      id: input.capabilityId,
      required: true,
      reason: 'Required to produce the proposed Outcome.',
    }],
    deliverables: [{
      id: input.deliverableId,
      description: 'Expected Profile deliverable.',
      required: true,
      schema: { id: 'fixture.outcome', version: 1 },
    }],
    compatibleRecipes: [{ id: 'fixture.recipe', version: 1 }],
    fragments: [{
      id: input.fragmentId,
      precedence: input.precedence ?? 10,
      nodes: [input.node],
    }],
    provenance: [{ sourceId: `compiler:${input.id}`, revision: 'compiler:1', relation: 'compiled-from-brief' }],
  }
}

function registerCompiler(
  registry: ProfileCompilerRegistry,
  id: string,
  digest: string,
  implementation: ProfileCompiler,
): void {
  registry.register({
    kind: 'compiler',
    id,
    version: '1.0.0',
    implementationHash: digest,
    ownerId: `cutout:${id}`,
    implementation,
  })
}

describe('Universal Brief and multi-Profile proposal composition', () => {
  it('strictly rejects undeclared, missing, duplicated, and unresolved brief data', () => {
    const valid = brief()
    expect(universalBriefSchema.parse(valid)).toEqual(valid)
    expect(() => universalBriefSchema.parse({ ...valid, outputPath: '/tmp/result' })).toThrow()
    const { risk: _risk, ...missingRisk } = valid
    expect(() => universalBriefSchema.parse(missingRisk)).toThrow()
    expect(() => universalBriefSchema.parse({
      ...valid,
      unknowns: [...valid.unknowns, valid.unknowns[0]],
    })).toThrow(/unknown ids must be unique/)
    expect(() => universalBriefSchema.parse({
      ...valid,
      invariants: [{
        id: 'invariant:unresolved',
        description: 'References absent evidence.',
        evidenceIds: ['evidence:missing'],
      }],
    })).toThrow(/evidence reference is unresolved/)
  })

  it('collects and composes compatible Profile proposals deterministically with provenance', async () => {
    const compilers = new ProfileCompilerRegistry()
    registerCompiler(compilers, 'compiler:alpha', digestA, {
      compile: () => [proposal({
        id: 'proposal:alpha',
        fragmentId: 'fragment:alpha',
        score: 0.8,
        node: node('outcome:alpha', { profile: 'alpha' }),
        unknownId: 'unknown:locale',
        capabilityId: 'capability:alpha',
        deliverableId: 'deliverable:alpha',
      })],
    })
    registerCompiler(compilers, 'compiler:beta', digestB, {
      compile: () => [proposal({
        id: 'proposal:beta',
        fragmentId: 'fragment:beta',
        score: 0.8,
        node: node('outcome:beta', { profile: 'beta' }),
        unknownId: 'unknown:format',
        capabilityId: 'capability:beta',
        deliverableId: 'deliverable:beta',
      })],
    })
    const installed = await installedProfiles([
      { profileId: 'profile:alpha', compilerId: 'compiler:alpha', implementationHash: digestA },
      { profileId: 'profile:beta', compilerId: 'compiler:beta', implementationHash: digestB },
    ])
    const alpha = installed.selection('profile:alpha')
    const beta = installed.selection('profile:beta')

    const forward = await collectProfileProposals({ brief: brief(), profiles: [beta, alpha], compilers, closure: installed.closure })
    const reverse = await collectProfileProposals({ brief: brief(), profiles: [alpha, beta], compilers, closure: installed.closure })
    const base = fixtureOutcomeGraph()
    const composedForward = composeProfileProposals({
      graph: {
        protocol: base.protocol,
        kind: base.kind,
        schema: base.schema,
        identity: base.identity,
        provenance: base.provenance,
      },
      proposals: forward.proposals,
    })
    const composedReverse = composeProfileProposals({
      graph: {
        protocol: base.protocol,
        kind: base.kind,
        schema: base.schema,
        identity: base.identity,
        provenance: base.provenance,
      },
      proposals: [...reverse.proposals].reverse(),
    })

    expect(canonicalJson(forward)).toBe(canonicalJson(reverse))
    expect(canonicalJson(composedForward)).toBe(canonicalJson(composedReverse))
    expect(forward.proposals.map(({ profile, advisoryRank }) => [profile.id, advisoryRank])).toEqual([
      ['profile:alpha', 1],
      ['profile:beta', 2],
    ])
    expect(composedForward.graph.body.nodes.map(({ id }) => id)).toEqual(['outcome:alpha', 'outcome:beta'])
    expect(composedForward.graph.body.nodes[0]?.provenance).toContainEqual(expect.objectContaining({
      sourceId: 'profile:alpha',
      relation: 'profile-proposal',
    }))
    expect(composedForward.requiredUnknownIds).toEqual(['unknown:format', 'unknown:locale'])
    expect(composedForward.capabilities.map(({ id }) => id).sort()).toEqual([
      'capability:alpha',
      'capability:beta',
    ])
    expect(composedForward.deliverables.map(({ id }) => id).sort()).toEqual([
      'deliverable:alpha',
      'deliverable:beta',
    ])
    expect(composedForward.proposalIdByFragmentId).toEqual({
      'fragment:alpha': 'profile:alpha:proposal:alpha',
      'fragment:beta': 'profile:beta:proposal:beta',
    })
    expect(composedForward.disposition).toEqual({
      rankingOnly: true,
      installs: false,
      authorizes: false,
      executes: false,
    })
    expect(forward.proposals.every(({ disposition }) => !disposition.installs
      && !disposition.authorizes && !disposition.executes)).toBe(true)
  })

  it('exposes equal-precedence semantic conflict without selecting either Outcome', async () => {
    const compilers = new ProfileCompilerRegistry()
    registerCompiler(compilers, 'compiler:alpha', digestA, {
      compile: () => [proposal({
        id: 'proposal:alpha',
        fragmentId: 'fragment:alpha',
        score: 0.9,
        node: node('outcome:shared', { direction: 'alpha' }),
        precedence: 20,
        unknownId: 'unknown:locale',
        capabilityId: 'capability:alpha',
        deliverableId: 'deliverable:alpha',
      })],
    })
    registerCompiler(compilers, 'compiler:beta', digestB, {
      compile: () => [proposal({
        id: 'proposal:beta',
        fragmentId: 'fragment:beta',
        score: 0.4,
        node: node('outcome:shared', { direction: 'beta' }),
        precedence: 20,
        unknownId: 'unknown:format',
        capabilityId: 'capability:beta',
        deliverableId: 'deliverable:beta',
      })],
    })
    const installed = await installedProfiles([
      { profileId: 'profile:alpha', compilerId: 'compiler:alpha', implementationHash: digestA },
      { profileId: 'profile:beta', compilerId: 'compiler:beta', implementationHash: digestB },
    ])
    const collected = await collectProfileProposals({
      brief: brief(),
      profiles: [
        installed.selection('profile:beta'),
        installed.selection('profile:alpha'),
      ],
      compilers,
      closure: installed.closure,
    })
    const base = fixtureOutcomeGraph()
    const composed = composeProfileProposals({
      graph: {
        protocol: base.protocol,
        kind: base.kind,
        schema: base.schema,
        identity: base.identity,
        provenance: base.provenance,
      },
      proposals: collected.proposals,
    })

    expect(collected.proposals[0]?.profile.id).toBe('profile:alpha')
    expect(composed.conflicts).toEqual([{
      nodeId: 'outcome:shared',
      fragmentIds: ['fragment:alpha', 'fragment:beta'],
      precedence: 20,
      code: 'equal-precedence-conflict',
    }])
    expect(composed.graph.body.nodes).toEqual([])
    expect(composed.sourceFragmentByNodeId).toEqual({})
  })

  it('rejects compiler mutation, nondeterminism, and selection drift from the installed closure', async () => {
    const mutating = new ProfileCompilerRegistry()
    registerCompiler(mutating, 'compiler:mutating', digestA, {
      compile: ({ brief: input }) => {
        input.goal.statement = 'mutated'
        return []
      },
    })
    const mutatingInstalled = await installedProfiles([
      { profileId: 'profile:mutating', compilerId: 'compiler:mutating', implementationHash: digestA },
    ])
    await expect(collectProfileProposals({
      brief: brief(),
      profiles: [mutatingInstalled.selection('profile:mutating')],
      compilers: mutating,
      closure: mutatingInstalled.closure,
    })).rejects.toThrow(/mutate the frozen Universal Brief/)

    const undeclared = new ProfileCompilerRegistry()
    registerCompiler(undeclared, 'compiler:undeclared', digestB, {
      compile: () => [proposal({
        id: 'proposal:undeclared',
        fragmentId: 'fragment:undeclared',
        score: 0.5,
        node: node('outcome:undeclared', { profile: 'undeclared' }),
        unknownId: 'unknown:not-in-brief',
        capabilityId: 'capability:fixture',
        deliverableId: 'deliverable:fixture',
      })],
    })
    const undeclaredInstalled = await installedProfiles([
      { profileId: 'profile:undeclared', compilerId: 'compiler:undeclared', implementationHash: digestB },
    ])
    await expect(collectProfileProposals({
      brief: brief(),
      profiles: [undeclaredInstalled.selection('profile:undeclared')],
      compilers: undeclared,
      closure: undeclaredInstalled.closure,
    })).rejects.toThrow(/undeclared unknown/)

    let invocation = 0
    const nondeterministic = new ProfileCompilerRegistry()
    registerCompiler(nondeterministic, 'compiler:nondeterministic', digestA, {
      compile: () => [proposal({
        id: `proposal:nondeterministic:${invocation += 1}`,
        fragmentId: `fragment:nondeterministic:${invocation}`,
        score: 0.5,
        node: node(`outcome:nondeterministic:${invocation}`, { profile: 'nondeterministic' }),
        unknownId: 'unknown:locale',
        capabilityId: 'capability:fixture',
        deliverableId: 'deliverable:fixture',
      })],
    })
    const nondeterministicInstalled = await installedProfiles([
      { profileId: 'profile:nondeterministic', compilerId: 'compiler:nondeterministic', implementationHash: digestA },
    ])
    await expect(collectProfileProposals({
      brief: brief(),
      profiles: [nondeterministicInstalled.selection('profile:nondeterministic')],
      compilers: nondeterministic,
      closure: nondeterministicInstalled.closure,
    })).rejects.toThrow(/nondeterministic proposals/)

    await expect(collectProfileProposals({
      brief: brief(),
      profiles: [{
        ...mutatingInstalled.selection('profile:mutating'),
        manifestDigest: digestB,
        source: { ...mutatingInstalled.selection('profile:mutating').source, contentHash: digestB },
      }],
      compilers: mutating,
      closure: mutatingInstalled.closure,
    })).rejects.toThrow(/not bound to the exact installed manifest/)
  })
})

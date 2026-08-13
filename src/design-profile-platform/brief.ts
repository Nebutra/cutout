import { z } from 'zod'
import {
  budgetSchema,
  evidenceNodeSchema,
  outcomeGraphSchema,
  outcomeNodeSchema,
  provenanceReferenceSchema,
  recordIdSchema,
  schemaReferenceSchema,
  sha256Schema,
  type OutcomeGraph,
  type ProvenanceReference,
} from '@/design-os-kernel/contracts'
import {
  composeOutcomeFragments,
  graphFragmentSchema,
  type ComposedOutcomeGraph,
} from '@/design-os-kernel/graph'
import { canonicalJson } from '@/design-ir/fingerprint'
import {
  ProfileCompilerRegistry,
} from './registries'
import {
  compilerBindingReferenceSchema,
  exactSemverSchema,
  type ProfileBindingReference,
} from './contracts'
import { deepFreeze } from './immutability'
import { decodeProfileClosure } from './closure'

const identifiedDescriptionSchema = z.object({
  id: recordIdSchema,
  description: z.string().min(1).max(4_000),
}).strict()

const universalDeliverableSchema = identifiedDescriptionSchema.extend({
  required: z.boolean(),
  schema: schemaReferenceSchema.optional(),
}).strict()
export type UniversalDeliverable = z.infer<typeof universalDeliverableSchema>

export const universalBriefSchema = z.object({
  version: z.literal('design-profile.universal-brief.v1'),
  id: recordIdSchema,
  revision: recordIdSchema,
  goal: z.object({
    statement: z.string().min(1).max(8_000),
    successCriteria: z.array(z.string().min(1).max(2_000)).min(1).max(1_000),
  }).strict(),
  audience: z.array(identifiedDescriptionSchema.extend({
    needs: z.array(z.string().min(1).max(2_000)).max(1_000),
  }).strict()).min(1).max(1_000),
  desiredExperience: z.array(identifiedDescriptionSchema).max(1_000),
  evidence: z.array(evidenceNodeSchema).max(20_000),
  unknowns: z.array(z.object({
    id: recordIdSchema,
    question: z.string().min(1).max(4_000),
    blocking: z.boolean(),
  }).strict()).max(10_000),
  invariants: z.array(identifiedDescriptionSchema.extend({
    evidenceIds: z.array(recordIdSchema).max(10_000),
  }).strict()).max(10_000),
  rights: z.object({
    declarations: z.array(identifiedDescriptionSchema.extend({
      subjectId: recordIdSchema,
      scope: z.enum(['inspect', 'transform', 'reproduce', 'deliver']),
      evidenceIds: z.array(recordIdSchema).max(10_000),
    }).strict()).max(10_000),
    unresolved: z.array(identifiedDescriptionSchema).max(10_000),
  }).strict(),
  deliverables: z.array(universalDeliverableSchema).min(1).max(10_000),
  budgets: budgetSchema,
  risk: z.object({
    tolerance: z.enum(['low', 'medium', 'high']),
    items: z.array(identifiedDescriptionSchema.extend({
      severity: z.enum(['low', 'medium', 'high', 'critical']),
      mitigation: z.string().min(1).max(4_000).optional(),
    }).strict()).max(10_000),
  }).strict(),
}).strict().superRefine((brief, context) => {
  for (const [label, ids] of [
    ['audience', brief.audience.map(({ id }) => id)],
    ['desired experience', brief.desiredExperience.map(({ id }) => id)],
    ['evidence', brief.evidence.map(({ id }) => id)],
    ['unknown', brief.unknowns.map(({ id }) => id)],
    ['invariant', brief.invariants.map(({ id }) => id)],
    ['right', brief.rights.declarations.map(({ id }) => id)],
    ['unresolved right', brief.rights.unresolved.map(({ id }) => id)],
    ['deliverable', brief.deliverables.map(({ id }) => id)],
    ['risk', brief.risk.items.map(({ id }) => id)],
  ] as const) {
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: 'custom', message: `Universal Brief ${label} ids must be unique.` })
    }
  }
  const evidenceIds = new Set(brief.evidence.map(({ id }) => id))
  for (const reference of [
    ...brief.invariants.flatMap(({ evidenceIds: ids }) => ids),
    ...brief.rights.declarations.flatMap(({ evidenceIds: ids }) => ids),
  ]) {
    if (!evidenceIds.has(reference)) {
      context.addIssue({ code: 'custom', message: `Universal Brief evidence reference is unresolved: ${reference}` })
    }
  }
})
export type UniversalBrief = z.infer<typeof universalBriefSchema>

export const profileCompilerSelectionSchema = z.object({
  profileId: recordIdSchema,
  profileVersion: exactSemverSchema,
  manifestDigest: sha256Schema,
  compiler: compilerBindingReferenceSchema,
  source: provenanceReferenceSchema,
}).strict()
export type ProfileCompilerSelection = z.infer<typeof profileCompilerSelectionSchema>

const proposalCapabilitySchema = z.object({
  id: recordIdSchema,
  required: z.boolean(),
  reason: z.string().min(1).max(2_000),
}).strict()

const proposalFragmentDraftSchema = z.object({
  id: recordIdSchema,
  precedence: z.number().int(),
  nodes: z.array(outcomeNodeSchema).max(20_000),
}).strict()

const profileProposalDraftBaseSchema = z.object({
  id: recordIdSchema,
  score: z.number().finite().min(0).max(1),
  scoreReasons: z.array(z.string().min(1).max(2_000)).min(1).max(1_000),
  requiredUnknownIds: z.array(recordIdSchema).max(10_000),
  capabilities: z.array(proposalCapabilitySchema).max(1_000),
  deliverables: z.array(universalDeliverableSchema).max(10_000),
  compatibleRecipes: z.array(schemaReferenceSchema).max(10_000),
  fragments: z.array(proposalFragmentDraftSchema).max(10_000),
  provenance: z.array(provenanceReferenceSchema).max(20_000),
}).strict()

function validateProposalClosure(
  proposal: z.infer<typeof profileProposalDraftBaseSchema>,
  context: z.RefinementCtx,
): void {
  for (const [label, ids] of [
    ['required unknown', proposal.requiredUnknownIds],
    ['capability', proposal.capabilities.map(({ id }) => id)],
    ['deliverable', proposal.deliverables.map(({ id }) => id)],
    ['recipe', proposal.compatibleRecipes.map(schemaKey)],
    ['fragment', proposal.fragments.map(({ id }) => id)],
  ] as const) {
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: 'custom', message: `Proposal ${label}s must be unique.` })
    }
  }
}

export const profileProposalDraftSchema = profileProposalDraftBaseSchema.superRefine(validateProposalClosure)
export type ProfileProposalDraft = z.infer<typeof profileProposalDraftSchema>

const advisoryDispositionSchema = z.object({
  rankingOnly: z.literal(true),
  installs: z.literal(false),
  authorizes: z.literal(false),
  executes: z.literal(false),
}).strict()

const unrankedProfileProposalSchema = profileProposalDraftBaseSchema.omit({ fragments: true }).extend({
  profile: z.object({
    id: recordIdSchema,
    version: z.string().min(1).max(120),
    manifestDigest: sha256Schema,
  }).strict(),
  compiler: compilerBindingReferenceSchema,
  fragments: z.array(graphFragmentSchema).max(10_000),
  disposition: advisoryDispositionSchema,
}).strict()

export const profileProposalSchema = unrankedProfileProposalSchema.extend({
  advisoryRank: z.number().int().positive(),
}).strict().superRefine(validateProposalClosure)
export type ProfileProposal = z.infer<typeof profileProposalSchema>

export interface ProfileProposalCollection {
  readonly brief: UniversalBrief
  readonly proposals: readonly ProfileProposal[]
}

export async function collectProfileProposals(input: {
  readonly brief: UniversalBrief
  readonly profiles: readonly ProfileCompilerSelection[]
  readonly compilers: ProfileCompilerRegistry
  readonly closure: unknown
}): Promise<ProfileProposalCollection> {
  const brief = universalBriefSchema.parse(input.brief)
  const closure = await decodeProfileClosure(input.closure)
  const profiles = input.profiles.map((profile) => profileCompilerSelectionSchema.parse(profile))
    .sort(compareProfileSelections)
  const profileKeys = profiles.map((profile) => `${profile.profileId}@${profile.profileVersion}`)
  if (new Set(profileKeys).size !== profileKeys.length) {
    throw new Error('Profile compiler selections must be unique by Profile id and version.')
  }
  for (const profile of profiles) {
    const manifest = closure.manifests.find((candidate) => candidate.id === profile.profileId)
    if (!manifest
      || manifest.version !== profile.profileVersion
      || manifest.contentHash !== profile.manifestDigest) {
      throw new Error(`Profile compiler selection is not bound to the exact installed manifest: ${profile.profileId}`)
    }
    const declaredCompiler = manifest.compilers.find((compiler) => (
      compiler.id === profile.compiler.id
      && compiler.version === profile.compiler.version
      && compiler.implementationHash === profile.compiler.implementationHash
      && compiler.required === profile.compiler.required
    ))
    if (!declaredCompiler) {
      throw new Error(`Profile compiler is not declared by the installed manifest: ${profile.compiler.id}`)
    }
    if (profile.source.sourceId !== manifest.id
      || profile.source.contentHash !== manifest.contentHash
      || profile.source.relation !== 'profile-proposal') {
      throw new Error(`Profile proposal provenance does not bind the installed manifest: ${profile.profileId}`)
    }
  }

  const proposals: Array<Omit<ProfileProposal, 'advisoryRank'>> = []
  for (const profile of profiles) {
    const compiler = input.compilers.require(profile.compiler)
    const compileOnce = async (): Promise<readonly ProfileProposalDraft[]> => {
      const compilerBrief = deepFreeze(structuredClone(brief))
      try {
        const candidates = await compiler.implementation.compile(deepFreeze({
          brief: compilerBrief,
          profile: {
            id: profile.profileId,
            version: profile.profileVersion,
            manifestDigest: profile.manifestDigest,
          },
        }))
        return candidates.map((candidate) => profileProposalDraftSchema.parse(candidate))
      } catch (error) {
        if (error instanceof TypeError && canonicalJson(compilerBrief) === canonicalJson(brief)) {
          throw new Error(`Profile compiler attempted to mutate the frozen Universal Brief: ${compiler.id}`, { cause: error })
        }
        throw error
      }
    }
    const drafts = await compileOnce()
    const replay = await compileOnce()
    if (canonicalJson(drafts) !== canonicalJson(replay)) {
      throw new Error(`Profile compiler produced nondeterministic proposals: ${compiler.id}`)
    }
    for (const candidate of drafts) {
      const draft = candidate
      assertProposalReferencesBrief(draft, brief)
      proposals.push(unrankedProfileProposalSchema.parse({
        ...draft,
        profile: {
          id: profile.profileId,
          version: profile.profileVersion,
          manifestDigest: profile.manifestDigest,
        },
        compiler: profile.compiler,
        fragments: draft.fragments.map((fragment) => ({ ...fragment, source: profile.source })),
        provenance: [...draft.provenance, profile.source],
        disposition: {
          rankingOnly: true,
          installs: false,
          authorizes: false,
          executes: false,
        },
      }))
    }
  }

  const proposalKeys = proposals.map((proposal) => `${proposal.profile.id}:${proposal.id}`)
  if (new Set(proposalKeys).size !== proposalKeys.length) {
    throw new Error('Profile proposal ids must be unique within each Profile.')
  }
  const fragmentIds = proposals.flatMap((proposal) => proposal.fragments.map(({ id }) => id))
  if (new Set(fragmentIds).size !== fragmentIds.length) {
    throw new Error('Profile proposal fragment ids must be globally unique.')
  }

  const ranked = proposals.sort(compareProposals).map((proposal, index) => profileProposalSchema.parse({
    ...proposal,
    advisoryRank: index + 1,
  }))
  return { brief, proposals: ranked }
}

export interface ComposedProfileProposals extends ComposedOutcomeGraph {
  readonly proposals: readonly ProfileProposal[]
  readonly proposalIdByFragmentId: Readonly<Record<string, string>>
  readonly requiredUnknownIds: readonly string[]
  readonly capabilities: readonly z.infer<typeof proposalCapabilitySchema>[]
  readonly deliverables: readonly UniversalDeliverable[]
  readonly provenance: readonly ProvenanceReference[]
  readonly disposition: z.infer<typeof advisoryDispositionSchema>
}

export function composeProfileProposals(input: {
  readonly graph: Omit<OutcomeGraph, 'body'>
  readonly proposals: readonly ProfileProposal[]
}): ComposedProfileProposals {
  const proposals = input.proposals.map((proposal) => profileProposalSchema.parse(proposal))
    .sort(compareProposals)
  const proposalIdByFragmentId: Record<string, string> = {}
  for (const proposal of proposals) {
    for (const fragment of proposal.fragments) {
      if (proposalIdByFragmentId[fragment.id]) {
        throw new Error(`Profile proposal fragment id is duplicated: ${fragment.id}`)
      }
      proposalIdByFragmentId[fragment.id] = `${proposal.profile.id}:${proposal.id}`
    }
  }
  const composed = composeOutcomeFragments({
    graph: outcomeGraphSchema.omit({ body: true }).parse(input.graph),
    fragments: proposals.flatMap(({ fragments }) => fragments),
  })
  return {
    ...composed,
    proposals,
    proposalIdByFragmentId,
    requiredUnknownIds: uniqueSorted(proposals.flatMap(({ requiredUnknownIds }) => requiredUnknownIds)),
    capabilities: uniqueByCanonical(proposals.flatMap(({ capabilities }) => capabilities)),
    deliverables: uniqueByCanonical(proposals.flatMap(({ deliverables }) => deliverables)),
    provenance: uniqueByCanonical(proposals.flatMap(({ provenance }) => provenance)),
    disposition: { rankingOnly: true, installs: false, authorizes: false, executes: false },
  }
}

function assertProposalReferencesBrief(proposal: ProfileProposalDraft, brief: UniversalBrief): void {
  const unknownIds = new Set(brief.unknowns.map(({ id }) => id))
  for (const unknownId of proposal.requiredUnknownIds) {
    if (!unknownIds.has(unknownId)) throw new Error(`Proposal requires an undeclared unknown: ${unknownId}`)
  }
}

function compareProfileSelections(left: ProfileCompilerSelection, right: ProfileCompilerSelection): number {
  return left.profileId.localeCompare(right.profileId)
    || left.profileVersion.localeCompare(right.profileVersion)
    || left.manifestDigest.localeCompare(right.manifestDigest)
    || left.compiler.id.localeCompare(right.compiler.id)
}

export type ProfileCompilerBindingReference = Extract<ProfileBindingReference, { kind: 'compiler' }>

function compareProposals(
  left: Pick<ProfileProposal, 'id' | 'profile' | 'score'>,
  right: Pick<ProfileProposal, 'id' | 'profile' | 'score'>,
): number {
  return right.score - left.score
    || left.profile.id.localeCompare(right.profile.id)
    || left.id.localeCompare(right.id)
}

function schemaKey(reference: z.infer<typeof schemaReferenceSchema>): string {
  return `${reference.id}@${reference.version}`
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

function uniqueByCanonical<Value>(values: readonly Value[]): readonly Value[] {
  const byCanonical = new Map<string, Value>()
  for (const value of values) byCanonical.set(canonicalJson(value), value)
  return [...byCanonical.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, value]) => value)
}

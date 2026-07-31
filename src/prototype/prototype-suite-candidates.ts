import {
  candidateSetSchema,
} from '@/candidate-selection/contracts'
import { codingReceiptSchema } from '@/coding-runtime/contracts'
import { err, ok, type Result } from '@/services/types'
import type {
  PersistedPrototypeDesignSystem,
  PersistedPrototypeDesignSystemCandidateSet,
  PersistedPrototypeImage,
  PersistedPrototypePage,
  PersistedPrototypeResourcePack,
  PersistedPrototypeSuiteCandidate,
  PersistedPrototypeSuiteCandidateSet,
  WorkspaceSnapshot,
} from '@/workspace/workspace-snapshot'
import { createPrototypeAssetManifest } from './asset-manifest'
import { designSystemMarkdownValidationError } from './design-system-validation'
import { prototypeMediaValidationError } from './prototype-artifact-recovery'
import {
  prototypePageSchema,
  prototypePlanSchema,
  validatePrototypePlan,
  type PrototypePlan,
} from './prototype-plan'

export type PrototypeSuiteCandidateSet = PersistedPrototypeSuiteCandidateSet

export function createPrototypeSuiteCandidateSet(input: {
  readonly designSystemCandidates: PersistedPrototypeDesignSystemCandidateSet
  readonly baseRevisionId: string
  readonly id?: string
}): PrototypeSuiteCandidateSet {
  const designSet = candidateSetSchema.parse(input.designSystemCandidates.set)
  if (designSet.kind !== 'design-system') {
    throw new Error('Prototype suite candidates require a Design System candidate set.')
  }
  return {
    set: candidateSetSchema.parse({
      id: input.id ?? `candidate-set:prototype-suite:${crypto.randomUUID()}`,
      kind: 'prototype-suite',
      baseRevisionId: input.baseRevisionId,
      proposal: designSet.proposal,
      candidates: designSet.proposal.directions.map((direction, index) => ({
        id: `candidate:prototype-suite:${index + 1}`,
        directionId: direction.id,
        status: 'planned',
        outputs: [],
        provenanceIds: [],
      })),
    }),
    artifacts: {},
  }
}

export function updatePrototypeSuiteCandidate(
  candidateSet: PrototypeSuiteCandidateSet,
  candidateId: string,
  update:
    | { readonly status: 'generating' | 'cancelled' }
    | { readonly status: 'failed'; readonly error: string }
    | { readonly status: 'ready'; readonly artifact: PersistedPrototypeSuiteCandidate },
  designSystemCandidates: PersistedPrototypeDesignSystemCandidateSet,
): PrototypeSuiteCandidateSet {
  const current = candidateSet.set.candidates.find((candidate) => candidate.id === candidateId)
  if (!current) throw new Error(`Unknown prototype suite candidate "${candidateId}".`)

  const artifacts = { ...candidateSet.artifacts }
  if (update.status === 'ready') {
    const artifact = validatePrototypeSuiteArtifact(
      update.artifact,
      current.directionId,
      designSystemCandidates,
    )
    if (!artifact.ok) throw new Error(artifact.error)
    const routeGraph = prototypeRouteGraphFingerprint(artifact.data.plan)
    const duplicate = Object.entries(artifacts).find(
      ([id, sibling]) => id !== candidateId && prototypeRouteGraphFingerprint(sibling.plan) === routeGraph,
    )
    if (duplicate) {
      throw new Error(`Prototype suite candidate "${candidateId}" duplicates the route graph of "${duplicate[0]}".`)
    }
    artifacts[candidateId] = artifact.data
  } else {
    delete artifacts[candidateId]
  }

  const candidates = candidateSet.set.candidates.map((candidate) => {
    if (candidate.id !== candidateId) return candidate
    if (update.status === 'ready') {
      return {
        ...candidate,
        status: 'ready' as const,
        outputs: [
          { role: 'prototype-suite', materialId: suiteMaterialId(candidateId, 'suite') },
          { role: 'resource-pack', materialId: suiteMaterialId(candidateId, 'resource-pack') },
        ],
        provenanceIds: [...update.artifact.provenanceIds],
        error: undefined,
      }
    }
    if (update.status === 'failed') {
      return {
        ...candidate,
        status: 'failed' as const,
        outputs: [],
        provenanceIds: [],
        error: update.error,
      }
    }
    return {
      ...candidate,
      status: update.status,
      outputs: [],
      provenanceIds: [],
      error: undefined,
    }
  })

  return {
    set: candidateSetSchema.parse({ ...candidateSet.set, candidates }),
    artifacts,
  }
}

export function cancelUnstartedPrototypeSuiteCandidates(
  candidateSet: PrototypeSuiteCandidateSet,
  designSystemCandidates: PersistedPrototypeDesignSystemCandidateSet,
): PrototypeSuiteCandidateSet {
  return candidateSet.set.candidates.reduce(
    (current, candidate) => candidate.status === 'planned'
      ? updatePrototypeSuiteCandidate(
          current,
          candidate.id,
          { status: 'cancelled' },
          designSystemCandidates,
        )
      : current,
    candidateSet,
  )
}

export function selectPrototypeSuiteCandidate(
  candidateSet: PrototypeSuiteCandidateSet,
  candidateId: string,
  actor: { readonly kind: 'human' | 'agent'; readonly id: string },
  selectedAt = new Date().toISOString(),
): PrototypeSuiteCandidateSet {
  const validated = validatePrototypeSuiteCandidateSet(candidateSet)
  if (!validated.ok) throw new Error(validated.error)
  const candidate = validated.data.set.candidates.find((item) => item.id === candidateId)
  if (!candidate || candidate.status !== 'ready' || !validated.data.artifacts[candidateId]) {
    throw new Error('Only a complete prototype suite candidate can be selected.')
  }
  return {
    ...validated.data,
    set: candidateSetSchema.parse({
      ...validated.data.set,
      selection: {
        candidateId,
        selectedAt,
        actor,
        baseRevisionId: validated.data.set.baseRevisionId,
        provenanceId: `provenance:prototype-suite-selection:${crypto.randomUUID()}`,
      },
    }),
  }
}

export function selectedPrototypeSuite(
  candidateSet: PrototypeSuiteCandidateSet | null | undefined,
): PersistedPrototypeSuiteCandidate | null {
  const selectedId = candidateSet?.set.selection?.candidateId
  return selectedId ? candidateSet?.artifacts[selectedId] ?? null : null
}

export function persistPrototypeSuiteCandidateSet(
  candidateSet: PrototypeSuiteCandidateSet,
): PersistedPrototypeSuiteCandidateSet {
  const validated = validatePrototypeSuiteCandidateSet(candidateSet)
  if (!validated.ok) throw new Error(validated.error)
  return validated.data
}

export function recoverPrototypeSuiteCandidateSet(
  persisted: PersistedPrototypeSuiteCandidateSet | null | undefined,
): PrototypeSuiteCandidateSet | null {
  if (!persisted) return null
  const validated = validatePrototypeSuiteCandidateSet(persisted)
  return validated.ok ? validated.data : null
}

export function projectSelectedPrototypeSuiteToWorkspace(
  snapshot: WorkspaceSnapshot,
  candidateSet: PrototypeSuiteCandidateSet,
): WorkspaceSnapshot {
  const persisted = persistPrototypeSuiteCandidateSet(candidateSet)
  const selected = selectedPrototypeSuite(persisted)
  if (!selected) throw new Error('Select a complete prototype suite before projecting it to the workspace.')
  return {
    ...snapshot,
    prototypeSuiteCandidates: persisted,
    prototypePlan: selected.plan,
    prototypeScope: 'full-plan',
    prototypeDesignSystem: selected.designSystem.artifact,
    prototypePages: selected.pages,
    selectedPrototypePageId: selected.plan.pages[0]?.id ?? null,
  }
}

export function validatePrototypeSuiteCandidateSet(
  input: unknown,
  designSystemCandidates?: PersistedPrototypeDesignSystemCandidateSet,
): Result<PrototypeSuiteCandidateSet> {
  if (!isRecord(input)) return err('Prototype suite candidate state must be an object.')
  const parsedSet = candidateSetSchema.safeParse(input.set)
  if (!parsedSet.success) {
    return err(parsedSet.error.issues[0]?.message ?? 'Invalid prototype suite candidate set.')
  }
  if (parsedSet.data.kind !== 'prototype-suite') {
    return err('Expected a prototype-suite candidate set.')
  }
  if (!isRecord(input.artifacts)) return err('Prototype suite candidate artifacts must be an object.')

  const candidateIds = new Set(parsedSet.data.candidates.map((candidate) => candidate.id))
  for (const id of Object.keys(input.artifacts)) {
    if (!candidateIds.has(id)) return err(`Prototype suite artifact references unknown candidate "${id}".`)
  }

  const artifacts: Record<string, PersistedPrototypeSuiteCandidate> = {}
  const routeGraphs = new Map<string, string>()
  for (const candidate of parsedSet.data.candidates) {
    const artifact = input.artifacts[candidate.id]
    if (candidate.status !== 'ready') {
      if (artifact !== undefined) {
        return err(`Non-ready prototype suite candidate "${candidate.id}" cannot retain a complete artifact.`)
      }
      continue
    }
    if (artifact === undefined) {
      return err(`Ready prototype suite candidate "${candidate.id}" is missing its artifact.`)
    }
    const validated = validatePrototypeSuiteArtifact(
      artifact,
      candidate.directionId,
      designSystemCandidates,
    )
    if (!validated.ok) return err(`Candidate "${candidate.id}": ${validated.error}`)
    const expectedOutputs = [
      { role: 'prototype-suite', materialId: suiteMaterialId(candidate.id, 'suite') },
      { role: 'resource-pack', materialId: suiteMaterialId(candidate.id, 'resource-pack') },
    ]
    if (!deepEqual(candidate.outputs, expectedOutputs)) {
      return err(`Candidate "${candidate.id}" outputs do not match its complete suite artifact.`)
    }
    if (!sameIds(candidate.provenanceIds, validated.data.provenanceIds)) {
      return err(`Candidate "${candidate.id}" provenance does not match its complete suite artifact.`)
    }
    const fingerprint = prototypeRouteGraphFingerprint(validated.data.plan)
    const duplicateId = routeGraphs.get(fingerprint)
    if (duplicateId) {
      return err(`Prototype suite candidate "${candidate.id}" duplicates the route graph of "${duplicateId}".`)
    }
    routeGraphs.set(fingerprint, candidate.id)
    artifacts[candidate.id] = validated.data
  }

  return ok({ set: parsedSet.data, artifacts })
}

export function prototypeRouteGraphFingerprint(plan: PrototypePlan): string {
  return JSON.stringify({
    pages: plan.pages.map((page) => ({
      id: page.id,
      name: page.name,
      route: page.route,
      purpose: page.purpose,
      interactions: page.interactions.map((interaction) => ({
        id: interaction.id,
        trigger: interaction.trigger,
        sourceSectionId: interaction.sourceSectionId,
        action: interaction.action,
      })),
    })),
    flows: plan.flows,
  })
}

function validatePrototypeSuiteArtifact(
  input: unknown,
  directionId: string,
  designSystemCandidates?: PersistedPrototypeDesignSystemCandidateSet,
): Result<PersistedPrototypeSuiteCandidate> {
  if (!isRecord(input)) return err('Prototype suite artifact must be an object.')
  const designSystem = validateDesignSystemBinding(input.designSystem, directionId, designSystemCandidates)
  if (!designSystem.ok) return designSystem

  const parsedPlan = prototypePlanSchema.safeParse(input.plan)
  if (!parsedPlan.success) {
    return err(parsedPlan.error.issues[0]?.message ?? 'Prototype suite plan is invalid.')
  }
  const planValidation = validatePrototypePlan(parsedPlan.data)
  if (!planValidation.ok) return err(planValidation.error)

  const pages = validateCompletePages(input.pages, parsedPlan.data)
  if (!pages.ok) return pages
  const resourcePack = validateResourcePack(input.resourcePack, parsedPlan.data)
  if (!resourcePack.ok) return resourcePack
  const provenanceIds = validateIds(input.provenanceIds, 'Prototype suite provenance')
  if (!provenanceIds.ok) return provenanceIds

  const codingReceipt = input.codingReceipt === undefined
    ? undefined
    : codingReceiptSchema.safeParse(input.codingReceipt)
  if (codingReceipt && !codingReceipt.success) {
    return err(codingReceipt.error.issues[0]?.message ?? 'Prototype suite Coding receipt is invalid.')
  }

  return ok({
    designSystem: designSystem.data,
    plan: parsedPlan.data,
    pages: pages.data,
    resourcePack: resourcePack.data,
    provenanceIds: provenanceIds.data,
    ...(codingReceipt ? { codingReceipt: codingReceipt.data } : {}),
  })
}

function validateDesignSystemBinding(
  input: unknown,
  directionId: string,
  source?: PersistedPrototypeDesignSystemCandidateSet,
): Result<PersistedPrototypeSuiteCandidate['designSystem']> {
  if (!isRecord(input)) return err('Prototype suite Design System binding must be an object.')
  const candidateSetId = input.candidateSetId
  const candidateId = input.candidateId
  const boundDirectionId = input.directionId
  const baseRevisionId = input.baseRevisionId
  if (!isId(candidateSetId)) return err('Prototype suite Design System candidateSetId is required.')
  if (!isId(candidateId)) return err('Prototype suite Design System candidateId is required.')
  if (!isId(boundDirectionId)) return err('Prototype suite Design System directionId is required.')
  if (!isId(baseRevisionId)) return err('Prototype suite Design System baseRevisionId is required.')
  if (boundDirectionId !== directionId) {
    return err(`Prototype suite direction "${directionId}" is bound to Design System direction "${boundDirectionId}".`)
  }
  const provenanceIds = validateIds(input.provenanceIds, 'Design System candidate provenance')
  if (!provenanceIds.ok) return provenanceIds
  if (!isPersistedDesignSystem(input.artifact)) {
    return err('Prototype suite Design System artifact is invalid.')
  }
  const mediaError = prototypeMediaValidationError(input.artifact)
  if (mediaError) return err(mediaError)
  const markdownError = designSystemMarkdownValidationError(input.artifact.designMarkdown)
  if (markdownError) return err(markdownError)

  const binding = {
    candidateSetId,
    candidateId,
    directionId: boundDirectionId,
    baseRevisionId,
    provenanceIds: provenanceIds.data,
    artifact: input.artifact,
  }
  if (!source) return ok(binding)

  const parsedSource = candidateSetSchema.safeParse(source.set)
  if (!parsedSource.success || parsedSource.data.kind !== 'design-system') {
    return err('The source Design System candidate set is invalid.')
  }
  if (binding.candidateSetId !== parsedSource.data.id || binding.baseRevisionId !== parsedSource.data.baseRevisionId) {
    return err('Prototype suite Design System binding does not match its source candidate set.')
  }
  const sourceCandidate = parsedSource.data.candidates.find((candidate) => candidate.id === binding.candidateId)
  const sourceArtifact = source.artifacts[binding.candidateId]
  if (
    !sourceCandidate ||
    sourceCandidate.status !== 'ready' ||
    sourceCandidate.directionId !== directionId ||
    !isPersistedDesignSystem(sourceArtifact)
  ) {
    return err('Prototype suite Design System binding does not reference a ready matching candidate.')
  }
  if (!sameIds(binding.provenanceIds, sourceCandidate.provenanceIds)) {
    return err('Prototype suite Design System provenance does not match its source candidate.')
  }
  if (!sameDesignSystem(binding.artifact, sourceArtifact)) {
    return err('Prototype suite Design System artifact does not match its source candidate.')
  }
  return ok(binding)
}

function validateCompletePages(
  input: unknown,
  plan: PrototypePlan,
): Result<readonly PersistedPrototypePage[]> {
  if (!Array.isArray(input)) return err('Prototype suite pages must be an array.')
  if (input.length !== plan.pages.length) {
    return err(`Prototype suite requires ${plan.pages.length} pages but persisted ${input.length}.`)
  }
  const expected = new Map(plan.pages.map((page) => [page.id, page]))
  const pages = new Map<string, PersistedPrototypePage>()
  const seen = new Set<string>()
  for (const value of input) {
    if (!isRecord(value) || !isRecord(value.page) || !isPersistedImage(value)) {
      return err('Prototype suite contains an invalid page artifact.')
    }
    const parsedPage = prototypePageSchema.safeParse(value.page)
    if (!parsedPage.success) return err('Prototype suite contains an invalid page contract.')
    const id = parsedPage.data.id
    if (!isId(id) || seen.has(id)) return err(`Prototype suite has a duplicate or invalid page id "${String(id)}".`)
    const planned = expected.get(id)
    if (!planned || !deepEqual(parsedPage.data, planned)) {
      return err(`Prototype page artifact "${id}" does not match the candidate route graph.`)
    }
    const mediaError = prototypeMediaValidationError(value)
    if (mediaError) return err(`Prototype page "${id}": ${mediaError}`)
    seen.add(id)
    pages.set(id, { ...value, page: parsedPage.data } as PersistedPrototypePage)
  }
  return ok(plan.pages.map((page) => pages.get(page.id)!))
}

function validateResourcePack(
  input: unknown,
  plan: PrototypePlan,
): Result<PersistedPrototypeResourcePack> {
  if (!isRecord(input) || !isId(input.id) || !isId(input.manifestProvenanceId)) {
    return err('Prototype resource pack identity and manifest provenance are required.')
  }
  const expected = createPrototypeAssetManifest(plan, plan.pages)
  if (!deepEqual(input.manifest, expected)) {
    return err('Prototype resource pack manifest does not match the complete candidate route graph.')
  }
  if (!Array.isArray(input.assets) || input.assets.length !== expected.assets.length) {
    return err(`Prototype resource pack requires ${expected.assets.length} attributable assets.`)
  }
  const expectedIds = new Set(expected.assets.map((asset) => asset.id))
  const manifestIds = new Set<string>()
  const artifactIds = new Set<string>()
  const assets: PersistedPrototypeResourcePack['assets'][number][] = []
  for (const value of input.assets) {
    if (!isRecord(value) || !isId(value.manifestItemId) || !isId(value.artifactId)) {
      return err('Prototype resource pack contains an invalid asset binding.')
    }
    if (!expectedIds.has(value.manifestItemId) || manifestIds.has(value.manifestItemId)) {
      return err(`Prototype resource pack has an unknown or duplicate manifest item "${value.manifestItemId}".`)
    }
    if (artifactIds.has(value.artifactId)) {
      return err(`Prototype resource pack reuses artifact "${value.artifactId}" for multiple manifest items.`)
    }
    const provenanceIds = validateIds(value.provenanceIds, `Resource asset "${value.manifestItemId}" provenance`)
    if (!provenanceIds.ok) return provenanceIds
    manifestIds.add(value.manifestItemId)
    artifactIds.add(value.artifactId)
    assets.push({
      manifestItemId: value.manifestItemId,
      artifactId: value.artifactId,
      provenanceIds: provenanceIds.data,
    })
  }
  return ok({
    id: input.id,
    manifest: expected,
    manifestProvenanceId: input.manifestProvenanceId,
    assets,
  })
}

function validateIds(input: unknown, label: string): Result<readonly string[]> {
  if (!Array.isArray(input) || input.length === 0 || input.some((value) => !isId(value))) {
    return err(`${label} requires at least one non-empty id.`)
  }
  const values = input as string[]
  if (new Set(values).size !== values.length) return err(`${label} contains duplicate ids.`)
  return ok([...values])
}

function suiteMaterialId(candidateId: string, role: 'suite' | 'resource-pack'): string {
  return `material:prototype-suite:${candidateId}:${role}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 160
}

function isPersistedImage(value: unknown): value is PersistedPrototypeImage {
  return isRecord(value) && value.bytes instanceof Uint8Array &&
    typeof value.mediaType === 'string' && value.mediaType.length > 0 &&
    Number.isInteger(value.width) && Number.isInteger(value.height)
}

function isPersistedDesignSystem(value: unknown): value is PersistedPrototypeDesignSystem {
  return isRecord(value) && isPersistedImage(value) &&
    typeof value.name === 'string' && value.name.trim().length > 0 &&
    typeof value.designMarkdown === 'string' && value.designMarkdown.trim().length > 0
}

function sameDesignSystem(
  left: PersistedPrototypeDesignSystem,
  right: PersistedPrototypeDesignSystem,
): boolean {
  return left.name === right.name &&
    left.mediaType === right.mediaType &&
    left.width === right.width &&
    left.height === right.height &&
    left.designMarkdown === right.designMarkdown &&
    sameBytes(left.bytes, right.bytes)
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index])
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) &&
      left.length === right.length && left.every((value, index) => deepEqual(value, right[index]))
  }
  if (!isRecord(left) || !isRecord(right)) return false
  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()
  return leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => key === rightKeys[index] && deepEqual(left[key], right[key]))
}

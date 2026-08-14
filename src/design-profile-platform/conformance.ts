import { z } from 'zod'
import { canonicalJson, fingerprint } from '@/design-ir/fingerprint'
import {
  hostBindingsSchema,
  normalizeHostCompilation,
  recordIdSchema,
  sha256Schema,
  type HostCompilation,
} from '@/design-os-kernel'
import { exactSemverSchema } from './contracts'
import { deepFreeze } from './immutability'

export const PROFILE_PROMOTION_PACKET_PROTOCOL = 'design-profile.promotion-packet.v1' as const
export const PROFILE_PROMOTION_PROOF_PROTOCOL = 'design-profile.verified-promotion-proof.v1' as const
export const PROFILE_PROMOTION_ENVELOPE_PROTOCOL = 'design-profile.promotion-envelope.v1' as const

export const protectedSurfaceSchema = z.enum([
  'kernel-lifecycle',
  'authority',
  'approval-history',
  'global-navigation',
  'profile-platform',
  'profile-owned',
  'host-owned',
])
export type ProtectedSurface = z.infer<typeof protectedSurfaceSchema>

const repositoryRelativePathSchema = z.string().min(1).max(1_000).refine((path) => (
  !path.startsWith('/')
  && !path.includes('\\')
  && !path.split('/').some((segment) => segment === '.' || segment === '..')
), 'Conformance audit paths must be normalized repository-relative paths.')

export const profileExtensionAuditInputSchema = z.object({
  profileId: recordIdSchema,
  profileOwnedFiles: z.array(repositoryRelativePathSchema).max(100_000),
  changedFiles: z.array(repositoryRelativePathSchema).max(100_000),
  registrations: z.array(z.object({
    kind: z.string().min(1).max(120),
    id: recordIdSchema,
  }).strict()).max(100_000),
  protectedCatalogs: z.object({
    beforeKernelHash: sha256Schema,
    afterKernelHash: sha256Schema,
    beforeNavigationHash: sha256Schema,
    afterNavigationHash: sha256Schema,
  }).strict(),
}).strict()

export const profileExtensionAuditSchema = z.object({
  profileId: recordIdSchema,
  passed: z.boolean(),
  findings: z.array(z.object({
    code: z.enum(['protected-file-change', 'kernel-catalog-drift', 'navigation-catalog-drift']),
    surface: protectedSurfaceSchema,
    path: z.string().min(1).max(1_000).optional(),
    message: z.string().min(1).max(2_000),
  }).strict()).max(100_000),
  admittedRegistrationIds: z.array(recordIdSchema).max(100_000),
}).strict()
export type ProfileExtensionAudit = z.infer<typeof profileExtensionAuditSchema>

const protectedPrefixes: readonly { readonly prefix: string, readonly surface: ProtectedSurface }[] = [
  { prefix: 'src/design-os-kernel/', surface: 'kernel-lifecycle' },
  { prefix: 'src/control-protocol/', surface: 'authority' },
  { prefix: 'src/policy/', surface: 'authority' },
  { prefix: 'src/global-library/approval', surface: 'approval-history' },
  { prefix: 'src/history/', surface: 'approval-history' },
  { prefix: 'src/components/AppShell', surface: 'global-navigation' },
  { prefix: 'src/workspace/navigation', surface: 'global-navigation' },
]

export function auditProfileExtension(input: unknown): ProfileExtensionAudit {
  const parsed = profileExtensionAuditInputSchema.parse(input)
  const findings: z.infer<typeof profileExtensionAuditSchema>['findings'] = []
  for (const path of parsed.changedFiles) {
    const protectedSurface = protectedPrefixes.find(({ prefix }) => path.startsWith(prefix))
    if (protectedSurface) {
      findings.push({
        code: 'protected-file-change',
        surface: protectedSurface.surface,
        path,
        message: `Profile installation changed protected surface ${path}.`,
      })
    }
  }
  if (parsed.protectedCatalogs.beforeKernelHash !== parsed.protectedCatalogs.afterKernelHash) {
    findings.push({ code: 'kernel-catalog-drift', surface: 'kernel-lifecycle', message: 'Kernel catalog changed during Profile installation.' })
  }
  if (parsed.protectedCatalogs.beforeNavigationHash !== parsed.protectedCatalogs.afterNavigationHash) {
    findings.push({ code: 'navigation-catalog-drift', surface: 'global-navigation', message: 'Global navigation catalog changed during Profile installation.' })
  }
  return profileExtensionAuditSchema.parse({
    profileId: parsed.profileId,
    passed: findings.length === 0,
    findings,
    admittedRegistrationIds: [...new Set(parsed.registrations.map(({ id }) => id))].sort(),
  })
}

export const profileHostCompilationSchema = z.object({
  profileId: recordIdSchema,
  closureHash: sha256Schema,
  bindings: hostBindingsSchema,
}).strict()

export function assertProfileCrossHostParity(
  left: HostCompilation & { readonly profileId: string, readonly closureHash: string },
  right: HostCompilation & { readonly profileId: string, readonly closureHash: string },
): void {
  const leftIdentity = profileHostCompilationSchema.parse({
    profileId: left.profileId, closureHash: left.closureHash, bindings: left.bindings,
  })
  const rightIdentity = profileHostCompilationSchema.parse({
    profileId: right.profileId, closureHash: right.closureHash, bindings: right.bindings,
  })
  if (leftIdentity.profileId !== rightIdentity.profileId || leftIdentity.closureHash !== rightIdentity.closureHash) {
    throw new Error('Host compilations must use the same exact Profile closure.')
  }
  if (canonicalJson(normalizeHostCompilation(left)) !== canonicalJson(normalizeHostCompilation(right))) {
    throw new Error(`Profile Host semantic parity failed: ${left.bindings.hostId} != ${right.bindings.hostId}`)
  }
}

export const promotionProofSchema = z.object({
  profileId: recordIdSchema,
  evidenceId: recordIdSchema,
  claimedEvidenceKind: z.enum(['contract-conformance', 'verified-host', 'production-rehearsal']),
  evidenceHash: sha256Schema,
  conformanceHash: sha256Schema,
  verification: z.literal('unverified-reference'),
}).strict()
export type PromotionProof = z.infer<typeof promotionProofSchema>

export const profilePromotionPacketContentSchema = z.object({
  protocol: z.literal(PROFILE_PROMOTION_PACKET_PROTOCOL),
  id: recordIdSchema,
  finding: z.string().min(1).max(5_000),
  proposedOwner: z.enum(['kernel', 'platform', 'profile', 'host']),
  targetSurface: protectedSurfaceSchema,
  beforeHash: sha256Schema,
  afterHash: sha256Schema,
  proofs: z.array(promotionProofSchema).min(1).max(100),
}).strict().superRefine((packet, context) => {
  const proofKeys = packet.proofs.map((proof) => `${proof.profileId}:${proof.evidenceId}`)
  if (new Set(proofKeys).size !== proofKeys.length) context.addIssue({ code: 'custom', message: 'Promotion proofs must be unique.' })
  if (packet.beforeHash === packet.afterHash) context.addIssue({ code: 'custom', message: 'Promotion packet must describe a changed surface.' })
  if (packet.proposedOwner === 'kernel' || packet.proposedOwner === 'platform') {
    const profiles = new Set(packet.proofs.map(({ profileId }) => profileId))
    if (profiles.size < 2) {
      context.addIssue({ code: 'custom', message: 'A shared-surface promotion proposal requires evidence references from two distinct Profiles.' })
    }
  }
  if (packet.proposedOwner === 'host' && packet.targetSurface !== 'host-owned') {
    context.addIssue({ code: 'custom', message: 'Host-owned findings cannot modify a non-Host target surface.' })
  }
  if (packet.proposedOwner === 'profile' && packet.targetSurface !== 'profile-owned') {
    context.addIssue({ code: 'custom', message: 'Profile-owned findings cannot modify a protected shared surface.' })
  }
})
export type ProfilePromotionPacketContent = z.infer<typeof profilePromotionPacketContentSchema>

export const profilePromotionPacketSchema = profilePromotionPacketContentSchema.extend({
  packetHash: sha256Schema,
}).strict()
export type ProfilePromotionPacket = z.infer<typeof profilePromotionPacketSchema>

export const verifiedPromotionProofSchema = z.object({
  protocol: z.literal(PROFILE_PROMOTION_PROOF_PROTOCOL),
  packetHash: sha256Schema,
  profileId: recordIdSchema,
  evidenceId: recordIdSchema,
  evidenceKind: z.enum(['contract-conformance', 'verified-host', 'production-rehearsal']),
  evidenceHash: sha256Schema,
  conformanceHash: sha256Schema,
  regressionClosure: z.object({
    id: recordIdSchema,
    closureHash: sha256Schema,
    beforeHash: sha256Schema,
    afterHash: sha256Schema,
    status: z.literal('passed'),
    evidenceIds: z.array(recordIdSchema).min(1).max(10_000),
  }).strict(),
  acceptance: z.object({
    receiptId: recordIdSchema,
    receiptHash: sha256Schema,
    packetHash: sha256Schema,
    evidenceHash: sha256Schema,
    producerId: recordIdSchema,
    reviewerId: recordIdSchema,
    decision: z.literal('accepted'),
  }).strict(),
  retainedEvidenceIds: z.array(recordIdSchema).min(1).max(10_000),
}).strict().superRefine((proof, context) => {
  if (proof.acceptance.producerId === proof.acceptance.reviewerId) {
    context.addIssue({ code: 'custom', message: 'Promotion acceptance must be independent from the evidence producer.' })
  }
  if (proof.acceptance.packetHash !== proof.packetHash
    || proof.acceptance.evidenceHash !== proof.evidenceHash) {
    context.addIssue({ code: 'custom', message: 'Promotion acceptance must bind the packet and verified evidence.' })
  }
  if (new Set(proof.regressionClosure.evidenceIds).size !== proof.regressionClosure.evidenceIds.length
    || new Set(proof.retainedEvidenceIds).size !== proof.retainedEvidenceIds.length) {
    context.addIssue({ code: 'custom', message: 'Verified promotion evidence ids must be unique.' })
  }
})
export type VerifiedPromotionProof = z.infer<typeof verifiedPromotionProofSchema>

export const promotionProofVerifierIdentitySchema = z.object({
  id: recordIdSchema,
  version: exactSemverSchema,
  implementationHash: sha256Schema,
  ownerId: recordIdSchema,
  profileId: recordIdSchema,
  admissibleEvidenceKinds: z.array(
    z.enum(['contract-conformance', 'verified-host', 'production-rehearsal']),
  ).min(1).max(3),
}).strict().superRefine((identity, context) => {
  if (new Set(identity.admissibleEvidenceKinds).size !== identity.admissibleEvidenceKinds.length) {
    context.addIssue({ code: 'custom', message: 'Promotion verifier evidence kinds must be unique.' })
  }
})
export type PromotionProofVerifierIdentity = z.infer<typeof promotionProofVerifierIdentitySchema>

export interface PromotionProofVerificationContext {
  readonly packet: ProfilePromotionPacket
  readonly proof: PromotionProof
}

export interface PromotionProofVerifier {
  readonly sourceSchema: z.ZodType
  readonly verify: (
    context: PromotionProofVerificationContext,
    retainedEvidence: unknown,
  ) => Promise<VerifiedPromotionProof>
}

export interface PromotionProofVerifierRegistration extends PromotionProofVerifierIdentity {
  readonly sourceSchema: z.ZodType
  readonly verify: PromotionProofVerifier['verify']
}

export const verifiedPromotionProofRecordSchema = z.object({
  verifier: promotionProofVerifierIdentitySchema,
  proof: verifiedPromotionProofSchema,
}).strict()

export const profilePromotionEnvelopeContentSchema = z.object({
  protocol: z.literal(PROFILE_PROMOTION_ENVELOPE_PROTOCOL),
  id: recordIdSchema,
  packetHash: sha256Schema,
  proposedOwner: z.enum(['kernel', 'platform', 'profile', 'host']),
  targetSurface: protectedSurfaceSchema,
  beforeHash: sha256Schema,
  afterHash: sha256Schema,
  proofs: z.array(verifiedPromotionProofRecordSchema).min(1).max(100),
  handoffStatus: z.literal('verified-evidence-only'),
  requiresChangeSet: z.literal(true),
  mutatesProject: z.literal(false),
}).strict().superRefine((envelope, context) => {
  const proofKeys = envelope.proofs.map(({ proof }) => `${proof.profileId}:${proof.evidenceId}`)
  if (new Set(proofKeys).size !== proofKeys.length) {
    context.addIssue({ code: 'custom', message: 'Verified promotion proofs must be unique.' })
  }
  const acceptanceKeys = envelope.proofs.map(({ proof }) => (
    `${proof.acceptance.receiptId}:${proof.acceptance.receiptHash}`
  ))
  if (new Set(acceptanceKeys).size !== acceptanceKeys.length) {
    context.addIssue({ code: 'custom', message: 'Cross-Profile promotion proofs require independent acceptance receipts.' })
  }
  if (envelope.beforeHash === envelope.afterHash) {
    context.addIssue({ code: 'custom', message: 'Promotion envelope must describe a changed surface.' })
  }
  if (envelope.proposedOwner === 'host' && envelope.targetSurface !== 'host-owned') {
    context.addIssue({ code: 'custom', message: 'Host-owned findings cannot modify a non-Host target surface.' })
  }
  if (envelope.proposedOwner === 'profile' && envelope.targetSurface !== 'profile-owned') {
    context.addIssue({ code: 'custom', message: 'Profile-owned findings cannot modify a protected shared surface.' })
  }
  for (const { verifier, proof } of envelope.proofs) {
    if (verifier.profileId !== proof.profileId
      || !verifier.admissibleEvidenceKinds.includes(proof.evidenceKind)
      || proof.packetHash !== envelope.packetHash
      || proof.regressionClosure.beforeHash !== envelope.beforeHash
      || proof.regressionClosure.afterHash !== envelope.afterHash) {
      context.addIssue({ code: 'custom', message: 'Verified promotion proof does not bind its verifier, packet, or target surface.' })
    }
  }
  if (envelope.proposedOwner === 'kernel' || envelope.proposedOwner === 'platform') {
    const profiles = new Set(envelope.proofs.map(({ proof }) => proof.profileId))
    if (profiles.size < 2) {
      context.addIssue({ code: 'custom', message: 'A shared-surface verified promotion requires two distinct real Profile proofs.' })
    }
    if (envelope.proofs.some(({ proof }) => proof.evidenceKind === 'contract-conformance')) {
      context.addIssue({ code: 'custom', message: 'Contract conformance cannot authorize a shared Platform or Kernel promotion.' })
    }
  }
})
export type ProfilePromotionEnvelopeContent = z.infer<typeof profilePromotionEnvelopeContentSchema>

export const profilePromotionEnvelopeSchema = profilePromotionEnvelopeContentSchema.extend({
  envelopeHash: sha256Schema,
}).strict()
export type ProfilePromotionEnvelope = z.infer<typeof profilePromotionEnvelopeSchema>

export class PromotionProofVerifierRegistry {
  readonly #registrations = new Map<string, PromotionProofVerifierRegistration>()

  register(registration: PromotionProofVerifierRegistration): this {
    const identity = promotionVerifierIdentity(registration)
    if (!(registration.sourceSchema instanceof z.ZodType) || !isAsyncFunction(registration.verify)) {
      throw new Error(`Invalid asynchronous promotion proof verifier: ${identity.id}`)
    }
    const key = promotionVerifierKey(identity)
    const existing = this.#registrations.get(key)
    if (existing) {
      if (canonicalJson(promotionVerifierIdentity(existing)) !== canonicalJson(identity)) {
        throw new Error(`Promotion verifier owner or implementation drift: ${key}`)
      }
      throw new Error(`Promotion verifier is already registered: ${key}`)
    }
    this.#registrations.set(key, Object.freeze({ ...identity, sourceSchema: registration.sourceSchema, verify: registration.verify }))
    return this
  }

  require(identityInput: unknown): PromotionProofVerifierRegistration {
    const identity = promotionVerifierIdentity(
      identityInput as PromotionProofVerifierIdentity,
    )
    const registration = this.#registrations.get(promotionVerifierKey(identity))
    if (!registration
      || canonicalJson(promotionVerifierIdentity(registration)) !== canonicalJson(identity)) {
      throw new Error(`Trusted promotion verifier is unavailable or drifted: ${identity.id}@${identity.version}`)
    }
    return registration
  }

  async verify(input: {
    readonly verifier: unknown
    readonly packet: ProfilePromotionPacket
    readonly proof: PromotionProof
    readonly retainedEvidence: unknown
  }): Promise<z.infer<typeof verifiedPromotionProofRecordSchema>> {
    const packet = await decodeProfilePromotionPacket(input.packet)
    const reference = promotionProofSchema.parse(input.proof)
    const verifier = this.require(input.verifier)
    if (verifier.profileId !== reference.profileId) {
      throw new Error('Promotion verifier does not own the referenced Profile.')
    }
    if (!verifier.admissibleEvidenceKinds.includes(reference.claimedEvidenceKind)) {
      throw new Error('Promotion verifier is not trusted for the referenced evidence kind.')
    }
    const decodedEvidence = verifier.sourceSchema.parse(input.retainedEvidence)
    const pending = verifier.verify(
      deepFreeze(structuredClone({ packet, proof: reference })),
      deepFreeze(structuredClone(decodedEvidence)),
    )
    if (!isPromiseLike(pending)) {
      throw new Error('Promotion proof verification must return an asynchronous result.')
    }
    const proof = verifiedPromotionProofSchema.parse(await pending)
    assertVerifiedPromotionProofIdentity(packet, reference, proof)
    return verifiedPromotionProofRecordSchema.parse({
      verifier: promotionVerifierIdentity(verifier),
      proof,
    })
  }
}

function normalizePromotionContent(input: unknown): ProfilePromotionPacketContent {
  const parsed = profilePromotionPacketContentSchema.parse(input)
  return profilePromotionPacketContentSchema.parse({
    ...parsed,
    proofs: [...parsed.proofs].sort((left, right) => `${left.profileId}:${left.evidenceId}`.localeCompare(`${right.profileId}:${right.evidenceId}`)),
  })
}

export async function createProfilePromotionPacket(input: unknown): Promise<ProfilePromotionPacket> {
  const content = normalizePromotionContent(input)
  return profilePromotionPacketSchema.parse({ ...content, packetHash: await fingerprint(content) })
}

export async function decodeProfilePromotionPacket(input: unknown): Promise<ProfilePromotionPacket> {
  const parsed = profilePromotionPacketSchema.parse(input)
  const { packetHash, ...stored } = parsed
  const normalized = normalizePromotionContent(stored)
  if (canonicalJson(stored) !== canonicalJson(normalized)) throw new Error('Profile promotion packet is not canonically ordered.')
  if (packetHash !== await fingerprint(normalized)) throw new Error('Profile promotion packet hash does not match.')
  return parsed
}

function normalizePromotionEnvelopeContent(input: unknown): ProfilePromotionEnvelopeContent {
  const parsed = profilePromotionEnvelopeContentSchema.parse(input)
  return profilePromotionEnvelopeContentSchema.parse({
    ...parsed,
    proofs: [...parsed.proofs].sort((left, right) => (
      `${left.proof.profileId}:${left.proof.evidenceId}`
        .localeCompare(`${right.proof.profileId}:${right.proof.evidenceId}`)
    )),
  })
}

export async function verifyProfilePromotionPacket(input: {
  readonly packet: unknown
  readonly proofs: readonly {
    readonly evidenceId: string
    readonly verifier: unknown
    readonly retainedEvidence: unknown
  }[]
  readonly registry: PromotionProofVerifierRegistry
}): Promise<ProfilePromotionEnvelope> {
  const packet = await decodeProfilePromotionPacket(input.packet)
  if (input.proofs.length !== packet.proofs.length) {
    throw new Error('Promotion verification requires retained evidence for every packet proof.')
  }
  const supplied = new Map<string, typeof input.proofs[number]>()
  for (const candidate of input.proofs) {
    const verifier = promotionVerifierIdentity(
      candidate.verifier as PromotionProofVerifierIdentity,
    )
    const evidenceId = recordIdSchema.parse(candidate.evidenceId)
    const key = promotionProofKey(verifier.profileId, evidenceId)
    if (supplied.has(key)) {
      throw new Error(`Promotion retained evidence is duplicated for proof ${key}.`)
    }
    supplied.set(key, candidate)
  }
  const proofs = await Promise.all(packet.proofs.map(async (proof) => {
    const key = promotionProofKey(proof.profileId, proof.evidenceId)
    const candidate = supplied.get(key)
    if (!candidate) throw new Error(`Promotion retained evidence is missing for proof ${key}.`)
    return input.registry.verify({
      verifier: candidate.verifier,
      packet,
      proof,
      retainedEvidence: candidate.retainedEvidence,
    })
  }))
  assertPromotionEvidenceAdmission(packet, proofs)
  const content = normalizePromotionEnvelopeContent({
    protocol: PROFILE_PROMOTION_ENVELOPE_PROTOCOL,
    id: packet.id,
    packetHash: packet.packetHash,
    proposedOwner: packet.proposedOwner,
    targetSurface: packet.targetSurface,
    beforeHash: packet.beforeHash,
    afterHash: packet.afterHash,
    proofs,
    handoffStatus: 'verified-evidence-only',
    requiresChangeSet: true,
    mutatesProject: false,
  })
  return profilePromotionEnvelopeSchema.parse({
    ...content,
    envelopeHash: await fingerprint(content),
  })
}

export async function decodeProfilePromotionEnvelope(input: unknown): Promise<ProfilePromotionEnvelope> {
  const parsed = profilePromotionEnvelopeSchema.parse(input)
  const { envelopeHash, ...stored } = parsed
  const normalized = normalizePromotionEnvelopeContent(stored)
  if (canonicalJson(stored) !== canonicalJson(normalized)) {
    throw new Error('Profile promotion envelope is not canonically ordered.')
  }
  if (envelopeHash !== await fingerprint(normalized)) {
    throw new Error('Profile promotion envelope hash does not match.')
  }
  return parsed
}

export async function assertProfilePromotionChangeSetHandoff(input: {
  readonly envelope: unknown
  readonly envelopeHash: string
  readonly packetHash: string
  readonly currentSurfaceHash: string
  readonly proposedSurfaceHash: string
}): Promise<ProfilePromotionEnvelope> {
  const envelope = await decodeProfilePromotionEnvelope(input.envelope)
  if (envelope.envelopeHash !== sha256Schema.parse(input.envelopeHash)) {
    throw new Error('Profile promotion envelope hash does not match the reviewed handoff.')
  }
  if (envelope.packetHash !== sha256Schema.parse(input.packetHash)) {
    throw new Error('Profile promotion packet does not match the verified handoff.')
  }
  if (envelope.beforeHash !== sha256Schema.parse(input.currentSurfaceHash)) {
    throw new Error('Profile promotion target surface is stale.')
  }
  if (envelope.afterHash !== sha256Schema.parse(input.proposedSurfaceHash)) {
    throw new Error('Profile promotion target surface does not match the reviewed proposal.')
  }
  return envelope
}

function assertVerifiedPromotionProofIdentity(
  packet: ProfilePromotionPacket,
  reference: PromotionProof,
  proof: VerifiedPromotionProof,
): void {
  if (proof.packetHash !== packet.packetHash
    || proof.profileId !== reference.profileId
    || proof.evidenceId !== reference.evidenceId
    || proof.evidenceKind !== reference.claimedEvidenceKind
    || proof.evidenceHash !== reference.evidenceHash
    || proof.conformanceHash !== reference.conformanceHash
    || proof.regressionClosure.beforeHash !== packet.beforeHash
    || proof.regressionClosure.afterHash !== packet.afterHash) {
    throw new Error('Verified promotion proof drifted from its packet reference or target surface.')
  }
}

function assertPromotionEvidenceAdmission(
  packet: ProfilePromotionPacket,
  records: readonly z.infer<typeof verifiedPromotionProofRecordSchema>[],
): void {
  const profiles = new Set(records.map(({ proof }) => proof.profileId))
  if ((packet.proposedOwner === 'kernel' || packet.proposedOwner === 'platform')
    && profiles.size < 2) {
    throw new Error('A shared-surface verified promotion requires two distinct real Profile proofs.')
  }
  if (packet.proposedOwner === 'kernel' || packet.proposedOwner === 'platform') {
    for (const { proof } of records) {
      if (proof.evidenceKind === 'contract-conformance') {
        throw new Error('Contract conformance cannot authorize a shared Platform or Kernel promotion.')
      }
    }
  }
}

function promotionVerifierKey(identity: PromotionProofVerifierIdentity): string {
  return `${identity.id}@${identity.version}`
}

function promotionVerifierIdentity(
  registration: PromotionProofVerifierIdentity,
): PromotionProofVerifierIdentity {
  return promotionProofVerifierIdentitySchema.parse({
    id: registration.id,
    version: registration.version,
    implementationHash: registration.implementationHash,
    ownerId: registration.ownerId,
    profileId: registration.profileId,
    admissibleEvidenceKinds: registration.admissibleEvidenceKinds,
  })
}

function promotionProofKey(profileId: string, evidenceId: string): string {
  return `${profileId}:${evidenceId}`
}

const asyncFunctionPrototype = Object.getPrototypeOf(async () => undefined)

function isAsyncFunction(value: unknown): value is (...args: readonly unknown[]) => Promise<unknown> {
  return typeof value === 'function' && Object.getPrototypeOf(value) === asyncFunctionPrototype
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return value !== null && (typeof value === 'object' || typeof value === 'function')
    && typeof (value as { readonly then?: unknown }).then === 'function'
}

import { z } from 'zod'
import { canonicalJson, fingerprint } from '@/design-ir/fingerprint'
import {
  hostBindingsSchema,
  normalizeHostCompilation,
  recordIdSchema,
  sha256Schema,
  type HostCompilation,
} from '@/design-os-kernel'

export const PROFILE_PROMOTION_PACKET_PROTOCOL = 'design-profile.promotion-packet.v1' as const

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
  fixtureId: recordIdSchema,
  evidenceHash: sha256Schema,
  conformanceHash: sha256Schema,
  reproducible: z.literal(true),
  regressionClosed: z.literal(true),
  heldOut: z.boolean(),
}).strict()

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
  const proofKeys = packet.proofs.map((proof) => `${proof.profileId}:${proof.fixtureId}`)
  if (new Set(proofKeys).size !== proofKeys.length) context.addIssue({ code: 'custom', message: 'Promotion proofs must be unique.' })
  if (packet.beforeHash === packet.afterHash) context.addIssue({ code: 'custom', message: 'Promotion packet must describe a changed surface.' })
  if (packet.proposedOwner === 'kernel' || packet.proposedOwner === 'platform') {
    const profiles = new Set(packet.proofs.map(({ profileId }) => profileId))
    if (profiles.size < 2) {
      context.addIssue({ code: 'custom', message: 'Kernel or Platform promotion requires two Profiles or a held-out proof.' })
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

function normalizePromotionContent(input: unknown): ProfilePromotionPacketContent {
  const parsed = profilePromotionPacketContentSchema.parse(input)
  return profilePromotionPacketContentSchema.parse({
    ...parsed,
    proofs: [...parsed.proofs].sort((left, right) => `${left.profileId}:${left.fixtureId}`.localeCompare(`${right.profileId}:${right.fixtureId}`)),
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

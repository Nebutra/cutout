import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createFixtureCompilation } from '@/design-os-kernel/test-fixture'
import {
  assertProfilePromotionChangeSetHandoff,
  assertProfileCrossHostParity,
  auditProfileExtension,
  createProfilePromotionPacket,
  decodeProfilePromotionEnvelope,
  decodeProfilePromotionPacket,
  PromotionProofVerifierRegistry,
  verifyProfilePromotionPacket,
  type ProfilePromotionPacket,
  type ProfilePromotionPacketContent,
  type PromotionProof,
  type PromotionProofVerifierRegistration,
} from './conformance'
import { fingerprintTrustedImplementation } from './registries'

const digestA = 'a'.repeat(64)
const digestB = 'b'.repeat(64)
const digestC = 'c'.repeat(64)
const digestD = 'd'.repeat(64)
const digestE = 'e'.repeat(64)

const retainedPromotionEvidenceSchema = z.object({
  version: z.literal('design-profile.promotion-contract-evidence.v1'),
  packetHash: z.string().regex(/^[a-f0-9]{64}$/),
  profileId: z.string().min(1),
  evidenceId: z.string().min(1),
  evidenceKind: z.enum(['contract-conformance', 'verified-host', 'production-rehearsal']),
  evidenceHash: z.string().regex(/^[a-f0-9]{64}$/),
  conformanceHash: z.string().regex(/^[a-f0-9]{64}$/),
  beforeHash: z.string().regex(/^[a-f0-9]{64}$/),
  afterHash: z.string().regex(/^[a-f0-9]{64}$/),
  regressionClosureHash: z.string().regex(/^[a-f0-9]{64}$/),
  regressionEvidenceIds: z.array(z.string().min(1)).min(1),
  acceptanceReceiptId: z.string().min(1),
  acceptanceReceiptHash: z.string().regex(/^[a-f0-9]{64}$/),
  producerId: z.string().min(1),
  reviewerId: z.string().min(1),
  retainedEvidenceIds: z.array(z.string().min(1)).min(1),
}).strict()

async function verifyRetainedPromotionContract(
  context: { readonly packet: ProfilePromotionPacket, readonly proof: PromotionProof },
  source: unknown,
) {
  const evidence = retainedPromotionEvidenceSchema.parse(source)
  if (evidence.packetHash !== context.packet.packetHash
    || evidence.profileId !== context.proof.profileId
    || evidence.evidenceId !== context.proof.evidenceId
    || evidence.evidenceKind !== context.proof.claimedEvidenceKind
    || evidence.evidenceHash !== context.proof.evidenceHash
    || evidence.conformanceHash !== context.proof.conformanceHash
    || evidence.beforeHash !== context.packet.beforeHash
    || evidence.afterHash !== context.packet.afterHash) {
    throw new Error('Retained promotion contract evidence does not match the packet.')
  }
  return {
    protocol: 'design-profile.verified-promotion-proof.v1' as const,
    packetHash: evidence.packetHash,
    profileId: evidence.profileId,
    evidenceId: evidence.evidenceId,
    evidenceKind: evidence.evidenceKind,
    evidenceHash: evidence.evidenceHash,
    conformanceHash: evidence.conformanceHash,
    regressionClosure: {
      id: `regression:${evidence.evidenceId}`,
      closureHash: evidence.regressionClosureHash,
      beforeHash: evidence.beforeHash,
      afterHash: evidence.afterHash,
      status: 'passed' as const,
      evidenceIds: evidence.regressionEvidenceIds,
    },
    acceptance: {
      receiptId: evidence.acceptanceReceiptId,
      receiptHash: evidence.acceptanceReceiptHash,
      packetHash: evidence.packetHash,
      evidenceHash: evidence.evidenceHash,
      producerId: evidence.producerId,
      reviewerId: evidence.reviewerId,
      decision: 'accepted' as const,
    },
    retainedEvidenceIds: evidence.retainedEvidenceIds,
  }
}

async function promotionVerifier(
  profileId: string,
  evidenceKinds: PromotionProofVerifierRegistration['admissibleEvidenceKinds'],
): Promise<PromotionProofVerifierRegistration> {
  const id = `promotion-verifier:${profileId}`
  return {
    id,
    version: '1.0.0',
    implementationHash: await fingerprintTrustedImplementation({
      id: `implementation:${id}`,
      functions: [verifyRetainedPromotionContract],
      schemas: [retainedPromotionEvidenceSchema],
      constants: [profileId, evidenceKinds],
    }),
    ownerId: `cutout:${profileId}`,
    profileId,
    admissibleEvidenceKinds: evidenceKinds,
    sourceSchema: retainedPromotionEvidenceSchema,
    verify: verifyRetainedPromotionContract,
  }
}

function retainedEvidence(
  packet: ProfilePromotionPacket,
  proof: PromotionProof,
  index: number,
) {
  return retainedPromotionEvidenceSchema.parse({
    version: 'design-profile.promotion-contract-evidence.v1',
    packetHash: packet.packetHash,
    profileId: proof.profileId,
    evidenceId: proof.evidenceId,
    evidenceKind: proof.claimedEvidenceKind,
    evidenceHash: proof.evidenceHash,
    conformanceHash: proof.conformanceHash,
    beforeHash: packet.beforeHash,
    afterHash: packet.afterHash,
    regressionClosureHash: index === 0 ? digestD : digestE,
    regressionEvidenceIds: [`regression-evidence:${index}`],
    acceptanceReceiptId: `acceptance:${index}`,
    acceptanceReceiptHash: index === 0 ? digestD : digestE,
    producerId: `producer:${proof.profileId}`,
    reviewerId: 'reviewer:independent-acceptance',
    retainedEvidenceIds: [`retained:${proof.evidenceId}`],
  })
}

function promotion(overrides: Partial<ProfilePromotionPacketContent> = {}): ProfilePromotionPacketContent {
  return {
    protocol: 'design-profile.promotion-packet.v1',
    id: 'promotion:contract-proof',
    finding: 'A held-out Profile reproduces the shared Platform invariant.',
    proposedOwner: 'platform',
    targetSurface: 'profile-platform',
    beforeHash: digestA,
    afterHash: digestB,
    proofs: [{
      profileId: 'profile:commerce',
      evidenceId: 'evidence:commerce-contract-conformance',
      claimedEvidenceKind: 'contract-conformance',
      evidenceHash: digestB,
      conformanceHash: digestC,
      verification: 'unverified-reference',
    }, {
      profileId: 'profile:game-asset',
      evidenceId: 'evidence:game-asset-contract-conformance',
      claimedEvidenceKind: 'contract-conformance',
      evidenceHash: digestA,
      conformanceHash: digestC,
      verification: 'unverified-reference',
    }],
    ...overrides,
  }
}

describe('Profile Platform conformance', () => {
  it('admits Profile-owned files and registrations without protected catalog drift', () => {
    expect(auditProfileExtension({
      profileId: 'profile:contract-probe',
      profileOwnedFiles: ['src/contract-probe-profile/index.ts'],
      changedFiles: ['src/contract-probe-profile/index.ts'],
      registrations: [{ kind: 'evaluator', id: 'evaluator:contract-probe' }],
      protectedCatalogs: {
        beforeKernelHash: digestA,
        afterKernelHash: digestA,
        beforeNavigationHash: digestB,
        afterNavigationHash: digestB,
      },
    })).toEqual({
      profileId: 'profile:contract-probe',
      passed: true,
      findings: [],
      admittedRegistrationIds: ['evaluator:contract-probe'],
    })
  })

  it('detects protected Kernel, authority, history and global-navigation changes', () => {
    const audit = auditProfileExtension({
      profileId: 'profile:contract-probe',
      profileOwnedFiles: [],
      changedFiles: [
        'src/design-os-kernel/runtime.ts',
      'src/control-protocol/control-protocol.ts',
      'src/global-library/approval.ts',
      'src/history/project-history.ts',
      'src/components/AppShell.tsx',
      'src/workspace/navigation.ts',
      ],
      registrations: [],
      protectedCatalogs: {
        beforeKernelHash: digestA,
        afterKernelHash: digestB,
        beforeNavigationHash: digestA,
        afterNavigationHash: digestC,
      },
    })

    expect(audit.passed).toBe(false)
    expect(audit.findings.map(({ surface }) => surface)).toEqual(expect.arrayContaining([
      'kernel-lifecycle', 'authority', 'approval-history', 'global-navigation',
    ]))
    expect(audit.findings.map(({ code }) => code)).toContain('kernel-catalog-drift')
    expect(audit.findings.map(({ code }) => code)).toContain('navigation-catalog-drift')

    expect(auditProfileExtension({
      profileId: 'profile:contract-probe',
      profileOwnedFiles: ['src/design-os-kernel/runtime.ts'],
      changedFiles: ['src/design-os-kernel/runtime.ts'],
      registrations: [],
      protectedCatalogs: {
        beforeKernelHash: digestA, afterKernelHash: digestA,
        beforeNavigationHash: digestA, afterNavigationHash: digestA,
      },
    }).passed).toBe(false)
    expect(() => auditProfileExtension({
      profileId: 'profile:contract-probe',
      profileOwnedFiles: [],
      changedFiles: ['src/contract-probe-profile/../design-os-kernel/runtime.ts'],
      registrations: [],
      protectedCatalogs: {
        beforeKernelHash: digestA, afterKernelHash: digestA,
        beforeNavigationHash: digestA, afterNavigationHash: digestA,
      },
    })).toThrow(/normalized repository-relative paths/)
  })

  it('compares cross-Host meaning after erasing only declared bindings', async () => {
    const leftCompilation = await createFixtureCompilation()
    const rightCompilation = await createFixtureCompilation({
      capabilityId: 'capability:structured:alternate',
      targetId: 'target:result:alternate',
    })
    const left = {
      ...leftCompilation,
      bindings: {
        hostId: 'host:fixture',
        authorizationId: 'authorization:fixture',
        capabilityRoutes: { 'capability:logical': 'capability:structured' },
        targetBindings: { 'target:logical': 'target:result' },
      },
    }
    const right = {
      ...rightCompilation,
      bindings: {
      hostId: 'host:alternate',
      authorizationId: 'authorization:alternate',
        capabilityRoutes: { 'capability:logical': 'capability:structured:alternate' },
        targetBindings: { 'target:logical': 'target:result:alternate' },
      },
    }
    const common = { profileId: 'profile:contract-probe', closureHash: digestA }

    expect(() => assertProfileCrossHostParity({ ...left, ...common }, { ...right, ...common })).not.toThrow()
    const missingOutcome = {
      ...right,
      outcomeGraph: {
        ...right.outcomeGraph,
        body: { nodes: [] },
      },
    }
    expect(() => assertProfileCrossHostParity({ ...left, ...common }, { ...missingOutcome, ...common }))
      .toThrow(/semantic parity failed/)
  })

  it('keeps promotion evidence unverified and requires two distinct Profile references for shared surfaces', async () => {
    const packet = await createProfilePromotionPacket(promotion())
    await expect(decodeProfilePromotionPacket(structuredClone(packet))).resolves.toEqual(packet)
    await expect(decodeProfilePromotionPacket({ ...packet, packetHash: digestC }))
      .rejects.toThrow(/packet hash does not match/)
    await expect(createProfilePromotionPacket(promotion({
      proofs: [promotion().proofs[0]!],
    }))).rejects.toThrow(/two distinct Profiles/)
    await expect(createProfilePromotionPacket(promotion({
      proofs: [promotion().proofs[1]!],
    }))).rejects.toThrow(/two distinct Profiles/)
    await expect(createProfilePromotionPacket(promotion({
      proposedOwner: 'host',
      targetSurface: 'kernel-lifecycle',
    }))).rejects.toThrow(/Host-owned findings/)
    await expect(createProfilePromotionPacket({
      ...promotion(),
      proofs: promotion().proofs.map((proof) => ({
        ...proof,
        verification: 'verified',
      })),
    })).rejects.toThrow()
  })

  it('round-trips a Profile-owned conformance envelope as an evidence-only ChangeSet handoff', async () => {
    const packet = await createProfilePromotionPacket(promotion({
      proposedOwner: 'profile',
      targetSurface: 'profile-owned',
      proofs: [promotion().proofs[1]!],
    }))
    const registry = new PromotionProofVerifierRegistry()
    const gameVerifier = await promotionVerifier('profile:game-asset', ['contract-conformance'])
    registry.register(gameVerifier)

    const envelope = await verifyProfilePromotionPacket({
      packet,
      registry,
      proofs: packet.proofs.map((proof, index) => ({
        evidenceId: proof.evidenceId,
        verifier: gameVerifier,
        retainedEvidence: retainedEvidence(packet, proof, index),
      })),
    })

    expect(envelope).toMatchObject({
      id: packet.id,
      packetHash: packet.packetHash,
      handoffStatus: 'verified-evidence-only',
      requiresChangeSet: true,
      mutatesProject: false,
    })
    await expect(decodeProfilePromotionEnvelope(structuredClone(envelope))).resolves.toEqual(envelope)
    await expect(assertProfilePromotionChangeSetHandoff({
      envelope,
      envelopeHash: envelope.envelopeHash,
      packetHash: packet.packetHash,
      currentSurfaceHash: packet.beforeHash,
      proposedSurfaceHash: packet.afterHash,
    })).resolves.toEqual(envelope)
    await expect(assertProfilePromotionChangeSetHandoff({
      envelope,
      envelopeHash: envelope.envelopeHash,
      packetHash: packet.packetHash,
      currentSurfaceHash: digestC,
      proposedSurfaceHash: packet.afterHash,
    })).rejects.toThrow(/target surface is stale/)
    await expect(decodeProfilePromotionEnvelope({
      ...envelope,
      proposedOwner: 'host',
      targetSurface: 'kernel-lifecycle',
    })).rejects.toThrow(/Host-owned findings/)
  })

  it('rejects conformance-only, forged, incomplete, synchronous, or non-independent promotion proof', async () => {
    const packet = await createProfilePromotionPacket(promotion())
    const commerceVerifier = await promotionVerifier('profile:commerce', [
      'contract-conformance', 'verified-host',
    ])
    const gameVerifier = await promotionVerifier('profile:game-asset', [
      'contract-conformance', 'verified-host',
    ])
    const registry = new PromotionProofVerifierRegistry()
      .register(commerceVerifier)
      .register(gameVerifier)
    const candidates = packet.proofs.map((proof, index) => ({
      evidenceId: proof.evidenceId,
      verifier: proof.profileId === 'profile:commerce' ? commerceVerifier : gameVerifier,
      retainedEvidence: retainedEvidence(packet, proof, index),
    }))

    await expect(verifyProfilePromotionPacket({ packet, registry, proofs: candidates }))
      .rejects.toThrow(/Contract conformance cannot authorize/)
    await expect(verifyProfilePromotionPacket({ packet, registry, proofs: candidates.slice(0, 1) }))
      .rejects.toThrow(/every packet proof/)
    await expect(verifyProfilePromotionPacket({
      packet,
      registry,
      proofs: candidates.map((candidate, index) => index === 0 ? {
        ...candidate,
        retainedEvidence: {
          ...candidate.retainedEvidence,
          evidenceHash: digestE,
        },
      } : candidate),
    })).rejects.toThrow(/does not match the packet/)

    const syncRegistry = new PromotionProofVerifierRegistry()
    expect(() => syncRegistry.register({
      ...commerceVerifier,
      verify: (() => ({ passed: true })) as never,
    })).toThrow(/asynchronous promotion proof verifier/)

    const realPacket = await createProfilePromotionPacket(promotion({
      proofs: promotion().proofs.map((proof) => ({
        ...proof,
        claimedEvidenceKind: 'verified-host',
      })),
    }))
    const duplicatedAcceptance = realPacket.proofs.map((proof) => ({
      evidenceId: proof.evidenceId,
      verifier: proof.profileId === 'profile:commerce' ? commerceVerifier : gameVerifier,
      retainedEvidence: {
        ...retainedEvidence(realPacket, proof, 0),
        acceptanceReceiptId: 'acceptance:reused',
        acceptanceReceiptHash: digestD,
      },
    }))
    await expect(verifyProfilePromotionPacket({
      packet: realPacket,
      registry,
      proofs: duplicatedAcceptance,
    })).rejects.toThrow(/independent acceptance receipts/)
    await expect(registry.verify({
      verifier: commerceVerifier,
      packet: { ...realPacket, packetHash: digestE },
      proof: realPacket.proofs[0]!,
      retainedEvidence: retainedEvidence(realPacket, realPacket.proofs[0]!, 0),
    })).rejects.toThrow(/packet hash does not match/)
  })
})

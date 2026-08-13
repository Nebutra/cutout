import { describe, expect, it } from 'vitest'
import { createFixtureCompilation } from '@/design-os-kernel/test-fixture'
import {
  assertProfileCrossHostParity,
  auditProfileExtension,
  createProfilePromotionPacket,
  decodeProfilePromotionPacket,
  type ProfilePromotionPacketContent,
} from './conformance'

const digestA = 'a'.repeat(64)
const digestB = 'b'.repeat(64)
const digestC = 'c'.repeat(64)

function promotion(overrides: Partial<ProfilePromotionPacketContent> = {}): ProfilePromotionPacketContent {
  return {
    protocol: 'design-profile.promotion-packet.v1',
    id: 'promotion:synthetic-proof',
    finding: 'A held-out Profile reproduces the shared Platform invariant.',
    proposedOwner: 'platform',
    targetSurface: 'profile-platform',
    beforeHash: digestA,
    afterHash: digestB,
    proofs: [{
      profileId: 'profile:commerce',
      fixtureId: 'fixture:commerce',
      evidenceHash: digestB,
      conformanceHash: digestC,
      reproducible: true,
      regressionClosed: true,
      heldOut: false,
    }, {
      profileId: 'profile:synthetic',
      fixtureId: 'fixture:held-out',
      evidenceHash: digestA,
      conformanceHash: digestC,
      reproducible: true,
      regressionClosed: true,
      heldOut: true,
    }],
    ...overrides,
  }
}

describe('Profile Platform conformance', () => {
  it('admits Profile-owned files and registrations without protected catalog drift', () => {
    expect(auditProfileExtension({
      profileId: 'profile:synthetic',
      profileOwnedFiles: ['src/synthetic-profile/index.ts'],
      changedFiles: ['src/synthetic-profile/index.ts'],
      registrations: [{ kind: 'evaluator', id: 'evaluator:synthetic' }],
      protectedCatalogs: {
        beforeKernelHash: digestA,
        afterKernelHash: digestA,
        beforeNavigationHash: digestB,
        afterNavigationHash: digestB,
      },
    })).toEqual({
      profileId: 'profile:synthetic',
      passed: true,
      findings: [],
      admittedRegistrationIds: ['evaluator:synthetic'],
    })
  })

  it('detects protected Kernel, authority, history and global-navigation changes', () => {
    const audit = auditProfileExtension({
      profileId: 'profile:synthetic',
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
      profileId: 'profile:synthetic',
      profileOwnedFiles: ['src/design-os-kernel/runtime.ts'],
      changedFiles: ['src/design-os-kernel/runtime.ts'],
      registrations: [],
      protectedCatalogs: {
        beforeKernelHash: digestA, afterKernelHash: digestA,
        beforeNavigationHash: digestA, afterNavigationHash: digestA,
      },
    }).passed).toBe(false)
    expect(() => auditProfileExtension({
      profileId: 'profile:synthetic',
      profileOwnedFiles: [],
      changedFiles: ['src/synthetic-profile/../design-os-kernel/runtime.ts'],
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
    const common = { profileId: 'profile:synthetic', closureHash: digestA }

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

  it('requires reproducible cross-Profile or held-out proof for shared promotion', async () => {
    const heldOut = await createProfilePromotionPacket(promotion())
    await expect(decodeProfilePromotionPacket(structuredClone(heldOut))).resolves.toEqual(heldOut)
    await expect(decodeProfilePromotionPacket({ ...heldOut, packetHash: digestC }))
      .rejects.toThrow(/packet hash does not match/)
    await expect(createProfilePromotionPacket(promotion({
      proofs: [promotion().proofs[0]!],
    }))).rejects.toThrow(/two Profiles or a held-out proof/)
    await expect(createProfilePromotionPacket(promotion({
      proofs: [promotion().proofs[1]!],
    }))).rejects.toThrow(/two Profiles or a held-out proof/)
    await expect(createProfilePromotionPacket(promotion({
      proposedOwner: 'host',
      targetSurface: 'kernel-lifecycle',
    }))).rejects.toThrow(/Host-owned findings/)
  })
})

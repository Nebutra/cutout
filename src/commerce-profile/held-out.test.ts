import { describe, expect, it } from 'vitest'
import { normalizeProductRecord } from './normalizer'
import { fingerprint } from '@/design-ir/fingerprint'
import {
  commerceHeldOutChallengeSelectionPayloadSchema,
  commerceHeldOutAdmissionSchema,
  commerceHeldOutCommitmentSchema,
  commerceHeldOutEvaluatorAttestationPayloadSchema,
  createCommerceHeldOutEvaluatorPackage,
  createCommerceHeldOutInputManifest,
  decodeCommerceHeldOutEvaluatorPackage,
  encodeCommerceHeldOutChallengePayload,
  encodeCommerceHeldOutEvaluatorPayload,
} from './held-out'
import { decodeCommerceHeldOutPendingAdmission } from './production-runner'
import { createCommerceRehearsalFixture } from './rehearsal.test-fixture'

const HASH = 'a'.repeat(64)

function facts() {
  return normalizeProductRecord({
    file: 'held-out.json',
    contents: JSON.stringify({
      title: 'Held-out product',
      images: [
        'https://aib-innovation-oss.oss-accelerate.aliyuncs.com/AI_Business/held-out.png',
      ],
    }),
  })
}

describe('held-out Commerce protocol binding (not benchmark evidence)', () => {
  it('derives the selected input manifest from exact fact, catalog, and rehearsal identities', async () => {
    const productFacts = facts()
    const source = productFacts.facts.find((fact) => fact.value.type === 'media')!
    const manifest = await createCommerceHeldOutInputManifest({
      rehearsalIdentity: {
        id: 'benchmark-run:held-out',
        revision: 'benchmark-run:held-out:revision:1',
      },
      facts: productFacts,
      categoryCatalog: '{"category":"leaf"}',
      attributeCatalog: '{"attributes":[]}',
      selectedSourceFactIds: [source.id],
    })

    expect(manifest).toMatchObject({
      schema: 'commerce.held-out-input-manifest.v1',
      rehearsalIdentity: { id: 'benchmark-run:held-out' },
      selectedSources: [{
        factId: source.id,
        sourceFile: source.source.file,
        sourcePointer: source.source.pointer,
      }],
    })
    expect(manifest.factsHash).toMatch(/^[a-f0-9]{64}$/)
    expect(manifest.categoryCatalogHash).not.toBe(manifest.attributeCatalogHash)
  })

  it('rejects duplicate or unresolved held-out source selection', async () => {
    const productFacts = facts()
    const source = productFacts.facts.find((fact) => fact.value.type === 'media')!
    await expect(createCommerceHeldOutInputManifest({
      rehearsalIdentity: { id: 'run:test', revision: 'run:test:revision:1' },
      facts: productFacts,
      categoryCatalog: '{}',
      attributeCatalog: '{}',
      selectedSourceFactIds: [source.id, source.id],
    })).rejects.toThrow(/unique image facts/)
    await expect(createCommerceHeldOutInputManifest({
      rehearsalIdentity: { id: 'run:test', revision: 'run:test:revision:1' },
      facts: productFacts,
      categoryCatalog: '{}',
      attributeCatalog: '{}',
      selectedSourceFactIds: ['fact:caller-invented'],
    })).rejects.toThrow(/resolved image fact/)
  })

  it('strictly decodes evaluator-selected challenge and completion bindings', () => {
    const challenge = commerceHeldOutChallengeSelectionPayloadSchema.parse({
      protocol: 'cutout.commerce-held-out-challenge-selection.v2',
      benchmark: { id: 'benchmark:commerce-profile:p1-p7', version: 2 },
      profile: { id: 'profile:commerce-materials', version: '1.1.0' },
      hostBuildVersion: '0.1.25',
      challengeId: 'challenge:test',
      challengeNonce: 'n'.repeat(32),
      inputManifestHash: HASH,
      allowedRunId: 'run:test',
      evaluatorKeyId: 'evaluator:minisign:test',
      issuedAt: 10,
      expiresAt: 20,
    })
    expect(encodeCommerceHeldOutChallengePayload(challenge)).toContain(
      '"allowedRunId":"run:test","benchmark":{"id":"benchmark:commerce-profile:p1-p7","version":2}',
    )
    const payload = commerceHeldOutEvaluatorAttestationPayloadSchema.parse({
      protocol: 'cutout.commerce-held-out-evaluator-completion.v2',
      attestationId: 'attestation:test',
      challengeHash: HASH,
      challengeId: 'challenge:test',
      evaluatorKeyId: 'evaluator:minisign:test',
      hostBuildVersion: '0.1.25',
      commitmentHash: HASH,
      inputManifestHash: HASH,
      runId: 'run:test',
      bundleHash: HASH,
      decision: 'accepted',
      deliverableCount: 11,
      completedAt: 42,
    })
    expect(encodeCommerceHeldOutEvaluatorPayload(payload)).toBe(
      '{"attestationId":"attestation:test","bundleHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","challengeHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","challengeId":"challenge:test","commitmentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","completedAt":42,"decision":"accepted","deliverableCount":11,"evaluatorKeyId":"evaluator:minisign:test","hostBuildVersion":"0.1.25","inputManifestHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","protocol":"cutout.commerce-held-out-evaluator-completion.v2","runId":"run:test"}',
    )
    expect(() => commerceHeldOutEvaluatorAttestationPayloadSchema.parse({
      ...payload,
      rendererVerified: true,
    })).toThrow()
    expect(() => commerceHeldOutEvaluatorAttestationPayloadSchema.parse({
      ...payload,
      protocol: 'cutout.commerce-held-out-evaluator-completion.v1',
    })).toThrow()
    const missingCompletionBuild = { ...payload } as Record<string, unknown>
    delete missingCompletionBuild.hostBuildVersion
    expect(() => commerceHeldOutEvaluatorAttestationPayloadSchema.parse(missingCompletionBuild)).toThrow()
    expect(() => commerceHeldOutCommitmentSchema.parse({
      protocol: 'cutout.commerce-held-out-commitment.v2',
      commitmentId: 'commitment:test',
      commitmentHash: HASH,
      challengeSelection: { payload: challenge, signature: 'x'.repeat(100) },
      challengeHash: HASH,
      evaluatorKeyId: 'evaluator:test',
      hostBuildVersion: '0.1.25',
      inputManifest: {},
      inputManifestHash: HASH,
      runId: 'run:test',
      issuedAt: 1,
      signature: HASH,
      publicKey: 'renderer-supplied',
    })).toThrow()
    expect(() => commerceHeldOutChallengeSelectionPayloadSchema.parse({
      ...challenge,
      expiresAt: challenge.issuedAt,
    })).toThrow(/expiry/)
    expect(() => commerceHeldOutChallengeSelectionPayloadSchema.parse({
      ...challenge,
      allowedRunId: 'run:other',
      benchmark: { ...challenge.benchmark, version: 3 },
    })).toThrow()
    expect(() => commerceHeldOutChallengeSelectionPayloadSchema.parse({
      ...challenge,
      protocol: 'cutout.commerce-held-out-challenge-selection.v1',
    })).toThrow()
    expect(() => commerceHeldOutChallengeSelectionPayloadSchema.parse({
      ...challenge,
      hostBuildVersion: '0.1.19',
    })).toThrow()
    const missingBuild = { ...challenge } as Record<string, unknown>
    delete missingBuild.hostBuildVersion
    expect(() => commerceHeldOutChallengeSelectionPayloadSchema.parse(missingBuild)).toThrow()
    const admission = commerceHeldOutAdmissionSchema.parse({
      protocol: 'cutout.commerce-held-out-admission.v2',
      challengeId: 'challenge:test',
      challengeHash: HASH,
      evaluatorKeyId: 'evaluator:test',
      hostBuildVersion: '0.1.25',
      commitmentId: 'commitment:test',
      commitmentHash: HASH,
      attestationId: 'attestation:test',
      inputManifestHash: HASH,
      runId: 'run:test',
      bundleHash: HASH,
      commitmentIssuedAt: 1,
      evaluatorCompletedAt: 2,
      deliverableCount: 11,
    })
    expect(() => commerceHeldOutAdmissionSchema.parse({
      ...admission,
      protocol: 'cutout.commerce-held-out-admission.v1',
    })).toThrow()
  })

  it('binds evaluator packages to one exact derived input manifest', async () => {
    const productFacts = facts()
    const source = productFacts.facts.find((fact) => fact.value.type === 'media')!
    const evaluatorInput = {
      schema: 'commerce.held-out-evaluator-input.v1' as const,
      rehearsalIdentity: { id: 'run:package', revision: 'run:package:revision:1' },
      facts: productFacts,
      categoryCatalog: '{"categories":[]}',
      attributeCatalog: '{"attributes":[]}',
      selectedSourceFactIds: [source.id],
    }
    const inputManifest = await createCommerceHeldOutInputManifest(evaluatorInput)
    const evaluatorChallenge = {
      payload: commerceHeldOutChallengeSelectionPayloadSchema.parse({
        protocol: 'cutout.commerce-held-out-challenge-selection.v2',
        benchmark: { id: 'benchmark:commerce-profile:p1-p7', version: 2 },
        profile: { id: 'profile:commerce-materials', version: '1.1.0' },
        hostBuildVersion: '0.1.25',
        challengeId: 'challenge:package',
        challengeNonce: 'p'.repeat(32),
        inputManifestHash: await fingerprint(inputManifest),
        allowedRunId: 'run:package',
        evaluatorKeyId: 'evaluator:minisign:package',
        issuedAt: 10,
        expiresAt: 20,
      }),
      signature: 's'.repeat(100),
    }
    const evaluatorPackage = await createCommerceHeldOutEvaluatorPackage({
      evaluatorInput,
      evaluatorChallenge,
    })
    await expect(decodeCommerceHeldOutEvaluatorPackage(evaluatorPackage)).resolves.toEqual(evaluatorPackage)

    const drift = structuredClone(evaluatorPackage)
    drift.inputManifest.categoryCatalogHash = 'f'.repeat(64)
    await expect(decodeCommerceHeldOutEvaluatorPackage(drift)).rejects.toThrow(/manifest does not match/)
  })

  it('rejects pending handoff content that drifts from its evaluator bundle hash', async () => {
    const fixture = await createCommerceRehearsalFixture()
    const inputManifest = await createCommerceHeldOutInputManifest({
      rehearsalIdentity: fixture.bundle.identity,
      facts: fixture.bundle.facts,
      categoryCatalog: fixture.bundle.categoryCatalog,
      attributeCatalog: fixture.bundle.attributeCatalog,
      selectedSourceFactIds: fixture.bundle.sourceMaterials.map((material) => material.factId),
    })
    const inputManifestHash = await fingerprint(inputManifest)
    const challenge = {
      payload: commerceHeldOutChallengeSelectionPayloadSchema.parse({
        protocol: 'cutout.commerce-held-out-challenge-selection.v2',
        benchmark: { id: 'benchmark:commerce-profile:p1-p7', version: 2 },
        profile: { id: 'profile:commerce-materials', version: '1.1.0' },
        hostBuildVersion: '0.1.25',
        challengeId: 'challenge:pending',
        challengeNonce: 'q'.repeat(32),
        inputManifestHash,
        allowedRunId: fixture.bundle.runId,
        evaluatorKeyId: 'evaluator:minisign:pending',
        issuedAt: 10,
        expiresAt: 20,
      }),
      signature: 's'.repeat(100),
    }
    const bundleHash = await fingerprint(fixture.bundle)
    const pending = {
      schema: 'commerce.held-out-pending-admission.v1' as const,
      commitment: {
        protocol: 'cutout.commerce-held-out-commitment.v2' as const,
        commitmentId: 'commitment:pending',
        commitmentHash: 'b'.repeat(64),
        challengeSelection: challenge,
        challengeHash: 'c'.repeat(64),
        evaluatorKeyId: challenge.payload.evaluatorKeyId,
        hostBuildVersion: '0.1.25',
        inputManifest,
        inputManifestHash,
        runId: fixture.bundle.runId,
        issuedAt: 11,
        signature: 'd'.repeat(64),
      },
      bundle: fixture.bundle,
      completionRequest: {
        protocol: 'cutout.commerce-held-out-evaluator-completion.v2' as const,
        challengeId: challenge.payload.challengeId,
        challengeHash: 'c'.repeat(64),
        evaluatorKeyId: challenge.payload.evaluatorKeyId,
        hostBuildVersion: '0.1.25',
        commitmentHash: 'b'.repeat(64),
        inputManifestHash,
        runId: fixture.bundle.runId,
        bundleHash,
        decision: 'accepted' as const,
        deliverableCount: 11 as const,
      },
    }
    await expect(decodeCommerceHeldOutPendingAdmission(pending)).resolves.toEqual(pending)
    const legacyCommitment = structuredClone(pending) as unknown as {
      commitment: { protocol: string }
    }
    legacyCommitment.commitment.protocol = 'cutout.commerce-held-out-commitment.v1'
    await expect(decodeCommerceHeldOutPendingAdmission(legacyCommitment)).rejects.toThrow()
    const drift = structuredClone(pending)
    drift.bundle.categoryCatalog = '{"drift":true}'
    await expect(decodeCommerceHeldOutPendingAdmission(drift)).rejects.toThrow(/does not bind/)
  })
})

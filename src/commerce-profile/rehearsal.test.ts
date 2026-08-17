import { beforeEach, describe, expect, it, vi } from 'vitest'
import { verifyNativeMultimodalHostArtifact } from '@/multimodal-host/desktop-host'
import currentCommerce from './benchmarks/contract-baseline.json'
import {
  createCommerceProfileBenchmarkReportFromRehearsal,
  decodeCommerceProfileBenchmarkReport,
  decodeCommerceProfileBenchmarkReportFromRehearsal,
} from './benchmark'
import { createCommerceRehearsalFixture } from './rehearsal.test-fixture'
import {
  assertCommerceHeldOutReceiptCommitmentClosure,
  commerceProductionRehearsalArtifactSchema,
  type CommerceProductionRehearsalBundle,
} from './rehearsal'
import {
  createDesignOsBenchmarkFromCommerceRehearsal,
  decodeDesignOsBenchmarkFromCommerceRehearsal,
} from '@/design-os-benchmark/commerce'
import { verifyNativeCommerceSourceIngestReceipt } from './source-ingest'

vi.mock('@/multimodal-host/desktop-host', () => ({
  verifyNativeMultimodalHostArtifact: vi.fn(),
}))
vi.mock('./source-ingest', async (importOriginal) => ({
  ...await importOriginal<typeof import('./source-ingest')>(),
  verifyNativeCommerceSourceIngestReceipt: vi.fn(),
}))

describe('Commerce rehearsal verifier contract (fixture only; not benchmark evidence)', () => {
  beforeEach(() => {
    vi.mocked(verifyNativeMultimodalHostArtifact).mockReset()
    vi.mocked(verifyNativeCommerceSourceIngestReceipt).mockReset()
  })

  function substituteNativeVerifierForContractTest(bundle: CommerceProductionRehearsalBundle): void {
    const receipts = bundle.artifacts.flatMap((artifact) => [
      artifact.receipt,
      ...(artifact.semanticQa ? [artifact.semanticQa.receipt] : []),
    ])
    let index = 0
    vi.mocked(verifyNativeMultimodalHostArtifact).mockImplementation(async () => {
      const receipt = receipts[index % receipts.length]!
      index += 1
      return { verified: true, receipt, artifact: receipt.artifact }
    })
    vi.mocked(verifyNativeCommerceSourceIngestReceipt).mockImplementation(async ({ receipt }) => receipt)
  }

  it('decodes retained multi-megabyte base64 with bounded linear validation', async () => {
    const fixture = await createCommerceRehearsalFixture()
    const retainedBytes = new Uint8Array(5 * 1024 * 1024)
    const chunk = 'Cutout held-out retained evidence.'
    for (let index = 0; index < retainedBytes.length; index += 1) {
      retainedBytes[index] = chunk.charCodeAt(index % chunk.length)
    }
    const artifactBytesBase64 = Buffer.from(retainedBytes).toString('base64')

    expect(artifactBytesBase64.length).toBeGreaterThan(6 * 1024 * 1024)
    expect(() => commerceProductionRehearsalArtifactSchema.parse({
      ...fixture.bundle.artifacts[0],
      artifactBytesBase64,
    })).not.toThrow()
  })

  it.each([
    'AAA',
    'A===',
    'AA=A',
    'AAA==',
    '====',
    'AA!A',
  ])('rejects malformed retained base64 syntax: %s', async (artifactBytesBase64) => {
    const fixture = await createCommerceRehearsalFixture()
    expect(() => commerceProductionRehearsalArtifactSchema.parse({
      ...fixture.bundle.artifacts[0],
      artifactBytesBase64,
    })).toThrow(/Invalid base64 encoding|too small/)
  })

  it('requires complete receipt, byte, graph, Plan, lock, QA, and evaluation closure before deriving real-Host statuses', async () => {
    const fixture = await createCommerceRehearsalFixture()
    substituteNativeVerifierForContractTest(fixture.bundle)
    const { report, rehearsal } = await createCommerceProfileBenchmarkReportFromRehearsal({
      baselineReport: currentCommerce,
      rehearsalBundle: fixture.bundle,
    })

    expect(verifyNativeMultimodalHostArtifact).toHaveBeenCalledTimes(18)
    expect(verifyNativeCommerceSourceIngestReceipt).toHaveBeenCalledTimes(3)
    expect(vi.mocked(verifyNativeMultimodalHostArtifact).mock.calls[0]?.[0]).toMatchObject({
      receipt: { receiptId: fixture.bundle.artifacts[0]!.receipt.receiptId },
      bytes: expect.any(Uint8Array),
    })
    expect(rehearsal.artifacts).toHaveLength(11)
    const video = rehearsal.artifacts.find((artifact) => artifact.semanticRole === 'product-video')!
    const mainImage = rehearsal.artifacts.find((artifact) => artifact.semanticRole === 'main-image')!
    expect(video.receipt).toMatchObject({
      operation: 'image-to-video',
      acceptedReferenceArtifactIds: [mainImage.publication.artifactId],
    })
    expect(video.dagReferenceBindings).toEqual([expect.objectContaining({
      artifactId: mainImage.publication.artifactId,
      contentHash: mainImage.publication.artifactId.slice('artifact:sha256:'.length),
      sourceSemanticRole: 'main-image',
      referenceRole: 'first-frame',
      identityLockIds: ['lock:commerce-product-identity', 'lock:commerce-creative-direction'],
      allowedChanges: ['camera-motion', 'temporal-composition', 'native-audio'],
    })])
    expect(rehearsal.evaluation).toMatchObject({ ready: true, validArtifactIds: expect.any(Array) })
    expect(rehearsal.evaluation.validArtifactIds).toHaveLength(11)
    expect(report.summary.tiers.at(-1)).toEqual({
      tier: 'real-host', total: 8, passed: 0, failed: 0, blocked: 8, ready: false,
    })
    const videoMetric = report.metrics.find((metric) => metric.id === 'p6.real-video-execution')!
    expect(videoMetric).toMatchObject({
      status: 'blocked',
      evidenceReferences: [{
        kind: 'host-capability-audit',
        binding: { findingCode: 'real-host-evidence-unavailable' },
      }],
    })
    expect(decodeCommerceProfileBenchmarkReport(report)).toEqual(report)
    substituteNativeVerifierForContractTest(fixture.bundle)
    await expect(decodeCommerceProfileBenchmarkReportFromRehearsal({
      report,
      baselineReport: currentCommerce,
      rehearsalBundle: fixture.bundle,
    })).resolves.toEqual(report)
  })

  it('rejects source bytes that were not authenticated for the retained source URL', async () => {
    const fixture = await createCommerceRehearsalFixture()
    const unrelated = structuredClone(fixture.bundle)
    const [target, foreign] = unrelated.sourceMaterials
    const fields = [
      'artifactId', 'sha256', 'mediaType', 'byteLength', 'width', 'height', 'artifactBytesBase64',
    ] as const
    for (const field of fields) {
      const value = target![field]
      ;(target as Record<typeof field, typeof value>)[field] = foreign![field]
      ;(foreign as Record<typeof field, typeof value>)[field] = value
    }
    substituteNativeVerifierForContractTest(unrelated)

    await expect(createCommerceProfileBenchmarkReportFromRehearsal({
      baselineReport: currentCommerce,
      rehearsalBundle: unrelated,
    })).rejects.toThrow(/does not match its source-ingest receipt URL, fact, or bytes/)
  })

  it('rejects missing source receipts and receipt URL, fact, or hash drift', async () => {
    const fixture = await createCommerceRehearsalFixture()
    const missing = structuredClone(fixture.bundle) as unknown as {
      sourceMaterials: Array<Record<string, unknown>>
    }
    delete missing.sourceMaterials[0]!.ingestReceipt
    await expect(createCommerceProfileBenchmarkReportFromRehearsal({
      baselineReport: currentCommerce,
      rehearsalBundle: missing,
    })).rejects.toThrow()

    for (const mutate of [
      (bundle: CommerceProductionRehearsalBundle) => { bundle.sourceMaterials[0]!.ingestReceipt.factId = 'fact:media.image:2' },
      (bundle: CommerceProductionRehearsalBundle) => { bundle.sourceMaterials[0]!.ingestReceipt.sourcePath = '/AI_Business/drift.png' },
      (bundle: CommerceProductionRehearsalBundle) => { bundle.sourceMaterials[0]!.ingestReceipt.sourceUrlSha256 = 'f'.repeat(64) },
    ]) {
      const drift = structuredClone(fixture.bundle)
      mutate(drift)
      substituteNativeVerifierForContractTest(drift)
      await expect(createCommerceProfileBenchmarkReportFromRehearsal({
        baselineReport: currentCommerce,
        rehearsalBundle: drift,
      })).rejects.toThrow(/does not match its source-ingest receipt URL, fact, or bytes/)
    }
  })

  it('rejects image receipts that omit sources or reorder source-first dependency references', async () => {
    const fixture = await createCommerceRehearsalFixture()
    const omitted = structuredClone(fixture.bundle)
    const main = omitted.artifacts.find((artifact) => artifact.semanticRole === 'main-image')!
    main.receipt.acceptedReferenceArtifactIds = main.receipt.acceptedReferenceArtifactIds.slice(1)
    substituteNativeVerifierForContractTest(omitted)
    await expect(createCommerceProfileBenchmarkReportFromRehearsal({
      baselineReport: currentCommerce,
      rehearsalBundle: omitted,
    })).rejects.toThrow(/accepted references must match the exact Commerce rehearsal closure/)

    const reordered = structuredClone(fixture.bundle)
    const detail = reordered.artifacts.find((artifact) => artifact.semanticRole === 'detail-image:1')!
    detail.receipt.acceptedReferenceArtifactIds = [
      detail.receipt.acceptedReferenceArtifactIds.at(-1)!,
      ...detail.receipt.acceptedReferenceArtifactIds.slice(0, -1),
    ]
    substituteNativeVerifierForContractTest(reordered)
    await expect(createCommerceProfileBenchmarkReportFromRehearsal({
      baselineReport: currentCommerce,
      rehearsalBundle: reordered,
    })).rejects.toThrow(/accepted references must match the exact Commerce rehearsal closure/)
  })

  it('rejects tampered retained bytes before they can reach Commerce evaluation', async () => {
    const fixture = await createCommerceRehearsalFixture()
    substituteNativeVerifierForContractTest(fixture.bundle)
    const tampered = structuredClone(fixture.bundle)
    tampered.artifacts[0]!.artifactBytesBase64 = btoa('{"tampered":true}')

    await expect(createCommerceProfileBenchmarkReportFromRehearsal({
      baselineReport: currentCommerce,
      rehearsalBundle: tampered,
    })).rejects.toThrow(/does not match its retained artifact bytes/)
  })

  it('rejects receipt reuse, frozen Plan drift, and incomplete signed semantic QA', async () => {
    const fixture = await createCommerceRehearsalFixture()
    substituteNativeVerifierForContractTest(fixture.bundle)
    const reused = structuredClone(fixture.bundle)
    reused.artifacts[1]!.receipt = structuredClone(reused.artifacts[0]!.receipt)
    substituteNativeVerifierForContractTest(reused)
    await expect(createCommerceProfileBenchmarkReportFromRehearsal({
      baselineReport: currentCommerce, rehearsalBundle: reused,
    })).rejects.toThrow()

    const planDrift = structuredClone(fixture.bundle)
    planDrift.plan.body.nodes[0]!.deadlineMs += 1
    await expect(createCommerceProfileBenchmarkReportFromRehearsal({
      baselineReport: currentCommerce, rehearsalBundle: planDrift,
    })).rejects.toThrow(/Plan does not match the canonical Commerce production document/)

    const missingQa = structuredClone(fixture.bundle)
    delete missingQa.artifacts.find((artifact) => artifact.semanticRole === 'main-image')!.semanticQa
    substituteNativeVerifierForContractTest(missingQa)
    await expect(createCommerceProfileBenchmarkReportFromRehearsal({
      baselineReport: currentCommerce, rehearsalBundle: missingQa,
    })).rejects.toThrow(/requires signed semantic QA/)
  })

  it('rejects missing or reordered roles before native verification', async () => {
    const fixture = await createCommerceRehearsalFixture()
    const missing = structuredClone(fixture.bundle) as unknown as { artifacts: unknown[] }
    missing.artifacts.pop()
    await expect(createCommerceProfileBenchmarkReportFromRehearsal({
      baselineReport: currentCommerce, rehearsalBundle: missing,
    })).rejects.toThrow()

    const reordered = structuredClone(fixture.bundle)
    ;[reordered.artifacts[0], reordered.artifacts[1]] = [reordered.artifacts[1]!, reordered.artifacts[0]!]
    await expect(createCommerceProfileBenchmarkReportFromRehearsal({
      baselineReport: currentCommerce, rehearsalBundle: reordered,
    })).rejects.toThrow(/semantic roles must match the exact Commerce rehearsal closure/)
    expect(verifyNativeMultimodalHostArtifact).not.toHaveBeenCalled()
  })

  it('rejects signed context lock drift and caller-tampered durable readiness', async () => {
    const fixture = await createCommerceRehearsalFixture()
    substituteNativeVerifierForContractTest(fixture.bundle)
    const lockDrift = structuredClone(fixture.bundle)
    lockDrift.artifacts[0]!.receipt.lockIds = lockDrift.artifacts[0]!.receipt.lockIds.slice(0, 2)
    substituteNativeVerifierForContractTest(lockDrift)
    await expect(createCommerceProfileBenchmarkReportFromRehearsal({
      baselineReport: currentCommerce, rehearsalBundle: lockDrift,
    })).rejects.toThrow(/locks must match the exact Commerce rehearsal closure/)

    const referenceDrift = structuredClone(fixture.bundle)
    const video = referenceDrift.artifacts.find((artifact) => artifact.semanticRole === 'product-video')!
    video.receipt.acceptedReferenceArtifactIds = []
    substituteNativeVerifierForContractTest(referenceDrift)
    await expect(createCommerceProfileBenchmarkReportFromRehearsal({
      baselineReport: currentCommerce, rehearsalBundle: referenceDrift,
    })).rejects.toThrow()

    substituteNativeVerifierForContractTest(fixture.bundle)
    const { report } = await createCommerceProfileBenchmarkReportFromRehearsal({
      baselineReport: currentCommerce, rehearsalBundle: fixture.bundle,
    })
    const tamperedReport = structuredClone(report)
    tamperedReport.summary.productionReady = true
    substituteNativeVerifierForContractTest(fixture.bundle)
    await expect(decodeCommerceProfileBenchmarkReportFromRehearsal({
      report: tamperedReport,
      baselineReport: currentCommerce,
      rehearsalBundle: fixture.bundle,
    })).rejects.toThrow(/does not match its reverified rehearsal bundle/)
  })

  it('does not admit the fixture verifier contract as held-out rehearsal proof', async () => {
    const fixture = await createCommerceRehearsalFixture()
    substituteNativeVerifierForContractTest(fixture.bundle)
    const identity = {
      id: 'benchmark-run:design-os:verifier-contract-fixture',
      revision: 'benchmark-run:design-os:verifier-contract-fixture:revision:1',
    }
    const report = await createDesignOsBenchmarkFromCommerceRehearsal({
      baselineCommerceReport: currentCommerce,
      rehearsalBundle: fixture.bundle,
      identity,
    })

    expect(report.summary.productionReady).toBe(false)
    expect(report.summary.stages.at(-1)).toEqual({
      stage: 'production-rehearsal', total: 1, passed: 0, failed: 0, blocked: 1, ready: false,
    })
    substituteNativeVerifierForContractTest(fixture.bundle)
    await expect(decodeDesignOsBenchmarkFromCommerceRehearsal({
      report,
      baselineCommerceReport: currentCommerce,
      rehearsalBundle: fixture.bundle,
      identity,
    })).resolves.toEqual(report)

    const rebound = structuredClone(report)
    rebound.identity = { id: 'caller:ready', revision: 'caller:ready:revision:1' }
    substituteNativeVerifierForContractTest(fixture.bundle)
    await expect(decodeDesignOsBenchmarkFromCommerceRehearsal({
      report: rebound,
      baselineCommerceReport: currentCommerce,
      rehearsalBundle: fixture.bundle,
      identity,
    })).rejects.toThrow(/does not match its reverified Commerce rehearsal bundle/)
  })

  it('requires the same held-out commitment on every source, Provider, QA, and playback receipt', async () => {
    const { bundle } = await createCommerceRehearsalFixture()
    const commitmentHash = 'a'.repeat(64)
    for (const material of bundle.sourceMaterials) {
      material.ingestReceipt.heldOutCommitmentHash = commitmentHash
    }
    for (const artifact of bundle.artifacts) {
      artifact.receipt.heldOutCommitmentHash = commitmentHash
      if (artifact.semanticQa) artifact.semanticQa.receipt.heldOutCommitmentHash = commitmentHash
      if (artifact.receipt.playbackPromotion) {
        artifact.receipt.playbackPromotion.sourceHeldOutCommitmentHash = commitmentHash
        artifact.playbackSourceReceipt = {
          ...structuredClone(artifact.receipt),
          receiptId: `${artifact.receipt.receiptId}:source`,
          receiptHash: artifact.receipt.playbackPromotion.sourceReceiptHash,
          artifact: { ...artifact.receipt.artifact, playbackVerified: false },
          playbackPromotion: undefined,
        }
      }
    }
    expect(() => assertCommerceHeldOutReceiptCommitmentClosure(bundle, commitmentHash)).not.toThrow()

    const mutations: Array<{
      readonly label: string
      readonly apply: (candidate: CommerceProductionRehearsalBundle) => void
    }> = [
      { label: 'source', apply: (candidate) => { delete candidate.sourceMaterials[0]!.ingestReceipt.heldOutCommitmentHash } },
      { label: 'Provider', apply: (candidate) => { delete candidate.artifacts[0]!.receipt.heldOutCommitmentHash } },
      {
        label: 'semantic-QA',
        apply: (candidate) => {
          delete candidate.artifacts.find((artifact) => artifact.semanticQa)!.semanticQa!.receipt.heldOutCommitmentHash
        },
      },
      {
        label: 'playback',
        apply: (candidate) => {
          delete candidate.artifacts.find((artifact) => artifact.playbackSourceReceipt)!
            .playbackSourceReceipt!.heldOutCommitmentHash
        },
      },
    ]
    for (const mutation of mutations) {
      const candidate = structuredClone(bundle)
      mutation.apply(candidate)
      expect(
        () => assertCommerceHeldOutReceiptCommitmentClosure(candidate, commitmentHash),
        mutation.label,
      ).toThrow(new RegExp(mutation.label, 'i'))
    }
  })
})

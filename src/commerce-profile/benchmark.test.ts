import { readFileSync } from 'node:fs'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  COMMERCE_BENCHMARK_ID,
  COMMERCE_BENCHMARK_METRICS,
  COMMERCE_BENCHMARK_VERSION,
  compareCommerceProfileBenchmarkReports,
  createCommerceProfileBenchmarkReport,
  decodeCommerceProfileBenchmarkReport,
  type CommerceBenchmarkEvidenceReference,
  type CommerceBenchmarkStatus,
} from './benchmark'

const HASH = 'a'.repeat(64)
const CURRENT_EVIDENCE_HASH_BY_METRIC: Readonly<Record<string, string>> = {
  'p1.product-facts-normalization': 'd54fccf30dc1bcce89e3d6f90af31b160af2a55ad070eb65523de61c0f406f52',
  'p2.fact-citation-closure': '0690a4223a590f007a420b4697a004eeb54a96158c1da7479ce829908eec9f5f',
  'p3.catalog-closure': '0690a4223a590f007a420b4697a004eeb54a96158c1da7479ce829908eec9f5f',
  'p4.offline-policy-gates': '0690a4223a590f007a420b4697a004eeb54a96158c1da7479ce829908eec9f5f',
  'p5.kernel-profile-composition': '235a8e790959cbd1fe1c1e0c2df6d4a8029ba1c7843fc18ac167c40299bb2839',
  'p6.mocked-deliverable-closure': '159d6d933216b30f0c74df5cb01e5bdebd0a8f6aad64653a1163e20307efa8ee',
  'p6.mocked-targeted-repair': '159d6d933216b30f0c74df5cb01e5bdebd0a8f6aad64653a1163e20307efa8ee',
  'p7.mocked-strategy-evidence': '159d6d933216b30f0c74df5cb01e5bdebd0a8f6aad64653a1163e20307efa8ee',
}
const CURRENT_HOST_AUDIT_HASH = '6f53d2b7e254518b2742e3e32c1573f3882af394c1037034749e0add421ea758'
const REAL_METRIC_IDS = COMMERCE_BENCHMARK_METRICS
  .filter((metric) => metric.tier === 'real-host')
  .map((metric) => metric.id)

function referenceFor(
  metric: (typeof COMMERCE_BENCHMARK_METRICS)[number],
  status: CommerceBenchmarkStatus,
): CommerceBenchmarkEvidenceReference[] {
  const base = {
    id: `evidence:${metric.id}`,
    revision: `evidence:${metric.id}:revision:1`,
    contentHash: HASH,
  }
  if (status !== 'passed') {
    return [{
      ...base,
      kind: 'host-capability-audit',
      binding: { metricId: metric.id, findingCode: 'real-host-evidence-unavailable' },
    }]
  }
  if (metric.tier === 'deterministic') {
    return [{
      ...base,
      kind: 'deterministic-test-run',
      binding: { metricId: metric.id, testIds: metric.assertionIds.map((id) => `test:${id}`) },
    }]
  }
  if (metric.tier === 'mocked-host') {
    return [{
      ...base,
      kind: 'mocked-host-receipt',
      binding: {
        metricId: metric.id,
        receiptId: `receipt:${metric.id}`,
        capabilityId: `capability:${metric.id}`,
        artifactIds: [`artifact:${metric.id}`],
      },
    }]
  }
  const receiptId = `receipt:${metric.id}`
  const artifactId = `artifact:${metric.id}`
  const references: CommerceBenchmarkEvidenceReference[] = [{
    ...base,
    kind: 'real-host-receipt',
    binding: {
      metricId: metric.id,
      receiptId,
      runId: 'run:real-host:1',
      capabilityId: `capability:${metric.id}`,
      artifactIds: [artifactId],
    },
  }]
  if (!metric.id.endsWith('-bytes')) return references
  return [...references, {
    ...base,
    id: `${base.id}:bytes`,
    kind: 'artifact-bytes',
    binding: { metricId: metric.id, receiptId, artifactId, mediaType: 'application/octet-stream', byteLength: 1 },
  }]
}

function evidenceSet(
  statuses: Readonly<Record<string, CommerceBenchmarkStatus>> = {},
  identity = { id: 'benchmark-run:current', revision: 'benchmark-run:current:revision:1' },
) {
  return {
    schema: 'commerce.profile-benchmark-evidence.v1',
    benchmark: { id: COMMERCE_BENCHMARK_ID, version: COMMERCE_BENCHMARK_VERSION },
    identity,
    metrics: COMMERCE_BENCHMARK_METRICS.map((metric) => {
      const status = statuses[metric.id] ?? 'passed'
      const evidenceReferences = referenceFor(metric, status)
      return {
        metricId: metric.id,
        assertions: metric.assertionIds.map((id) => status === 'passed' ? { id, verdict: status } : {
          id,
          verdict: status,
          diagnostic: {
            code: status === 'blocked' ? 'real-host-evidence-unavailable' : 'benchmark-assertion-failed',
            message: status === 'blocked'
              ? 'Real Host execution evidence has not been supplied.'
              : 'The benchmark assertion failed.',
            evidenceReferenceIds: evidenceReferences.map((reference) => reference.id),
          },
        }),
        evidenceReferences,
      }
    }),
  }
}

function currentEvidenceSet() {
  const evidence = evidenceSet(Object.fromEntries(REAL_METRIC_IDS.map((id) => [id, 'blocked'])))
  for (const metric of evidence.metrics) {
    const contentHash = CURRENT_EVIDENCE_HASH_BY_METRIC[metric.metricId] ?? CURRENT_HOST_AUDIT_HASH
    metric.evidenceReferences = metric.evidenceReferences.map((reference) => ({ ...reference, contentHash }))
  }
  return evidence
}

function clone(value: unknown): Record<string, unknown> {
  return structuredClone(value) as Record<string, unknown>
}

describe('Commerce Profile benchmark (P8)', () => {
  if (process.env.CUTOUT_WRITE_COMMERCE_BENCHMARK === '1') {
    writeFileSync('/tmp/cutout-current-commerce-benchmark.json', `${JSON.stringify(
      createCommerceProfileBenchmarkReport(currentEvidenceSet()),
      null,
      2,
    )}\n`)
  }

  it('separates deterministic, mocked, and unavailable real-Host evidence without claiming production readiness', () => {
    const report = createCommerceProfileBenchmarkReport(currentEvidenceSet())

    expect(report.summary).toEqual({
      overall: { total: 16, passed: 8, failed: 0, blocked: 8, ready: false },
      tiers: [
        { tier: 'deterministic', total: 5, passed: 5, failed: 0, blocked: 0, ready: true },
        { tier: 'mocked-host', total: 3, passed: 3, failed: 0, blocked: 0, ready: true },
        { tier: 'real-host', total: 8, passed: 0, failed: 0, blocked: 8, ready: false },
      ],
      productionReady: false,
      productionFrontier: REAL_METRIC_IDS.map((metricId) => ({ metricId, tier: 'real-host', status: 'blocked' })),
    })
  })

  it('never promotes mocked success to real production readiness', () => {
    const report = createCommerceProfileBenchmarkReport(currentEvidenceSet())
    expect(report.summary.tiers.find((tier) => tier.tier === 'mocked-host')?.ready).toBe(true)
    expect(report.summary.productionReady).toBe(false)
  })

  it('rejects a forged real-Host pass backed only by a mocked receipt', () => {
    const evidence = currentEvidenceSet()
    const realMetric = evidence.metrics.find((metric) => metric.metricId === REAL_METRIC_IDS[0])!
    realMetric.assertions = realMetric.assertions.map((assertion) => ({ id: assertion.id, verdict: 'passed' }))
    realMetric.evidenceReferences = [{
      id: `evidence:${realMetric.metricId}`,
      revision: `evidence:${realMetric.metricId}:revision:1`,
      contentHash: HASH,
      kind: 'mocked-host-receipt',
      binding: {
        metricId: realMetric.metricId,
        receiptId: 'receipt:mocked',
        capabilityId: 'capability:mocked',
        artifactIds: ['artifact:mocked'],
      },
    }]

    expect(() => createCommerceProfileBenchmarkReport(evidence)).toThrow(/requires real-host-receipt evidence/)
  })

  it('rejects real artifact bytes that are not bound to the real receipt and artifact', () => {
    const evidence = evidenceSet(Object.fromEntries(REAL_METRIC_IDS.map((id) => [
      id,
      id === 'p6.real-image-bytes' ? 'passed' : 'blocked',
    ])))
    const bytesMetric = evidence.metrics.find((metric) => metric.metricId === 'p6.real-image-bytes')!
    const byteReference = bytesMetric.evidenceReferences.find((reference) => reference.kind === 'artifact-bytes')
    if (!byteReference || byteReference.kind !== 'artifact-bytes') throw new Error('Missing byte evidence fixture.')
    byteReference.binding.artifactId = 'artifact:not-on-receipt'

    expect(() => createCommerceProfileBenchmarkReport(evidence)).toThrow(/must bind a real Host receipt and artifact/)
  })

  it('fails closed when caller-authored real receipts and byte labels claim a pass', () => {
    expect(() => createCommerceProfileBenchmarkReport(evidenceSet()))
      .toThrow(/cannot pass until a trusted Host verification contract is installed/)
  })

  it('rejects missing, duplicate, and reordered metric closure', () => {
    const missing = currentEvidenceSet()
    missing.metrics.pop()
    expect(() => createCommerceProfileBenchmarkReport(missing)).toThrow(/exact ordered Commerce benchmark closure/)

    const duplicate = currentEvidenceSet()
    duplicate.metrics[1] = structuredClone(duplicate.metrics[0])
    expect(() => createCommerceProfileBenchmarkReport(duplicate)).toThrow(/metric ids must be unique/)

    const reordered = currentEvidenceSet()
    const first = reordered.metrics[0]
    reordered.metrics[0] = reordered.metrics[1]
    reordered.metrics[1] = first
    expect(() => createCommerceProfileBenchmarkReport(reordered)).toThrow(/exact ordered Commerce benchmark closure/)
  })

  it('rejects caller-authored metric status, diagnostics, summary, and evidence bindings', () => {
    const report = createCommerceProfileBenchmarkReport(currentEvidenceSet())
    const statusTamper = clone(report)
    ;(statusTamper.metrics as Array<Record<string, unknown>>)[0].status = 'failed'
    expect(() => decodeCommerceProfileBenchmarkReport(statusTamper)).toThrow(/status is not derived/)

    const summaryTamper = clone(report)
    ;((summaryTamper.summary as Record<string, unknown>).overall as Record<string, unknown>).passed = 16
    expect(() => decodeCommerceProfileBenchmarkReport(summaryTamper)).toThrow(/summary and readiness must be derived/)

    const bindingTamper = clone(report)
    const reference = ((bindingTamper.metrics as Array<Record<string, unknown>>)[0]
      .evidenceReferences as Array<Record<string, unknown>>)[0]
    ;(reference.binding as Record<string, unknown>).metricId = 'p2.fact-citation-closure'
    expect(() => decodeCommerceProfileBenchmarkReport(bindingTamper)).toThrow(/bound to another metric/)
  })

  it('reports deterministic ordered transitions, newly passed metrics, and regressions', () => {
    const prior = createCommerceProfileBenchmarkReport(evidenceSet({
      'p1.product-facts-normalization': 'failed',
      'p6.mocked-deliverable-closure': 'passed',
      ...Object.fromEntries(REAL_METRIC_IDS.map((id) => [id, 'blocked'])),
    }, { id: 'benchmark-run:prior', revision: 'benchmark-run:prior:revision:1' }))
    const current = createCommerceProfileBenchmarkReport(evidenceSet({
      'p1.product-facts-normalization': 'passed',
      'p6.mocked-deliverable-closure': 'failed',
      ...Object.fromEntries(REAL_METRIC_IDS.map((id) => [id, 'blocked'])),
    }, { id: 'benchmark-run:next', revision: 'benchmark-run:next:revision:1' }))

    const comparison = compareCommerceProfileBenchmarkReports(prior, current)
    expect(comparison.transitions).toEqual([
      { metricId: 'p1.product-facts-normalization', tier: 'deterministic', from: 'failed', to: 'passed' },
      { metricId: 'p6.mocked-deliverable-closure', tier: 'mocked-host', from: 'passed', to: 'failed' },
    ])
    expect(comparison.newlyPassed).toEqual(['p1.product-facts-normalization'])
    expect(comparison.regressions).toEqual(['p6.mocked-deliverable-closure'])
  })

  it('rejects incompatible benchmark identity and metric closure', () => {
    const prior = createCommerceProfileBenchmarkReport(currentEvidenceSet())
    const incompatibleIdentity = clone(prior)
    ;(incompatibleIdentity.benchmark as Record<string, unknown>).version = 2
    expect(() => compareCommerceProfileBenchmarkReports(incompatibleIdentity, prior)).toThrow(/benchmark identity/)

    const incompatibleClosure = clone(prior)
    ;(incompatibleClosure.metrics as unknown[]).pop()
    expect(() => compareCommerceProfileBenchmarkReports(incompatibleClosure, prior)).toThrow(/exact ordered Commerce benchmark closure/)
  })

  it('decodes the committed current capability snapshot', () => {
    const snapshot = JSON.parse(readFileSync(resolve(
      process.cwd(),
      'src/commerce-profile/benchmarks/current.json',
    ), 'utf8'))
    const report = decodeCommerceProfileBenchmarkReport(snapshot)
    const expected = createCommerceProfileBenchmarkReport(currentEvidenceSet())

    expect(report).toEqual(expected)
    expect(report.summary.productionReady).toBe(false)
    expect(report.summary.productionFrontier.map((entry) => entry.metricId)).toEqual(REAL_METRIC_IDS)
  })
})

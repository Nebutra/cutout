import { describe, expect, it } from 'vitest'
import commerceCurrent from '@/commerce-profile/benchmarks/contract-baseline.json'
import designOsCurrent from './benchmarks/contract-baseline.json'
import {
  compareDesignOsBenchmarkReports,
  decodeDesignOsBenchmarkReport,
  deriveDesignOsBenchmarkSummary,
  type DesignOsBenchmarkReport,
} from './contracts'
import { createDesignOsBenchmarkFromCommerce } from './commerce'

async function currentReport(): Promise<DesignOsBenchmarkReport> {
  return createDesignOsBenchmarkFromCommerce({
    commerceReport: commerceCurrent,
    identity: {
      id: 'benchmark-run:design-os:current',
      revision: 'benchmark-run:design-os:current:revision:1',
    },
  })
}

function clone(report: DesignOsBenchmarkReport): DesignOsBenchmarkReport {
  return structuredClone(report)
}

function settleSummary(report: DesignOsBenchmarkReport): void {
  report.summary = deriveDesignOsBenchmarkSummary(report.metrics)
}

describe('Design OS evidence benchmark', () => {
  it('projects the truthful Commerce maturity frontier', async () => {
    const report = await currentReport()

    expect(report.summary).toEqual({
      overall: { total: 14, passed: 5, failed: 0, blocked: 9, ready: false },
      coverage: { passed: 5, total: 14, basisPoints: 3_571 },
      stages: [
        { stage: 'contract', total: 5, passed: 5, failed: 0, blocked: 0, ready: true },
        { stage: 'real-host', total: 8, passed: 0, failed: 0, blocked: 8, ready: false },
        { stage: 'production-rehearsal', total: 1, passed: 0, failed: 0, blocked: 1, ready: false },
      ],
      maturity: 'contract',
      nextStage: 'real-host',
      criticalFrontier: report.metrics.slice(5, 13).map((metric) => ({
        metricId: metric.id,
        stage: 'real-host',
        status: 'blocked',
      })),
      productionReady: false,
    })
  })

  it('keeps the durable contract baseline equal to the regenerated Profile projection', async () => {
    const regenerated = await currentReport()
    expect(decodeDesignOsBenchmarkReport(designOsCurrent)).toEqual(regenerated)
  })

  it('rejects reordered closure, metadata drift, source drift, and caller-authored summary', async () => {
    const report = await currentReport()

    const reordered = clone(report)
    reordered.metrics.reverse()
    expect(() => decodeDesignOsBenchmarkReport(reordered)).toThrow(/exact ordered Design OS benchmark closure/)

    const missing = clone(report)
    missing.metrics.pop()
    expect(() => decodeDesignOsBenchmarkReport(missing)).toThrow(/exact ordered Design OS benchmark closure/)

    const duplicated = clone(report)
    duplicated.metrics[1] = structuredClone(duplicated.metrics[0]!)
    expect(() => decodeDesignOsBenchmarkReport(duplicated)).toThrow(/exact ordered Design OS benchmark closure/)

    const relabeled = clone(report)
    relabeled.metrics[0]!.label = 'A nicer score'
    expect(() => decodeDesignOsBenchmarkReport(relabeled)).toThrow(/metadata drifted/)

    const rebound = clone(report)
    rebound.metrics[0]!.source.sourceReportId = 'source-report:unverified'
    expect(() => decodeDesignOsBenchmarkReport(rebound)).toThrow(/source drifted/)

    const auditDrift = clone(report)
    const rehearsal = auditDrift.metrics.at(-1)!
    if (rehearsal.source.kind !== 'profile-capability-audit') throw new Error('Missing audit fixture.')
    rehearsal.source.findingCode = 'caller-authored-audit'
    expect(() => decodeDesignOsBenchmarkReport(auditDrift)).toThrow(/audit source drifted/)

    const summarized = clone(report)
    summarized.summary.productionReady = true
    expect(() => decodeDesignOsBenchmarkReport(summarized)).toThrow(/summary must be derived/)
  })

  it('rejects old v1 and conformance-shaped reports as current evidence', async () => {
    const oldV1 = clone(await currentReport())
    oldV1.benchmark.version = 1
    expect(() => decodeDesignOsBenchmarkReport(oldV1)).toThrow(/Unsupported Design OS benchmark/)

    const oldStage = clone(await currentReport()) as unknown as { summary: { stages: unknown[] } }
    oldStage.summary.stages.splice(1, 0, {
      stage: 'conformance', total: 3, passed: 3, failed: 0, blocked: 0, ready: true,
    })
    expect(() => decodeDesignOsBenchmarkReport(oldStage)).toThrow()
  })

  it('keeps the normal decoder fail-closed for a caller-authored rehearsal pass', async () => {
    const passed = clone(await currentReport())
    const rehearsal = passed.metrics.at(-1)!
    rehearsal.status = 'passed'
    delete rehearsal.diagnostic
    settleSummary(passed)

    expect(() => decodeDesignOsBenchmarkReport(passed))
      .toThrow(/requires the native held-out rehearsal decoder/)

    const blockedWithAdmission = clone(await currentReport())
    const blockedAudit = blockedWithAdmission.metrics.at(-1)!
    if (blockedAudit.source.kind !== 'profile-capability-audit') throw new Error('Missing audit fixture.')
    blockedAudit.source.admission = {
      protocol: 'cutout.commerce-held-out-admission.v2',
      challengeId: 'challenge:caller',
      challengeHash: 'd'.repeat(64),
      evaluatorKeyId: 'evaluator:caller',
      hostBuildVersion: '0.1.24',
      commitmentId: 'commitment:caller',
      commitmentHash: 'a'.repeat(64),
      attestationId: 'attestation:caller',
      inputManifestHash: 'b'.repeat(64),
      runId: 'run:caller',
      bundleHash: 'c'.repeat(64),
      commitmentIssuedAt: 1,
      evaluatorCompletedAt: 2,
      deliverableCount: 11,
    }
    expect(() => decodeDesignOsBenchmarkReport(blockedWithAdmission))
      .toThrow(/cannot carry admission evidence/)
  })

  it('strictly decodes the Profile source before projection and binds its canonical hash', async () => {
    const tamperedCommerce = structuredClone(commerceCurrent)
    tamperedCommerce.summary.productionReady = true
    await expect(createDesignOsBenchmarkFromCommerce({
      commerceReport: tamperedCommerce,
      identity: { id: 'benchmark-run:tampered', revision: 'benchmark-run:tampered:revision:1' },
    })).rejects.toThrow(/summary and readiness must be derived/)

    const generated = await currentReport()
    const persisted = decodeDesignOsBenchmarkReport(designOsCurrent)
    expect(persisted).toEqual(generated)
    expect(persisted.profiles[0]!.sourceReport.contentHash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('keeps maturity contiguous instead of allowing a later stage to skip a failed gate', async () => {
    const report = await currentReport()
    for (const metric of report.metrics.filter((candidate) => candidate.stage === 'real-host')) {
      metric.status = 'passed'
      delete metric.diagnostic
    }
    const failedContract = report.metrics[0]!
    failedContract.status = 'failed'
    failedContract.diagnostic = { code: 'regression', message: 'The contract regressed.' }
    settleSummary(report)

    const decoded = decodeDesignOsBenchmarkReport(report)
    expect(decoded.summary.coverage.passed).toBe(12)
    expect(decoded.summary.maturity).toBe('unproven')
    expect(decoded.summary.nextStage).toBe('contract')
    expect(decoded.summary.productionReady).toBe(false)
  })

  it('reports progress and treats any critical passed-to-non-passed transition as a release regression', async () => {
    const baseline = await currentReport()
    const prior = clone(baseline)
    prior.identity = { id: 'benchmark-run:prior', revision: 'benchmark-run:prior:revision:1' }
    const priorMetric = prior.metrics[4]!
    priorMetric.status = 'blocked'
    priorMetric.diagnostic = { code: 'not-yet-proven', message: 'Evidence was not yet available.' }
    settleSummary(prior)

    const progress = compareDesignOsBenchmarkReports(prior, baseline)
    expect(progress.newlyPassed).toEqual([baseline.metrics[4]!.id])
    expect(progress.stageTransitions).toEqual([{ stage: 'contract', from: 'not-ready', to: 'ready' }])
    expect(progress.coverageDeltaBasisPoints).toBeGreaterThan(0)
    expect(progress.releaseRegression).toBe(false)

    const regressed = clone(baseline)
    regressed.identity = { id: 'benchmark-run:regressed', revision: 'benchmark-run:regressed:revision:1' }
    const contractMetric = regressed.metrics[0]!
    contractMetric.status = 'failed'
    contractMetric.diagnostic = { code: 'contract-regression', message: 'The contract no longer conforms.' }
    const rehearsalMetric = regressed.metrics.at(-1)!
    rehearsalMetric.status = 'passed'
    delete rehearsalMetric.diagnostic
    settleSummary(regressed)

    expect(() => compareDesignOsBenchmarkReports(baseline, regressed))
      .toThrow(/requires the native held-out rehearsal decoder/)
  })

  it('rejects an incompatible benchmark ruler before comparison', async () => {
    const report = await currentReport()
    const incompatible = clone(report)
    incompatible.benchmark.version += 1
    expect(() => compareDesignOsBenchmarkReports(report, incompatible)).toThrow(/Unsupported Design OS benchmark/)
  })
})

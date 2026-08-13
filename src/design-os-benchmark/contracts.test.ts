import { describe, expect, it } from 'vitest'
import commerceCurrent from '@/commerce-profile/benchmarks/current.json'
import designOsCurrent from './benchmarks/current.json'
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
      overall: { total: 17, passed: 8, failed: 0, blocked: 9, ready: false },
      coverage: { passed: 8, total: 17, basisPoints: 4_706 },
      stages: [
        { stage: 'contract', total: 5, passed: 5, failed: 0, blocked: 0, ready: true },
        { stage: 'conformance', total: 3, passed: 3, failed: 0, blocked: 0, ready: true },
        { stage: 'real-host', total: 8, passed: 0, failed: 0, blocked: 8, ready: false },
        { stage: 'production-rehearsal', total: 1, passed: 0, failed: 0, blocked: 1, ready: false },
      ],
      maturity: 'conformance',
      nextStage: 'real-host',
      criticalFrontier: report.metrics.slice(8, 16).map((metric) => ({
        metricId: metric.id,
        stage: 'real-host',
        status: 'blocked',
      })),
      productionReady: false,
    })
  })

  it('keeps the durable current snapshot equal to the regenerated Profile projection', async () => {
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
    expect(decoded.summary.coverage.passed).toBe(15)
    expect(decoded.summary.maturity).toBe('unproven')
    expect(decoded.summary.nextStage).toBe('contract')
    expect(decoded.summary.productionReady).toBe(false)
  })

  it('reports progress and treats any critical passed-to-non-passed transition as a release regression', async () => {
    const baseline = await currentReport()
    const prior = clone(baseline)
    prior.identity = { id: 'benchmark-run:prior', revision: 'benchmark-run:prior:revision:1' }
    const priorMetric = prior.metrics[7]!
    priorMetric.status = 'blocked'
    priorMetric.diagnostic = { code: 'not-yet-proven', message: 'Evidence was not yet available.' }
    settleSummary(prior)

    const progress = compareDesignOsBenchmarkReports(prior, baseline)
    expect(progress.newlyPassed).toEqual([baseline.metrics[7]!.id])
    expect(progress.stageTransitions).toEqual([{ stage: 'conformance', from: 'not-ready', to: 'ready' }])
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

    const comparison = compareDesignOsBenchmarkReports(baseline, regressed)
    expect(comparison.regressions).toEqual([contractMetric.id])
    expect(comparison.criticalRegressions).toEqual([contractMetric.id])
    expect(comparison.newlyPassed).toEqual([rehearsalMetric.id])
    expect(comparison.stageTransitions).toEqual([
      { stage: 'contract', from: 'ready', to: 'not-ready' },
      { stage: 'production-rehearsal', from: 'not-ready', to: 'ready' },
    ])
    expect(comparison.releaseRegression).toBe(true)
  })

  it('rejects an incompatible benchmark ruler before comparison', async () => {
    const report = await currentReport()
    const incompatible = clone(report)
    incompatible.benchmark.version += 1
    expect(() => compareDesignOsBenchmarkReports(report, incompatible)).toThrow(/Unsupported Design OS benchmark/)
  })
})

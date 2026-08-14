import {
  createCommerceProfileBenchmarkReportFromRehearsal,
  createCommerceProfileBenchmarkReportFromHeldOutRehearsal,
  decodeCommerceProfileBenchmarkReport,
  type CommerceProfileBenchmarkReport,
} from '@/commerce-profile/benchmark'
import type { CommerceHeldOutAdmission } from '@/commerce-profile/held-out'
import { canonicalJson, fingerprint } from '@/design-ir/fingerprint'
import {
  DESIGN_OS_BENCHMARK_RULER,
  assembleDesignOsBenchmarkReport,
  decodeDesignOsBenchmarkReport,
  deriveDesignOsBenchmarkSummary,
  designOsBenchmarkReportSchema,
  type DesignOsBenchmarkReport,
} from './contracts'

const COMMERCE_PROFILE_ID = 'commerce'
const REHEARSAL_METRIC_ID = 'commerce.production-rehearsal.complete-run'

function admitProductionRehearsalAudit(input: {
  readonly report: DesignOsBenchmarkReport
  readonly sourceReportId: string
  readonly admission: CommerceHeldOutAdmission
}): DesignOsBenchmarkReport {
  const rehearsalDefinition = DESIGN_OS_BENCHMARK_RULER.metrics.find((metric) => (
    metric.id === REHEARSAL_METRIC_ID
  ))
  const metric = input.report.metrics.find((candidate) => candidate.id === REHEARSAL_METRIC_ID)
  if (!rehearsalDefinition || rehearsalDefinition.sourceMetricId
    || !rehearsalDefinition.auditFindingCode
    || !metric || metric.source.kind !== 'profile-capability-audit'
    || metric.source.sourceReportId !== input.sourceReportId
    || metric.source.findingCode !== rehearsalDefinition.auditFindingCode
    || metric.status !== 'blocked') {
    throw new Error('Design OS production rehearsal admission requires the exact blocked audit frontier.')
  }
  const metrics = input.report.metrics.map((candidate) => candidate.id === REHEARSAL_METRIC_ID
    ? {
        ...candidate,
        status: 'passed' as const,
        source: { ...candidate.source, admission: input.admission },
        diagnostic: undefined,
      }
    : candidate)
  return designOsBenchmarkReportSchema.parse({
    ...input.report,
    metrics,
    summary: deriveDesignOsBenchmarkSummary(metrics),
  })
}

export async function createDesignOsBenchmarkFromCommerce(input: {
  readonly commerceReport: unknown
  readonly identity: { readonly id: string; readonly revision: string }
}): Promise<DesignOsBenchmarkReport> {
  const commerce = decodeCommerceProfileBenchmarkReport(input.commerceReport)
  return createDesignOsBenchmarkFromDecodedCommerce({
    commerce,
    identity: input.identity,
  })
}

async function createDesignOsBenchmarkFromDecodedCommerce(input: {
  readonly commerce: CommerceProfileBenchmarkReport
  readonly identity: { readonly id: string; readonly revision: string }
}): Promise<DesignOsBenchmarkReport> {
  const commerce = input.commerce
  const profileDefinition = DESIGN_OS_BENCHMARK_RULER.profiles.find((profile) => (
    profile.id === COMMERCE_PROFILE_ID
  ))
  if (!profileDefinition) throw new Error('Commerce is missing from the Design OS benchmark ruler.')
  const sourceReportId = `source-report:commerce:${commerce.identity.id}`
  const sourceReport = {
    id: sourceReportId,
    schema: commerce.schema,
    benchmark: commerce.benchmark,
    identity: commerce.identity,
    contentHash: await fingerprint(commerce),
  }
  const commerceMetricById = new Map(commerce.metrics.map((metric) => [metric.id, metric]))
  const metricEvidence = DESIGN_OS_BENCHMARK_RULER.metrics.map((definition) => {
    if (definition.profileId !== COMMERCE_PROFILE_ID) {
      throw new Error(`Unsupported Design OS benchmark Profile adapter: ${definition.profileId}`)
    }
    if (!definition.sourceMetricId) {
      if (definition.id !== REHEARSAL_METRIC_ID) {
        throw new Error(`Commerce audit mapping is missing for ${definition.id}.`)
      }
      if (!definition.auditFindingCode) {
        throw new Error(`Commerce audit finding is missing for ${definition.id}.`)
      }
      return {
        id: definition.id,
        status: 'blocked' as const,
        source: {
          kind: 'profile-capability-audit' as const,
          sourceReportId,
          findingCode: definition.auditFindingCode,
        },
        diagnostic: {
          code: definition.auditFindingCode,
          message: 'No complete unseen-input Commerce production rehearsal bundle is available.',
        },
      }
    }
    const sourceMetric = commerceMetricById.get(definition.sourceMetricId)
    if (!sourceMetric) {
      throw new Error(`Commerce source metric is missing: ${definition.sourceMetricId}`)
    }
    const sourceDiagnostic = sourceMetric.diagnostics[0]
    return {
      id: definition.id,
      status: sourceMetric.status,
      source: {
        kind: 'profile-report-metric' as const,
        sourceReportId,
        sourceMetricId: sourceMetric.id,
      },
      diagnostic: sourceMetric.status === 'passed' ? undefined : {
        code: sourceDiagnostic?.code ?? 'profile-metric-not-passed',
        message: sourceDiagnostic?.message ?? `Commerce metric is ${sourceMetric.status}: ${sourceMetric.id}`,
      },
    }
  })
  return assembleDesignOsBenchmarkReport({
    identity: input.identity,
    profiles: [{
      id: profileDefinition.id,
      label: profileDefinition.label,
      sourceReport,
    }],
    metricEvidence,
  })
}

export async function createDesignOsBenchmarkFromCommerceRehearsal(input: {
  readonly baselineCommerceReport: unknown
  readonly rehearsalBundle: unknown
  readonly identity: { readonly id: string; readonly revision: string }
}): Promise<DesignOsBenchmarkReport> {
  const { report } = await createCommerceProfileBenchmarkReportFromRehearsal({
    baselineReport: input.baselineCommerceReport,
    rehearsalBundle: input.rehearsalBundle,
  })
  return createDesignOsBenchmarkFromDecodedCommerce({
    commerce: report,
    identity: input.identity,
  })
}

export async function decodeDesignOsBenchmarkFromCommerceRehearsal(input: {
  readonly report: unknown
  readonly baselineCommerceReport: unknown
  readonly rehearsalBundle: unknown
  readonly identity: { readonly id: string; readonly revision: string }
}): Promise<DesignOsBenchmarkReport> {
  const expected = await createDesignOsBenchmarkFromCommerceRehearsal(input)
  const candidate = decodeDesignOsBenchmarkReport(input.report)
  if (canonicalJson(candidate) !== canonicalJson(expected)) {
    throw new Error('Design OS report does not match its reverified Commerce rehearsal bundle.')
  }
  return expected
}

export async function createDesignOsBenchmarkFromCommerceHeldOutRehearsal(input: {
  readonly baselineCommerceReport: unknown
  readonly rehearsalBundle: unknown
  readonly commitment: unknown
  readonly evaluatorAttestation: unknown
  readonly identity: { readonly id: string; readonly revision: string }
}): Promise<DesignOsBenchmarkReport> {
  const { report, admission } = await createCommerceProfileBenchmarkReportFromHeldOutRehearsal({
    baselineReport: input.baselineCommerceReport,
    rehearsalBundle: input.rehearsalBundle,
    commitment: input.commitment,
    evaluatorAttestation: input.evaluatorAttestation,
  })
  const projected = await createDesignOsBenchmarkFromDecodedCommerce({
    commerce: report,
    identity: input.identity,
  })
  const sourceReportId = projected.profiles.find((profile) => profile.id === COMMERCE_PROFILE_ID)
    ?.sourceReport.id
  if (!sourceReportId) throw new Error('Admitted Commerce source report is missing.')
  return admitProductionRehearsalAudit({ report: projected, sourceReportId, admission })
}

export async function decodeDesignOsBenchmarkFromCommerceHeldOutRehearsal(input: {
  readonly report: unknown
  readonly baselineCommerceReport: unknown
  readonly rehearsalBundle: unknown
  readonly commitment: unknown
  readonly evaluatorAttestation: unknown
  readonly identity: { readonly id: string; readonly revision: string }
}): Promise<DesignOsBenchmarkReport> {
  const expected = await createDesignOsBenchmarkFromCommerceHeldOutRehearsal(input)
  const candidate = designOsBenchmarkReportSchema.parse(input.report)
  if (canonicalJson(candidate) !== canonicalJson(expected)) {
    throw new Error('Design OS report does not match its admitted held-out Commerce rehearsal.')
  }
  return expected
}

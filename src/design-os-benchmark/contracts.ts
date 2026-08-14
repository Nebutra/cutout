import { z } from 'zod'
import rulerInput from './ruler.json' with { type: 'json' }

export const DESIGN_OS_BENCHMARK_SCHEMA = 'design-os.benchmark-report.v1' as const
export const DESIGN_OS_BENCHMARK_COMPARISON_SCHEMA = 'design-os.benchmark-comparison.v1' as const
export const DESIGN_OS_BENCHMARK_ID = 'benchmark:design-os:production-maturity' as const
export const DESIGN_OS_BENCHMARK_VERSION = 2 as const

export const designOsBenchmarkStageSchema = z.enum([
  'contract',
  'real-host',
  'production-rehearsal',
])
export type DesignOsBenchmarkStage = z.infer<typeof designOsBenchmarkStageSchema>

export const DESIGN_OS_BENCHMARK_STAGES: readonly DesignOsBenchmarkStage[] = Object.freeze([
  'contract',
  'real-host',
  'production-rehearsal',
])

export const designOsBenchmarkStatusSchema = z.enum(['passed', 'failed', 'blocked'])
export type DesignOsBenchmarkStatus = z.infer<typeof designOsBenchmarkStatusSchema>

export const designOsBenchmarkMaturitySchema = z.enum([
  'unproven',
  ...DESIGN_OS_BENCHMARK_STAGES,
])
export type DesignOsBenchmarkMaturity = z.infer<typeof designOsBenchmarkMaturitySchema>

const idSchema = z.string().min(1).max(240)
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const benchmarkIdentitySchema = z.object({
  id: idSchema,
  version: z.number().int().positive(),
}).strict()
const reportIdentitySchema = z.object({
  id: idSchema,
  revision: idSchema,
}).strict()

const rulerSchema = z.object({
  schema: z.literal('design-os.benchmark-ruler.v1'),
  benchmark: benchmarkIdentitySchema,
  stages: z.array(z.object({
    id: designOsBenchmarkStageSchema,
    label: z.string().min(1).max(120),
  }).strict()).length(DESIGN_OS_BENCHMARK_STAGES.length),
  profiles: z.array(z.object({
    id: idSchema,
    label: z.string().min(1).max(120),
    sourceSchema: idSchema,
    sourceBenchmark: benchmarkIdentitySchema,
  }).strict()).min(1).max(100),
  metrics: z.array(z.object({
    id: idSchema,
    profileId: idSchema,
    stage: designOsBenchmarkStageSchema,
    label: z.string().min(1).max(240),
    critical: z.boolean(),
    sourceMetricId: idSchema.optional(),
    auditFindingCode: idSchema.optional(),
  }).strict().superRefine((metric, context) => {
    if (Boolean(metric.sourceMetricId) === Boolean(metric.auditFindingCode)) {
      context.addIssue({
        code: 'custom',
        message: 'Each Design OS benchmark metric requires exactly one source metric or audit finding.',
      })
    }
  })).min(1).max(1_000),
}).strict()

export const DESIGN_OS_BENCHMARK_RULER = rulerSchema.parse(rulerInput)

const sourceReportSchema = z.object({
  id: idSchema,
  schema: idSchema,
  benchmark: benchmarkIdentitySchema,
  identity: reportIdentitySchema,
  contentHash: sha256Schema,
}).strict()

const profileReportSourceSchema = z.object({
  kind: z.literal('profile-report-metric'),
  sourceReportId: idSchema,
  sourceMetricId: idSchema,
}).strict()

const capabilityAuditSourceSchema = z.object({
  kind: z.literal('profile-capability-audit'),
  sourceReportId: idSchema,
  findingCode: idSchema,
  admission: z.object({
    protocol: idSchema,
    challengeId: idSchema,
    challengeHash: sha256Schema,
    evaluatorKeyId: idSchema,
    hostBuildVersion: idSchema,
    commitmentId: idSchema,
    commitmentHash: sha256Schema,
    attestationId: idSchema,
    inputManifestHash: sha256Schema,
    runId: idSchema,
    bundleHash: sha256Schema,
    commitmentIssuedAt: z.number().int().nonnegative(),
    evaluatorCompletedAt: z.number().int().nonnegative(),
    deliverableCount: z.literal(11),
  }).strict().optional(),
}).strict()

const metricSourceSchema = z.discriminatedUnion('kind', [
  profileReportSourceSchema,
  capabilityAuditSourceSchema,
])

const diagnosticSchema = z.object({
  code: idSchema,
  message: z.string().min(1).max(2_000),
}).strict()

const metricSchema = z.object({
  id: idSchema,
  profileId: idSchema,
  stage: designOsBenchmarkStageSchema,
  label: z.string().min(1).max(240),
  critical: z.boolean(),
  status: designOsBenchmarkStatusSchema,
  source: metricSourceSchema,
  diagnostic: diagnosticSchema.optional(),
}).strict().superRefine((metric, context) => {
  if (metric.status === 'passed' && metric.diagnostic) {
    context.addIssue({ code: 'custom', message: 'Passing Design OS metrics cannot carry diagnostics.' })
  }
  if (metric.status !== 'passed' && !metric.diagnostic) {
    context.addIssue({ code: 'custom', message: 'Non-passing Design OS metrics require a diagnostic.' })
  }
})

const countSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  blocked: z.number().int().nonnegative(),
  ready: z.boolean(),
}).strict()

const benchmarkSummarySchema = z.object({
  overall: countSummarySchema,
  coverage: z.object({
    passed: z.number().int().nonnegative(),
    total: z.number().int().positive(),
    basisPoints: z.number().int().min(0).max(10_000),
  }).strict(),
  stages: z.array(z.object({
    stage: designOsBenchmarkStageSchema,
  }).extend(countSummarySchema.shape).strict()).length(DESIGN_OS_BENCHMARK_STAGES.length),
  maturity: designOsBenchmarkMaturitySchema,
  nextStage: designOsBenchmarkStageSchema.nullable(),
  criticalFrontier: z.array(z.object({
    metricId: idSchema,
    stage: designOsBenchmarkStageSchema,
    status: z.enum(['failed', 'blocked']),
  }).strict()).max(1_000),
  productionReady: z.boolean(),
}).strict()

export const designOsBenchmarkReportSchema = z.object({
  schema: z.literal(DESIGN_OS_BENCHMARK_SCHEMA),
  benchmark: benchmarkIdentitySchema,
  identity: reportIdentitySchema,
  profiles: z.array(z.object({
    id: idSchema,
    label: z.string().min(1).max(120),
    sourceReport: sourceReportSchema,
  }).strict()).min(1).max(100),
  metrics: z.array(metricSchema).min(1).max(1_000),
  summary: benchmarkSummarySchema,
}).strict()
export type DesignOsBenchmarkReport = z.infer<typeof designOsBenchmarkReportSchema>

const transitionSchema = z.object({
  metricId: idSchema,
  profileId: idSchema,
  stage: designOsBenchmarkStageSchema,
  critical: z.boolean(),
  from: designOsBenchmarkStatusSchema,
  to: designOsBenchmarkStatusSchema,
}).strict()

const stageTransitionSchema = z.object({
  stage: designOsBenchmarkStageSchema,
  from: z.enum(['ready', 'not-ready']),
  to: z.enum(['ready', 'not-ready']),
}).strict()

export const designOsBenchmarkComparisonSchema = z.object({
  schema: z.literal(DESIGN_OS_BENCHMARK_COMPARISON_SCHEMA),
  benchmark: benchmarkIdentitySchema,
  prior: reportIdentitySchema,
  current: reportIdentitySchema,
  transitions: z.array(transitionSchema).max(1_000),
  stageTransitions: z.array(stageTransitionSchema).max(DESIGN_OS_BENCHMARK_STAGES.length),
  newlyPassed: z.array(idSchema).max(1_000),
  regressions: z.array(idSchema).max(1_000),
  criticalRegressions: z.array(idSchema).max(1_000),
  coverageDeltaBasisPoints: z.number().int().min(-10_000).max(10_000),
  maturity: z.object({
    from: designOsBenchmarkMaturitySchema,
    to: designOsBenchmarkMaturitySchema,
  }).strict(),
  releaseRegression: z.boolean(),
}).strict()
export type DesignOsBenchmarkComparison = z.infer<typeof designOsBenchmarkComparisonSchema>

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const object = value as Record<string, unknown>
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`
}

function assertExactOrderedClosure(actual: readonly string[], expected: readonly string[], label: string): void {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new Error(`${label} must match the exact ordered Design OS benchmark closure.`)
  }
}

function assertRuler(): void {
  const ruler = DESIGN_OS_BENCHMARK_RULER
  if (ruler.benchmark.id !== DESIGN_OS_BENCHMARK_ID
    || ruler.benchmark.version !== DESIGN_OS_BENCHMARK_VERSION) {
    throw new Error('Design OS benchmark ruler identity drifted.')
  }
  assertExactOrderedClosure(
    ruler.stages.map((stage) => stage.id),
    DESIGN_OS_BENCHMARK_STAGES,
    'Ruler stages',
  )
  const profileIds = ruler.profiles.map((profile) => profile.id)
  const metricIds = ruler.metrics.map((metric) => metric.id)
  if (new Set(profileIds).size !== profileIds.length || new Set(metricIds).size !== metricIds.length) {
    throw new Error('Design OS benchmark ruler ids must be unique.')
  }
  const knownProfiles = new Set(profileIds)
  if (ruler.metrics.some((metric) => !knownProfiles.has(metric.profileId))) {
    throw new Error('Design OS benchmark ruler metrics must bind a known Profile.')
  }
}

assertRuler()

function countStatuses(statuses: readonly DesignOsBenchmarkStatus[]) {
  const passed = statuses.filter((status) => status === 'passed').length
  const failed = statuses.filter((status) => status === 'failed').length
  const blocked = statuses.filter((status) => status === 'blocked').length
  return { total: statuses.length, passed, failed, blocked, ready: statuses.length > 0 && passed === statuses.length }
}

export function deriveDesignOsBenchmarkSummary(
  metrics: readonly z.infer<typeof metricSchema>[],
): z.infer<typeof benchmarkSummarySchema> {
  const overall = countStatuses(metrics.map((metric) => metric.status))
  const stages = DESIGN_OS_BENCHMARK_STAGES.map((stage) => ({
    stage,
    ...countStatuses(metrics.filter((metric) => metric.stage === stage).map((metric) => metric.status)),
  }))
  let maturity: DesignOsBenchmarkMaturity = 'unproven'
  for (const stage of stages) {
    if (!stage.ready) break
    maturity = stage.stage
  }
  const nextStage = stages.find((stage) => !stage.ready)?.stage ?? null
  return {
    overall,
    coverage: {
      passed: overall.passed,
      total: overall.total,
      basisPoints: Math.round((overall.passed / overall.total) * 10_000),
    },
    stages,
    maturity,
    nextStage,
    criticalFrontier: nextStage === null ? [] : metrics.flatMap((metric) => (
      metric.stage === nextStage && metric.critical && metric.status !== 'passed'
        ? [{ metricId: metric.id, stage: metric.stage, status: metric.status }]
        : []
    )),
    productionReady: stages.every((stage) => stage.ready),
  }
}

export function assembleDesignOsBenchmarkReport(input: {
  readonly identity: { readonly id: string; readonly revision: string }
  readonly profiles: DesignOsBenchmarkReport['profiles']
  readonly metricEvidence: readonly Pick<DesignOsBenchmarkReport['metrics'][number], 'id' | 'status' | 'source' | 'diagnostic'>[]
}): DesignOsBenchmarkReport {
  const evidenceById = new Map(input.metricEvidence.map((metric) => [metric.id, metric]))
  if (evidenceById.size !== input.metricEvidence.length) {
    throw new Error('Design OS benchmark metric evidence ids must be unique.')
  }
  const metrics = DESIGN_OS_BENCHMARK_RULER.metrics.map((definition) => {
    const evidence = evidenceById.get(definition.id)
    if (!evidence) throw new Error(`Design OS benchmark evidence is missing for ${definition.id}.`)
    return metricSchema.parse({
      id: definition.id,
      profileId: definition.profileId,
      stage: definition.stage,
      label: definition.label,
      critical: definition.critical,
      status: evidence.status,
      source: evidence.source,
      ...(evidence.diagnostic ? { diagnostic: evidence.diagnostic } : {}),
    })
  })
  if (input.metricEvidence.length !== metrics.length) {
    throw new Error('Design OS benchmark evidence contains metrics outside the ruler.')
  }
  return decodeDesignOsBenchmarkReport({
    schema: DESIGN_OS_BENCHMARK_SCHEMA,
    benchmark: DESIGN_OS_BENCHMARK_RULER.benchmark,
    identity: input.identity,
    profiles: input.profiles,
    metrics,
    summary: deriveDesignOsBenchmarkSummary(metrics),
  })
}

export function decodeDesignOsBenchmarkReport(input: unknown): DesignOsBenchmarkReport {
  const report = designOsBenchmarkReportSchema.parse(input)
  if (report.benchmark.id !== DESIGN_OS_BENCHMARK_ID
    || report.benchmark.version !== DESIGN_OS_BENCHMARK_VERSION) {
    throw new Error(`Unsupported Design OS benchmark: ${report.benchmark.id}@${report.benchmark.version}`)
  }
  assertExactOrderedClosure(
    report.profiles.map((profile) => profile.id),
    DESIGN_OS_BENCHMARK_RULER.profiles.map((profile) => profile.id),
    'Report Profiles',
  )
  report.profiles.forEach((profile, index) => {
    const definition = DESIGN_OS_BENCHMARK_RULER.profiles[index]!
    if (profile.label !== definition.label
      || profile.sourceReport.schema !== definition.sourceSchema
      || profile.sourceReport.benchmark.id !== definition.sourceBenchmark.id
      || profile.sourceReport.benchmark.version !== definition.sourceBenchmark.version) {
      throw new Error(`Design OS benchmark Profile metadata drifted for ${profile.id}.`)
    }
  })
  const sourceReportIds = report.profiles.map((profile) => profile.sourceReport.id)
  if (new Set(sourceReportIds).size !== sourceReportIds.length) {
    throw new Error('Design OS benchmark source report ids must be unique.')
  }
  assertExactOrderedClosure(
    report.metrics.map((metric) => metric.id),
    DESIGN_OS_BENCHMARK_RULER.metrics.map((metric) => metric.id),
    'Report metrics',
  )
  const profileById = new Map(report.profiles.map((profile) => [profile.id, profile]))
  report.metrics.forEach((metric, index) => {
    const definition = DESIGN_OS_BENCHMARK_RULER.metrics[index]!
    const profile = profileById.get(metric.profileId)
    if (!profile || metric.profileId !== definition.profileId || metric.stage !== definition.stage
      || metric.label !== definition.label || metric.critical !== definition.critical) {
      throw new Error(`Design OS benchmark metric metadata drifted for ${metric.id}.`)
    }
    if (metric.source.sourceReportId !== profile.sourceReport.id) {
      throw new Error(`Design OS benchmark metric source drifted for ${metric.id}.`)
    }
    if (definition.sourceMetricId) {
      if (metric.source.kind !== 'profile-report-metric'
        || metric.source.sourceMetricId !== definition.sourceMetricId) {
        throw new Error(`Design OS benchmark source metric drifted for ${metric.id}.`)
      }
    } else if (metric.source.kind !== 'profile-capability-audit'
      || metric.source.findingCode !== definition.auditFindingCode) {
      throw new Error(`Design OS benchmark audit source drifted for ${metric.id}.`)
    }
    if (!definition.sourceMetricId && metric.status === 'passed') {
      throw new Error(
        `Design OS audit metric ${metric.id} requires the native held-out rehearsal decoder.`,
      )
    }
    if (!definition.sourceMetricId && metric.status !== 'passed'
      && metric.source.kind === 'profile-capability-audit' && metric.source.admission) {
      throw new Error(`Non-passing Design OS audit metric ${metric.id} cannot carry admission evidence.`)
    }
  })
  const expectedSummary = deriveDesignOsBenchmarkSummary(report.metrics)
  if (canonical(report.summary) !== canonical(expectedSummary)) {
    throw new Error('Design OS benchmark summary must be derived from metric evidence.')
  }
  return report
}

export function compareDesignOsBenchmarkReports(
  priorInput: unknown,
  currentInput: unknown,
): DesignOsBenchmarkComparison {
  const prior = decodeDesignOsBenchmarkReport(priorInput)
  const current = decodeDesignOsBenchmarkReport(currentInput)
  if (prior.benchmark.id !== current.benchmark.id || prior.benchmark.version !== current.benchmark.version) {
    throw new Error('Design OS benchmark reports use incompatible rulers.')
  }
  const currentById = new Map(current.metrics.map((metric) => [metric.id, metric]))
  const transitions = prior.metrics.flatMap((metric) => {
    const next = currentById.get(metric.id)!
    return metric.status === next.status ? [] : [{
      metricId: metric.id,
      profileId: metric.profileId,
      stage: metric.stage,
      critical: metric.critical,
      from: metric.status,
      to: next.status,
    }]
  })
  const regressions = transitions.filter((transition) => (
    transition.from === 'passed' && transition.to !== 'passed'
  )).map((transition) => transition.metricId)
  const criticalRegressions = transitions.filter((transition) => (
    transition.critical && transition.from === 'passed' && transition.to !== 'passed'
  )).map((transition) => transition.metricId)
  const stageTransitions = prior.summary.stages.flatMap((stage, index) => {
    const next = current.summary.stages[index]!
    return stage.ready === next.ready ? [] : [{
      stage: stage.stage,
      from: stage.ready ? 'ready' as const : 'not-ready' as const,
      to: next.ready ? 'ready' as const : 'not-ready' as const,
    }]
  })
  return designOsBenchmarkComparisonSchema.parse({
    schema: DESIGN_OS_BENCHMARK_COMPARISON_SCHEMA,
    benchmark: current.benchmark,
    prior: prior.identity,
    current: current.identity,
    transitions,
    stageTransitions,
    newlyPassed: transitions.filter((transition) => transition.to === 'passed')
      .map((transition) => transition.metricId),
    regressions,
    criticalRegressions,
    coverageDeltaBasisPoints: current.summary.coverage.basisPoints - prior.summary.coverage.basisPoints,
    maturity: { from: prior.summary.maturity, to: current.summary.maturity },
    releaseRegression: criticalRegressions.length > 0,
  })
}

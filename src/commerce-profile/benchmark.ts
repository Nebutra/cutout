import { z } from 'zod'
import {
  commerceDagReferenceBindingSchema,
  verifyCommerceProductionRehearsalBundle,
  type VerifiedCommerceProductionRehearsal,
} from './rehearsal'
import {
  verifyCommerceHeldOutProductionRehearsal,
  type CommerceHeldOutAdmission,
} from './held-out'

export const COMMERCE_BENCHMARK_SCHEMA = 'commerce.profile-benchmark.v1' as const
export const COMMERCE_BENCHMARK_ID = 'benchmark:commerce-profile:p1-p7' as const
export const COMMERCE_BENCHMARK_VERSION = 2 as const

export const commerceBenchmarkTierSchema = z.enum(['deterministic', 'real-host'])
export type CommerceBenchmarkTier = z.infer<typeof commerceBenchmarkTierSchema>

export const commerceBenchmarkStatusSchema = z.enum(['passed', 'failed', 'blocked'])
export type CommerceBenchmarkStatus = z.infer<typeof commerceBenchmarkStatusSchema>

interface CommerceBenchmarkMetricDefinition {
  readonly id: string
  readonly acceptanceCriterion: `P${1 | 2 | 3 | 4 | 5 | 6 | 7}`
  readonly tier: CommerceBenchmarkTier
  readonly label: string
  readonly assertionIds: readonly string[]
  readonly passEvidenceKinds: readonly CommerceBenchmarkEvidenceKind[]
}

const metricDefinitions = [
  {
    id: 'p1.product-facts-normalization', acceptanceCriterion: 'P1', tier: 'deterministic',
    label: 'Bounded product-facts normalization',
    assertionIds: ['supported-shapes-and-lineage', 'malformed-path-size-html-rejected'],
    passEvidenceKinds: ['deterministic-test-run'],
  },
  {
    id: 'p2.fact-citation-closure', acceptanceCriterion: 'P2', tier: 'deterministic',
    label: 'Claim and overlay fact citation closure',
    assertionIds: ['known-fact-citations-resolve', 'unknown-and-conflicting-claims-rejected'],
    passEvidenceKinds: ['deterministic-test-run'],
  },
  {
    id: 'p3.catalog-closure', acceptanceCriterion: 'P3', tier: 'deterministic',
    label: 'Exact leaf category and attribute enum closure',
    assertionIds: ['leaf-category-exact', 'attribute-enums-and-references-exact'],
    passEvidenceKinds: ['deterministic-test-run'],
  },
  {
    id: 'p4.offline-policy-gates', acceptanceCriterion: 'P4', tier: 'deterministic',
    label: 'Offline locale policy compilation and validation',
    assertionIds: ['locale-generation-constraints-compile', 'unit-size-claim-media-gates-execute'],
    passEvidenceKinds: ['deterministic-test-run'],
  },
  {
    id: 'p5.kernel-profile-composition', acceptanceCriterion: 'P5', tier: 'deterministic',
    label: 'Removable Commerce Profile Kernel composition',
    assertionIds: ['semantic-role-and-lock-closure', 'bounded-kernel-plan-and-removable-registry'],
    passEvidenceKinds: ['deterministic-test-run'],
  },
  {
    id: 'p6.real-text-execution', acceptanceCriterion: 'P6', tier: 'real-host',
    label: 'Real Host localized text execution',
    assertionIds: ['authorized-command-settled', 'accepted-receipt-bound'],
    passEvidenceKinds: ['real-host-receipt'],
  },
  {
    id: 'p6.real-text-bytes', acceptanceCriterion: 'P6', tier: 'real-host',
    label: 'Real Host localized text bytes and gates',
    assertionIds: ['artifact-bytes-present-and-decoded', 'locale-policy-and-citation-gates-pass'],
    passEvidenceKinds: ['real-host-receipt', 'artifact-bytes'],
  },
  {
    id: 'p6.real-image-execution', acceptanceCriterion: 'P6', tier: 'real-host',
    label: 'Real Host commerce image execution',
    assertionIds: ['authorized-command-settled', 'accepted-receipt-bound'],
    passEvidenceKinds: ['real-host-receipt'],
  },
  {
    id: 'p6.real-image-bytes', acceptanceCriterion: 'P6', tier: 'real-host',
    label: 'Real Host image bytes and usability gates',
    assertionIds: ['artifact-bytes-present-and-decoded', 'dimensions-identity-policy-and-usability-pass'],
    passEvidenceKinds: ['real-host-receipt', 'artifact-bytes'],
  },
  {
    id: 'p6.real-video-execution', acceptanceCriterion: 'P6', tier: 'real-host',
    label: 'Real Host product video execution',
    assertionIds: ['authorized-command-settled', 'accepted-receipt-bound'],
    passEvidenceKinds: ['real-host-receipt'],
  },
  {
    id: 'p6.real-video-bytes', acceptanceCriterion: 'P6', tier: 'real-host',
    label: 'Real Host video bytes and playability gates',
    assertionIds: ['artifact-bytes-present-and-decoded', 'playability-identity-and-policy-gates-pass'],
    passEvidenceKinds: ['real-host-receipt', 'artifact-bytes'],
  },
  {
    id: 'p7.real-strategy-execution', acceptanceCriterion: 'P7', tier: 'real-host',
    label: 'Real Host strategy document execution',
    assertionIds: ['authorized-command-settled', 'accepted-receipt-bound'],
    passEvidenceKinds: ['real-host-receipt'],
  },
  {
    id: 'p7.real-strategy-bytes', acceptanceCriterion: 'P7', tier: 'real-host',
    label: 'Real Host strategy bytes and evidence gates',
    assertionIds: ['artifact-bytes-present-and-decoded', 'facts-plan-route-validation-receipt-repair-closure-passes'],
    passEvidenceKinds: ['real-host-receipt', 'artifact-bytes'],
  },
] as const satisfies readonly CommerceBenchmarkMetricDefinition[]

export const COMMERCE_BENCHMARK_METRICS: readonly CommerceBenchmarkMetricDefinition[] = metricDefinitions
export const COMMERCE_BENCHMARK_TIERS: readonly CommerceBenchmarkTier[] = [
  'deterministic',
  'real-host',
]

const benchmarkIdentitySchema = z.object({
  id: z.string().min(1).max(240),
  version: z.number().int().positive(),
}).strict()

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const recordIdSchema = z.string().min(1).max(240)

const evidenceReferenceBase = {
  id: recordIdSchema,
  revision: recordIdSchema,
  contentHash: sha256Schema,
}

const metricBindingSchema = z.object({ metricId: recordIdSchema }).strict()

const deterministicTestRunReferenceSchema = z.object({
  ...evidenceReferenceBase,
  kind: z.literal('deterministic-test-run'),
  binding: metricBindingSchema.extend({
    testIds: z.array(recordIdSchema).min(1).max(100),
  }).strict(),
}).strict()

const realHostReceiptReferenceSchema = z.object({
  ...evidenceReferenceBase,
  kind: z.literal('real-host-receipt'),
  binding: metricBindingSchema.extend({
    receiptId: recordIdSchema,
    runId: recordIdSchema,
    capabilityId: recordIdSchema,
    artifactIds: z.array(recordIdSchema).min(1).max(100),
    acceptedReferenceArtifactIds: z.array(recordIdSchema).max(100).optional(),
    dagReferences: z.array(commerceDagReferenceBindingSchema).max(64).optional(),
  }).strict(),
}).strict()

const artifactBytesReferenceSchema = z.object({
  ...evidenceReferenceBase,
  kind: z.literal('artifact-bytes'),
  binding: metricBindingSchema.extend({
    receiptId: recordIdSchema,
    artifactId: recordIdSchema,
    mediaType: z.string().min(1).max(120),
    byteLength: z.number().int().positive(),
    derivedFromArtifactId: recordIdSchema.optional(),
  }).strict(),
}).strict()

const hostCapabilityAuditReferenceSchema = z.object({
  ...evidenceReferenceBase,
  kind: z.literal('host-capability-audit'),
  binding: metricBindingSchema.extend({ findingCode: recordIdSchema }).strict(),
}).strict()

export const commerceBenchmarkEvidenceReferenceSchema = z.discriminatedUnion('kind', [
  deterministicTestRunReferenceSchema,
  realHostReceiptReferenceSchema,
  artifactBytesReferenceSchema,
  hostCapabilityAuditReferenceSchema,
])
export type CommerceBenchmarkEvidenceReference = z.infer<typeof commerceBenchmarkEvidenceReferenceSchema>
type CommerceBenchmarkEvidenceKind = CommerceBenchmarkEvidenceReference['kind']

const diagnosticSchema = z.object({
  code: recordIdSchema,
  message: z.string().min(1).max(1_000),
  evidenceReferenceIds: z.array(recordIdSchema).min(1).max(20),
}).strict()

const assertionEvidenceSchema = z.object({
  id: recordIdSchema,
  verdict: commerceBenchmarkStatusSchema,
  diagnostic: diagnosticSchema.optional(),
}).strict().superRefine((assertion, context) => {
  if (assertion.verdict === 'passed' && assertion.diagnostic) {
    context.addIssue({ code: 'custom', message: 'Passing benchmark assertions cannot carry diagnostics.' })
  }
  if (assertion.verdict !== 'passed' && !assertion.diagnostic) {
    context.addIssue({ code: 'custom', message: 'Failed or blocked benchmark assertions require a diagnostic.' })
  }
})

const metricEvidenceSchema = z.object({
  metricId: recordIdSchema,
  assertions: z.array(assertionEvidenceSchema).min(1).max(20),
  evidenceReferences: z.array(commerceBenchmarkEvidenceReferenceSchema).min(1).max(100),
}).strict()

export const commerceBenchmarkEvidenceSetSchema = z.object({
  schema: z.literal('commerce.profile-benchmark-evidence.v1'),
  benchmark: benchmarkIdentitySchema,
  identity: z.object({ id: recordIdSchema, revision: recordIdSchema }).strict(),
  metrics: z.array(metricEvidenceSchema).min(1).max(100),
}).strict()
export type CommerceBenchmarkEvidenceSet = z.infer<typeof commerceBenchmarkEvidenceSetSchema>

const countSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  blocked: z.number().int().nonnegative(),
  ready: z.boolean(),
}).strict()

const reportMetricSchema = z.object({
  id: recordIdSchema,
  acceptanceCriterion: z.enum(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7']),
  tier: commerceBenchmarkTierSchema,
  label: z.string().min(1).max(240),
  status: commerceBenchmarkStatusSchema,
  assertions: z.array(assertionEvidenceSchema).min(1).max(20),
  evidenceReferences: z.array(commerceBenchmarkEvidenceReferenceSchema).min(1).max(100),
  diagnostics: z.array(diagnosticSchema).max(20),
}).strict()

export const commerceProfileBenchmarkReportSchema = z.object({
  schema: z.literal(COMMERCE_BENCHMARK_SCHEMA),
  benchmark: benchmarkIdentitySchema,
  identity: z.object({ id: recordIdSchema, revision: recordIdSchema }).strict(),
  metrics: z.array(reportMetricSchema).min(1).max(100),
  summary: z.object({
    overall: countSummarySchema,
    tiers: z.array(z.object({ tier: commerceBenchmarkTierSchema }).extend(countSummarySchema.shape).strict()).length(2),
    productionReady: z.boolean(),
    productionFrontier: z.array(z.object({
      metricId: recordIdSchema,
      tier: commerceBenchmarkTierSchema,
      status: z.enum(['failed', 'blocked']),
    }).strict()).max(100),
  }).strict(),
}).strict()
export type CommerceProfileBenchmarkReport = z.infer<typeof commerceProfileBenchmarkReportSchema>

const statusTransitionSchema = z.object({
  metricId: recordIdSchema,
  tier: commerceBenchmarkTierSchema,
  from: commerceBenchmarkStatusSchema,
  to: commerceBenchmarkStatusSchema,
}).strict()

export const commerceBenchmarkComparisonSchema = z.object({
  schema: z.literal('commerce.profile-benchmark-comparison.v1'),
  benchmark: benchmarkIdentitySchema,
  prior: z.object({ id: recordIdSchema, revision: recordIdSchema }).strict(),
  current: z.object({ id: recordIdSchema, revision: recordIdSchema }).strict(),
  transitions: z.array(statusTransitionSchema).max(100),
  newlyPassed: z.array(recordIdSchema).max(100),
  regressions: z.array(recordIdSchema).max(100),
}).strict()
export type CommerceBenchmarkComparison = z.infer<typeof commerceBenchmarkComparisonSchema>

function metricDefinition(metricId: string): CommerceBenchmarkMetricDefinition {
  const definition = metricDefinitions.find((candidate) => candidate.id === metricId)
  if (!definition) throw new Error(`Unsupported Commerce benchmark metric: ${metricId}`)
  return definition
}

function assertBenchmarkIdentity(benchmark: z.infer<typeof benchmarkIdentitySchema>): void {
  if (benchmark.id !== COMMERCE_BENCHMARK_ID || benchmark.version !== COMMERCE_BENCHMARK_VERSION) {
    throw new Error(`Unsupported Commerce benchmark identity: ${benchmark.id}@${benchmark.version}`)
  }
}

function assertExactOrderedClosure(actual: readonly string[], expected: readonly string[], label: string): void {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new Error(`${label} must match the exact ordered Commerce benchmark closure.`)
  }
}

function assertMetricEvidenceClosure(
  definition: CommerceBenchmarkMetricDefinition,
  assertions: readonly z.infer<typeof assertionEvidenceSchema>[],
  evidenceReferences: readonly CommerceBenchmarkEvidenceReference[],
): void {
  const assertionIds = assertions.map((assertion) => assertion.id)
  if (new Set(assertionIds).size !== assertionIds.length) {
    throw new Error(`Benchmark assertion ids must be unique for ${definition.id}.`)
  }
  assertExactOrderedClosure(assertionIds, definition.assertionIds, `Assertion ids for ${definition.id}`)
  const referenceIds = evidenceReferences.map((reference) => reference.id)
  if (new Set(referenceIds).size !== referenceIds.length) {
    throw new Error(`Evidence reference ids must be unique for ${definition.id}.`)
  }
  const knownReferences = new Set(referenceIds)
  for (const reference of evidenceReferences) {
    if (reference.binding.metricId !== definition.id) {
      throw new Error(`Evidence reference ${reference.id} is bound to another metric.`)
    }
  }
  for (const assertion of assertions) {
    if (assertion.diagnostic?.evidenceReferenceIds.some((id) => !knownReferences.has(id))) {
      throw new Error(`Benchmark diagnostic for ${definition.id}/${assertion.id} has unresolved evidence.`)
    }
  }
}

function assertEvidenceSetClosure(evidence: CommerceBenchmarkEvidenceSet): void {
  assertBenchmarkIdentity(evidence.benchmark)
  const metricIds = evidence.metrics.map((metric) => metric.metricId)
  if (new Set(metricIds).size !== metricIds.length) throw new Error('Commerce benchmark metric ids must be unique.')
  assertExactOrderedClosure(metricIds, metricDefinitions.map((definition) => definition.id), 'Metric ids')
  for (const metric of evidence.metrics) {
    const definition = metricDefinition(metric.metricId)
    assertMetricEvidenceClosure(definition, metric.assertions, metric.evidenceReferences)
  }
}

function metricStatus(assertions: readonly z.infer<typeof assertionEvidenceSchema>[]): CommerceBenchmarkStatus {
  if (assertions.some((assertion) => assertion.verdict === 'failed')) return 'failed'
  if (assertions.some((assertion) => assertion.verdict === 'blocked')) return 'blocked'
  return 'passed'
}

function assertPassEvidence(
  definition: CommerceBenchmarkMetricDefinition,
  evidenceReferences: readonly CommerceBenchmarkEvidenceReference[],
  trustedRealHost = false,
): void {
  for (const kind of definition.passEvidenceKinds) {
    if (!evidenceReferences.some((reference) => reference.kind === kind)) {
      throw new Error(`Passing metric ${definition.id} requires ${kind} evidence.`)
    }
  }
  if (definition.tier !== 'real-host') return
  const realReceipts = evidenceReferences.filter((reference) => reference.kind === 'real-host-receipt')
  if (realReceipts.length === 0 || realReceipts.some((reference) => reference.binding.metricId !== definition.id)) {
    throw new Error(`Real-Host pass requires a receipt bound to ${definition.id}.`)
  }
  const byteEvidence = evidenceReferences.filter((reference) => reference.kind === 'artifact-bytes')
  for (const bytes of byteEvidence) {
    const signedArtifactId = bytes.binding.derivedFromArtifactId ?? bytes.binding.artifactId
    if (!realReceipts.some((receipt) => receipt.binding.receiptId === bytes.binding.receiptId
      && receipt.binding.artifactIds.includes(signedArtifactId))) {
      throw new Error(`Artifact bytes for ${definition.id} must bind a real Host receipt and artifact.`)
    }
  }
  if (definition.id.includes('real-video')) {
    const videoReferences = realReceipts.flatMap((receipt) => receipt.binding.dagReferences ?? [])
    if (videoReferences.length !== 1
      || videoReferences[0]?.sourceSemanticRole !== 'main-image'
      || videoReferences[0].referenceRole !== 'first-frame') {
      throw new Error(`Real-Host video pass requires the exact signed Commerce DAG reference binding.`)
    }
  }
  if (definition.id.includes('real-image')) {
    const imageReceipts = realReceipts.filter((reference) => (
      reference.binding.capabilityId === 'capability:commerce-image'
    ))
    const sourceClosure = imageReceipts[0]?.binding.acceptedReferenceArtifactIds ?? []
    const detailReceipts = imageReceipts.slice(1)
    if (imageReceipts.length !== 6 || sourceClosure.length === 0
      || detailReceipts.some((reference) => (
        reference.binding.acceptedReferenceArtifactIds?.[0] !== sourceClosure[0]
      ))) {
      throw new Error('Real-Host image pass requires the exact retained product source-material closure.')
    }
    const detailReferences = detailReceipts.flatMap((receipt) => receipt.binding.dagReferences ?? [])
    if (detailReferences.length !== 5 || detailReferences.some((reference) => (
      reference.sourceSemanticRole !== 'main-image' || reference.referenceRole !== 'visual-continuity'
    ))) {
      throw new Error('Real-Host detail images require the exact signed main-image continuity binding.')
    }
  }
  if (trustedRealHost) return
  throw new Error(
    `Real-Host metric ${definition.id} cannot pass until a trusted Host verification contract is installed.`,
  )
}

function countStatuses(statuses: readonly CommerceBenchmarkStatus[]): z.infer<typeof countSummarySchema> {
  const passed = statuses.filter((status) => status === 'passed').length
  const failed = statuses.filter((status) => status === 'failed').length
  const blocked = statuses.filter((status) => status === 'blocked').length
  return { total: statuses.length, passed, failed, blocked, ready: statuses.length > 0 && passed === statuses.length }
}

function deriveSummary(metrics: CommerceProfileBenchmarkReport['metrics']): CommerceProfileBenchmarkReport['summary'] {
  const overall = countStatuses(metrics.map((metric) => metric.status))
  const tiers = COMMERCE_BENCHMARK_TIERS.map((tier) => ({
    tier,
    ...countStatuses(metrics.filter((metric) => metric.tier === tier).map((metric) => metric.status)),
  }))
  return {
    overall,
    tiers,
    productionReady: tiers.every((tier) => tier.ready),
    productionFrontier: metrics.flatMap((metric) => metric.status === 'passed' ? [] : [{
      metricId: metric.id,
      tier: metric.tier,
      status: metric.status,
    }]),
  }
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const object = value as Record<string, unknown>
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`
}

export function createCommerceProfileBenchmarkReport(input: unknown): CommerceProfileBenchmarkReport {
  const evidence = commerceBenchmarkEvidenceSetSchema.parse(input)
  assertEvidenceSetClosure(evidence)
  const metrics = evidence.metrics.map((metric) => {
    const definition = metricDefinition(metric.metricId)
    const status = metricStatus(metric.assertions)
    if (status === 'passed') assertPassEvidence(definition, metric.evidenceReferences)
    return {
      id: definition.id,
      acceptanceCriterion: definition.acceptanceCriterion,
      tier: definition.tier,
      label: definition.label,
      status,
      assertions: metric.assertions,
      evidenceReferences: metric.evidenceReferences,
      diagnostics: metric.assertions.flatMap((assertion) => assertion.diagnostic ? [assertion.diagnostic] : []),
    }
  })
  return decodeCommerceProfileBenchmarkReport({
    schema: COMMERCE_BENCHMARK_SCHEMA,
    benchmark: evidence.benchmark,
    identity: evidence.identity,
    metrics,
    summary: deriveSummary(metrics),
  })
}

function decodeCommerceProfileBenchmarkReportInternal(
  input: unknown,
  trustedRealHost: boolean,
): CommerceProfileBenchmarkReport {
  const report = commerceProfileBenchmarkReportSchema.parse(input)
  assertBenchmarkIdentity(report.benchmark)
  const metricIds = report.metrics.map((metric) => metric.id)
  if (new Set(metricIds).size !== metricIds.length) throw new Error('Commerce benchmark report metric ids must be unique.')
  assertExactOrderedClosure(metricIds, metricDefinitions.map((definition) => definition.id), 'Report metric ids')
  for (const metric of report.metrics) {
    const definition = metricDefinition(metric.id)
    if (metric.acceptanceCriterion !== definition.acceptanceCriterion
      || metric.tier !== definition.tier
      || metric.label !== definition.label) {
      throw new Error(`Benchmark metric metadata drifted for ${metric.id}.`)
    }
    assertMetricEvidenceClosure(definition, metric.assertions, metric.evidenceReferences)
    if (metric.status !== metricStatus(metric.assertions)) {
      throw new Error(`Benchmark metric status is not derived for ${metric.id}.`)
    }
    if (metric.status === 'passed') assertPassEvidence(definition, metric.evidenceReferences, trustedRealHost)
    const derivedDiagnostics = metric.assertions.flatMap((assertion) => assertion.diagnostic ? [assertion.diagnostic] : [])
    if (canonical(metric.diagnostics) !== canonical(derivedDiagnostics)) {
      throw new Error(`Benchmark diagnostics are not derived for ${metric.id}.`)
    }
  }
  const expectedSummary = deriveSummary(report.metrics)
  if (canonical(report.summary) !== canonical(expectedSummary)) {
    throw new Error('Commerce benchmark summary and readiness must be derived from metric evidence.')
  }
  return report
}

export function decodeCommerceProfileBenchmarkReport(input: unknown): CommerceProfileBenchmarkReport {
  return decodeCommerceProfileBenchmarkReportInternal(input, false)
}

function referenceRevision(receiptId: string): string {
  return `${receiptId}:revision:1`
}

function realReceiptReference(input: {
  readonly metricId: string
  readonly runId: string
  readonly receipt: VerifiedCommerceProductionRehearsal['artifacts'][number]['receipt']
  readonly artifactIds?: readonly string[]
  readonly dagReferences?: VerifiedCommerceProductionRehearsal['artifacts'][number]['dagReferenceBindings']
}): CommerceBenchmarkEvidenceReference {
  return commerceBenchmarkEvidenceReferenceSchema.parse({
    id: `evidence:${input.metricId}:${input.receipt.receiptId}`,
    revision: referenceRevision(input.receipt.receiptId),
    contentHash: input.receipt.receiptHash,
    kind: 'real-host-receipt',
    binding: {
      metricId: input.metricId,
      receiptId: input.receipt.receiptId,
      runId: input.runId,
      capabilityId: input.receipt.capabilityId,
      artifactIds: input.artifactIds ?? [input.receipt.artifact.artifactId],
      acceptedReferenceArtifactIds: input.receipt.acceptedReferenceArtifactIds,
      ...(input.dagReferences ? { dagReferences: input.dagReferences } : {}),
    },
  })
}

function byteReference(input: {
  readonly metricId: string
  readonly evidence: VerifiedCommerceProductionRehearsal['artifacts'][number]['retainedBytes'][number]
}): CommerceBenchmarkEvidenceReference {
  return commerceBenchmarkEvidenceReferenceSchema.parse({
    id: `evidence:${input.metricId}:bytes:${input.evidence.artifactId}`,
    revision: `${input.evidence.artifactId}:revision:1`,
    contentHash: input.evidence.contentHash,
    kind: 'artifact-bytes',
    binding: {
      metricId: input.metricId,
      receiptId: input.evidence.receiptId,
      artifactId: input.evidence.artifactId,
      mediaType: input.evidence.mediaType,
      byteLength: input.evidence.byteLength,
      ...(input.evidence.derivedFromArtifactId
        ? { derivedFromArtifactId: input.evidence.derivedFromArtifactId }
        : {}),
    },
  })
}

function referencesForArtifacts(input: {
  readonly metricId: string
  readonly rehearsal: VerifiedCommerceProductionRehearsal
  readonly artifacts: readonly VerifiedCommerceProductionRehearsal['artifacts'][number][]
  readonly includeBytes: boolean
  readonly includeSemanticQa: boolean
}): CommerceBenchmarkEvidenceReference[] {
  return input.artifacts.flatMap((artifact) => {
    const receipts = [realReceiptReference({
      metricId: input.metricId,
      runId: input.rehearsal.runId,
      receipt: artifact.receipt,
      dagReferences: artifact.dagReferenceBindings,
    })]
    const bytes = input.includeBytes
      ? artifact.retainedBytes.map((evidence) => byteReference({ metricId: input.metricId, evidence }))
      : []
    if (!input.includeSemanticQa || !artifact.semanticQa) return [...receipts, ...bytes]
    return [
      ...receipts,
      realReceiptReference({
        metricId: input.metricId,
        runId: input.rehearsal.runId,
        receipt: artifact.semanticQa.receipt,
      }),
      ...bytes,
      ...(input.includeBytes ? [byteReference({
        metricId: input.metricId,
        evidence: artifact.semanticQa.retainedBytes,
      })] : []),
    ]
  })
}

function realMetricArtifacts(
  metricId: string,
  rehearsal: VerifiedCommerceProductionRehearsal,
): readonly VerifiedCommerceProductionRehearsal['artifacts'][number][] {
  if (metricId.includes('real-text')) {
    return rehearsal.artifacts.filter((artifact) => artifact.semanticRole.startsWith('localized-description:'))
  }
  if (metricId.includes('real-image')) {
    return rehearsal.artifacts.filter((artifact) => artifact.semanticRole === 'main-image'
      || artifact.semanticRole.startsWith('detail-image:'))
  }
  if (metricId.includes('real-video')) {
    return rehearsal.artifacts.filter((artifact) => artifact.semanticRole === 'product-video')
  }
  return rehearsal.artifacts.filter((artifact) => artifact.semanticRole === 'strategy-document')
}

function createVerifiedCommerceReport(
  baselineInput: unknown,
  rehearsal: VerifiedCommerceProductionRehearsal,
): CommerceProfileBenchmarkReport {
  const baseline = decodeCommerceProfileBenchmarkReportInternal(baselineInput, true)
  const metrics = baseline.metrics.map((metric) => {
    if (metric.tier !== 'real-host') return metric
    const definition = metricDefinition(metric.id)
    const includeBytes = metric.id.endsWith('-bytes')
    const artifacts = realMetricArtifacts(metric.id, rehearsal)
    const includeSemanticQa = metric.id.includes('real-image') || metric.id.includes('real-video')
    const evidenceReferences = referencesForArtifacts({
      metricId: metric.id,
      rehearsal,
      artifacts,
      includeBytes,
      includeSemanticQa,
    })
    const assertions = definition.assertionIds.map((id) => ({ id, verdict: 'passed' as const }))
    assertPassEvidence(definition, evidenceReferences, true)
    return {
      id: definition.id,
      acceptanceCriterion: definition.acceptanceCriterion,
      tier: definition.tier,
      label: definition.label,
      status: 'passed' as const,
      assertions,
      evidenceReferences,
      diagnostics: [],
    }
  })
  return decodeCommerceProfileBenchmarkReportInternal({
    schema: COMMERCE_BENCHMARK_SCHEMA,
    benchmark: baseline.benchmark,
    identity: rehearsal.identity,
    metrics,
    summary: deriveSummary(metrics),
  }, true)
}

export async function createCommerceProfileBenchmarkReportFromRehearsal(input: {
  readonly baselineReport: unknown
  readonly rehearsalBundle: unknown
}): Promise<{
  readonly report: CommerceProfileBenchmarkReport
  readonly rehearsal: VerifiedCommerceProductionRehearsal
}> {
  const rehearsal = await verifyCommerceProductionRehearsalBundle(input.rehearsalBundle)
  return {
    // Bundle contract verification alone is not benchmark admission. This
    // compatibility path intentionally retains the blocked durable baseline.
    report: decodeCommerceProfileBenchmarkReport(input.baselineReport),
    rehearsal,
  }
}

export async function decodeCommerceProfileBenchmarkReportFromRehearsal(input: {
  readonly report: unknown
  readonly baselineReport: unknown
  readonly rehearsalBundle: unknown
}): Promise<CommerceProfileBenchmarkReport> {
  const expected = await createCommerceProfileBenchmarkReportFromRehearsal({
    baselineReport: input.baselineReport,
    rehearsalBundle: input.rehearsalBundle,
  })
  const candidate = commerceProfileBenchmarkReportSchema.parse(input.report)
  if (canonical(candidate) !== canonical(expected.report)) {
    throw new Error('Commerce real-Host report does not match its reverified rehearsal bundle.')
  }
  return expected.report
}

export async function createCommerceProfileBenchmarkReportFromHeldOutRehearsal(input: {
  readonly baselineReport: unknown
  readonly rehearsalBundle: unknown
  readonly commitment: unknown
  readonly evaluatorAttestation: unknown
  readonly host: Parameters<typeof verifyCommerceHeldOutProductionRehearsal>[0]['host']
}): Promise<{
  readonly report: CommerceProfileBenchmarkReport
  readonly rehearsal: VerifiedCommerceProductionRehearsal
  readonly admission: CommerceHeldOutAdmission
}> {
  const verified = await verifyCommerceHeldOutProductionRehearsal(input)
  return {
    report: createVerifiedCommerceReport(input.baselineReport, verified.rehearsal),
    rehearsal: verified.rehearsal,
    admission: verified.admission,
  }
}

export async function decodeCommerceProfileBenchmarkReportFromHeldOutRehearsal(input: {
  readonly report: unknown
  readonly baselineReport: unknown
  readonly rehearsalBundle: unknown
  readonly commitment: unknown
  readonly evaluatorAttestation: unknown
  readonly host: Parameters<typeof verifyCommerceHeldOutProductionRehearsal>[0]['host']
}): Promise<CommerceProfileBenchmarkReport> {
  const expected = await createCommerceProfileBenchmarkReportFromHeldOutRehearsal(input)
  const candidate = commerceProfileBenchmarkReportSchema.parse(input.report)
  if (canonical(candidate) !== canonical(expected.report)) {
    throw new Error('Commerce real-Host report does not match its admitted held-out rehearsal bundle.')
  }
  return expected.report
}

export function compareCommerceProfileBenchmarkReports(
  priorInput: unknown,
  currentInput: unknown,
): CommerceBenchmarkComparison {
  const prior = decodeCommerceProfileBenchmarkReport(priorInput)
  const current = decodeCommerceProfileBenchmarkReport(currentInput)
  return compareDecodedCommerceProfileBenchmarkReports(prior, current)
}

function compareDecodedCommerceProfileBenchmarkReports(
  prior: CommerceProfileBenchmarkReport,
  current: CommerceProfileBenchmarkReport,
): CommerceBenchmarkComparison {
  if (prior.benchmark.id !== current.benchmark.id || prior.benchmark.version !== current.benchmark.version) {
    throw new Error('Commerce benchmark reports are incompatible by benchmark id or version.')
  }
  assertExactOrderedClosure(
    current.metrics.map((metric) => metric.id),
    prior.metrics.map((metric) => metric.id),
    'Compared report metric ids',
  )
  const currentById = new Map(current.metrics.map((metric) => [metric.id, metric]))
  const transitions = prior.metrics.flatMap((metric) => {
    const next = currentById.get(metric.id)!
    return metric.status === next.status ? [] : [{
      metricId: metric.id,
      tier: metric.tier,
      from: metric.status,
      to: next.status,
    }]
  })
  return commerceBenchmarkComparisonSchema.parse({
    schema: 'commerce.profile-benchmark-comparison.v1',
    benchmark: current.benchmark,
    prior: prior.identity,
    current: current.identity,
    transitions,
    newlyPassed: transitions.filter((transition) => transition.to === 'passed').map((transition) => transition.metricId),
    regressions: transitions.filter((transition) => transition.from === 'passed' && transition.to !== 'passed')
      .map((transition) => transition.metricId),
  })
}

interface ReverifiedCommerceReportInput {
  readonly report: unknown
  readonly baselineReport: unknown
  readonly rehearsalBundle: unknown
}

export async function compareCommerceProfileBenchmarkReportsFromRehearsals(
  priorInput: ReverifiedCommerceReportInput,
  currentInput: ReverifiedCommerceReportInput,
): Promise<CommerceBenchmarkComparison> {
  const [prior, current] = await Promise.all([
    decodeCommerceProfileBenchmarkReportFromRehearsal(priorInput),
    decodeCommerceProfileBenchmarkReportFromRehearsal(currentInput),
  ])
  return compareDecodedCommerceProfileBenchmarkReports(prior, current)
}

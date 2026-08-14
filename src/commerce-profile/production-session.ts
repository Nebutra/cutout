import currentCommerce from './benchmarks/current.json'
import { designOsBenchmarkReportSchema, type DesignOsBenchmarkReport } from '@/design-os-benchmark/contracts'
import { createDesignOsBenchmarkFromCommerceHeldOutRehearsal } from '@/design-os-benchmark/commerce'
import { canonicalJson } from '@/design-ir/fingerprint'
import {
  commerceHeldOutEvaluatorAttestationSchema,
  decodeCommerceHeldOutEvaluatorPackage,
  type CommerceHeldOutEvaluatorAttestation,
  type CommerceHeldOutEvaluatorPackage,
} from './held-out'
import {
  decodeCommerceHeldOutPendingAdmission,
  runCommerceHeldOutProduction,
  type CommerceHeldOutPendingAdmission,
} from './production-runner'
import type { MultimodalDesktopHost } from '@/multimodal-host'
import { z } from 'zod'

export const COMMERCE_HELD_OUT_ADMITTED_EVIDENCE_SCHEMA = 'commerce.held-out-admitted-evidence.v1' as const

export const commerceHeldOutAdmittedEvidenceSchema = z.object({
  schema: z.literal(COMMERCE_HELD_OUT_ADMITTED_EVIDENCE_SCHEMA),
  pending: z.unknown(),
  evaluatorAttestation: commerceHeldOutEvaluatorAttestationSchema,
  benchmarkReport: designOsBenchmarkReportSchema,
}).strict()
export interface CommerceHeldOutAdmittedEvidence {
  readonly schema: typeof COMMERCE_HELD_OUT_ADMITTED_EVIDENCE_SCHEMA
  readonly pending: CommerceHeldOutPendingAdmission
  readonly evaluatorAttestation: CommerceHeldOutEvaluatorAttestation
  readonly benchmarkReport: DesignOsBenchmarkReport
}

export async function runCommerceHeldOutEvaluatorPackage(input: {
  readonly evaluatorPackage: unknown
  readonly providerId: string
  readonly signal?: AbortSignal
  readonly host?: MultimodalDesktopHost
}): Promise<CommerceHeldOutPendingAdmission> {
  const evaluatorPackage = await decodeCommerceHeldOutEvaluatorPackage(input.evaluatorPackage)
  const runInput = evaluatorPackage.input
  return runCommerceHeldOutProduction({
    providerId: z.string().min(1).max(240).parse(input.providerId),
    evaluatorChallenge: evaluatorPackage.evaluatorChallenge,
    rehearsalIdentity: runInput.rehearsalIdentity,
    facts: runInput.facts,
    categoryCatalog: runInput.categoryCatalog,
    attributeCatalog: runInput.attributeCatalog,
    selectedSourceFactIds: runInput.selectedSourceFactIds,
    signal: input.signal,
  }, input.host)
}

export async function admitCommerceHeldOutPending(input: {
  readonly pending: unknown
  readonly evaluatorAttestation: unknown
}): Promise<CommerceHeldOutAdmittedEvidence> {
  const pending = await decodeCommerceHeldOutPendingAdmission(input.pending)
  const evaluatorAttestation = commerceHeldOutEvaluatorAttestationSchema.parse(input.evaluatorAttestation)
  const identity = {
    id: `benchmark-run:design-os:${pending.commitment.runId}`,
    revision: `benchmark-run:design-os:${pending.commitment.runId}:bundle:${pending.completionRequest.bundleHash}`,
  }
  const benchmarkReport = await createDesignOsBenchmarkFromCommerceHeldOutRehearsal({
    baselineCommerceReport: currentCommerce,
    rehearsalBundle: pending.bundle,
    commitment: pending.commitment,
    evaluatorAttestation,
    identity,
  })
  if (!benchmarkReport.summary.productionReady
    || benchmarkReport.summary.coverage.passed !== benchmarkReport.summary.coverage.total
    || benchmarkReport.summary.coverage.total !== 14) {
    throw new Error('Native admission did not close the exact 14-metric Design OS benchmark.')
  }
  return {
    schema: COMMERCE_HELD_OUT_ADMITTED_EVIDENCE_SCHEMA,
    pending,
    evaluatorAttestation,
    benchmarkReport,
  }
}

export async function decodeCommerceHeldOutAdmittedEvidence(
  input: unknown,
): Promise<CommerceHeldOutAdmittedEvidence> {
  const candidate = commerceHeldOutAdmittedEvidenceSchema.parse(input)
  const expected = await admitCommerceHeldOutPending({
    pending: candidate.pending,
    evaluatorAttestation: candidate.evaluatorAttestation,
  })
  if (canonicalJson(candidate) !== canonicalJson(expected)) {
    throw new Error('Admitted Commerce evidence does not match native re-verification.')
  }
  return expected
}

export type { CommerceHeldOutEvaluatorPackage }

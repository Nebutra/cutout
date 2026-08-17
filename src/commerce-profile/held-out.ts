import { z } from 'zod'
import { canonicalJson, fingerprint } from '@/design-ir/fingerprint'
import { PRODUCT_VERSION } from '@/product-version'
import type { MultimodalHostReceipt } from '@/multimodal-host/contracts'
import { productFactsSchema, type ProductFacts } from './contracts'
import { COMMERCE_PROFILE_ID, COMMERCE_PROFILE_VERSION } from './profile'
import {
  commerceProductionRehearsalBundleSchema,
  verifyCommerceProductionRehearsalBundle,
  type CommerceProductionRehearsalBundle,
  type VerifiedCommerceProductionRehearsal,
} from './rehearsal'
import type { CommerceSourceIngestArtifact } from './source-ingest'

export const COMMERCE_HELD_OUT_INPUT_MANIFEST_SCHEMA = 'commerce.held-out-input-manifest.v1' as const
export const COMMERCE_HELD_OUT_EVALUATOR_INPUT_SCHEMA = 'commerce.held-out-evaluator-input.v1' as const
export const COMMERCE_HELD_OUT_EVALUATOR_PACKAGE_SCHEMA = 'commerce.held-out-evaluator-package.v1' as const
export const COMMERCE_HELD_OUT_CHALLENGE_PROTOCOL = 'cutout.commerce-held-out-challenge-selection.v2' as const
export const COMMERCE_HELD_OUT_COMMITMENT_PROTOCOL = 'cutout.commerce-held-out-commitment.v2' as const
export const COMMERCE_HELD_OUT_ATTESTATION_PROTOCOL = 'cutout.commerce-held-out-evaluator-completion.v2' as const
export const COMMERCE_HELD_OUT_ADMISSION_PROTOCOL = 'cutout.commerce-held-out-admission.v2' as const
export const COMMERCE_HELD_OUT_HOST_BUILD_VERSION = PRODUCT_VERSION

const recordIdSchema = z.string().min(1).max(240)
const challengeNonceSchema = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/)
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const rehearsalIdentitySchema = z.object({
  id: recordIdSchema,
  revision: recordIdSchema,
}).strict()

export const commerceHeldOutSelectedSourceSchema = z.object({
  factId: recordIdSchema,
  sourceFile: z.string().min(1).max(512),
  sourcePointer: z.string().startsWith('/').max(2_000),
  sourceDescriptor: z.string().min(1).max(4_096),
  sourceDescriptorSha256: sha256Schema,
}).strict()

export const commerceHeldOutInputManifestSchema = z.object({
  schema: z.literal(COMMERCE_HELD_OUT_INPUT_MANIFEST_SCHEMA),
  rehearsalIdentity: rehearsalIdentitySchema,
  factsHash: sha256Schema,
  categoryCatalogHash: sha256Schema,
  attributeCatalogHash: sha256Schema,
  selectedSources: z.array(commerceHeldOutSelectedSourceSchema).min(1).max(3),
}).strict().superRefine((manifest, context) => {
  const factIds = manifest.selectedSources.map((source) => source.factId)
  if (new Set(factIds).size !== factIds.length) {
    context.addIssue({ code: 'custom', message: 'Held-out selected source fact ids must be unique.' })
  }
})
export type CommerceHeldOutInputManifest = z.infer<typeof commerceHeldOutInputManifestSchema>

export const commerceHeldOutChallengeSelectionPayloadSchema = z.object({
  protocol: z.literal(COMMERCE_HELD_OUT_CHALLENGE_PROTOCOL),
  benchmark: z.object({
    id: z.literal('benchmark:commerce-profile:p1-p7'),
    version: z.literal(2),
  }).strict(),
  profile: z.object({
    id: z.literal(COMMERCE_PROFILE_ID),
    version: z.literal(COMMERCE_PROFILE_VERSION),
  }).strict(),
  hostBuildVersion: z.literal(COMMERCE_HELD_OUT_HOST_BUILD_VERSION),
  challengeId: recordIdSchema,
  challengeNonce: challengeNonceSchema,
  inputManifestHash: sha256Schema,
  allowedRunId: recordIdSchema,
  evaluatorKeyId: recordIdSchema,
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive(),
}).strict().superRefine((payload, context) => {
  if (payload.expiresAt <= payload.issuedAt) {
    context.addIssue({ code: 'custom', message: 'Held-out challenge expiry must follow issuance.' })
  }
  if (payload.expiresAt - payload.issuedAt > 24 * 60 * 60 * 1_000) {
    context.addIssue({ code: 'custom', message: 'Held-out challenge window cannot exceed 24 hours.' })
  }
})
export type CommerceHeldOutChallengeSelectionPayload = z.infer<
  typeof commerceHeldOutChallengeSelectionPayloadSchema
>

export const commerceHeldOutChallengeSelectionSchema = z.object({
  payload: commerceHeldOutChallengeSelectionPayloadSchema,
  signature: z.string().min(100).max(4_096),
}).strict()
export type CommerceHeldOutChallengeSelection = z.infer<
  typeof commerceHeldOutChallengeSelectionSchema
>

export const commerceHeldOutEvaluatorInputSchema = z.object({
  schema: z.literal(COMMERCE_HELD_OUT_EVALUATOR_INPUT_SCHEMA),
  rehearsalIdentity: rehearsalIdentitySchema,
  facts: productFactsSchema,
  categoryCatalog: z.string().min(2).max(8 * 1024 * 1024),
  attributeCatalog: z.string().min(2).max(8 * 1024 * 1024),
  selectedSourceFactIds: z.array(recordIdSchema).min(1).max(3),
}).strict().superRefine((input, context) => {
  if (new Set(input.selectedSourceFactIds).size !== input.selectedSourceFactIds.length) {
    context.addIssue({ code: 'custom', message: 'Evaluator-selected source fact ids must be unique.' })
  }
})
export type CommerceHeldOutEvaluatorInput = z.infer<typeof commerceHeldOutEvaluatorInputSchema>

export const commerceHeldOutEvaluatorPackageSchema = z.object({
  schema: z.literal(COMMERCE_HELD_OUT_EVALUATOR_PACKAGE_SCHEMA),
  input: commerceHeldOutEvaluatorInputSchema,
  inputManifest: commerceHeldOutInputManifestSchema,
  evaluatorChallenge: commerceHeldOutChallengeSelectionSchema,
}).strict()
export type CommerceHeldOutEvaluatorPackage = z.infer<typeof commerceHeldOutEvaluatorPackageSchema>

export const commerceHeldOutCommitmentSchema = z.object({
  protocol: z.literal(COMMERCE_HELD_OUT_COMMITMENT_PROTOCOL),
  commitmentId: recordIdSchema,
  commitmentHash: sha256Schema,
  challengeSelection: commerceHeldOutChallengeSelectionSchema,
  challengeHash: sha256Schema,
  evaluatorKeyId: recordIdSchema,
  hostBuildVersion: z.literal(COMMERCE_HELD_OUT_HOST_BUILD_VERSION),
  inputManifest: commerceHeldOutInputManifestSchema,
  inputManifestHash: sha256Schema,
  runId: recordIdSchema,
  issuedAt: z.number().int().nonnegative(),
  signature: sha256Schema,
}).strict()
export type CommerceHeldOutCommitment = z.infer<typeof commerceHeldOutCommitmentSchema>

export const commerceHeldOutEvaluatorAttestationPayloadSchema = z.object({
  protocol: z.literal(COMMERCE_HELD_OUT_ATTESTATION_PROTOCOL),
  attestationId: recordIdSchema,
  challengeHash: sha256Schema,
  challengeId: recordIdSchema,
  evaluatorKeyId: recordIdSchema,
  hostBuildVersion: z.literal(COMMERCE_HELD_OUT_HOST_BUILD_VERSION),
  commitmentHash: sha256Schema,
  inputManifestHash: sha256Schema,
  runId: recordIdSchema,
  bundleHash: sha256Schema,
  decision: z.literal('accepted'),
  deliverableCount: z.literal(11),
  completedAt: z.number().int().nonnegative(),
}).strict()
export type CommerceHeldOutEvaluatorAttestationPayload = z.infer<
  typeof commerceHeldOutEvaluatorAttestationPayloadSchema
>

export const commerceHeldOutEvaluatorAttestationSchema = z.object({
  payload: commerceHeldOutEvaluatorAttestationPayloadSchema,
  signature: z.string().min(100).max(4_096),
}).strict()
export type CommerceHeldOutEvaluatorAttestation = z.infer<
  typeof commerceHeldOutEvaluatorAttestationSchema
>

export const commerceHeldOutCompletionRequestSchema = commerceHeldOutEvaluatorAttestationPayloadSchema
  .omit({ attestationId: true, completedAt: true })
  .strict()
export type CommerceHeldOutCompletionRequest = z.infer<typeof commerceHeldOutCompletionRequestSchema>

export const commerceHeldOutAdmissionSchema = z.object({
  protocol: z.literal(COMMERCE_HELD_OUT_ADMISSION_PROTOCOL),
  challengeId: recordIdSchema,
  challengeHash: sha256Schema,
  evaluatorKeyId: recordIdSchema,
  hostBuildVersion: z.literal(COMMERCE_HELD_OUT_HOST_BUILD_VERSION),
  commitmentId: recordIdSchema,
  commitmentHash: sha256Schema,
  attestationId: recordIdSchema,
  inputManifestHash: sha256Schema,
  runId: recordIdSchema,
  bundleHash: sha256Schema,
  commitmentIssuedAt: z.number().int().nonnegative(),
  evaluatorCompletedAt: z.number().int().nonnegative(),
  deliverableCount: z.literal(11),
}).strict()
export type CommerceHeldOutAdmission = z.infer<typeof commerceHeldOutAdmissionSchema>

async function sha256Text(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function selectedSourceFromFact(facts: ProductFacts, factId: string): {
  readonly id: string
  readonly source: { readonly file: string; readonly pointer: string }
  readonly descriptor: string
} {
  const fact = facts.facts.find((candidate) => candidate.id === factId)
  if (!fact || fact.confidence === 'unknown' || fact.value.type !== 'media'
    || fact.value.mediaKind !== 'image') {
    throw new Error(`Held-out Commerce source ${factId} must be a resolved image fact.`)
  }
  return { id: fact.id, source: fact.source, descriptor: fact.value.descriptor }
}

export async function createCommerceHeldOutInputManifest(input: {
  readonly rehearsalIdentity: { readonly id: string; readonly revision: string }
  readonly facts: unknown
  readonly categoryCatalog: string
  readonly attributeCatalog: string
  readonly selectedSourceFactIds: readonly string[]
}): Promise<CommerceHeldOutInputManifest> {
  const facts = productFactsSchema.parse(input.facts)
  if (input.selectedSourceFactIds.length < 1 || input.selectedSourceFactIds.length > 3
    || new Set(input.selectedSourceFactIds).size !== input.selectedSourceFactIds.length) {
    throw new Error('Held-out Commerce source selection requires one to three unique image facts.')
  }
  const selectedSources = await Promise.all(input.selectedSourceFactIds.map(async (factId) => {
    const fact = selectedSourceFromFact(facts, factId)
    return commerceHeldOutSelectedSourceSchema.parse({
      factId: fact.id,
      sourceFile: fact.source.file,
      sourcePointer: fact.source.pointer,
      sourceDescriptor: fact.descriptor,
      sourceDescriptorSha256: await sha256Text(fact.descriptor),
    })
  }))
  return commerceHeldOutInputManifestSchema.parse({
    schema: COMMERCE_HELD_OUT_INPUT_MANIFEST_SCHEMA,
    rehearsalIdentity: rehearsalIdentitySchema.parse(input.rehearsalIdentity),
    factsHash: await fingerprint(facts),
    categoryCatalogHash: await sha256Text(input.categoryCatalog),
    attributeCatalogHash: await sha256Text(input.attributeCatalog),
    selectedSources,
  })
}

export async function createCommerceHeldOutEvaluatorPackage(input: {
  readonly evaluatorInput: unknown
  readonly evaluatorChallenge: unknown
}): Promise<CommerceHeldOutEvaluatorPackage> {
  const evaluatorInput = commerceHeldOutEvaluatorInputSchema.parse(input.evaluatorInput)
  const evaluatorChallenge = commerceHeldOutChallengeSelectionSchema.parse(input.evaluatorChallenge)
  const inputManifest = await createCommerceHeldOutInputManifest(evaluatorInput)
  const inputManifestHash = await fingerprint(inputManifest)
  if (evaluatorChallenge.payload.inputManifestHash !== inputManifestHash) {
    throw new Error('Evaluator challenge does not bind the exact held-out input manifest.')
  }
  return commerceHeldOutEvaluatorPackageSchema.parse({
    schema: COMMERCE_HELD_OUT_EVALUATOR_PACKAGE_SCHEMA,
    input: evaluatorInput,
    inputManifest,
    evaluatorChallenge,
  })
}

export async function decodeCommerceHeldOutEvaluatorPackage(
  input: unknown,
): Promise<CommerceHeldOutEvaluatorPackage> {
  const candidate = commerceHeldOutEvaluatorPackageSchema.parse(input)
  const expected = await createCommerceHeldOutEvaluatorPackage({
    evaluatorInput: candidate.input,
    evaluatorChallenge: candidate.evaluatorChallenge,
  })
  if (canonicalJson(candidate) !== canonicalJson(expected)) {
    throw new Error('Evaluator package manifest does not match its exact held-out input.')
  }
  return expected
}

export function encodeCommerceHeldOutChallengePayload(input: unknown): string {
  return canonicalJson(commerceHeldOutChallengeSelectionPayloadSchema.parse(input))
}

export function encodeCommerceHeldOutEvaluatorPayload(input: unknown): string {
  return canonicalJson(commerceHeldOutEvaluatorAttestationPayloadSchema.parse(input))
}

async function expectedManifestFromBundle(
  bundle: CommerceProductionRehearsalBundle,
): Promise<CommerceHeldOutInputManifest> {
  return createCommerceHeldOutInputManifest({
    rehearsalIdentity: bundle.identity,
    facts: bundle.facts,
    categoryCatalog: bundle.categoryCatalog,
    attributeCatalog: bundle.attributeCatalog,
    selectedSourceFactIds: bundle.sourceMaterials.map((material) => material.factId),
  })
}

function assertExactAdmission(input: {
  readonly commitment: CommerceHeldOutCommitment
  readonly attestation: CommerceHeldOutEvaluatorAttestation
  readonly admission: CommerceHeldOutAdmission
  readonly rehearsal: VerifiedCommerceProductionRehearsal
}): void {
  const challenge = input.commitment.challengeSelection.payload
  const payload = input.attestation.payload
  const expected = {
    protocol: COMMERCE_HELD_OUT_ADMISSION_PROTOCOL,
    challengeId: challenge.challengeId,
    challengeHash: input.commitment.challengeHash,
    evaluatorKeyId: input.commitment.evaluatorKeyId,
    hostBuildVersion: challenge.hostBuildVersion,
    commitmentId: input.commitment.commitmentId,
    commitmentHash: input.commitment.commitmentHash,
    attestationId: payload.attestationId,
    inputManifestHash: input.commitment.inputManifestHash,
    runId: input.rehearsal.runId,
    bundleHash: input.rehearsal.bundleHash,
    commitmentIssuedAt: input.commitment.issuedAt,
    evaluatorCompletedAt: payload.completedAt,
    deliverableCount: 11 as const,
  }
  if (canonicalJson(input.admission) !== canonicalJson(expected)) {
    throw new Error('Native held-out admission does not match the exact Commerce challenge, commitment, and bundle.')
  }
}

export async function verifyCommerceHeldOutProductionRehearsal(input: {
  readonly rehearsalBundle: unknown
  readonly commitment: unknown
  readonly evaluatorAttestation: unknown
  readonly host: {
    verify(input: {
      readonly receipt: MultimodalHostReceipt
      readonly bytes: Uint8Array
    }): Promise<unknown>
    verifySource(input: CommerceSourceIngestArtifact): Promise<unknown>
    admit(input: {
      readonly commitment: CommerceHeldOutCommitment
      readonly evaluatorAttestation: CommerceHeldOutEvaluatorAttestation
      readonly rehearsalBundle: CommerceProductionRehearsalBundle
    }): Promise<CommerceHeldOutAdmission>
  }
}): Promise<{
  readonly rehearsal: VerifiedCommerceProductionRehearsal
  readonly admission: CommerceHeldOutAdmission
}> {
  const bundle = commerceProductionRehearsalBundleSchema.parse(input.rehearsalBundle)
  const commitment = commerceHeldOutCommitmentSchema.parse(input.commitment)
  const evaluatorAttestation = commerceHeldOutEvaluatorAttestationSchema.parse(input.evaluatorAttestation)
  const expectedManifest = await expectedManifestFromBundle(bundle)
  const challenge = commitment.challengeSelection.payload
  if (canonicalJson(commitment.inputManifest) !== canonicalJson(expectedManifest)
    || commitment.inputManifestHash !== await fingerprint(expectedManifest)
    || challenge.inputManifestHash !== commitment.inputManifestHash
    || challenge.allowedRunId !== commitment.runId
    || challenge.hostBuildVersion !== commitment.hostBuildVersion
    || evaluatorAttestation.payload.hostBuildVersion !== commitment.hostBuildVersion
    || commitment.runId !== bundle.runId) {
    throw new Error('Held-out commitment does not bind the exact evaluator-selected Commerce input and run.')
  }

  // This complete verification remains authoritative for source ingestion,
  // receipt/byte identity, graph/Plan closure, semantic QA and playback.
  const rehearsal = await verifyCommerceProductionRehearsalBundle(bundle, {
    heldOutCommitmentHash: commitment.commitmentHash,
    host: input.host,
  })
  const admission = commerceHeldOutAdmissionSchema.parse(await input.host.admit({
    commitment,
    evaluatorAttestation,
    rehearsalBundle: bundle,
  }))
  assertExactAdmission({ commitment, attestation: evaluatorAttestation, admission, rehearsal })
  return { rehearsal, admission }
}

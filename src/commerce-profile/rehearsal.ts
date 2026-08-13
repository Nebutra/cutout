import { z } from 'zod'
import {
  evidenceGraphSchema,
  executionPlanSchema,
  outcomeContractSchema,
  outcomeGraphSchema,
} from '@/design-os-kernel'
import { canonicalJson, fingerprint } from '@/design-ir/fingerprint'
import { readRasterDimensions } from '@/lib/raster-dimensions'
import {
  multimodalHostReceiptSchema,
  verifiedMultimodalHostArtifactSchema,
  type MultimodalHostReceipt,
} from '@/multimodal-host/contracts'
import { verifyNativeMultimodalHostArtifact } from '@/multimodal-host/desktop-host'
import { buildAttributeIndex, buildCategoryIndex } from './catalog'
import {
  capabilityReceiptSchema,
  commerceMediaArtifactSchema,
  localizedDescriptionSchema,
  productFactsSchema,
  strategyDocumentSchema,
  type CapabilityReceipt,
  type LocalizedDescription,
  type StrategyDocument,
} from './contracts'
import {
  commerceMaterialPublicationSchema,
  evaluateCommerceProduction,
  type CommerceEvaluationResult,
  type CommerceMaterialPublication,
} from './evaluation'
import {
  COMMERCE_CREATIVE_DIRECTION_ID,
  COMMERCE_IDENTITY_LOCK_ID,
  COMMERCE_SEMANTIC_ROLES,
  commerceOutcomePayloadSchema,
  commerceSemanticRoleSchema,
  createCommerceEvidenceGraph,
  createCommerceOutcomeGraph,
  type CommerceSemanticRole,
} from './profile'
import { compileCommerceProduction } from './recipes'
import {
  commerceSourceIngestReceiptSchema,
  sha256CommerceSourceUrl,
  verifyNativeCommerceSourceIngestReceipt,
} from './source-ingest'

const MAX_RETAINED_BASE64_CHARACTERS = 360 * 1024 * 1024
const SEMANTIC_QA_CAPABILITY_ID = 'capability:commerce-semantic-media-qa'
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const artifactIdSchema = z.string().regex(/^artifact:sha256:[a-f0-9]{64}$/)
const base64Schema = z.string()
  .min(4)
  .max(MAX_RETAINED_BASE64_CHARACTERS)
  .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)

const retainedSemanticQaSchema = z.object({
  receipt: multimodalHostReceiptSchema,
  artifactBytesBase64: base64Schema,
}).strict()

export const commerceSemanticMediaQaSchema = z.object({
  schema: z.literal('commerce.semantic-media-qa.v1'),
  artifactId: z.string().regex(/^artifact:sha256:[a-f0-9]{64}$/),
  artifactSha256: sha256Schema,
  artifact: commerceMediaArtifactSchema,
  productIdentityVerified: z.literal(true),
  creativeDirectionVerified: z.literal(true),
  overlayTextVerified: z.literal(true),
  sensitiveVisualPolicyPassed: z.literal(true),
  usable: z.literal(true),
}).strict().superRefine((qa, context) => {
  if (qa.artifactId !== `artifact:sha256:${qa.artifactSha256}`) {
    context.addIssue({ code: 'custom', message: 'Semantic QA must bind the exact retained media hash.' })
  }
  if (qa.artifact.visualReviewLabels.length === 0) {
    context.addIssue({ code: 'custom', message: 'Semantic QA requires at least one signed visual review label.' })
  }
})
export type CommerceSemanticMediaQa = z.infer<typeof commerceSemanticMediaQaSchema>

export const COMMERCE_VIDEO_REFERENCE_ALLOWED_CHANGES = Object.freeze([
  'camera-motion',
  'temporal-composition',
  'native-audio',
] as const)

export const COMMERCE_DETAIL_REFERENCE_ALLOWED_CHANGES = Object.freeze([
  'camera-angle',
  'crop',
  'lighting',
  'background',
] as const)

const commerceDagReferenceBindingBaseShape = {
  sourcePlanNodeId: z.string().min(1).max(240),
  sourceSemanticRole: z.literal('main-image'),
  artifactId: artifactIdSchema,
  contentHash: sha256Schema,
  identityLockIds: z.tuple([
    z.literal(COMMERCE_IDENTITY_LOCK_ID),
    z.literal(COMMERCE_CREATIVE_DIRECTION_ID),
  ]),
}

const commerceVideoDagReferenceBindingSchema = z.object({
  ...commerceDagReferenceBindingBaseShape,
  referenceRole: z.literal('first-frame'),
  allowedChanges: z.tuple([
    z.literal(COMMERCE_VIDEO_REFERENCE_ALLOWED_CHANGES[0]),
    z.literal(COMMERCE_VIDEO_REFERENCE_ALLOWED_CHANGES[1]),
    z.literal(COMMERCE_VIDEO_REFERENCE_ALLOWED_CHANGES[2]),
  ]),
  bindingHash: sha256Schema,
}).strict()

const commerceDetailDagReferenceBindingSchema = z.object({
  ...commerceDagReferenceBindingBaseShape,
  referenceRole: z.literal('visual-continuity'),
  allowedChanges: z.tuple([
    z.literal(COMMERCE_DETAIL_REFERENCE_ALLOWED_CHANGES[0]),
    z.literal(COMMERCE_DETAIL_REFERENCE_ALLOWED_CHANGES[1]),
    z.literal(COMMERCE_DETAIL_REFERENCE_ALLOWED_CHANGES[2]),
    z.literal(COMMERCE_DETAIL_REFERENCE_ALLOWED_CHANGES[3]),
  ]),
  bindingHash: sha256Schema,
}).strict()

export const commerceDagReferenceBindingSchema = z.discriminatedUnion('referenceRole', [
  commerceVideoDagReferenceBindingSchema,
  commerceDetailDagReferenceBindingSchema,
]).superRefine((binding, context) => {
  if (binding.artifactId !== `artifact:sha256:${binding.contentHash}`) {
    context.addIssue({ code: 'custom', message: 'Commerce DAG reference identity must equal its content hash.' })
  }
})
export type CommerceDagReferenceBinding = z.infer<typeof commerceDagReferenceBindingSchema>

export async function createCommerceMediaDagReferenceBindings(input: {
  readonly semanticRole: CommerceSemanticRole
  readonly dependencies: readonly {
    readonly planNodeId: string
    readonly semanticRole: CommerceSemanticRole
    readonly artifactId: string
  }[]
}): Promise<readonly CommerceDagReferenceBinding[]> {
  if (input.semanticRole === 'main-image') {
    if (input.dependencies.length !== 0) {
      throw new Error('Commerce main image cannot claim an Outcome DAG reference.')
    }
    return []
  }
  const detail = input.semanticRole.startsWith('detail-image:')
  if (!detail && input.semanticRole !== 'product-video') return []
  const [dependency] = input.dependencies
  if (input.dependencies.length !== 1 || dependency?.semanticRole !== 'main-image') {
    throw new Error(`Commerce ${detail ? 'detail image' : 'product video'} requires the exact retained main image reference.`)
  }
  const core = {
    sourcePlanNodeId: dependency.planNodeId,
    sourceSemanticRole: dependency.semanticRole,
    artifactId: dependency.artifactId,
    contentHash: dependency.artifactId.slice('artifact:sha256:'.length),
    referenceRole: detail ? 'visual-continuity' as const : 'first-frame' as const,
    identityLockIds: [COMMERCE_IDENTITY_LOCK_ID, COMMERCE_CREATIVE_DIRECTION_ID],
    allowedChanges: detail
      ? COMMERCE_DETAIL_REFERENCE_ALLOWED_CHANGES
      : COMMERCE_VIDEO_REFERENCE_ALLOWED_CHANGES,
  }
  return [commerceDagReferenceBindingSchema.parse({
    ...core,
    bindingHash: await fingerprint(core),
  })]
}

export function commerceDagReferenceLockId(binding: CommerceDagReferenceBinding): string {
  return `commerce-dag-reference:sha256:${binding.bindingHash}`
}

export const commerceProductionRehearsalArtifactSchema = z.object({
  semanticRole: commerceSemanticRoleSchema,
  receipt: multimodalHostReceiptSchema,
  artifactBytesBase64: base64Schema,
  deliveryBytesBase64: base64Schema.optional(),
  semanticQa: retainedSemanticQaSchema.optional(),
}).strict()

export const commerceRehearsalSourceMaterialSchema = z.object({
  factId: z.string().min(1).max(240),
  source: z.object({
    file: z.string().min(1).max(512),
    pointer: z.string().startsWith('/').max(2_000),
    descriptor: z.string().min(1).max(4_096),
  }).strict(),
  artifactId: artifactIdSchema,
  sha256: sha256Schema,
  mediaType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  byteLength: z.number().int().positive().max(10 * 1024 * 1024),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  ingestReceipt: commerceSourceIngestReceiptSchema,
  artifactBytesBase64: base64Schema,
}).strict().superRefine((material, context) => {
  if (material.artifactId !== `artifact:sha256:${material.sha256}`) {
    context.addIssue({ code: 'custom', message: 'Commerce source material identity must equal its content hash.' })
  }
})
export type CommerceRehearsalSourceMaterial = z.infer<typeof commerceRehearsalSourceMaterialSchema>

export const commerceProductionRehearsalBundleSchema = z.object({
  schema: z.literal('commerce.production-rehearsal.v1'),
  identity: z.object({
    id: z.string().min(1).max(240),
    revision: z.string().min(1).max(240),
  }).strict(),
  runId: z.string().min(1).max(240),
  facts: productFactsSchema,
  categoryCatalog: z.string().min(2).max(8 * 1024 * 1024),
  attributeCatalog: z.string().min(2).max(8 * 1024 * 1024),
  sourceMaterials: z.array(commerceRehearsalSourceMaterialSchema).min(1).max(3),
  evidenceGraph: evidenceGraphSchema,
  outcomeGraph: outcomeGraphSchema,
  contract: outcomeContractSchema,
  plan: executionPlanSchema,
  artifacts: z.array(commerceProductionRehearsalArtifactSchema)
    .length(COMMERCE_SEMANTIC_ROLES.length),
}).strict().superRefine((bundle, context) => {
  const retainedCharacters = bundle.artifacts.reduce((total, artifact) => total
    + artifact.artifactBytesBase64.length
    + (artifact.deliveryBytesBase64?.length ?? 0)
    + (artifact.semanticQa?.artifactBytesBase64.length ?? 0), 0)
    + bundle.sourceMaterials.reduce((total, material) => total + material.artifactBytesBase64.length, 0)
  if (retainedCharacters > MAX_RETAINED_BASE64_CHARACTERS) {
    context.addIssue({ code: 'custom', message: 'Commerce rehearsal retained bytes exceed the bounded run budget.' })
  }
})
export type CommerceProductionRehearsalBundle = z.infer<typeof commerceProductionRehearsalBundleSchema>

export interface VerifiedCommerceRehearsalBytes {
  readonly artifactId: string
  readonly contentHash: string
  readonly mediaType: string
  readonly byteLength: number
  readonly receiptId: string
  readonly derivedFromArtifactId?: string
}

export interface VerifiedCommerceRehearsalArtifact {
  readonly semanticRole: CommerceSemanticRole
  readonly receipt: MultimodalHostReceipt
  readonly publication: CommerceMaterialPublication
  readonly retainedBytes: readonly VerifiedCommerceRehearsalBytes[]
  readonly dagReferenceBindings: readonly CommerceDagReferenceBinding[]
  readonly semanticQa?: {
    readonly receipt: MultimodalHostReceipt
    readonly retainedBytes: VerifiedCommerceRehearsalBytes
  }
}

export interface VerifiedCommerceProductionRehearsal {
  readonly identity: CommerceProductionRehearsalBundle['identity']
  readonly runId: string
  readonly bundleHash: string
  readonly evaluation: CommerceEvaluationResult
  readonly sourceMaterials: readonly Omit<CommerceRehearsalSourceMaterial, 'artifactBytesBase64'>[]
  readonly artifacts: readonly VerifiedCommerceRehearsalArtifact[]
}

function bytesFromBase64(value: string): Uint8Array {
  const parsed = base64Schema.parse(value)
  const binary = atob(parsed)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.length)
  copy.set(bytes)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', copy.buffer)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function decodeJsonBytes(bytes: Uint8Array, label: string): unknown {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new Error(`${label} is not valid UTF-8.`)
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`${label} is not valid JSON.`)
  }
}

function citedText(text: string, factIds: readonly string[]): string {
  return `${text} [facts: ${factIds.join(', ')}]`
}

export function renderCommerceStructuredDelivery(
  payload: LocalizedDescription | StrategyDocument,
): string {
  if (payload.schema === 'commerce.localized-description.v1') {
    return [
      `# ${citedText(payload.title.text, payload.title.citations.map((citation) => citation.factId))}`,
      '',
      ...payload.summary.map((claim) => citedText(claim.text, claim.citations.map((citation) => citation.factId))),
      '',
      '## Product',
      citedText(payload.productIdentity.text, payload.productIdentity.citations.map((citation) => citation.factId)),
      citedText(payload.sourcePlatform.text, payload.sourcePlatform.citations.map((citation) => citation.factId)),
      ...payload.attributes.map((claim) => citedText(claim.text, claim.citations.map((citation) => citation.factId))),
      ...payload.skuBreakdown.map((claim) => citedText(claim.text, claim.citations.map((citation) => citation.factId))),
      ...payload.mediaDescriptions.map((claim) => citedText(claim.text, claim.citations.map((citation) => citation.factId))),
      '',
    ].join('\n')
  }
  const section = (label: string, values: readonly string[]) => [
    `## ${label}`,
    ...(values.length > 0 ? values.map((value) => `- ${value}`) : ['- None']),
    '',
  ]
  return [
    '# Commerce Strategy',
    '',
    ...payload.narrative.map((claim) => citedText(claim.text, claim.citations.map((citation) => citation.factId))),
    '',
    ...section('Facts', payload.factIds),
    ...section('Plan', payload.planNodeIds),
    ...section('Routes', payload.routeIds),
    ...section('Validations', payload.validationFindingCodes),
    ...section('Receipts', payload.receiptIds),
    ...section('Repairs', payload.repairReceiptIds),
  ].join('\n')
}

function exactArray(actual: readonly string[], expected: readonly string[], label: string): void {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new Error(`${label} must match the exact Commerce rehearsal closure.`)
  }
}

async function assertCanonicalDocument(actual: unknown, expected: unknown, label: string): Promise<void> {
  if (await fingerprint(actual) !== await fingerprint(expected)) {
    throw new Error(`${label} does not match the canonical Commerce production document.`)
  }
}

async function assertFrozenCommerceDocuments(bundle: CommerceProductionRehearsalBundle): Promise<void> {
  const expectedEvidence = createCommerceEvidenceGraph({
    facts: bundle.facts,
    id: bundle.evidenceGraph.identity.id,
    revision: bundle.evidenceGraph.identity.revision,
  })
  const expectedOutcomes = createCommerceOutcomeGraph({
    facts: bundle.facts,
    id: bundle.outcomeGraph.identity.id,
    revision: bundle.outcomeGraph.identity.revision,
  })
  await assertCanonicalDocument(bundle.evidenceGraph, expectedEvidence, 'Rehearsal EvidenceGraph')
  await assertCanonicalDocument(bundle.outcomeGraph, expectedOutcomes, 'Rehearsal OutcomeGraph')
  const compiled = await compileCommerceProduction({
    evidenceGraph: bundle.evidenceGraph,
    outcomeGraph: bundle.outcomeGraph,
    contractId: bundle.contract.identity.id,
    contractRevision: bundle.contract.identity.revision,
    planId: bundle.plan.identity.id,
    planRevision: bundle.plan.identity.revision,
    sourceImageArtifactIds: bundle.sourceMaterials.map((material) => material.artifactId),
  })
  await assertCanonicalDocument(bundle.contract, compiled.contract, 'Rehearsal Contract')
  await assertCanonicalDocument(bundle.plan, compiled.plan, 'Rehearsal Plan')
}

async function signedRunBindings(bundle: CommerceProductionRehearsalBundle): Promise<readonly string[]> {
  const catalogHashes = await Promise.all([
    sha256Bytes(new TextEncoder().encode(bundle.categoryCatalog)),
    sha256Bytes(new TextEncoder().encode(bundle.attributeCatalog)),
  ])
  return [
    COMMERCE_IDENTITY_LOCK_ID,
    COMMERCE_CREATIVE_DIRECTION_ID,
    `evidence-graph:sha256:${await fingerprint(bundle.evidenceGraph)}`,
    `outcome-graph:sha256:${await fingerprint(bundle.outcomeGraph)}`,
    `outcome-contract:sha256:${await fingerprint(bundle.contract)}`,
    `execution-plan:sha256:${await fingerprint(bundle.plan)}`,
    `category-catalog:sha256:${catalogHashes[0]}`,
    `attribute-catalog:sha256:${catalogHashes[1]}`,
    `source-materials:sha256:${await fingerprint(bundle.sourceMaterials.map((material) => ({
      factId: material.factId,
      source: material.source,
      artifactId: material.artifactId,
      sha256: material.sha256,
      mediaType: material.mediaType,
      byteLength: material.byteLength,
      width: material.width,
      height: material.height,
      ingestReceiptId: material.ingestReceipt.receiptId,
      ingestReceiptHash: material.ingestReceipt.receiptHash,
    })))}`,
    `rehearsal-identity:sha256:${await fingerprint(bundle.identity)}`,
  ]
}

function sourceMediaType(bytes: Uint8Array): CommerceRehearsalSourceMaterial['mediaType'] | undefined {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50
    && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.subarray(0, 4)) === 'RIFF'
    && new TextDecoder().decode(bytes.subarray(8, 12)) === 'WEBP') return 'image/webp'
  return undefined
}

async function verifySourceMaterials(
  bundle: CommerceProductionRehearsalBundle,
): Promise<VerifiedCommerceProductionRehearsal['sourceMaterials']> {
  assertUnique(bundle.sourceMaterials.map((material) => material.artifactId), 'Commerce source material artifact ids')
  assertUnique(bundle.sourceMaterials.map((material) => material.factId), 'Commerce source material fact ids')
  assertUnique(
    bundle.sourceMaterials.map((material) => material.ingestReceipt.receiptId),
    'Commerce source material ingest receipt ids',
  )
  assertUnique(
    bundle.sourceMaterials.map((material) => material.ingestReceipt.requestId),
    'Commerce source material ingest request ids',
  )
  const verified: Omit<CommerceRehearsalSourceMaterial, 'artifactBytesBase64'>[] = []
  for (const material of bundle.sourceMaterials) {
    const fact = bundle.facts.facts.find((candidate) => candidate.id === material.factId)
    if (!fact || fact.value.type !== 'media' || fact.value.mediaKind !== 'image'
      || fact.confidence === 'unknown' || fact.value.descriptor !== material.source.descriptor
      || fact.source.file !== material.source.file || fact.source.pointer !== material.source.pointer) {
      throw new Error(`Commerce source material ${material.artifactId} does not match its image fact lineage.`)
    }
    const bytes = bytesFromBase64(material.artifactBytesBase64)
    const digest = await sha256Bytes(bytes)
    const dimensions = readRasterDimensions(bytes)
    if (digest !== material.sha256 || bytes.byteLength !== material.byteLength
      || sourceMediaType(bytes) !== material.mediaType || !dimensions
      || dimensions.width !== material.width || dimensions.height !== material.height) {
      throw new Error(`Commerce source material ${material.artifactId} does not match its retained decoded bytes.`)
    }
    const receipt = material.ingestReceipt
    const sourceUrl = new URL(material.source.descriptor).href
    const parsedSourceUrl = new URL(sourceUrl)
    if (receipt.runId !== bundle.runId || receipt.factId !== material.factId
      || receipt.sourceFile !== material.source.file
      || receipt.sourcePointer !== material.source.pointer
      || receipt.sourceOrigin !== parsedSourceUrl.origin
      || receipt.sourcePath !== parsedSourceUrl.pathname
      || receipt.sourceUrlSha256 !== await sha256CommerceSourceUrl(sourceUrl)
      || canonicalJson(receipt.artifact) !== canonicalJson({
        artifactId: material.artifactId,
        sha256: material.sha256,
        mediaType: material.mediaType,
        byteLength: material.byteLength,
        decoded: true,
        width: material.width,
        height: material.height,
      })) {
      throw new Error(`Commerce source material ${material.artifactId} does not match its source-ingest receipt URL, fact, or bytes.`)
    }
    const verifiedReceipt = commerceSourceIngestReceiptSchema.parse(
      await verifyNativeCommerceSourceIngestReceipt({ receipt, bytes }),
    )
    if (canonicalJson(verifiedReceipt) !== canonicalJson(receipt)) {
      throw new Error(`Commerce source material ${material.artifactId} source-ingest receipt was not authenticated unchanged.`)
    }
    const { artifactBytesBase64: _bytes, ...metadata } = material
    verified.push(metadata)
  }
  return verified
}

async function verifyRetainedArtifact(input: {
  readonly receipt: MultimodalHostReceipt
  readonly bytes: Uint8Array
  readonly label: string
}): Promise<VerifiedCommerceRehearsalBytes> {
  const digest = await sha256Bytes(input.bytes)
  if (digest !== input.receipt.artifact.sha256
    || input.bytes.byteLength !== input.receipt.artifact.byteLength
    || input.receipt.artifact.artifactId !== `artifact:sha256:${digest}`) {
    throw new Error(`${input.label} does not match its retained artifact bytes.`)
  }
  const verified = verifiedMultimodalHostArtifactSchema.parse(await verifyNativeMultimodalHostArtifact({
    receipt: input.receipt,
    bytes: input.bytes,
  }))
  if (canonicalJson(verified.receipt) !== canonicalJson(input.receipt)
    || canonicalJson(verified.artifact) !== canonicalJson(input.receipt.artifact)) {
    throw new Error(`${input.label} verifier changed or failed to authenticate the retained receipt.`)
  }
  return {
    artifactId: input.receipt.artifact.artifactId,
    contentHash: sha256Schema.parse(digest),
    mediaType: input.receipt.artifact.mediaType,
    byteLength: input.bytes.byteLength,
    receiptId: input.receipt.receiptId,
  }
}

function assertReceiptContext(input: {
  readonly receipt: MultimodalHostReceipt
  readonly runId: string
  readonly semanticRole: CommerceSemanticRole
  readonly nodeId: string
  readonly capabilityId: string
  readonly operation: MultimodalHostReceipt['operation']
  readonly acceptedReferenceArtifactIds: readonly string[]
  readonly lockIds: readonly string[]
  readonly label: string
}): void {
  if (input.receipt.runId !== input.runId
    || input.receipt.semanticRole !== input.semanticRole
    || input.receipt.nodeId !== input.nodeId
    || input.receipt.capabilityId !== input.capabilityId
    || input.receipt.operation !== input.operation) {
    throw new Error(`${input.label} is not bound to the exact run, semantic role, Plan node, and capability.`)
  }
  exactArray(input.receipt.lockIds, input.lockIds, `${input.label} locks`)
  exactArray(
    input.receipt.acceptedReferenceArtifactIds,
    input.acceptedReferenceArtifactIds,
    `${input.label} accepted references`,
  )
}

function operationForRole(role: CommerceSemanticRole): MultimodalHostReceipt['operation'] {
  if (role.startsWith('localized-description:') || role === 'strategy-document') return 'structured-text'
  if (role === 'product-video') return 'image-to-video'
  return 'image-edit'
}

function mediaTypeForStructuredDelivery(): 'text/markdown' {
  return 'text/markdown'
}

async function documentPublication(input: {
  readonly role: CommerceSemanticRole
  readonly outcomeNodeId: string
  readonly receipt: MultimodalHostReceipt
  readonly sourceBytes: Uint8Array
  readonly deliveryBytesBase64?: string
}): Promise<{
  readonly publication: CommerceMaterialPublication
  readonly retainedDelivery: VerifiedCommerceRehearsalBytes
}> {
  if (input.receipt.artifact.mediaType !== 'application/json') {
    throw new Error(`Structured Commerce artifact ${input.role} must retain signed JSON source bytes.`)
  }
  const raw = decodeJsonBytes(input.sourceBytes, `Structured Commerce artifact ${input.role}`)
  const payload = input.role.startsWith('localized-description:')
    ? localizedDescriptionSchema.parse(raw)
    : strategyDocumentSchema.parse(raw)
  if (payload.schema === 'commerce.localized-description.v1'
    && input.role !== `localized-description:${payload.locale}`) {
    throw new Error(`Localized Commerce artifact ${input.role} contains another locale.`)
  }
  if (!input.deliveryBytesBase64) {
    throw new Error(`Structured Commerce artifact ${input.role} is missing retained Markdown delivery bytes.`)
  }
  const deliveryBytes = bytesFromBase64(input.deliveryBytesBase64)
  const expectedBytes = new TextEncoder().encode(renderCommerceStructuredDelivery(payload))
  if (deliveryBytes.byteLength !== expectedBytes.byteLength
    || deliveryBytes.some((byte, index) => byte !== expectedBytes[index])) {
    throw new Error(`Structured Commerce artifact ${input.role} does not match its deterministic Markdown derivation.`)
  }
  const contentHash = await sha256Bytes(deliveryBytes)
  const artifactId = `artifact:sha256:${contentHash}`
  return {
    publication: commerceMaterialPublicationSchema.parse({
      artifactId,
      outcomeNodeId: input.outcomeNodeId,
      mediaType: mediaTypeForStructuredDelivery(),
      byteLength: deliveryBytes.byteLength,
      payload,
    }),
    retainedDelivery: {
      artifactId,
      contentHash,
      mediaType: mediaTypeForStructuredDelivery(),
      byteLength: deliveryBytes.byteLength,
      receiptId: input.receipt.receiptId,
      derivedFromArtifactId: input.receipt.artifact.artifactId,
    },
  }
}

function mediaPublication(input: {
  readonly outcomeNodeId: string
  readonly receipt: MultimodalHostReceipt
  readonly semanticQaPayload: CommerceSemanticMediaQa
}): CommerceMaterialPublication {
  const artifact = input.receipt.artifact
  const qa = input.semanticQaPayload.artifact
  if (input.semanticQaPayload.artifactId !== artifact.artifactId
    || input.semanticQaPayload.artifactSha256 !== artifact.sha256) {
    throw new Error(`Signed semantic QA does not bind retained media ${qa.role}.`)
  }
  if (qa.mediaType !== artifact.mediaType || qa.byteLength !== artifact.byteLength
    || qa.width !== artifact.width || qa.height !== artifact.height
    || (qa.mediaKind === 'video') !== (artifact.mediaType === 'video/mp4')
    || (qa.mediaKind === 'video' && qa.playable !== artifact.playbackVerified)) {
    throw new Error(`Signed semantic QA metadata does not match retained media ${qa.role}.`)
  }
  return commerceMaterialPublicationSchema.parse({
    artifactId: artifact.artifactId,
    outcomeNodeId: input.outcomeNodeId,
    mediaType: artifact.mediaType,
    byteLength: artifact.byteLength,
    payload: qa,
  })
}

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique.`)
}

export async function verifyCommerceProductionRehearsalBundle(
  input: unknown,
): Promise<VerifiedCommerceProductionRehearsal> {
  const bundle = commerceProductionRehearsalBundleSchema.parse(input)
  exactArray(
    bundle.artifacts.map((artifact) => artifact.semanticRole),
    COMMERCE_SEMANTIC_ROLES,
    'Rehearsal semantic roles',
  )
  const sourceMaterials = await verifySourceMaterials(bundle)
  await assertFrozenCommerceDocuments(bundle)
  const runBindings = await signedRunBindings(bundle)
  const categoryIndex = buildCategoryIndex(bundle.categoryCatalog)
  const attributeIndex = buildAttributeIndex(bundle.attributeCatalog, categoryIndex)
  const nodeByRole = new Map(bundle.outcomeGraph.body.nodes.map((node) => [
    commerceOutcomePayloadSchema.parse(node.payload).semanticRole,
    node,
  ]))
  const planByOutcome = new Map(bundle.plan.body.nodes.map((node) => [node.outcomeNodeId, node]))
  const prepared: Array<VerifiedCommerceRehearsalArtifact & {
    readonly planNode: (typeof bundle.plan.body.nodes)[number]
    dagReferenceBindings: CommerceDagReferenceBinding[]
  }> = []
  for (const retained of bundle.artifacts) {
    const node = nodeByRole.get(retained.semanticRole)
    const planNode = node && planByOutcome.get(node.id)
    if (!node || !planNode) throw new Error(`Rehearsal role is missing from the frozen graph or Plan: ${retained.semanticRole}`)
    const sourceBytes = bytesFromBase64(retained.artifactBytesBase64)
    const sourceEvidence = await verifyRetainedArtifact({
      receipt: retained.receipt,
      bytes: sourceBytes,
      label: `Commerce artifact ${retained.semanticRole}`,
    })
    let publication: CommerceMaterialPublication
    const retainedBytes: VerifiedCommerceRehearsalBytes[] = [sourceEvidence]
    let semanticQa: VerifiedCommerceRehearsalArtifact['semanticQa']
    if (retained.semanticRole.startsWith('localized-description:') || retained.semanticRole === 'strategy-document') {
      if (retained.semanticQa) throw new Error(`Structured Commerce artifact ${retained.semanticRole} cannot carry media QA.`)
      const document = await documentPublication({
        role: retained.semanticRole,
        outcomeNodeId: node.id,
        receipt: retained.receipt,
        sourceBytes,
        deliveryBytesBase64: retained.deliveryBytesBase64,
      })
      publication = document.publication
      retainedBytes.push(document.retainedDelivery)
    } else {
      if (retained.deliveryBytesBase64) throw new Error(`Media artifact ${retained.semanticRole} cannot carry derived document bytes.`)
      if (!retained.semanticQa) throw new Error(`Media artifact ${retained.semanticRole} requires signed semantic QA.`)
      const qaBytes = bytesFromBase64(retained.semanticQa.artifactBytesBase64)
      const qaEvidence = await verifyRetainedArtifact({
        receipt: retained.semanticQa.receipt,
        bytes: qaBytes,
        label: `Commerce semantic QA ${retained.semanticRole}`,
      })
      if (retained.semanticQa.receipt.artifact.mediaType !== 'application/json') {
        throw new Error(`Commerce semantic QA ${retained.semanticRole} must retain signed JSON bytes.`)
      }
      const qaPayload = commerceSemanticMediaQaSchema.parse(
        decodeJsonBytes(qaBytes, `Commerce semantic QA ${retained.semanticRole}`),
      )
      publication = mediaPublication({
        outcomeNodeId: node.id,
        receipt: retained.receipt,
        semanticQaPayload: qaPayload,
      })
      semanticQa = { receipt: retained.semanticQa.receipt, retainedBytes: qaEvidence }
    }
    prepared.push({
      semanticRole: retained.semanticRole,
      planNode,
      receipt: retained.receipt,
      publication,
      retainedBytes,
      dagReferenceBindings: [],
      ...(semanticQa ? { semanticQa } : {}),
    })
  }

  const artifactByPlanNode = new Map(prepared.map((artifact) => [artifact.planNode.id, artifact]))
  for (const artifact of prepared) {
    const dependencies = artifact.planNode.dependencyNodeIds.map((nodeId) => {
      const dependency = artifactByPlanNode.get(nodeId)
      if (!dependency) throw new Error(`Rehearsal Plan dependency has no retained artifact: ${nodeId}`)
      return dependency
    })
    const expectedReferences = [
      ...artifact.planNode.inputArtifactIds,
      ...dependencies.map((dependency) => dependency.publication.artifactId),
    ]
    artifact.dagReferenceBindings.push(...await createCommerceMediaDagReferenceBindings({
      semanticRole: artifact.semanticRole,
      dependencies: dependencies.map((dependency) => ({
        planNodeId: dependency.planNode.id,
        semanticRole: dependency.semanticRole,
        artifactId: dependency.publication.artifactId,
      })),
    }))
    assertReceiptContext({
      receipt: artifact.receipt,
      runId: bundle.runId,
      semanticRole: artifact.semanticRole,
      nodeId: artifact.planNode.id,
      capabilityId: artifact.planNode.capabilityId,
      operation: operationForRole(artifact.semanticRole),
      acceptedReferenceArtifactIds: expectedReferences,
      lockIds: [
        ...runBindings,
        ...artifact.dagReferenceBindings.map(commerceDagReferenceLockId),
      ],
      label: `Commerce artifact ${artifact.semanticRole}`,
    })
    if (artifact.semanticQa) {
      assertReceiptContext({
        receipt: artifact.semanticQa.receipt,
        runId: bundle.runId,
        semanticRole: artifact.semanticRole,
        nodeId: `${artifact.planNode.id}:semantic-qa`,
        capabilityId: SEMANTIC_QA_CAPABILITY_ID,
        operation: 'vision-ocr',
        acceptedReferenceArtifactIds: [artifact.receipt.artifact.artifactId],
        lockIds: runBindings,
        label: `Commerce semantic QA ${artifact.semanticRole}`,
      })
    }
  }

  const primaryReceipts = prepared.map((artifact) => artifact.receipt)
  const qaReceipts = prepared.flatMap((artifact) => artifact.semanticQa ? [artifact.semanticQa.receipt] : [])
  assertUnique([...primaryReceipts, ...qaReceipts].map((receipt) => receipt.receiptId), 'Rehearsal receipt ids')
  assertUnique([...primaryReceipts, ...qaReceipts].map((receipt) => receipt.requestId), 'Rehearsal request ids')
  assertUnique(prepared.map((artifact) => artifact.publication.artifactId), 'Rehearsal publication artifact ids')
  const strategy = prepared.find((artifact) => artifact.semanticRole === 'strategy-document')
  if (!strategy) throw new Error('Rehearsal strategy artifact is missing.')
  const latestDependencyCompletion = Math.max(...prepared
    .filter((artifact) => artifact.semanticRole !== 'strategy-document')
    .flatMap((artifact) => [artifact.receipt.completedAt, artifact.semanticQa?.receipt.completedAt ?? 0]))
  if (strategy.receipt.startedAt < latestDependencyCompletion) {
    throw new Error('Commerce strategy must be generated after every material and semantic QA receipt settles.')
  }

  const receipts: CapabilityReceipt[] = prepared.map((artifact) => capabilityReceiptSchema.parse({
    id: artifact.receipt.receiptId,
    nodeId: artifact.planNode.id,
    capabilityId: artifact.planNode.capabilityId,
    routeId: artifact.receipt.routeId,
    attempt: 1,
    artifactId: artifact.publication.artifactId,
    status: 'accepted',
  }))
  const publications = prepared.map((artifact) => artifact.publication)
  const evaluation = evaluateCommerceProduction({
    facts: bundle.facts,
    categoryIndex,
    attributeIndex,
    outcomeGraph: bundle.outcomeGraph,
    plan: bundle.plan,
    publications,
    receipts,
    supportingReceipts: qaReceipts.map((receipt) => ({ id: receipt.receiptId, routeId: receipt.routeId })),
  })
  if (!evaluation.ready || evaluation.findings.length > 0
    || evaluation.validArtifactIds.length !== COMMERCE_SEMANTIC_ROLES.length) {
    throw new Error(`Commerce production rehearsal failed internal evaluation: ${evaluation.findings
      .map((finding) => finding.code).join(', ') || 'artifact closure incomplete'}`)
  }
  return {
    identity: bundle.identity,
    runId: bundle.runId,
    bundleHash: await fingerprint(bundle),
    evaluation,
    sourceMaterials,
    artifacts: prepared.map(({ planNode: _planNode, ...artifact }) => artifact),
  }
}

import { z } from 'zod'
import { fingerprint } from '@/design-ir/fingerprint'
import { base64ToBytes, bytesToBlob } from '@/lib/image'
import { readRasterDimensions } from '@/lib/raster-dimensions'
import { multimodalHostReceiptSchema } from '@/multimodal-host/contracts'
import { buildAttributeIndex, buildCategoryIndex } from './catalog'
import { productFactsSchema, type ProductFacts } from './contracts'
import { normalizeProductRecord } from './normalizer'
import {
  COMMERCE_CREATIVE_DIRECTION_ID,
  COMMERCE_CAPABILITY_IDS,
  COMMERCE_IDENTITY_LOCK_ID,
  COMMERCE_SEMANTIC_ROLES,
  commerceSemanticRoleSchema,
  createCommerceEvidenceGraph,
  createCommerceOutcomeGraph,
  type CommerceSemanticRole,
} from './profile'
import {
  assertCommerceProductionProviderAuthority,
  assertCommerceProductionRunnerRoutes,
  assertCommerceProductionSourceSelection,
  executeCommerceProduction,
  type CommerceProductionExecutionArtifact,
} from './production-runner'
import {
  createCommerceProductionDesktopHost,
  type CommerceProductionCoreHost,
} from './production-host'
import { compileCommerceProduction } from './recipes'
import {
  commerceSemanticMediaQaSchema,
  commerceSourceMediaType,
} from './rehearsal'

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder('utf-8', { fatal: true })
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const artifactIdSchema = z.string().regex(/^artifact:sha256:[a-f0-9]{64}$/)
const projectFileNameSchema = z.string().min(1).max(240).refine(
  (value) => value !== '.' && value !== '..'
    && !value.includes('/') && !value.includes('\\')
    && ![...value].some((character) => {
      const codePoint = character.codePointAt(0)!
      return codePoint <= 0x1f || codePoint === 0x7f
    }),
  'Commerce Project filenames must be plain local basenames.',
)
const projectJsonFileNameSchema = projectFileNameSchema.refine(
  (value) => value.toLocaleLowerCase('en-US').endsWith('.json'),
  'Commerce Project JSON inputs must use a .json filename.',
)
const boundedJsonContentsSchema = z.string().min(2).max(8 * 1024 * 1024)
const retainedBase64Schema = z.string().min(4).max(384 * 1024 * 1024)

export const COMMERCE_PROJECT_PRODUCTION_SCHEMA = 'commerce.project-production.v1' as const
export const MAX_COMMERCE_PROJECT_REFERENCE_BYTES = 10 * 1024 * 1024

export interface CommerceProjectReferenceInput {
  readonly fileName: string
  readonly mediaType?: string
  readonly bytes: Uint8Array
}

export interface CommerceProjectProductionInput {
  readonly providerId: string
  readonly product: {
    readonly fileName: string
    readonly contents: string
  }
  readonly categoryCatalog: {
    readonly fileName: string
    readonly contents: string
  }
  readonly attributeCatalog: {
    readonly fileName: string
    readonly contents: string
  }
  readonly references: readonly CommerceProjectReferenceInput[]
  readonly signal?: AbortSignal
  readonly onProgress?: (event: CommerceProjectProgressEvent) => void | Promise<void>
}

const commerceProjectSourceSchema = z.object({
  fileName: projectFileNameSchema,
  factId: z.string().min(1).max(240),
  sourcePointer: z.string().startsWith('/').max(2_000),
  artifactId: artifactIdSchema,
  sha256: sha256Schema,
  mediaType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  byteLength: z.number().int().positive().max(MAX_COMMERCE_PROJECT_REFERENCE_BYTES),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
}).strict()
export type CommerceProjectSource = z.infer<typeof commerceProjectSourceSchema>

const commerceProjectQaSchema = z.object({
  status: z.literal('passed'),
  receipt: multimodalHostReceiptSchema,
  assessment: commerceSemanticMediaQaSchema,
}).strict()

export const commerceProjectDeliverableSchema = z.object({
  semanticRole: commerceSemanticRoleSchema,
  planNodeId: z.string().min(1).max(240),
  fileName: projectFileNameSchema,
  artifactId: artifactIdSchema,
  sha256: sha256Schema,
  mediaType: z.enum([
    'text/markdown',
    'image/png',
    'image/jpeg',
    'image/webp',
    'video/mp4',
  ]),
  byteLength: z.number().int().positive(),
  bytesBase64: retainedBase64Schema,
  providerReceipt: multimodalHostReceiptSchema,
  playbackSourceReceipt: multimodalHostReceiptSchema.optional(),
  qa: commerceProjectQaSchema.optional(),
  diagnostics: z.array(z.string().min(1).max(500)).max(100),
}).strict().superRefine((deliverable, context) => {
  const media = deliverable.semanticRole === 'main-image'
    || deliverable.semanticRole.startsWith('detail-image:')
    || deliverable.semanticRole === 'product-video'
  if (media !== (deliverable.qa !== undefined)) {
    context.addIssue({ code: 'custom', message: 'Commerce Project media deliverables require passing semantic QA.' })
  }
  if ((deliverable.semanticRole === 'product-video') !== (deliverable.playbackSourceReceipt !== undefined)) {
    context.addIssue({ code: 'custom', message: 'Commerce Project video requires its playback source receipt.' })
  }
})
export type CommerceProjectDeliverable = z.infer<typeof commerceProjectDeliverableSchema>

export const commerceProjectProductionResultSchema = z.object({
  schema: z.literal(COMMERCE_PROJECT_PRODUCTION_SCHEMA),
  run: z.object({
    runId: z.string().min(1).max(240),
    status: z.literal('completed'),
    providerId: z.string().min(1).max(160),
    startedAt: z.number().int().nonnegative(),
    completedAt: z.number().int().nonnegative(),
  }).strict(),
  product: z.object({
    fileName: projectJsonFileNameSchema,
    facts: productFactsSchema,
  }).strict(),
  sources: z.array(commerceProjectSourceSchema).min(1).max(3),
  runBindings: z.array(z.string().min(1).max(240)).min(1).max(64),
  deliverables: z.array(commerceProjectDeliverableSchema).length(COMMERCE_SEMANTIC_ROLES.length),
}).strict().superRefine((result, context) => {
  if (result.run.completedAt < result.run.startedAt) {
    context.addIssue({ code: 'custom', message: 'Commerce Project completion cannot precede its start.' })
  }
  if (result.deliverables.some((deliverable, index) => (
    deliverable.semanticRole !== COMMERCE_SEMANTIC_ROLES[index]
  ))) {
    context.addIssue({ code: 'custom', message: 'Commerce Project deliverables must retain the exact ordered role closure.' })
  }
  const receipts = result.deliverables.flatMap((deliverable) => [
    deliverable.providerReceipt,
    ...(deliverable.playbackSourceReceipt ? [deliverable.playbackSourceReceipt] : []),
    ...(deliverable.qa ? [deliverable.qa.receipt] : []),
  ])
  if (receipts.some((receipt) => receipt.heldOutCommitmentHash !== undefined)) {
    context.addIssue({ code: 'custom', message: 'Commerce Project receipts cannot carry held-out evaluator authority.' })
  }
  const exact = (actual: readonly string[], expected: readonly string[]) => (
    actual.length === expected.length && actual.every((value, index) => value === expected[index])
  )
  const main = result.deliverables.find((deliverable) => deliverable.semanticRole === 'main-image')
  for (const [index, deliverable] of result.deliverables.entries()) {
    const role = deliverable.semanticRole
    const receipt = deliverable.providerReceipt
    const expectedOperation = role.startsWith('localized-description:') || role === 'strategy-document'
      ? 'structured-text'
      : role === 'product-video'
        ? 'image-to-video'
        : 'image-edit'
    const expectedCapability = role.startsWith('localized-description:')
      ? COMMERCE_CAPABILITY_IDS.localizedCopy
      : role === 'strategy-document'
        ? COMMERCE_CAPABILITY_IDS.strategy
        : role === 'product-video'
          ? COMMERCE_CAPABILITY_IDS.video
          : COMMERCE_CAPABILITY_IDS.image
    const expectedReferences = role === 'main-image'
      ? result.sources.map((source) => source.artifactId)
      : role.startsWith('detail-image:')
        ? [result.sources[0]!.artifactId, main?.artifactId ?? 'missing-main-image']
        : role === 'product-video'
          ? [main?.artifactId ?? 'missing-main-image']
          : role === 'strategy-document'
            ? result.deliverables.slice(0, index).map((candidate) => candidate.artifactId)
            : []
    const expectedRunLocks = role.startsWith('detail-image:') || role === 'product-video'
      ? result.runBindings.length + 1
      : result.runBindings.length
    const primaryContextValid = receipt.runId === result.run.runId
      && receipt.providerId === result.run.providerId
      && receipt.semanticRole === role
      && receipt.nodeId === deliverable.planNodeId
      && receipt.capabilityId === expectedCapability
      && receipt.operation === expectedOperation
      && exact(receipt.acceptedReferenceArtifactIds, expectedReferences)
      && receipt.lockIds.length === expectedRunLocks
      && exact(receipt.lockIds.slice(0, result.runBindings.length), result.runBindings)
      && (expectedRunLocks === result.runBindings.length
        || receipt.lockIds.at(-1)?.startsWith('commerce-dag-reference:sha256:') === true)
    if (!primaryContextValid) {
      context.addIssue({ code: 'custom', path: ['deliverables', index], message: 'Commerce Project receipt context does not match its exact run, Plan node, references, and locks.' })
    }
    if (deliverable.qa) {
      const qa = deliverable.qa.receipt
      if (qa.runId !== result.run.runId || qa.providerId !== result.run.providerId
        || qa.semanticRole !== role || qa.nodeId !== `${deliverable.planNodeId}:semantic-qa`
        || qa.capabilityId !== 'capability:commerce-semantic-media-qa'
        || qa.operation !== 'vision-ocr'
        || !exact(qa.acceptedReferenceArtifactIds, [receipt.artifact.artifactId])
        || !exact(qa.lockIds, result.runBindings)) {
        context.addIssue({ code: 'custom', path: ['deliverables', index, 'qa'], message: 'Commerce Project QA receipt context does not match its exact media artifact.' })
      }
    }
  }
})
export type CommerceProjectProductionResult = z.infer<typeof commerceProjectProductionResultSchema>

export type CommerceProjectProgressEvent =
  | {
      readonly type: 'step-started'
      readonly semanticRole: CommerceSemanticRole
      readonly completed: number
      readonly total: number
    }
  | {
      readonly type: 'deliverable-completed'
      readonly semanticRole: CommerceSemanticRole
      readonly completed: number
      readonly total: number
      readonly deliverable: CommerceProjectDeliverable
    }

export interface PreparedCommerceProjectSource extends CommerceProjectSource {
  readonly descriptor: string
  readonly bytes: Uint8Array
}

export interface PreparedCommerceProjectInput {
  readonly productFileName: string
  readonly facts: ProductFacts
  readonly categoryCatalog: string
  readonly attributeCatalog: string
  readonly sources: readonly PreparedCommerceProjectSource[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parseJsonObject(contents: string, label: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(contents)
    if (!isRecord(parsed)) throw new Error('expected a JSON object')
    return parsed
  } catch (error) {
    throw new Error(`${label} is not a valid product JSON object: ${error instanceof Error ? error.message : 'parse failed'}`)
  }
}

function injectLocalReferenceDescriptors(
  product: Record<string, unknown>,
  descriptors: readonly string[],
): Record<string, unknown> {
  const ret = isRecord(product.ret) ? product.ret : undefined
  const result = ret && isRecord(ret.result) ? ret.result : undefined
  const nestedProduct = result && isRecord(result.result) ? result.result : undefined
  if (!ret || !result || !nestedProduct) return { ...product, images: [...descriptors] }
  return {
    ...product,
    ret: {
      ...ret,
      result: {
        ...result,
        result: { ...nestedProduct, images: [...descriptors] },
      },
    },
  }
}

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', copy.buffer)
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function randomNonce(): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function prepareCommerceProjectInput(
  input: Pick<CommerceProjectProductionInput, 'product' | 'categoryCatalog' | 'attributeCatalog' | 'references'>,
): Promise<PreparedCommerceProjectInput> {
  const productFileName = projectJsonFileNameSchema.parse(input.product.fileName)
  projectJsonFileNameSchema.parse(input.categoryCatalog.fileName)
  projectJsonFileNameSchema.parse(input.attributeCatalog.fileName)
  const productContents = boundedJsonContentsSchema.parse(input.product.contents)
  const categoryCatalog = boundedJsonContentsSchema.parse(input.categoryCatalog.contents)
  const attributeCatalog = boundedJsonContentsSchema.parse(input.attributeCatalog.contents)
  if (input.references.length < 1 || input.references.length > 3) {
    throw new Error('Commerce Project requires one to three local product reference images.')
  }

  const sourceDrafts = await Promise.all(input.references.map(async (reference) => {
    const fileName = projectFileNameSchema.parse(reference.fileName)
    if (!(reference.bytes instanceof Uint8Array)
      || reference.bytes.byteLength < 1
      || reference.bytes.byteLength > MAX_COMMERCE_PROJECT_REFERENCE_BYTES) {
      throw new Error(`Commerce Project reference ${fileName} is empty or exceeds 10 MiB.`)
    }
    const bytes = new Uint8Array(reference.bytes.byteLength)
    bytes.set(reference.bytes)
    const mediaType = commerceSourceMediaType(bytes)
    const dimensions = readRasterDimensions(bytes)
    if (!mediaType || !dimensions) {
      throw new Error(`Commerce Project reference ${fileName} is not a decodable PNG, JPEG, or WebP image.`)
    }
    if (reference.mediaType && reference.mediaType !== mediaType) {
      throw new Error(`Commerce Project reference ${fileName} media type does not match its bytes.`)
    }
    if (typeof globalThis.createImageBitmap === 'function') {
      let bitmap: ImageBitmap
      try {
        bitmap = await globalThis.createImageBitmap(bytesToBlob(bytes, mediaType))
      } catch {
        throw new Error(`Commerce Project reference ${fileName} could not be decoded as an image.`)
      }
      try {
        if (bitmap.width !== dimensions.width || bitmap.height !== dimensions.height) {
          throw new Error(`Commerce Project reference ${fileName} decoded dimensions do not match its bytes.`)
        }
      } finally {
        bitmap.close()
      }
    }
    const sha256 = await sha256Bytes(bytes)
    return {
      fileName,
      bytes,
      sha256,
      artifactId: `artifact:sha256:${sha256}`,
      mediaType,
      byteLength: bytes.byteLength,
      width: dimensions.width,
      height: dimensions.height,
      descriptor: `local-reference:sha256:${sha256}:${encodeURIComponent(fileName)}`,
    }
  }))
  if (new Set(sourceDrafts.map((source) => source.sha256)).size !== sourceDrafts.length) {
    throw new Error('Commerce Project local reference images must have unique content hashes.')
  }

  const rawProduct = parseJsonObject(productContents, productFileName)
  const facts = normalizeProductRecord({
    file: productFileName,
    contents: JSON.stringify(injectLocalReferenceDescriptors(
      rawProduct,
      sourceDrafts.map((source) => source.descriptor),
    )),
  })
  const selectedSourceFactIds = facts.mediaFactIds.slice(0, sourceDrafts.length)
  assertCommerceProductionSourceSelection(facts, selectedSourceFactIds)
  const sources = sourceDrafts.map((source, index): PreparedCommerceProjectSource => {
    const factId = selectedSourceFactIds[index]!
    const fact = facts.facts.find((candidate) => candidate.id === factId)
    if (!fact || fact.value.type !== 'media' || fact.value.descriptor !== source.descriptor) {
      throw new Error(`Commerce Project reference ${source.fileName} lost its normalized fact binding.`)
    }
    return commerceProjectSourceSchema.extend({
      descriptor: z.string().min(1).max(4_096),
      bytes: z.instanceof(Uint8Array),
    }).parse({
      ...source,
      factId,
      sourcePointer: fact.source.pointer,
    })
  })

  return { productFileName, facts, categoryCatalog, attributeCatalog, sources }
}

function exportFileName(role: CommerceSemanticRole, mediaType: CommerceProjectDeliverable['mediaType']): string {
  if (role === 'localized-description:en-US') return 'description-en-US.md'
  if (role === 'localized-description:ko-KR') return 'description-ko-KR.md'
  if (role === 'localized-description:pt-BR') return 'description-pt-BR.md'
  if (role === 'strategy-document') return 'strategy.md'
  if (role === 'product-video') return 'product-video.mp4'
  const extension = mediaType === 'image/jpeg' ? 'jpg' : mediaType === 'image/webp' ? 'webp' : 'png'
  return role === 'main-image' ? `main-image.${extension}` : `${role.replace(':', '-')}.${extension}`
}

async function deliverableFromExecutionArtifact(
  artifact: CommerceProductionExecutionArtifact,
): Promise<CommerceProjectDeliverable> {
  const retained = artifact.retained
  const media = artifact.semanticRole === 'main-image'
    || artifact.semanticRole.startsWith('detail-image:')
    || artifact.semanticRole === 'product-video'
  const bytesBase64 = media ? retained.artifactBytesBase64 : retained.deliveryBytesBase64
  if (!bytesBase64) throw new Error(`Commerce Project ${artifact.semanticRole} has no exportable retained bytes.`)
  const bytes = base64ToBytes(bytesBase64)
  const sha256 = await sha256Bytes(bytes)
  const mediaType = media
    ? z.enum(['image/png', 'image/jpeg', 'image/webp', 'video/mp4']).parse(retained.receipt.artifact.mediaType)
    : 'text/markdown' as const
  const qa = retained.semanticQa
    ? {
        status: 'passed' as const,
        receipt: retained.semanticQa.receipt,
        assessment: commerceSemanticMediaQaSchema.parse(JSON.parse(
          textDecoder.decode(base64ToBytes(retained.semanticQa.artifactBytesBase64)),
        )),
      }
    : undefined
  return commerceProjectDeliverableSchema.parse({
    semanticRole: artifact.semanticRole,
    planNodeId: artifact.planNodeId,
    fileName: exportFileName(artifact.semanticRole, mediaType),
    artifactId: artifact.publicationArtifactId,
    sha256,
    mediaType,
    byteLength: bytes.byteLength,
    bytesBase64,
    providerReceipt: retained.receipt,
    ...(retained.playbackSourceReceipt ? { playbackSourceReceipt: retained.playbackSourceReceipt } : {}),
    ...(qa ? { qa } : {}),
    diagnostics: [],
  })
}

async function createProjectRunBindings(input: {
  readonly runId: string
  readonly prepared: PreparedCommerceProjectInput
  readonly evidenceGraph: ReturnType<typeof createCommerceEvidenceGraph>
  readonly outcomeGraph: ReturnType<typeof createCommerceOutcomeGraph>
  readonly contract: Awaited<ReturnType<typeof compileCommerceProduction>>['contract']
  readonly plan: Awaited<ReturnType<typeof compileCommerceProduction>>['plan']
}): Promise<readonly string[]> {
  const categoryHash = await sha256Bytes(textEncoder.encode(input.prepared.categoryCatalog))
  const attributeHash = await sha256Bytes(textEncoder.encode(input.prepared.attributeCatalog))
  return [
    COMMERCE_IDENTITY_LOCK_ID,
    COMMERCE_CREATIVE_DIRECTION_ID,
    `evidence-graph:sha256:${await fingerprint(input.evidenceGraph)}`,
    `outcome-graph:sha256:${await fingerprint(input.outcomeGraph)}`,
    `outcome-contract:sha256:${await fingerprint(input.contract)}`,
    `execution-plan:sha256:${await fingerprint(input.plan)}`,
    `category-catalog:sha256:${categoryHash}`,
    `attribute-catalog:sha256:${attributeHash}`,
    `source-materials:sha256:${await fingerprint(input.prepared.sources.map((source) => ({
      fileName: source.fileName,
      factId: source.factId,
      sourcePointer: source.sourcePointer,
      artifactId: source.artifactId,
      sha256: source.sha256,
      mediaType: source.mediaType,
      byteLength: source.byteLength,
      width: source.width,
      height: source.height,
    })))}`,
    `project-run:sha256:${await fingerprint({ runId: input.runId })}`,
  ]
}

export async function runCommerceProjectProduction(
  input: CommerceProjectProductionInput,
  host: CommerceProductionCoreHost = createCommerceProductionDesktopHost(),
): Promise<CommerceProjectProductionResult> {
  const providerId = z.string().min(1).max(160).parse(input.providerId)
  const prepared = await prepareCommerceProjectInput(input)
  buildAttributeIndex(
    prepared.attributeCatalog,
    buildCategoryIndex(prepared.categoryCatalog),
  )
  assertCommerceProductionRunnerRoutes()
  const evidenceGraph = createCommerceEvidenceGraph({ facts: prepared.facts })
  const outcomeGraph = createCommerceOutcomeGraph({ facts: prepared.facts })
  const { contract, plan } = await compileCommerceProduction({
    evidenceGraph,
    outcomeGraph,
    sourceImageArtifactIds: prepared.sources.map((source) => source.artifactId),
  })
  const providerPreflight = await host.preflightProvider(providerId)
  assertCommerceProductionProviderAuthority(providerPreflight.provider, providerPreflight.hasKey)
  const startedAt = Date.now()
  const runId = `commerce-project:${(await fingerprint({
    schema: COMMERCE_PROJECT_PRODUCTION_SCHEMA,
    nonce: randomNonce(),
    product: prepared.facts,
    sources: prepared.sources.map((source) => source.sha256),
  })).slice(0, 48)}`
  const runBindings = await createProjectRunBindings({
    runId,
    prepared,
    evidenceGraph,
    outcomeGraph,
    contract,
    plan,
  })
  const completedDeliverables = new Map<CommerceSemanticRole, CommerceProjectDeliverable>()
  await executeCommerceProduction({
    providerId,
    runId,
    facts: prepared.facts,
    categoryCatalog: prepared.categoryCatalog,
    attributeCatalog: prepared.attributeCatalog,
    sourceArtifacts: prepared.sources.map((source) => ({
      artifactId: source.artifactId,
      bytes: source.bytes,
    })),
    evidenceGraph,
    outcomeGraph,
    contract,
    plan,
    runBindings,
    host,
    signal: input.signal,
    onProgress: async (event) => {
      if (event.type === 'step-started') {
        await input.onProgress?.(event)
        return
      }
      const deliverable = await deliverableFromExecutionArtifact(event.artifact)
      completedDeliverables.set(event.semanticRole, deliverable)
      await input.onProgress?.({
        type: 'deliverable-completed',
        semanticRole: event.semanticRole,
        completed: event.completed,
        total: event.total,
        deliverable,
      })
    },
  })
  const deliverables = COMMERCE_SEMANTIC_ROLES.map((role) => {
    const deliverable = completedDeliverables.get(role)
    if (!deliverable) throw new Error(`Commerce Project did not retain completed deliverable ${role}.`)
    return deliverable
  })
  return commerceProjectProductionResultSchema.parse({
    schema: COMMERCE_PROJECT_PRODUCTION_SCHEMA,
    run: {
      runId,
      status: 'completed',
      providerId,
      startedAt,
      completedAt: Date.now(),
    },
    product: {
      fileName: prepared.productFileName,
      facts: prepared.facts,
    },
    sources: prepared.sources.map(({ descriptor: _descriptor, bytes: _bytes, ...source }) => source),
    runBindings,
    deliverables,
  })
}

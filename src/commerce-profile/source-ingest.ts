import { invoke } from '@tauri-apps/api/core'
import { z } from 'zod'
import { base64ToBytes } from '@/lib/image'
import { multimodalArtifactEvidenceSchema } from '@/multimodal-host/contracts'
import { invokeCancellableProxy } from '@/services/ai/tauri-fetch'

export const COMMERCE_SOURCE_INGEST_PROTOCOL = 'cutout.commerce-source-ingest-receipt.v1' as const
export const COMMERCE_SOURCE_ORIGIN = 'https://aib-innovation-oss.oss-accelerate.aliyuncs.com' as const
export const COMMERCE_SOURCE_PATH_PREFIX = '/AI_Business/' as const
export const COMMERCE_DASHSCOPE_SOURCE_ORIGIN = 'https://dashscope-a717.oss-accelerate.aliyuncs.com' as const
export const COMMERCE_DASHSCOPE_SOURCE_PATH_PREFIX = '/' as const
export const COMMERCE_SOURCE_MAXIMUM_BYTES = 10 * 1024 * 1024
export const COMMERCE_SOURCE_TIMEOUT_MS = 120_000

const recordIdSchema = z.string().min(1).max(240)
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)

export const COMMERCE_SOURCE_POLICIES = Object.freeze([
  {
    policyId: 'qianwen-commerce-product-image-source.v1',
    origin: COMMERCE_SOURCE_ORIGIN,
    pathPrefix: COMMERCE_SOURCE_PATH_PREFIX,
  },
  {
    policyId: 'dashscope-generated-product-image-source.v1',
    origin: COMMERCE_DASHSCOPE_SOURCE_ORIGIN,
    pathPrefix: COMMERCE_DASHSCOPE_SOURCE_PATH_PREFIX,
  },
] as const)

export type CommerceSourcePolicy = typeof COMMERCE_SOURCE_POLICIES[number]

export const commerceSourceFetchPolicySchema = z.discriminatedUnion('policyId', [
  z.object({
    policyId: z.literal(COMMERCE_SOURCE_POLICIES[0].policyId),
    origin: z.literal(COMMERCE_SOURCE_POLICIES[0].origin),
    pathPrefix: z.literal(COMMERCE_SOURCE_POLICIES[0].pathPrefix),
    redirects: z.literal('disabled'),
    dnsBinding: z.literal('public-resolved-and-pinned'),
    maximumBytes: z.literal(COMMERCE_SOURCE_MAXIMUM_BYTES),
    timeoutMs: z.literal(COMMERCE_SOURCE_TIMEOUT_MS),
  }).strict(),
  z.object({
    policyId: z.literal(COMMERCE_SOURCE_POLICIES[1].policyId),
    origin: z.literal(COMMERCE_SOURCE_POLICIES[1].origin),
    pathPrefix: z.literal(COMMERCE_SOURCE_POLICIES[1].pathPrefix),
    redirects: z.literal('disabled'),
    dnsBinding: z.literal('public-resolved-and-pinned'),
    maximumBytes: z.literal(COMMERCE_SOURCE_MAXIMUM_BYTES),
    timeoutMs: z.literal(COMMERCE_SOURCE_TIMEOUT_MS),
  }).strict(),
])

export function resolveCommerceSourcePolicy(value: string): {
  readonly url: URL
  readonly policy: CommerceSourcePolicy
} | undefined {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return undefined
  }
  if (url.href !== value || url.protocol !== 'https:' || url.port !== ''
    || url.username !== '' || url.password !== '' || url.hash !== '') {
    return undefined
  }
  const policy = COMMERCE_SOURCE_POLICIES.find((candidate) => (
    url.origin === candidate.origin
      && url.pathname.startsWith(candidate.pathPrefix)
      && url.pathname.length > candidate.pathPrefix.length
  ))
  return policy ? { url, policy } : undefined
}

export const commerceSourceIngestReceiptSchema = z.object({
  protocol: z.literal(COMMERCE_SOURCE_INGEST_PROTOCOL),
  receiptId: recordIdSchema,
  receiptHash: sha256Schema,
  requestId: recordIdSchema,
  runId: recordIdSchema,
  heldOutCommitmentHash: sha256Schema.optional(),
  factId: recordIdSchema,
  sourceFile: z.string().min(1).max(512),
  sourcePointer: z.string().startsWith('/').max(2_000),
  sourceOrigin: z.enum([COMMERCE_SOURCE_ORIGIN, COMMERCE_DASHSCOPE_SOURCE_ORIGIN]),
  sourcePath: z.string().startsWith('/').max(2_000),
  sourceUrlSha256: sha256Schema,
  fetchPolicy: commerceSourceFetchPolicySchema,
  status: z.literal('succeeded'),
  artifact: multimodalArtifactEvidenceSchema,
  startedAt: z.number().int().nonnegative(),
  completedAt: z.number().int().nonnegative(),
  signature: sha256Schema,
}).strict().superRefine((receipt, context) => {
  if (receipt.completedAt < receipt.startedAt) {
    context.addIssue({ code: 'custom', message: 'Source ingestion completion cannot precede its start.' })
  }
  if (!receipt.artifact.mediaType.startsWith('image/')) {
    context.addIssue({ code: 'custom', message: 'Source ingestion receipts are valid only for decoded images.' })
  }
  if (receipt.sourceOrigin !== receipt.fetchPolicy.origin
    || !receipt.sourcePath.startsWith(receipt.fetchPolicy.pathPrefix)
    || receipt.sourcePath.length <= receipt.fetchPolicy.pathPrefix.length) {
    context.addIssue({ code: 'custom', message: 'Source ingestion receipt does not match its fixed fetch policy.' })
  }
})
export type CommerceSourceIngestReceipt = z.infer<typeof commerceSourceIngestReceiptSchema>

export const commerceSourceIngestResultSchema = z.object({
  mediaType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  data: z.string().min(4).max(16 * 1024 * 1024),
  receipt: commerceSourceIngestReceiptSchema,
}).strict()

export interface CommerceSourceIngestArtifact {
  readonly receipt: CommerceSourceIngestReceipt
  readonly bytes: Uint8Array
}

export async function sha256CommerceSourceUrl(sourceUrl: string): Promise<string> {
  const normalized = new URL(sourceUrl).href
  const bytes = new TextEncoder().encode(normalized)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function ingestCompetitionCommerceSourceImage(input: {
  readonly requestId: string
  readonly runId: string
  readonly heldOutCommitmentHash?: string
  readonly factId: string
  readonly sourceFile: string
  readonly sourcePointer: string
  readonly sourceUrl: string
  readonly signal?: AbortSignal
}): Promise<CommerceSourceIngestArtifact> {
  const result = commerceSourceIngestResultSchema.parse(await invokeCancellableProxy(
    'ai_ingest_competition_source_image',
    {
      operationRequestId: input.requestId,
      runId: input.runId,
      heldOutCommitmentHash: input.heldOutCommitmentHash,
      factId: input.factId,
      sourceFile: input.sourceFile,
      sourcePointer: input.sourcePointer,
      sourceUrl: input.sourceUrl,
    },
    input.signal,
  ))
  const bytes = base64ToBytes(result.data)
  if (result.mediaType !== result.receipt.artifact.mediaType
    || result.receipt.sourceUrlSha256 !== await sha256CommerceSourceUrl(input.sourceUrl)) {
    throw new Error('Native Commerce source ingestion result does not match its requested URL or media type.')
  }
  return { receipt: result.receipt, bytes }
}

export async function verifyNativeCommerceSourceIngestReceipt(input: CommerceSourceIngestArtifact): Promise<unknown> {
  return invoke('verify_commerce_source_ingest_receipt', {
    receipt: commerceSourceIngestReceiptSchema.parse(input.receipt),
    artifactBytes: Array.from(input.bytes),
  })
}

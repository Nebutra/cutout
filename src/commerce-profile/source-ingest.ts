import { invoke } from '@tauri-apps/api/core'
import { z } from 'zod'
import { base64ToBytes } from '@/lib/image'
import { multimodalArtifactEvidenceSchema } from '@/multimodal-host/contracts'

export const COMMERCE_SOURCE_INGEST_PROTOCOL = 'cutout.commerce-source-ingest-receipt.v1' as const
export const COMMERCE_SOURCE_ORIGIN = 'https://aib-innovation-oss.oss-accelerate.aliyuncs.com' as const
export const COMMERCE_SOURCE_PATH_PREFIX = '/AI_Business/' as const
export const COMMERCE_SOURCE_MAXIMUM_BYTES = 10 * 1024 * 1024
export const COMMERCE_SOURCE_TIMEOUT_MS = 120_000

const recordIdSchema = z.string().min(1).max(240)
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)

export const commerceSourceFetchPolicySchema = z.object({
  policyId: z.literal('qianwen-commerce-product-image-source.v1'),
  origin: z.literal(COMMERCE_SOURCE_ORIGIN),
  pathPrefix: z.literal(COMMERCE_SOURCE_PATH_PREFIX),
  redirects: z.literal('disabled'),
  dnsBinding: z.literal('public-resolved-and-pinned'),
  maximumBytes: z.literal(COMMERCE_SOURCE_MAXIMUM_BYTES),
  timeoutMs: z.literal(COMMERCE_SOURCE_TIMEOUT_MS),
}).strict()

export const commerceSourceIngestReceiptSchema = z.object({
  protocol: z.literal(COMMERCE_SOURCE_INGEST_PROTOCOL),
  receiptId: recordIdSchema,
  receiptHash: sha256Schema,
  requestId: recordIdSchema,
  runId: recordIdSchema,
  factId: recordIdSchema,
  sourceFile: z.string().min(1).max(512),
  sourcePointer: z.string().startsWith('/').max(2_000),
  sourceOrigin: z.literal(COMMERCE_SOURCE_ORIGIN),
  sourcePath: z.string().startsWith(COMMERCE_SOURCE_PATH_PREFIX).max(2_000),
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
})
export type CommerceSourceIngestReceipt = z.infer<typeof commerceSourceIngestReceiptSchema>

const commerceSourceIngestResultSchema = z.object({
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
  readonly factId: string
  readonly sourceFile: string
  readonly sourcePointer: string
  readonly sourceUrl: string
}): Promise<CommerceSourceIngestArtifact> {
  const result = commerceSourceIngestResultSchema.parse(await invoke(
    'ai_ingest_competition_source_image',
    input,
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

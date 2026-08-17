import { z } from 'zod'
import { base64ToBytes } from '@/lib/image'
import {
  createMultimodalDesktopHost,
  type MultimodalNativeTransport,
} from '@/multimodal-host'
import { providerConfigsSchema } from '@/services/ai/provider-types'
import {
  commerceHeldOutAdmissionSchema,
  commerceHeldOutCommitmentSchema,
  type CommerceHeldOutCommitment,
} from './held-out'
import {
  commerceSourceIngestResultSchema,
  sha256CommerceSourceUrl,
} from './source-ingest'
import type { CommerceProductionHost } from './production-host'
import {
  COMMERCE_OPERATOR_NATIVE_PROTOCOL,
  commerceOperatorJobIdSchema,
  commerceOperatorNativeRequestSchema,
  type CommerceOperatorNativeCommand,
} from './operator-protocol'

const providerPreflightResultSchema = z.object({
  providers: providerConfigsSchema,
  hasKey: z.boolean(),
}).strict()

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 32 * 1024
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

export interface CommerceOperatorNativeTransport {
  request(
    input: ReturnType<typeof commerceOperatorNativeRequestSchema.parse>,
    signal?: AbortSignal,
  ): Promise<unknown>
}

function nativeRequest(input: {
  readonly jobId: string
  readonly command: CommerceOperatorNativeCommand
  readonly payload: Record<string, unknown>
  readonly cancellationId?: string
}) {
  return commerceOperatorNativeRequestSchema.parse({
    protocol: COMMERCE_OPERATOR_NATIVE_PROTOCOL,
    ...input,
  })
}

export function createCommerceProductionOperatorHost(input: {
  readonly jobId: string
  readonly transport: CommerceOperatorNativeTransport
  readonly retainedCommitment?: CommerceHeldOutCommitment
}): CommerceProductionHost {
  const jobId = commerceOperatorJobIdSchema.parse(input.jobId)
  const request = (
    command: CommerceOperatorNativeCommand,
    payload: Record<string, unknown>,
    signal?: AbortSignal,
  ) => input.transport.request(nativeRequest({
    jobId,
    command,
    payload,
    ...(signal ? { cancellationId: globalThis.crypto.randomUUID() } : {}),
  }), signal)
  const multimodalTransport: MultimodalNativeTransport = {
    encodeBytes: bytesToBase64,
    invokeCancellable: (command, payload, signal) => {
      const operatorCommand = command === 'ai_dashscope_structured_text'
        ? 'structured-text'
        : command === 'ai_dashscope_vision_json'
          ? 'vision-json'
          : command === 'ai_dashscope_image'
            ? 'image-edit'
            : 'image-to-video'
      return request(operatorCommand, payload, signal)
    },
    verify: (receipt, artifactBytes) => request('receipt-verify', {
      receipt,
      artifactBytes: bytesToBase64(artifactBytes),
    }),
    promoteVideoPlayback: (receipt, artifactBytes) => request('playback-promote', {
      receipt,
      artifactBytes: bytesToBase64(artifactBytes),
    }),
  }
  const multimodal = createMultimodalDesktopHost(multimodalTransport)
  return {
    ...multimodal,
    async preflightProvider(providerId) {
      const result = providerPreflightResultSchema.parse(await request(
        'provider-preflight',
        { providerId },
      ))
      return {
        provider: result.providers.find((provider) => provider.id === providerId),
        hasKey: result.hasKey,
      }
    },
    async createCommitment(value) {
      return commerceHeldOutCommitmentSchema.parse(await request('commitment-create', {
        ...value,
        ...(input.retainedCommitment
          ? { retainedCommitment: input.retainedCommitment }
          : {}),
      }))
    },
    async ingestSource(value) {
      const result = commerceSourceIngestResultSchema.parse(await request('source-ingest', {
        operationRequestId: value.requestId,
        runId: value.runId,
        heldOutCommitmentHash: value.heldOutCommitmentHash,
        factId: value.factId,
        sourceFile: value.sourceFile,
        sourcePointer: value.sourcePointer,
        sourceUrl: value.sourceUrl,
      }, value.signal))
      const bytes = base64ToBytes(result.data)
      if (result.mediaType !== result.receipt.artifact.mediaType
        || result.receipt.sourceUrlSha256 !== await sha256CommerceSourceUrl(value.sourceUrl)) {
        throw new Error('Native Commerce source ingestion result does not match its requested URL or media type.')
      }
      return { receipt: result.receipt, bytes }
    },
    verifySource: (value) => request('source-receipt-verify', {
      receipt: value.receipt,
      artifactBytes: bytesToBase64(value.bytes),
    }),
    async admit(value) {
      return commerceHeldOutAdmissionSchema.parse(await request('admission-verify', value))
    },
  }
}

import { invoke } from '@tauri-apps/api/core'
import { z } from 'zod'
import { base64ToBytes } from '@/lib/image'
import { invokeCancellableProxy } from '@/services/ai/tauri-fetch'
import {
  multimodalArtifactEvidenceSchema,
  multimodalHostContextSchema,
  multimodalHostReceiptSchema,
  multimodalOperationSchema,
  resolveVerifiedMultimodalRoute,
  verifiedMultimodalHostArtifactSchema,
  type MultimodalHostContext,
  type MultimodalHostReceipt,
  type MultimodalOperation,
  type VerifiedMultimodalHostArtifact,
} from './contracts'

const base64AssetSchema = z.object({
  mediaType: z.string().min(1).max(120),
  data: z.string().min(1),
}).strict()

const imageResultSchema = z.object({
  images: z.array(base64AssetSchema).min(1).max(6),
  receipts: z.array(multimodalHostReceiptSchema).min(1).max(6),
}).strict()

const singleResultSchema = z.object({
  mediaType: z.string().min(1).max(120),
  data: z.string().min(1),
  receipt: multimodalHostReceiptSchema,
}).strict()

export interface MultimodalHostArtifactBytes {
  readonly receipt: MultimodalHostReceipt
  readonly bytes: Uint8Array
}

export interface MultimodalHostVerifier {
  verify(input: MultimodalHostArtifactBytes): Promise<VerifiedMultimodalHostArtifact>
}

export async function verifyNativeMultimodalHostArtifact(
  input: MultimodalHostArtifactBytes,
): Promise<VerifiedMultimodalHostArtifact> {
  return verifyWithNativeTransport(input, tauriTransport)
}

export interface MultimodalDesktopHost extends MultimodalHostVerifier {
  structuredText(input: {
    readonly providerId: string
    readonly model: 'qwen3.8-max'
    readonly system: string
    readonly prompt: string
    readonly outputSchema: Readonly<Record<string, unknown>>
    readonly context: MultimodalHostContext
    readonly signal?: AbortSignal
  }): Promise<MultimodalHostArtifactBytes>
  visionJson(input: {
    readonly providerId: string
    readonly model: 'qwen3-vl-plus'
    readonly system: string
    readonly prompt: string
    readonly outputSchema: Readonly<Record<string, unknown>>
    readonly referenceBytes: Uint8Array
    readonly context: MultimodalHostContext
    readonly signal?: AbortSignal
  }): Promise<MultimodalHostArtifactBytes>
  image(input: {
    readonly providerId: string
    readonly model: 'qwen-image-3.0' | 'qwen-image-3.0-pro'
    readonly operation: 'image-generation' | 'image-edit'
    readonly prompt: string
    readonly referenceBytes?: readonly Uint8Array[]
    readonly size?: string
    readonly context: MultimodalHostContext
    readonly signal?: AbortSignal
  }): Promise<readonly MultimodalHostArtifactBytes[]>
  video(input: {
    readonly providerId: string
    readonly model: 'wan2.6-t2v' | 'wan2.7-i2v-2026-04-25'
    readonly prompt: string
    readonly resolution: '720P' | '1080P'
    readonly ratio: '16:9'
    readonly durationSeconds: 5
    readonly seed?: number
    readonly referenceBytes?: Uint8Array
    readonly context: MultimodalHostContext
    readonly signal?: AbortSignal
  }): Promise<MultimodalHostArtifactBytes>
}

export interface MultimodalNativeTransport {
  encodeBytes?(bytes: Uint8Array): readonly number[] | string
  invokeCancellable(
    command: 'ai_dashscope_structured_text' | 'ai_dashscope_vision_json' | 'ai_dashscope_image' | 'ai_dashscope_video',
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown>
  verify(receipt: MultimodalHostReceipt, artifactBytes: Uint8Array): Promise<unknown>
  promoteVideoPlayback(receipt: MultimodalHostReceipt, artifactBytes: Uint8Array): Promise<unknown>
}

function encodeTransportBytes(
  transport: MultimodalNativeTransport,
  bytes: Uint8Array,
): readonly number[] | string {
  return transport.encodeBytes?.(bytes) ?? Array.from(bytes)
}

const tauriTransport: MultimodalNativeTransport = {
  invokeCancellable: (command, args, signal) => invokeCancellableProxy(command, args, signal),
  verify: (receipt, artifactBytes) => invoke('verify_multimodal_host_artifact', {
    receipt,
    artifactBytes: Array.from(artifactBytes),
  }),
  promoteVideoPlayback: (receipt, artifactBytes) => invoke('promote_multimodal_video_playback', {
    receipt,
    artifactBytes: Array.from(artifactBytes),
  }),
}

async function verifyWithNativeTransport(
  input: MultimodalHostArtifactBytes,
  transport: MultimodalNativeTransport,
): Promise<VerifiedMultimodalHostArtifact> {
  const sourceReceipt = multimodalHostReceiptSchema.parse(input.receipt)
  const sourceArtifact = multimodalArtifactEvidenceSchema.parse(
    await transport.verify(sourceReceipt, input.bytes),
  )
  let receipt = sourceReceipt
  let artifact = sourceArtifact
  if (artifact.mediaType === 'video/mp4' && artifact.playbackVerified !== true) {
    receipt = multimodalHostReceiptSchema.parse(
      await transport.promoteVideoPlayback(sourceReceipt, input.bytes),
    )
    if (receipt.playbackPromotion?.sourceReceiptHash !== sourceReceipt.receiptHash) {
      throw new Error('Native playback promotion does not bind the verified source receipt.')
    }
    assertPlaybackPromotionIdentity(sourceReceipt, receipt)
    artifact = multimodalArtifactEvidenceSchema.parse(
      await transport.verify(receipt, input.bytes),
    )
  }
  return verifiedMultimodalHostArtifactSchema.parse({ verified: true, receipt, artifact })
}

function assertPlaybackPromotionIdentity(
  source: MultimodalHostReceipt,
  promoted: MultimodalHostReceipt,
): void {
  const scalarIdentity = [
    'requestId', 'runId', 'heldOutCommitmentHash', 'providerId', 'providerKind', 'model', 'routeId', 'operation',
    'semanticRole', 'nodeId', 'capabilityId', 'status', 'remoteTaskIdHash',
  ] as const
  const scalarDrift = scalarIdentity.some((key) => source[key] !== promoted[key])
  const arrayDrift = [
    'acceptedReferenceArtifactIds', 'lockIds',
  ].some((key) => {
    const name = key as 'acceptedReferenceArtifactIds' | 'lockIds'
    return source[name].length !== promoted[name].length
      || source[name].some((value, index) => value !== promoted[name][index])
  })
  const sourceArtifact = { ...source.artifact, playbackVerified: true }
  if (scalarDrift || arrayDrift
    || JSON.stringify(sourceArtifact) !== JSON.stringify(promoted.artifact)) {
    throw new Error('Native playback promotion changed the verified route, context, or artifact identity.')
  }
}

function assertRoute(
  model: string,
  operation: MultimodalOperation,
): void {
  if (!resolveVerifiedMultimodalRoute({ providerKind: 'dashscope', model, operation })) {
    throw new Error(`capability-required: no verified DashScope ${operation} route exists for ${model}.`)
  }
}

function assertReceipt(
  receipt: MultimodalHostReceipt,
  input: { readonly providerId: string; readonly model: string; readonly operation: MultimodalOperation },
): void {
  if (receipt.providerId !== input.providerId || receipt.model !== input.model
    || receipt.operation !== input.operation) {
    throw new Error('Native multimodal receipt does not match the requested route.')
  }
}

export function createMultimodalDesktopHost(
  transport: MultimodalNativeTransport = tauriTransport,
): MultimodalDesktopHost {
  return {
    async structuredText(input) {
      assertRoute(input.model, 'structured-text')
      const context = multimodalHostContextSchema.parse(input.context)
      const result = singleResultSchema.parse(await transport.invokeCancellable(
        'ai_dashscope_structured_text',
        {
          providerId: input.providerId,
          model: input.model,
          system: input.system,
          prompt: input.prompt,
          outputSchema: input.outputSchema,
          hostContext: context,
        },
        input.signal,
      ))
      assertReceipt(result.receipt, { ...input, operation: 'structured-text' })
      return { receipt: result.receipt, bytes: base64ToBytes(result.data) }
    },
    async visionJson(input) {
      assertRoute(input.model, 'vision-ocr')
      const context = multimodalHostContextSchema.parse(input.context)
      if (context.acceptedReferenceArtifactIds.length !== 1) {
        throw new Error('Vision JSON requires one retained accepted image reference.')
      }
      const result = singleResultSchema.parse(await transport.invokeCancellable(
        'ai_dashscope_vision_json',
        {
          providerId: input.providerId,
          model: input.model,
          system: input.system,
          prompt: input.prompt,
          outputSchema: input.outputSchema,
          referenceImage: encodeTransportBytes(transport, input.referenceBytes),
          hostContext: context,
        },
        input.signal,
      ))
      assertReceipt(result.receipt, { ...input, operation: 'vision-ocr' })
      return { receipt: result.receipt, bytes: base64ToBytes(result.data) }
    },
    async image(input) {
      assertRoute(input.model, input.operation)
      const context = multimodalHostContextSchema.parse(input.context)
      const references = input.referenceBytes ?? []
      if (input.operation === 'image-generation' && references.length > 0) {
        throw new Error('Image generation cannot discard reference bytes.')
      }
      if (input.operation === 'image-edit' && references.length === 0) {
        throw new Error('Image edit requires reference bytes.')
      }
      const result = imageResultSchema.parse(await transport.invokeCancellable(
        'ai_dashscope_image',
        {
          providerId: input.providerId,
          model: input.model,
          operation: input.operation === 'image-generation' ? 'generation' : 'edit',
          prompt: input.prompt,
          images: references.map((bytes) => encodeTransportBytes(transport, bytes)),
          size: input.size ?? null,
          hostContext: context,
        },
        input.signal,
      ))
      if (result.images.length !== result.receipts.length) {
        throw new Error('Native image output and receipt counts differ.')
      }
      return result.images.map((image, index) => {
        const receipt = result.receipts[index]!
        assertReceipt(receipt, input)
        return { receipt, bytes: base64ToBytes(image.data) }
      })
    },
    async video(input) {
      const context = multimodalHostContextSchema.parse(input.context)
      const operation = input.model === 'wan2.7-i2v-2026-04-25'
        ? 'image-to-video' as const
        : 'text-to-video' as const
      assertRoute(input.model, operation)
      if (operation === 'text-to-video' && (context.acceptedReferenceArtifactIds.length > 0
        || input.referenceBytes)) {
        throw new Error('Text-to-video cannot discard accepted image references.')
      }
      if (operation === 'image-to-video' && (!input.referenceBytes
        || context.acceptedReferenceArtifactIds.length !== 1)) {
        throw new Error('Image-to-video requires one retained accepted image reference.')
      }
      const result = singleResultSchema.parse(await transport.invokeCancellable(
        'ai_dashscope_video',
        {
          providerId: input.providerId,
          model: input.model,
          prompt: input.prompt,
          resolution: input.resolution,
          ratio: input.ratio,
          durationSeconds: input.durationSeconds,
          seed: input.seed ?? null,
          referenceImage: input.referenceBytes
            ? encodeTransportBytes(transport, input.referenceBytes)
            : null,
          hostContext: context,
        },
        input.signal,
      ))
      assertReceipt(result.receipt, { ...input, operation })
      return { receipt: result.receipt, bytes: base64ToBytes(result.data) }
    },
    async verify(input) {
      return verifyWithNativeTransport(input, transport)
    },
  }
}

export function operationForCommerceRole(role: string): MultimodalOperation {
  if (role.startsWith('localized-description:') || role === 'strategy-document') {
    return multimodalOperationSchema.parse('structured-text')
  }
  if (role === 'main-image' || role.startsWith('detail-image:')) {
    // Every Commerce image is reference-conditioned: the main image binds the
    // evaluator-selected source, and details additionally bind the retained
    // main image through the frozen Outcome DAG.
    return multimodalOperationSchema.parse('image-edit')
  }
  // Commerce video is reference-conditioned. Capability resolution must fail
  // closed until the Host owns the Provider object URL for that exact image.
  if (role === 'product-video') return multimodalOperationSchema.parse('image-to-video')
  throw new Error(`Unsupported Commerce semantic role: ${role}`)
}

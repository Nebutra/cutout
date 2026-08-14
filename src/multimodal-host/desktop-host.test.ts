import { describe, expect, it, vi } from 'vitest'
import type { MultimodalNativeTransport } from './desktop-host'
import { createMultimodalDesktopHost, operationForCommerceRole } from './desktop-host'
import type { MultimodalHostReceipt } from './contracts'

const HASH = 'a'.repeat(64)
const bytes = Uint8Array.of(1, 2, 3)

function context(role: string) {
  return {
    requestId: `request:${role}`,
    runId: 'run:commerce:1',
    semanticRole: role,
    acceptedReferenceArtifactIds: [],
    lockIds: ['lock:commerce-product-identity'],
  }
}

function receipt(operation: MultimodalHostReceipt['operation'], role: string): MultimodalHostReceipt {
  const model = operation === 'structured-text' ? 'qwen3.8-max'
    : operation === 'text-to-video' ? 'wan2.6-t2v'
      : operation === 'image-to-video' ? 'wan2.7-i2v-2026-04-25' : 'qwen-image-3.0'
  const mediaType = operation === 'structured-text' ? 'application/json'
    : operation === 'text-to-video' || operation === 'image-to-video' ? 'video/mp4' : 'image/png'
  return {
    protocol: 'cutout.multimodal-host-receipt.v1',
    receiptId: `receipt:${role}`,
    receiptHash: 'b'.repeat(64),
    requestId: `request:${role}`,
    runId: 'run:commerce:1',
    providerId: 'dashscope-qwen-image3',
    providerKind: 'dashscope',
    model,
    routeId: `route:dashscope:${model}:${operation}`,
    operation,
    semanticRole: role,
    acceptedReferenceArtifactIds: operation === 'image-to-video'
      ? [`artifact:sha256:${HASH}`]
      : [],
    lockIds: ['lock:commerce-product-identity'],
    status: 'succeeded',
    artifact: {
      artifactId: `artifact:sha256:${HASH}`,
      sha256: HASH,
      mediaType,
      byteLength: bytes.length,
      decoded: true,
      ...(mediaType.startsWith('image/') ? { width: 1024, height: 1024 } : {}),
      ...(mediaType === 'video/mp4' ? {
        width: 1920, height: 1080, durationMs: 5_000, frameRate: 30,
        videoCodec: 'h264' as const, audioCodec: 'aac' as const,
        sampleTablesReadable: true, playbackVerified: false,
      } : {}),
    },
    startedAt: 1,
    completedAt: 2,
    signature: 'c'.repeat(64),
  }
}

function native(): MultimodalNativeTransport {
  return {
    invokeCancellable: vi.fn(async (command, args) => {
      const hostContext = args.hostContext as ReturnType<typeof context>
      const role = hostContext.semanticRole
      if (command === 'ai_dashscope_image') {
        return {
          images: [{ mediaType: 'image/png', data: 'AQID' }],
          receipts: [receipt('image-generation', role)],
        }
      }
      const operation = command === 'ai_dashscope_video'
        ? args.model === 'wan2.7-i2v-2026-04-25' ? 'image-to-video' : 'text-to-video'
        : 'structured-text'
      return {
        mediaType: operation === 'text-to-video' ? 'video/mp4' : 'application/json',
        data: 'AQID',
        receipt: receipt(operation, role),
      }
    }),
    verify: vi.fn(async (value) => value.artifact),
    promoteVideoPlayback: vi.fn(async (value) => ({
      ...value,
      receiptId: `${value.receiptId}:playback`,
      receiptHash: 'd'.repeat(64),
      artifact: { ...value.artifact, playbackVerified: true },
      playbackPromotion: {
        sourceReceiptHash: value.receiptHash,
        decoder: 'avfoundation-asset-image-generator-v1',
        representativeFrames: 3,
        nonBlankFrames: 3,
        pixelEvidenceHash: 'e'.repeat(64),
      },
    })),
  }
}

describe('multimodal desktop Host', () => {
  it('executes and verifies exact structured text, image and video routes', async () => {
    const host = createMultimodalDesktopHost(native())
    const text = await host.structuredText({
      providerId: 'dashscope-qwen-image3', model: 'qwen3.8-max', system: 'Return JSON.',
      prompt: 'Describe product.', outputSchema: { type: 'object' },
      context: context('localized-description:en-US'),
    })
    const image = await host.image({
      providerId: 'dashscope-qwen-image3', model: 'qwen-image-3.0',
      operation: 'image-generation', prompt: 'Product image.',
      context: context('main-image'),
    })
    const video = await host.video({
      providerId: 'dashscope-qwen-image3', model: 'wan2.6-t2v', prompt: 'Product video.',
      resolution: '1080P', ratio: '16:9', durationSeconds: 5,
      context: context('product-video'),
    })

    await expect(host.verify(text)).resolves.toMatchObject({ verified: true })
    await expect(host.verify(image[0]!)).resolves.toMatchObject({ verified: true })
    await expect(host.verify(video)).resolves.toMatchObject({
      artifact: { mediaType: 'video/mp4', playbackVerified: true },
      receipt: {
        playbackPromotion: { sourceReceiptHash: video.receipt.receiptHash },
      },
    })
  })

  it('rejects playback promotion that is not bound to the verified source receipt', async () => {
    const transport = native()
    transport.promoteVideoPlayback = vi.fn(async (value) => ({
      ...value,
      receiptId: `${value.receiptId}:playback`,
      receiptHash: 'd'.repeat(64),
      artifact: { ...value.artifact, playbackVerified: true },
      playbackPromotion: {
        sourceReceiptHash: 'f'.repeat(64),
        decoder: 'avfoundation-asset-image-generator-v1',
        representativeFrames: 3,
        nonBlankFrames: 3,
        pixelEvidenceHash: 'e'.repeat(64),
      },
    }))
    const host = createMultimodalDesktopHost(transport)
    await expect(host.verify({
      receipt: receipt('text-to-video', 'product-video'), bytes,
    })).rejects.toThrow(/does not bind the verified source receipt/)
  })

  it('rejects a signed-looking promotion that drifts route or artifact identity', async () => {
    const transport = native()
    transport.promoteVideoPlayback = vi.fn(async (value) => ({
      ...value,
      receiptId: `${value.receiptId}:playback`,
      receiptHash: 'd'.repeat(64),
      routeId: 'route:dashscope:wan2.6-t2v:video-edit',
      artifact: { ...value.artifact, playbackVerified: true },
      playbackPromotion: {
        sourceReceiptHash: value.receiptHash,
        decoder: 'avfoundation-asset-image-generator-v1',
        representativeFrames: 3,
        nonBlankFrames: 3,
        pixelEvidenceHash: 'e'.repeat(64),
      },
    }))
    const host = createMultimodalDesktopHost(transport)
    await expect(host.verify({
      receipt: receipt('text-to-video', 'product-video'), bytes,
    })).rejects.toThrow()
  })

  it('rejects unsupported route drift before native execution', async () => {
    const transport = native()
    const host = createMultimodalDesktopHost(transport)
    await expect(host.image({
      providerId: 'dashscope-qwen-image3', model: 'qwen-image-3.0',
      operation: 'image-edit', prompt: 'Edit without reference.',
      context: context('main-image'),
    })).rejects.toThrow(/requires reference bytes/)
    expect(transport.invokeCancellable).not.toHaveBeenCalled()
  })

  it('rejects native receipts for another exact route', async () => {
    const transport = native()
    transport.invokeCancellable = vi.fn(async () => ({
      mediaType: 'application/json', data: 'AQID',
      receipt: receipt('text-to-video', 'localized-description:en-US'),
    }))
    const host = createMultimodalDesktopHost(transport)
    await expect(host.structuredText({
      providerId: 'dashscope-qwen-image3', model: 'qwen3.8-max', system: 'Return JSON.',
      prompt: 'Describe product.', outputSchema: { type: 'object' },
      context: context('localized-description:en-US'),
    })).rejects.toThrow(/does not match the requested route/)
  })

  it('does not silently route Commerce product video through text-to-video', () => {
    expect(operationForCommerceRole('main-image')).toBe('image-edit')
    expect(operationForCommerceRole('detail-image:1')).toBe('image-edit')
    expect(operationForCommerceRole('product-video')).toBe('image-to-video')
  })

  it('executes Wan 2.7 only as image-to-video with one retained accepted reference', async () => {
    const transport = native()
    const host = createMultimodalDesktopHost(transport)
    const imageConditioned = {
      ...context('product-video'),
      acceptedReferenceArtifactIds: [`artifact:sha256:${HASH}`],
    }
    const result = await host.video({
      providerId: 'dashscope-qwen-image3', model: 'wan2.7-i2v-2026-04-25', prompt: 'Product video.',
      resolution: '1080P', ratio: '16:9', durationSeconds: 5, seed: 42,
      referenceBytes: bytes,
      context: imageConditioned,
    })
    expect(result.receipt).toMatchObject({
      model: 'wan2.7-i2v-2026-04-25',
      operation: 'image-to-video',
      acceptedReferenceArtifactIds: [`artifact:sha256:${HASH}`],
    })
    expect(transport.invokeCancellable).toHaveBeenCalledWith(
      'ai_dashscope_video',
      expect.objectContaining({ seed: 42, referenceImage: [1, 2, 3] }),
      undefined,
    )
  })

  it('rejects Wan 2.7 before native execution when the retained reference is absent', async () => {
    const transport = native()
    const host = createMultimodalDesktopHost(transport)
    await expect(host.video({
      providerId: 'dashscope-qwen-image3', model: 'wan2.7-i2v-2026-04-25', prompt: 'Product video.',
      resolution: '1080P', ratio: '16:9', durationSeconds: 5, seed: 42,
      context: context('product-video'),
    })).rejects.toThrow(/requires one retained accepted image reference/)
    expect(transport.invokeCancellable).not.toHaveBeenCalled()
  })

  it('rejects image-conditioned context before invoking text-to-video', async () => {
    const transport = native()
    const host = createMultimodalDesktopHost(transport)
    const imageConditioned = {
      ...context('product-video'),
      acceptedReferenceArtifactIds: [`artifact:sha256:${'f'.repeat(64)}`],
    }
    await expect(host.video({
      providerId: 'dashscope-qwen-image3', model: 'wan2.6-t2v', prompt: 'Product video.',
      resolution: '1080P', ratio: '16:9', durationSeconds: 5,
      context: imageConditioned,
    })).rejects.toThrow(/cannot discard accepted image references/)
    expect(transport.invokeCancellable).not.toHaveBeenCalled()
  })
})

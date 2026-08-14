import { describe, expect, it } from 'vitest'
import {
  DASHSCOPE_WAN_VIDEO_SEED_MAXIMUM,
  QWEN_GATE_A_ROUTES,
  multimodalHostReceiptSchema,
  multimodalRouteDescriptorSchema,
  normalizeDashScopeWanVideoSeed,
  resolveMultimodalRoute,
  resolveVerifiedMultimodalRoute,
  verifiedMultimodalHostArtifactSchema,
  type MultimodalHostReceipt,
} from './contracts'

const HASH = 'a'.repeat(64)

function receipt(): MultimodalHostReceipt {
  const artifact = {
    artifactId: `artifact:sha256:${HASH}`,
    sha256: HASH,
    mediaType: 'video/mp4' as const,
    byteLength: 1_024,
    decoded: true as const,
    width: 1920,
    height: 1080,
    durationMs: 5_007,
    frameRate: 30,
    videoCodec: 'h264' as const,
    audioCodec: 'aac' as const,
    sampleTablesReadable: true,
    playbackVerified: true,
  }
  return {
    protocol: 'cutout.multimodal-host-receipt.v1' as const,
    receiptId: 'receipt:qwen-video:1',
    receiptHash: 'b'.repeat(64),
    requestId: 'request:qwen-video:1',
    runId: 'run:commerce:1',
    providerId: 'dashscope-qwen-image3',
    providerKind: 'dashscope' as const,
    model: 'wan2.6-t2v',
    routeId: 'route:dashscope:wan2.6-t2v:text-to-video',
    operation: 'text-to-video' as const,
    semanticRole: 'product-video',
    acceptedReferenceArtifactIds: [],
    lockIds: ['lock:commerce-product-identity'],
    status: 'succeeded' as const,
    artifact,
    startedAt: 1,
    completedAt: 2,
    remoteTaskIdHash: 'c'.repeat(64),
    playbackPromotion: {
      sourceReceiptHash: 'e'.repeat(64),
      decoder: 'avfoundation-asset-image-generator-v1' as const,
      representativeFrames: 3 as const,
      nonBlankFrames: 3,
      pixelEvidenceHash: 'f'.repeat(64),
    },
    signature: 'd'.repeat(64),
  }
}

describe('portable multimodal Host contracts', () => {
  it('routes only exact observed operation/model pairs', () => {
    expect(resolveVerifiedMultimodalRoute({
      providerKind: 'dashscope',
      model: 'wan2.6-t2v',
      operation: 'text-to-video',
    })?.transport).toBe('dashscope-native-video-async')
    expect(resolveVerifiedMultimodalRoute({
      providerKind: 'dashscope',
      model: 'wan2.6-t2v',
      operation: 'video-edit',
    })).toBeUndefined()
    expect(resolveVerifiedMultimodalRoute({
      providerKind: 'dashscope',
      model: 'minimax-h3',
      operation: 'video-edit',
    })).toBeUndefined()
  })

  it('retains the exact executable Wan 2.7 image-to-video proof and native object binding', () => {
    const route = resolveMultimodalRoute({
      providerKind: 'dashscope',
      model: 'wan2.7-i2v-2026-04-25',
      operation: 'image-to-video',
    })
    expect(route).toMatchObject({
      id: 'route:dashscope:wan2.7-i2v-2026-04-25:image-to-video',
      inputModalities: ['text', 'image'],
      requiredReferenceBinding: 'native-provider-object-url',
      imageToVideoWireContract: {
        endpointPath: '/api/v1/services/aigc/video-generation/video-synthesis',
        inputReferenceField: 'input.media[0]',
        inputReferenceType: 'first_frame',
        providerObjectScheme: 'oss://dashscope-instant/',
        inputPromptFields: ['prompt', 'negative_prompt'],
        parameters: {
          resolution: '1080P',
          ratio: '16:9',
          durationSeconds: 5,
          promptExtend: false,
          watermark: false,
        },
      },
      evidence: {
        status: 'verified',
        observedOutput: {
          sha256: '7b06f3e7a76f83594731698351164c4318a3c60b28610299321d5527c030227d',
          width: 1440,
          height: 1440,
          durationMs: 5_038,
          videoCodec: 'h264',
          audioCodec: 'aac',
          nativePlaybackPromotion: 'passed',
          semanticIdentityReview: 'passed',
        },
      },
      hostCapability: { status: 'available' },
      executable: true,
      limits: {
        maximumInputReferences: 1,
        supportedResolutions: ['1080P'],
        seedRange: { minimum: 0, maximum: DASHSCOPE_WAN_VIDEO_SEED_MAXIMUM },
      },
    })
    expect(resolveVerifiedMultimodalRoute({
      providerKind: 'dashscope',
      model: 'wan2.7-i2v-2026-04-25',
      operation: 'image-to-video',
    })?.hostCapability.status).toBe('available')
  })

  it('rejects wrong Wan 2.7 modality and model identities', () => {
    const route = structuredClone(QWEN_GATE_A_ROUTES.find(
      (candidate) => candidate.model === 'wan2.7-i2v-2026-04-25',
    )!)
    route.inputModalities = ['text']
    expect(() => multimodalRouteDescriptorSchema.parse(route)).toThrow(/cannot fall back to text/)

    const wrongModel = structuredClone(QWEN_GATE_A_ROUTES.find(
      (candidate) => candidate.model === 'wan2.7-i2v-2026-04-25',
    )!)
    wrongModel.model = 'wan2.7-t2v-2026-04-25'
    expect(() => multimodalRouteDescriptorSchema.parse(wrongModel)).toThrow(/Route identity/)
    expect(resolveMultimodalRoute({
      providerKind: 'dashscope',
      model: 'wan2.7-i2v-2026-04-25',
      operation: 'text-to-video',
    })).toBeUndefined()
  })

  it('normalizes only seeds inside the verified inclusive 31-bit range', () => {
    expect(normalizeDashScopeWanVideoSeed(-0)).toBe(0)
    expect(normalizeDashScopeWanVideoSeed(DASHSCOPE_WAN_VIDEO_SEED_MAXIMUM))
      .toBe(DASHSCOPE_WAN_VIDEO_SEED_MAXIMUM)
    for (const invalid of [-1, DASHSCOPE_WAN_VIDEO_SEED_MAXIMUM + 1, 1.5]) {
      expect(() => normalizeDashScopeWanVideoSeed(invalid)).toThrow()
    }
  })

  it('admits VL/OCR only with retained image and video structured-output probes', () => {
    const vl = QWEN_GATE_A_ROUTES.find((route) => route.operation === 'vision-ocr')
    expect(vl).toMatchObject({
      executable: true,
      evidence: {
        status: 'verified',
        observedStructuredOutputs: [
          { inputMediaType: 'image/png', schemaValid: true },
          { inputMediaType: 'video/mp4', schemaValid: true },
        ],
      },
    })
    expect(resolveVerifiedMultimodalRoute({
      providerKind: 'dashscope',
      model: 'qwen3-vl-plus',
      operation: 'vision-ocr',
    })).toEqual(vl)
  })

  it('rejects generic capability labels that drift from exact operations', () => {
    const route = structuredClone(QWEN_GATE_A_ROUTES.at(-1)!)
    route.id = 'route:dashscope:wan2.6-t2v:video-edit'
    expect(() => multimodalRouteDescriptorSchema.parse(route)).toThrow()
  })

  it('binds image-to-video receipts to the exact operation and one image artifact', () => {
    const value = receipt()
    value.model = 'wan2.7-i2v-2026-04-25'
    value.routeId = 'route:dashscope:wan2.7-i2v-2026-04-25:image-to-video'
    value.operation = 'image-to-video'
    value.acceptedReferenceArtifactIds = [`artifact:sha256:${'e'.repeat(64)}`]
    expect(multimodalHostReceiptSchema.parse(value).operation).toBe('image-to-video')

    for (const references of [[], [
      `artifact:sha256:${'e'.repeat(64)}`,
      `artifact:sha256:${'f'.repeat(64)}`,
    ]]) {
      const drifted = structuredClone(value)
      drifted.acceptedReferenceArtifactIds = references
      expect(() => multimodalHostReceiptSchema.parse(drifted)).toThrow(/exactly one/)
    }

    const wrongRoute = structuredClone(value)
    wrongRoute.routeId = 'route:dashscope:wan2.7-t2v-2026-04-25:image-to-video'
    expect(() => multimodalHostReceiptSchema.parse(wrongRoute)).toThrow(/exact model and operation/)

    const unlocked = structuredClone(value)
    unlocked.lockIds = []
    expect(() => multimodalHostReceiptSchema.parse(unlocked)).toThrow(/and its locks/)
  })

  it('binds signed receipts to content-addressed decoded media', () => {
    const parsed = multimodalHostReceiptSchema.parse(receipt())
    expect(verifiedMultimodalHostArtifactSchema.parse({
      verified: true,
      receipt: parsed,
      artifact: parsed.artifact,
    }).artifact.sha256).toBe(HASH)

    const drifted = structuredClone(parsed)
    drifted.artifact.artifactId = `artifact:sha256:${'e'.repeat(64)}`
    expect(() => multimodalHostReceiptSchema.parse(drifted)).toThrow(/content digest/)
  })

  it('rejects receipt route, timing, credential and video QA drift', () => {
    for (const mutate of [
      (value: ReturnType<typeof receipt>) => { value.routeId = 'route:dashscope:wan2.6-t2v:video-edit' },
      (value: ReturnType<typeof receipt>) => { value.completedAt = 0 },
      (value: ReturnType<typeof receipt>) => { value.providerId = 'Bearer leaked-token' },
      (value: ReturnType<typeof receipt>) => { value.artifact.sampleTablesReadable = false },
    ]) {
      const value = receipt()
      mutate(value)
      expect(() => multimodalHostReceiptSchema.parse(value)).toThrow()
    }
  })

  it('rejects caller-authored playback booleans without native promotion evidence', () => {
    const value = structuredClone(receipt()) as Omit<
      ReturnType<typeof receipt>,
      'playbackPromotion'
    > & { playbackPromotion?: ReturnType<typeof receipt>['playbackPromotion'] }
    delete value.playbackPromotion
    expect(() => multimodalHostReceiptSchema.parse(value)).toThrow(/native signed promotion evidence/)

    const unpromoted = receipt()
    unpromoted.artifact.playbackVerified = false
    expect(() => multimodalHostReceiptSchema.parse(unpromoted)).toThrow(/native signed promotion evidence/)
  })
})

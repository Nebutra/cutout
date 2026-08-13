import { z } from 'zod'

export const MULTIMODAL_HOST_RECEIPT_PROTOCOL = 'cutout.multimodal-host-receipt.v1' as const

const recordIdSchema = z.string().min(1).max(240)
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const safeTextSchema = z.string().min(1).max(2_000).refine(
  (value) => !/(?:\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b|\bBearer\s+[A-Za-z0-9._~+/-]+\b)/i.test(value),
  'Credential-shaped values are not accepted.',
)

export const multimodalOperationSchema = z.enum([
  'structured-text',
  'vision-ocr',
  'image-generation',
  'image-edit',
  'text-to-video',
  'image-to-video',
  'reference-to-video',
  'video-edit',
])
export type MultimodalOperation = z.infer<typeof multimodalOperationSchema>

export const multimodalInputModalitySchema = z.enum(['text', 'image', 'video', 'audio'])
export type MultimodalInputModality = z.infer<typeof multimodalInputModalitySchema>

export const multimodalTransportSchema = z.enum([
  'dashscope-compatible-chat-completions',
  'dashscope-native-image-sync',
  'dashscope-native-video-async',
])
export type MultimodalTransport = z.infer<typeof multimodalTransportSchema>

export const DASHSCOPE_WAN_VIDEO_SEED_MINIMUM = 0
export const DASHSCOPE_WAN_VIDEO_SEED_MAXIMUM = 2_147_483_647
export const dashScopeWanVideoSeedSchema = z.number().int()
  .min(DASHSCOPE_WAN_VIDEO_SEED_MINIMUM)
  .max(DASHSCOPE_WAN_VIDEO_SEED_MAXIMUM)

export function normalizeDashScopeWanVideoSeed(seed: number): number {
  return dashScopeWanVideoSeedSchema.parse(Object.is(seed, -0) ? 0 : seed)
}

const exactRouteLimitsSchema = z.object({
  maximumInputReferences: z.number().int().nonnegative().max(64),
  maximumOutputBytes: z.number().int().positive(),
  supportedDurationsSeconds: z.array(z.number().int().positive()).max(30),
  supportedResolutions: z.array(z.string().regex(/^(?:\d+x\d+|720P|1080P)$/)).max(30),
  nativeAudio: z.boolean(),
  seedRange: z.object({
    minimum: z.literal(DASHSCOPE_WAN_VIDEO_SEED_MINIMUM),
    maximum: z.literal(DASHSCOPE_WAN_VIDEO_SEED_MAXIMUM),
  }).strict().optional(),
}).strict()

const hostCapabilitySchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('available') }).strict(),
  z.object({
    status: z.literal('capability-required'),
    requirement: safeTextSchema.max(500),
  }).strict(),
])

const dashScopeImageToVideoWireContractSchema = z.object({
  endpointPath: z.literal('/api/v1/services/aigc/video-generation/video-synthesis'),
  inputReferenceField: z.literal('input.media[0]'),
  inputReferenceType: z.literal('first_frame'),
  providerObjectScheme: z.literal('oss://dashscope-instant/'),
  inputPromptFields: z.tuple([z.literal('prompt'), z.literal('negative_prompt')]),
  parameters: z.object({
    resolution: z.literal('1080P'),
    ratio: z.literal('16:9'),
    durationSeconds: z.literal(5),
    promptExtend: z.literal(false),
    watermark: z.literal(false),
  }).strict(),
}).strict()

export const multimodalRouteDescriptorSchema = z.object({
  schema: z.literal('cutout.multimodal-route.v1'),
  id: recordIdSchema,
  providerKind: z.literal('dashscope'),
  model: safeTextSchema.max(300),
  operation: multimodalOperationSchema,
  inputModalities: z.array(multimodalInputModalitySchema).min(1).max(4),
  transport: multimodalTransportSchema,
  limits: exactRouteLimitsSchema,
  evidence: z.object({
    status: z.enum(['verified', 'capability-required']),
    sourceId: recordIdSchema,
    observedAt: z.string().datetime().optional(),
    observedOutput: z.object({
      sha256: sha256Schema,
      mediaType: z.literal('video/mp4'),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      durationMs: z.number().int().positive(),
      videoCodec: z.literal('h264'),
      audioCodec: z.literal('aac'),
      nativePlaybackPromotion: z.literal('passed'),
      semanticIdentityReview: z.literal('passed'),
    }).strict().optional(),
  }).strict(),
  hostCapability: hostCapabilitySchema,
  requiredReferenceBinding: z.enum([
    'native-inline-image-bytes',
    'native-provider-object-url',
  ]).optional(),
  imageToVideoWireContract: dashScopeImageToVideoWireContractSchema.optional(),
  executable: z.boolean(),
}).strict().superRefine((route, context) => {
  if (route.executable !== (route.hostCapability.status === 'available')) {
    context.addIssue({
      code: 'custom',
      message: 'Route executability must match its Host capability status.',
    })
  }
  if (route.executable && route.evidence.status !== 'verified') {
    context.addIssue({ code: 'custom', message: 'An executable route requires verified evidence.' })
  }
  if (route.operation === 'structured-text' && route.inputModalities.join(',') !== 'text') {
    context.addIssue({ code: 'custom', message: 'Structured text accepts text input only.' })
  }
  if (route.operation === 'text-to-video' && route.inputModalities.join(',') !== 'text') {
    context.addIssue({ code: 'custom', message: 'Text-to-video accepts text input only.' })
  }
  if (route.operation === 'image-edit' && !route.inputModalities.includes('image')) {
    context.addIssue({ code: 'custom', message: 'Image edit requires image input.' })
  }
  if (route.operation === 'image-to-video'
    && (route.inputModalities.join(',') !== 'text,image'
      || route.limits.maximumInputReferences !== 1
      || route.requiredReferenceBinding !== 'native-provider-object-url'
      || route.imageToVideoWireContract === undefined)) {
    context.addIssue({
      code: 'custom',
      message: 'Image-to-video requires one native-bound image reference and cannot fall back to text.',
    })
  }
  if (route.id !== `route:${route.providerKind}:${route.model}:${route.operation}`) {
    context.addIssue({ code: 'custom', message: 'Route identity must bind its exact operation.' })
  }
})
export type MultimodalRouteDescriptor = z.infer<typeof multimodalRouteDescriptorSchema>

export const multimodalHostContextSchema = z.object({
  requestId: recordIdSchema,
  runId: recordIdSchema,
  semanticRole: recordIdSchema.optional(),
  nodeId: recordIdSchema.optional(),
  capabilityId: recordIdSchema.optional(),
  acceptedReferenceArtifactIds: z.array(
    z.string().regex(/^artifact:sha256:[a-f0-9]{64}$/),
  ).max(64),
  lockIds: z.array(recordIdSchema).max(64),
}).strict()
export type MultimodalHostContext = z.infer<typeof multimodalHostContextSchema>

export const multimodalArtifactEvidenceSchema = z.object({
  artifactId: z.string().regex(/^artifact:sha256:[a-f0-9]{64}$/),
  sha256: sha256Schema,
  mediaType: z.enum([
    'application/json',
    'image/png',
    'image/jpeg',
    'image/webp',
    'video/mp4',
  ]),
  byteLength: z.number().int().positive(),
  decoded: z.literal(true),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationMs: z.number().int().positive().optional(),
  frameRate: z.number().positive().finite().optional(),
  videoCodec: z.enum(['h264', 'h265', 'vp9']).optional(),
  audioCodec: z.literal('aac').optional(),
  sampleTablesReadable: z.boolean().optional(),
  playbackVerified: z.boolean().optional(),
}).strict().superRefine((artifact, context) => {
  if (artifact.artifactId !== `artifact:sha256:${artifact.sha256}`) {
    context.addIssue({ code: 'custom', message: 'Artifact identity must equal its content digest.' })
  }
  const image = artifact.mediaType.startsWith('image/')
  const video = artifact.mediaType === 'video/mp4'
  if ((image || video) && (!artifact.width || !artifact.height)) {
    context.addIssue({ code: 'custom', message: 'Verified media requires decoded dimensions.' })
  }
  if (video && (!artifact.durationMs || !artifact.frameRate || !artifact.videoCodec
    || artifact.sampleTablesReadable !== true || artifact.playbackVerified === undefined)) {
    context.addIssue({ code: 'custom', message: 'Verified video requires readable timed sample evidence.' })
  }
  if (!video && (artifact.durationMs !== undefined || artifact.frameRate !== undefined
    || artifact.videoCodec !== undefined || artifact.audioCodec !== undefined
    || artifact.sampleTablesReadable !== undefined || artifact.playbackVerified !== undefined)) {
    context.addIssue({ code: 'custom', message: 'Non-video artifacts cannot carry video evidence.' })
  }
})
export type MultimodalArtifactEvidence = z.infer<typeof multimodalArtifactEvidenceSchema>

export const playbackPromotionEvidenceSchema = z.object({
  sourceReceiptHash: sha256Schema,
  decoder: z.literal('avfoundation-asset-image-generator-v1'),
  representativeFrames: z.literal(3),
  nonBlankFrames: z.literal(3),
  pixelEvidenceHash: sha256Schema,
}).strict()
export type PlaybackPromotionEvidence = z.infer<typeof playbackPromotionEvidenceSchema>

export const multimodalHostReceiptSchema = z.object({
  protocol: z.literal(MULTIMODAL_HOST_RECEIPT_PROTOCOL),
  receiptId: recordIdSchema,
  receiptHash: sha256Schema,
  requestId: recordIdSchema,
  runId: recordIdSchema,
  providerId: safeTextSchema.max(160),
  providerKind: z.literal('dashscope'),
  model: safeTextSchema.max(300),
  routeId: recordIdSchema,
  operation: multimodalOperationSchema,
  semanticRole: recordIdSchema.optional(),
  nodeId: recordIdSchema.optional(),
  capabilityId: recordIdSchema.optional(),
  acceptedReferenceArtifactIds: z.array(
    z.string().regex(/^artifact:sha256:[a-f0-9]{64}$/),
  ).max(64),
  lockIds: z.array(recordIdSchema).max(64),
  status: z.literal('succeeded'),
  artifact: multimodalArtifactEvidenceSchema,
  startedAt: z.number().int().nonnegative(),
  completedAt: z.number().int().nonnegative(),
  remoteTaskIdHash: sha256Schema.optional(),
  playbackPromotion: playbackPromotionEvidenceSchema.optional(),
  signature: sha256Schema,
}).strict().superRefine((receipt, context) => {
  if (receipt.completedAt < receipt.startedAt) {
    context.addIssue({ code: 'custom', message: 'Receipt completion cannot precede its start.' })
  }
  if (receipt.routeId !== `route:${receipt.providerKind}:${receipt.model}:${receipt.operation}`) {
    context.addIssue({ code: 'custom', message: 'Receipt route must bind its exact model and operation.' })
  }
  if (receipt.operation === 'image-to-video'
    && (receipt.acceptedReferenceArtifactIds.length !== 1 || receipt.lockIds.length === 0)) {
    context.addIssue({
      code: 'custom',
      message: 'Image-to-video receipts must bind exactly one accepted image artifact and its locks.',
    })
  }
  const promoted = receipt.artifact.playbackVerified === true
  if (promoted !== (receipt.playbackPromotion !== undefined)) {
    context.addIssue({
      code: 'custom',
      message: 'Playback verification requires native signed promotion evidence.',
    })
  }
  if (receipt.playbackPromotion && receipt.artifact.mediaType !== 'video/mp4') {
    context.addIssue({ code: 'custom', message: 'Playback promotion is valid only for MP4 video.' })
  }
})
export type MultimodalHostReceipt = z.infer<typeof multimodalHostReceiptSchema>

export const verifiedMultimodalHostArtifactSchema = z.object({
  verified: z.literal(true),
  receipt: multimodalHostReceiptSchema,
  artifact: multimodalArtifactEvidenceSchema,
}).strict().superRefine((value, context) => {
  if (value.artifact.artifactId !== value.receipt.artifact.artifactId
    || value.artifact.sha256 !== value.receipt.artifact.sha256) {
    context.addIssue({ code: 'custom', message: 'Verified artifact must match the signed receipt.' })
  }
})
export type VerifiedMultimodalHostArtifact = z.infer<typeof verifiedMultimodalHostArtifactSchema>

const LIVE_PROBE_SOURCE = 'probe:qwen-gate-a:2026-08-13'

export const QWEN_GATE_A_ROUTES: readonly MultimodalRouteDescriptor[] = Object.freeze([
  multimodalRouteDescriptorSchema.parse({
    schema: 'cutout.multimodal-route.v1',
    id: 'route:dashscope:qwen3.8-max:structured-text',
    providerKind: 'dashscope',
    model: 'qwen3.8-max',
    operation: 'structured-text',
    inputModalities: ['text'],
    transport: 'dashscope-compatible-chat-completions',
    limits: {
      maximumInputReferences: 0,
      maximumOutputBytes: 2 * 1024 * 1024,
      supportedDurationsSeconds: [],
      supportedResolutions: [],
      nativeAudio: false,
    },
    evidence: { status: 'verified', sourceId: LIVE_PROBE_SOURCE, observedAt: '2026-08-13T01:34:27Z' },
    hostCapability: { status: 'available' },
    executable: true,
  }),
  multimodalRouteDescriptorSchema.parse({
    schema: 'cutout.multimodal-route.v1',
    id: 'route:dashscope:qwen3-vl-plus:vision-ocr',
    providerKind: 'dashscope',
    model: 'qwen3-vl-plus',
    operation: 'vision-ocr',
    inputModalities: ['text', 'image'],
    transport: 'dashscope-compatible-chat-completions',
    limits: {
      maximumInputReferences: 1,
      maximumOutputBytes: 2 * 1024 * 1024,
      supportedDurationsSeconds: [],
      supportedResolutions: [],
      nativeAudio: false,
    },
    evidence: { status: 'capability-required', sourceId: 'route-requires-live-vl-host-probe' },
    hostCapability: {
      status: 'capability-required',
      requirement: 'An exact native VL/OCR Host probe has not been retained.',
    },
    executable: false,
  }),
  ...(['image-generation', 'image-edit'] as const).map((operation) => (
    multimodalRouteDescriptorSchema.parse({
      schema: 'cutout.multimodal-route.v1',
      id: `route:dashscope:qwen-image-3.0:${operation}`,
      providerKind: 'dashscope',
      model: 'qwen-image-3.0',
      operation,
      inputModalities: operation === 'image-edit' ? ['text', 'image'] : ['text'],
      transport: 'dashscope-native-image-sync',
      limits: {
        maximumInputReferences: operation === 'image-edit' ? 3 : 0,
        maximumOutputBytes: 32 * 1024 * 1024,
        supportedDurationsSeconds: [],
        supportedResolutions: ['1024x1024'],
        nativeAudio: false,
      },
      evidence: { status: 'verified', sourceId: LIVE_PROBE_SOURCE, observedAt: '2026-08-13T01:34:27Z' },
      hostCapability: { status: 'available' },
      ...(operation === 'image-edit'
        ? { requiredReferenceBinding: 'native-inline-image-bytes' as const }
        : {}),
      executable: true,
    })
  )),
  multimodalRouteDescriptorSchema.parse({
    schema: 'cutout.multimodal-route.v1',
    id: 'route:dashscope:wan2.6-t2v:text-to-video',
    providerKind: 'dashscope',
    model: 'wan2.6-t2v',
    operation: 'text-to-video',
    inputModalities: ['text'],
    transport: 'dashscope-native-video-async',
    limits: {
      maximumInputReferences: 0,
      maximumOutputBytes: 64 * 1024 * 1024,
      supportedDurationsSeconds: [5],
      supportedResolutions: ['720P', '1080P'],
      nativeAudio: true,
    },
    evidence: { status: 'verified', sourceId: LIVE_PROBE_SOURCE, observedAt: '2026-08-13T01:34:27Z' },
    hostCapability: { status: 'available' },
    executable: true,
  }),
  multimodalRouteDescriptorSchema.parse({
    schema: 'cutout.multimodal-route.v1',
    id: 'route:dashscope:wan2.7-i2v-2026-04-25:image-to-video',
    providerKind: 'dashscope',
    model: 'wan2.7-i2v-2026-04-25',
    operation: 'image-to-video',
    inputModalities: ['text', 'image'],
    transport: 'dashscope-native-video-async',
    limits: {
      maximumInputReferences: 1,
      maximumOutputBytes: 64 * 1024 * 1024,
      supportedDurationsSeconds: [5],
      supportedResolutions: ['1080P'],
      nativeAudio: true,
      seedRange: {
        minimum: DASHSCOPE_WAN_VIDEO_SEED_MINIMUM,
        maximum: DASHSCOPE_WAN_VIDEO_SEED_MAXIMUM,
      },
    },
    evidence: {
      status: 'verified',
      sourceId: 'probe:dashscope:wan2.7-i2v-2026-04-25:2026-08-13',
      observedOutput: {
        sha256: '7b06f3e7a76f83594731698351164c4318a3c60b28610299321d5527c030227d',
        mediaType: 'video/mp4',
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
    executable: true,
  }),
])

export function resolveMultimodalRoute(input: {
  readonly providerKind: 'dashscope'
  readonly model: string
  readonly operation: MultimodalOperation
}): MultimodalRouteDescriptor | undefined {
  return QWEN_GATE_A_ROUTES.find((route) => route.providerKind === input.providerKind
    && route.model === input.model
    && route.operation === input.operation)
}

export function resolveVerifiedMultimodalRoute(input: {
  readonly providerKind: 'dashscope'
  readonly model: string
  readonly operation: MultimodalOperation
}): MultimodalRouteDescriptor | undefined {
  const route = resolveMultimodalRoute(input)
  return route?.executable ? route : undefined
}

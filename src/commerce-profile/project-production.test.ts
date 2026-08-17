import { describe, expect, it } from 'vitest'
import { base64ToBytes } from '@/lib/image'
import type { MultimodalHostArtifactBytes } from '@/multimodal-host'
import type {
  MultimodalArtifactEvidence,
  MultimodalHostContext,
  MultimodalHostReceipt,
} from '@/multimodal-host/contracts'
import {
  fixtureAttributeCatalog,
  fixtureCategoryCatalog,
  fixtureLocalizedDescription,
  fixtureProductRecord,
} from './commerce-profile.test-fixture'
import type { CommerceProductionCoreHost } from './production-host'
import {
  COMMERCE_SEMANTIC_ROLES,
  type CommerceSemanticRole,
} from './profile'
import {
  prepareCommerceProjectInput,
  runCommerceProjectProduction,
  type CommerceProjectProductionInput,
  type CommerceProjectProgressEvent,
} from './project-production'

// This deterministic Host exercises orchestration contracts only. It is never
// admitted as held-out or real-Provider benchmark evidence.

const onePixelPng = base64ToBytes(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
)

function projectInput(): CommerceProjectProductionInput {
  return {
    providerId: 'dashscope-project',
    product: { fileName: 'product.json', contents: JSON.stringify(fixtureProductRecord) },
    categoryCatalog: { fileName: 'categories.json', contents: fixtureCategoryCatalog },
    attributeCatalog: { fileName: 'attributes.json', contents: fixtureAttributeCatalog },
    references: [{ fileName: 'front.png', mediaType: 'image/png', bytes: onePixelPng }],
  }
}

function repeatedHash(index: number): string {
  return index.toString(16).padStart(2, '0').repeat(32)
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function modelForOperation(operation: MultimodalHostReceipt['operation']): string {
  if (operation === 'structured-text') return 'qwen3.8-max'
  if (operation === 'vision-ocr') return 'qwen3-vl-plus'
  if (operation === 'image-to-video') return 'wan2.7-i2v-2026-04-25'
  return 'qwen-image-3.0'
}

async function artifactEvidence(
  bytes: Uint8Array,
  mediaType: MultimodalArtifactEvidence['mediaType'],
): Promise<MultimodalArtifactEvidence> {
  const digest = await sha256(bytes)
  const image = mediaType.startsWith('image/')
  const video = mediaType === 'video/mp4'
  return {
    artifactId: `artifact:sha256:${digest}`,
    sha256: digest,
    mediaType,
    byteLength: bytes.byteLength,
    decoded: true,
    ...(image || video ? { width: 1024, height: video ? 576 : 1024 } : {}),
    ...(video ? {
      durationMs: 5_000,
      frameRate: 30,
      videoCodec: 'h264' as const,
      sampleTablesReadable: true,
      playbackVerified: false,
    } : {}),
  }
}

function receipt(input: {
  readonly index: number
  readonly context: MultimodalHostContext
  readonly artifact: MultimodalArtifactEvidence
  readonly operation: MultimodalHostReceipt['operation']
  readonly providerId: string
}): MultimodalHostReceipt {
  const model = modelForOperation(input.operation)
  return {
    protocol: 'cutout.multimodal-host-receipt.v1',
    receiptId: `receipt:project-contract:${input.index}`,
    receiptHash: repeatedHash(input.index + 40),
    requestId: input.context.requestId,
    runId: input.context.runId,
    providerId: input.providerId,
    providerKind: 'dashscope',
    model,
    routeId: `route:dashscope:${model}:${input.operation}`,
    operation: input.operation,
    semanticRole: input.context.semanticRole,
    nodeId: input.context.nodeId,
    capabilityId: input.context.capabilityId,
    acceptedReferenceArtifactIds: input.context.acceptedReferenceArtifactIds,
    lockIds: input.context.lockIds,
    status: 'succeeded',
    artifact: input.artifact,
    startedAt: input.index * 10,
    completedAt: input.index * 10 + 1,
    signature: repeatedHash(input.index + 120),
  }
}

async function result(input: {
  readonly index: number
  readonly context: MultimodalHostContext
  readonly bytes: Uint8Array
  readonly mediaType: MultimodalArtifactEvidence['mediaType']
  readonly operation: MultimodalHostReceipt['operation']
  readonly providerId: string
}): Promise<MultimodalHostArtifactBytes> {
  const artifact = await artifactEvidence(input.bytes, input.mediaType)
  return {
    bytes: input.bytes,
    receipt: receipt({ ...input, artifact }),
  }
}

function localeForRole(role: CommerceSemanticRole) {
  if (role === 'localized-description:en-US') return 'en-US' as const
  if (role === 'localized-description:ko-KR') return 'ko-KR' as const
  if (role === 'localized-description:pt-BR') return 'pt-BR' as const
  throw new Error(`Not a locale role: ${role}`)
}

async function createContractHost(input: {
  readonly facts: Awaited<ReturnType<typeof prepareCommerceProjectInput>>['facts']
  readonly failImageCall?: number
}): Promise<CommerceProductionCoreHost> {
  let receiptIndex = 1
  let imageCalls = 0
  const providerId = 'dashscope-project'
  const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))
  return {
    async preflightProvider() {
      return {
        provider: {
          id: providerId,
          kind: 'dashscope',
          label: 'DashScope project contract',
          baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
          wireProtocol: 'chat-completions',
          defaultModel: 'qwen3.8-max',
          enabled: true,
        },
        hasKey: true,
      }
    },
    async structuredText(request) {
      const role = request.context.semanticRole as CommerceSemanticRole
      const payload = role === 'strategy-document'
        ? (JSON.parse(request.prompt) as { expectedStrategy: unknown }).expectedStrategy
        : {
            ...fixtureLocalizedDescription(input.facts, localeForRole(role)),
            mediaDescriptions: [],
            catalogAttributes: {},
          }
      return result({
        index: receiptIndex++,
        context: request.context,
        bytes: encode(payload),
        mediaType: 'application/json',
        operation: 'structured-text',
        providerId,
      })
    },
    async visionJson(request) {
      const prompt = JSON.parse(request.prompt) as {
        expectedArtifactIdentity: {
          artifactId: string
          sha256: string
          media: Record<string, unknown>
        }
      }
      const expected = prompt.expectedArtifactIdentity
      return result({
        index: receiptIndex++,
        context: request.context,
        bytes: encode({
          schema: 'commerce.semantic-media-qa.v1',
          artifactId: expected.artifactId,
          artifactSha256: expected.sha256,
          artifact: { ...expected.media, visualReviewLabels: ['identity cues verified'] },
          productIdentityVerified: true,
          creativeDirectionVerified: true,
          overlayTextVerified: true,
          sensitiveVisualPolicyPassed: true,
          usable: true,
        }),
        mediaType: 'application/json',
        operation: 'vision-ocr',
        providerId,
      })
    },
    async image(request) {
      imageCalls += 1
      if (imageCalls === input.failImageCall) throw new Error('contract-only image failure')
      const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, imageCalls, 1, 2, 3])
      return [await result({
        index: receiptIndex++,
        context: request.context,
        bytes,
        mediaType: 'image/png',
        operation: 'image-edit',
        providerId,
      })]
    },
    async video(request) {
      return result({
        index: receiptIndex++,
        context: request.context,
        bytes: new Uint8Array([0, 0, 0, 8, 0x66, 0x74, 0x79, 0x70, 1]),
        mediaType: 'video/mp4',
        operation: 'image-to-video',
        providerId,
      })
    },
    async verify(candidate) {
      if (candidate.receipt.artifact.mediaType !== 'video/mp4') {
        return { verified: true, receipt: candidate.receipt, artifact: candidate.receipt.artifact }
      }
      const artifact = { ...candidate.receipt.artifact, playbackVerified: true }
      const promoted: MultimodalHostReceipt = {
        ...candidate.receipt,
        receiptId: `${candidate.receipt.receiptId}:playback`,
        receiptHash: repeatedHash(receiptIndex + 60),
        artifact,
        playbackPromotion: {
          sourceReceiptHash: candidate.receipt.receiptHash,
          decoder: 'avfoundation-asset-image-generator-v1',
          representativeFrames: 3,
          nonBlankFrames: 3,
          pixelEvidenceHash: repeatedHash(receiptIndex + 80),
        },
        signature: repeatedHash(receiptIndex + 100),
      }
      receiptIndex += 1
      return { verified: true, receipt: promoted, artifact }
    },
  }
}

describe('Commerce Project production contracts (not benchmark evidence)', () => {
  it('binds ordinary product data to one-to-three local content-addressed image facts', async () => {
    const prepared = await prepareCommerceProjectInput(projectInput())
    expect(prepared.sources).toHaveLength(1)
    expect(prepared.sources[0]).toMatchObject({
      fileName: 'front.png',
      factId: prepared.facts.identityAnchorFactId,
      mediaType: 'image/png',
      width: 1,
      height: 1,
    })
    const anchor = prepared.facts.facts.find((fact) => fact.id === prepared.facts.identityAnchorFactId)
    expect(anchor?.value).toMatchObject({
      type: 'media',
      mediaKind: 'image',
      descriptor: expect.stringMatching(/^local-reference:sha256:/),
    })

    const duplicate = projectInput()
    await expect(prepareCommerceProjectInput({
      ...duplicate,
      references: [duplicate.references[0]!, { ...duplicate.references[0]!, fileName: 'copy.png' }],
    })).rejects.toThrow(/unique content hashes/)
    await expect(prepareCommerceProjectInput({
      ...duplicate,
      references: [{ ...duplicate.references[0]!, mediaType: 'image/jpeg' }],
    })).rejects.toThrow(/media type does not match/)
  })

  it('executes and validates the exact eleven-role Project closure without evaluator authority', async () => {
    const requested = projectInput()
    const prepared = await prepareCommerceProjectInput(requested)
    const events: CommerceProjectProgressEvent[] = []
    const result = await runCommerceProjectProduction({
      ...requested,
      onProgress: (event) => { events.push(event) },
    }, await createContractHost({ facts: prepared.facts }))

    expect(result.deliverables.map((deliverable) => deliverable.semanticRole)).toEqual(COMMERCE_SEMANTIC_ROLES)
    expect(result.deliverables.filter((deliverable) => deliverable.qa)).toHaveLength(7)
    expect(result.deliverables.find((deliverable) => deliverable.semanticRole === 'product-video'))
      .toMatchObject({ mediaType: 'video/mp4', qa: { status: 'passed' } })
    expect(JSON.stringify(result)).not.toContain('heldOutCommitmentHash')
    expect(JSON.stringify(result)).not.toContain('productionReady')
    expect(events.filter((event) => event.type === 'step-started').map((event) => event.semanticRole))
      .toEqual(COMMERCE_SEMANTIC_ROLES)
    expect(events.filter((event) => event.type === 'deliverable-completed').map((event) => event.semanticRole))
      .toEqual(COMMERCE_SEMANTIC_ROLES)
  })

  it('retains completed progress outputs when a later Provider role fails', async () => {
    const requested = projectInput()
    const prepared = await prepareCommerceProjectInput(requested)
    const events: CommerceProjectProgressEvent[] = []
    await expect(runCommerceProjectProduction({
      ...requested,
      onProgress: (event) => { events.push(event) },
    }, await createContractHost({ facts: prepared.facts, failImageCall: 2 })))
      .rejects.toThrow('contract-only image failure')
    expect(events.filter((event) => event.type === 'deliverable-completed').map((event) => event.semanticRole))
      .toEqual([
        'localized-description:en-US',
        'localized-description:ko-KR',
        'localized-description:pt-BR',
        'main-image',
      ])
  })
})

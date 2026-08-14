import { describe, expect, it } from 'vitest'
import type { MultimodalArtifactEvidence, MultimodalHostReceipt } from '@/multimodal-host/contracts'
import { fixtureProductRecord } from './commerce-profile.test-fixture'
import { productFactsSchema } from './contracts'
import { normalizeProductRecord } from './normalizer'
import {
  COMMERCE_SEMANTIC_ROLES,
  commerceOutcomePayloadSchema,
  createCommerceEvidenceGraph,
  createCommerceOutcomeGraph,
  type CommerceSemanticRole,
} from './profile'
import {
  assertCommerceProductionRunnerRoutes,
  assertCommerceProductionProviderAuthority,
  assertCommerceProductionSourceDescriptor,
  assertCommerceProductionSourceSelection,
  assertCommerceRunnerQaReadyArtifact,
  assertCommerceRunnerReceiptClosure,
  COMMERCE_PRODUCTION_RUNNER_MODELS,
  createCommerceHeldOutCompletionRequest,
  createCommerceRunnerMediaReferenceClosure,
  preflightCommerceProductionDocuments,
  resolveCommerceRunnerStrategyReferences,
  selectCommerceProductionCategoryCandidates,
  type CommerceRunnerReferenceArtifact,
} from './production-runner'
import { COMMERCE_HELD_OUT_HOST_BUILD_VERSION } from './held-out'
import { compileCommerceProduction } from './recipes'
import type { CommerceProductionRehearsalBundle } from './rehearsal'

// These synthetic values exercise pure runner contracts only. They are never
// submitted to native verification or admitted as Commerce benchmark evidence.

const reviewedSource = 'https://aib-innovation-oss.oss-accelerate.aliyuncs.com/AI_Business/product/front.png?Expires=1&Signature=x'
const facts = normalizeProductRecord({
  file: 'product.json',
  contents: JSON.stringify(fixtureProductRecord),
})

function hash(index: number): string {
  return index.toString(16).padStart(2, '0').repeat(32)
}

function artifactEvidence(
  role: CommerceSemanticRole,
  index: number,
  playbackVerified?: boolean,
): MultimodalArtifactEvidence {
  const video = role === 'product-video'
  const media = video || role === 'main-image' || role.startsWith('detail-image:')
  const sha256 = hash(index)
  return {
    artifactId: `artifact:sha256:${sha256}`,
    sha256,
    mediaType: media ? video ? 'video/mp4' : 'image/png' : 'application/json',
    byteLength: 64 + index,
    decoded: true,
    ...(media ? { width: 1024, height: video ? 576 : 1024 } : {}),
    ...(video ? {
      durationMs: 5_000,
      frameRate: 30,
      videoCodec: 'h264' as const,
      sampleTablesReadable: true,
      playbackVerified: playbackVerified ?? false,
    } : {}),
  }
}

function receipt(input: {
  readonly id: string
  readonly role: CommerceSemanticRole
  readonly index: number
  readonly artifact: MultimodalArtifactEvidence
  readonly operation?: MultimodalHostReceipt['operation']
  readonly playbackSourceReceiptHash?: string
}): MultimodalHostReceipt {
  const operation = input.operation ?? (input.role === 'product-video'
    ? 'image-to-video'
    : input.role === 'main-image' || input.role.startsWith('detail-image:')
      ? 'image-edit'
      : 'structured-text')
  const model = operation === 'image-to-video'
    ? COMMERCE_PRODUCTION_RUNNER_MODELS.video
    : operation === 'image-edit'
      ? COMMERCE_PRODUCTION_RUNNER_MODELS.image
      : operation === 'vision-ocr'
        ? COMMERCE_PRODUCTION_RUNNER_MODELS.semanticQa
        : COMMERCE_PRODUCTION_RUNNER_MODELS.structuredText
  return {
    protocol: 'cutout.multimodal-host-receipt.v1',
    receiptId: input.id,
    receiptHash: hash(input.index + 80),
    requestId: `request:${input.id}`,
    runId: 'run:contract-only',
    providerId: 'provider:contract-only',
    providerKind: 'dashscope',
    model,
    routeId: `route:dashscope:${model}:${operation}`,
    operation,
    semanticRole: input.role,
    nodeId: `plan:${input.role}`,
    capabilityId: `capability:${input.role}`,
    acceptedReferenceArtifactIds: [],
    lockIds: ['lock:contract-only'],
    status: 'succeeded',
    artifact: input.artifact,
    startedAt: input.index * 10,
    completedAt: input.index * 10 + 1,
    ...(input.playbackSourceReceiptHash ? {
      playbackPromotion: {
        sourceReceiptHash: input.playbackSourceReceiptHash,
        decoder: 'avfoundation-asset-image-generator-v1' as const,
        representativeFrames: 3 as const,
        nonBlankFrames: 3 as const,
        pixelEvidenceHash: hash(input.index + 120),
      },
    } : {}),
    signature: hash(input.index + 160),
  }
}

function retainedContractArtifacts(): CommerceProductionRehearsalBundle['artifacts'] {
  return COMMERCE_SEMANTIC_ROLES.map((role, index) => {
    const media = role === 'main-image' || role.startsWith('detail-image:') || role === 'product-video'
    const baseArtifact = artifactEvidence(role, index + 1, false)
    const providerReceipt = receipt({
      id: `receipt:provider:${role}`,
      role,
      index: index + 1,
      artifact: baseArtifact,
    })
    const retainedReceipt = role === 'product-video'
      ? receipt({
          id: 'receipt:playback:product-video',
          role,
          index: index + 30,
          artifact: { ...baseArtifact, playbackVerified: true },
          playbackSourceReceiptHash: providerReceipt.receiptHash,
        })
      : providerReceipt
    return {
      semanticRole: role,
      receipt: retainedReceipt,
      ...(role === 'product-video' ? { playbackSourceReceipt: providerReceipt } : {}),
      artifactBytesBase64: 'eA==',
      ...(media ? {
        semanticQa: {
          receipt: receipt({
            id: `receipt:qa:${role}`,
            role,
            index: index + 50,
            artifact: artifactEvidence('strategy-document', index + 50),
            operation: 'vision-ocr',
          }),
          artifactBytesBase64: 'e30=',
        },
      } : { deliveryBytesBase64: 'eA==' }),
    }
  })
}

describe('Commerce production runner pure preflight contracts (not benchmark evidence)', () => {
  it('binds evaluator completion to the committed Host build version', () => {
    const completion = createCommerceHeldOutCompletionRequest({
      commitment: {
        challengeSelection: {
          payload: {
            challengeId: 'challenge:contract-only',
          },
        },
        challengeHash: hash(1),
        evaluatorKeyId: 'evaluator:contract-only',
        hostBuildVersion: COMMERCE_HELD_OUT_HOST_BUILD_VERSION,
        commitmentHash: hash(2),
        inputManifestHash: hash(3),
        runId: 'run:contract-only',
      },
      bundleHash: hash(4),
    })

    expect(completion).toMatchObject({
      protocol: 'cutout.commerce-held-out-evaluator-completion.v2',
      challengeId: 'challenge:contract-only',
      hostBuildVersion: COMMERCE_HELD_OUT_HOST_BUILD_VERSION,
      runId: 'run:contract-only',
      bundleHash: hash(4),
    })
  })

  it('requires one enabled keyed first-party DashScope Provider before commitment', () => {
    const provider = {
      id: 'dashscope-production',
      kind: 'dashscope',
      label: 'DashScope',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      wireProtocol: 'chat-completions' as const,
      defaultModel: 'qwen3.8-max',
      enabled: true,
    }
    expect(() => assertCommerceProductionProviderAuthority(provider, true)).not.toThrow()
    expect(() => assertCommerceProductionProviderAuthority({ ...provider, enabled: false }, true))
      .toThrow(/capability-required/)
    expect(() => assertCommerceProductionProviderAuthority({
      ...provider,
      baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    }, true)).toThrow(/capability-required/)
    expect(() => assertCommerceProductionProviderAuthority(provider, false))
      .toThrow(/capability-required/)
  })

  it('rejects source descriptors and lineage that native ingestion would reject before commitment', () => {
    expect(() => assertCommerceProductionSourceDescriptor({
      sourceFile: 'product.json',
      sourcePointer: '/images/0',
      sourceDescriptor: reviewedSource,
    })).not.toThrow()
    for (const sourceDescriptor of [
      reviewedSource.replace('https:', 'http:'),
      reviewedSource.replace('aib-innovation-oss.oss-accelerate.aliyuncs.com', 'evil.example'),
      reviewedSource.replace('https://', 'https://user:secret@'),
      reviewedSource.replace('.com/', '.com:8443/'),
      `${reviewedSource}#fragment`,
      'https://aib-innovation-oss.oss-accelerate.aliyuncs.com/AI_Business/',
      reviewedSource.replace('https://', 'HTTPS://'),
    ]) {
      expect(() => assertCommerceProductionSourceDescriptor({
        sourceFile: 'product.json',
        sourcePointer: '/images/0',
        sourceDescriptor,
      })).toThrow(/source descriptor/)
    }
    expect(() => assertCommerceProductionSourceDescriptor({
      sourceFile: '../product.json',
      sourcePointer: '/images/0',
      sourceDescriptor: reviewedSource,
    })).toThrow(/source lineage/)
  })

  it('requires the immutable identity anchor to be the first selected source', () => {
    expect(() => assertCommerceProductionSourceSelection(facts, [facts.identityAnchorFactId])).not.toThrow()
    const anotherImage = facts.mediaFactIds.find((factId) => factId !== facts.identityAnchorFactId)
    if (anotherImage) {
      expect(() => assertCommerceProductionSourceSelection(
        facts,
        [anotherImage, facts.identityAnchorFactId],
      )).toThrow(/identity anchor/)
    }
    expect(() => assertCommerceProductionSourceSelection(facts, [facts.categoryFactId]))
      .toThrow(/resolved image fact|identity anchor/)
  })

  it('keeps the fixed production models on verified executable routes', () => {
    expect(COMMERCE_PRODUCTION_RUNNER_MODELS.image).toBe('qwen-image-3.0')
    expect(() => assertCommerceProductionRunnerRoutes()).not.toThrow()
  })

  it('precompiles canonical Commerce documents before the one-shot commitment', async () => {
    const evidenceGraph = createCommerceEvidenceGraph({ facts })
    const outcomeGraph = createCommerceOutcomeGraph({ facts })
    const selectedSources = [{
      factId: facts.identityAnchorFactId,
      sourceFile: 'product.json',
      sourcePointer: '/images/0',
      sourceDescriptor: reviewedSource,
      sourceDescriptorSha256: hash(1),
    }]
    await expect(preflightCommerceProductionDocuments({
      evidenceGraph,
      outcomeGraph,
      selectedSources,
    })).resolves.toBeUndefined()
  })

  it('derives an order-independent bounded category shortlist with an ASCII tie break', () => {
    const rankedFacts = productFactsSchema.parse({
      ...facts,
      facts: facts.facts.map((fact) => fact.id === facts.categoryFactId
        ? { ...fact, value: { type: 'text' as const, value: 'shirt' } }
        : fact),
    })
    const categories = [
      { id: 'category:b', name: 'Shirt Accessories', leaf: true },
      { id: 'category:a', name: 'Shirt Tops', leaf: true },
      { id: 'category:parent', name: 'Shirt', leaf: false },
    ]
    const forward = selectCommerceProductionCategoryCandidates(rankedFacts, categories)
    const reversed = selectCommerceProductionCategoryCandidates(rankedFacts, [...categories].reverse())
    expect(forward.map((category) => category.id)).toEqual(['category:a', 'category:b'])
    expect(reversed).toEqual(forward)
    const duplicateExactNames = [
      { id: 'category:z', name: 'shirt', leaf: true },
      { id: 'category:a', name: 'shirt', leaf: true },
    ]
    expect(selectCommerceProductionCategoryCandidates(rankedFacts, duplicateExactNames)[0]?.id)
      .toBe('category:a')
    expect(selectCommerceProductionCategoryCandidates(rankedFacts, [...duplicateExactNames].reverse())[0]?.id)
      .toBe('category:a')
  })

  it('binds source and DAG bytes in exact frozen Plan order, including DAG lock ids', async () => {
    const sourceIds = [1, 2, 3].map((index) => `artifact:sha256:${hash(index)}`)
    const evidenceGraph = createCommerceEvidenceGraph({ facts })
    const outcomeGraph = createCommerceOutcomeGraph({ facts })
    const { plan } = await compileCommerceProduction({ evidenceGraph, outcomeGraph, sourceImageArtifactIds: sourceIds })
    const planByRole = new Map(plan.body.nodes.map((node) => {
      const outcome = outcomeGraph.body.nodes.find((candidate) => candidate.id === node.outcomeNodeId)!
      return [commerceOutcomePayloadSchema.parse(outcome.payload).semanticRole, node] as const
    }))
    const sourceBytes = new Map(sourceIds.map((artifactId, index) => [artifactId, new Uint8Array([index + 1])]))
    const runtime = new Map<string, CommerceRunnerReferenceArtifact>()
    const mainNode = planByRole.get('main-image')!
    const main = await createCommerceRunnerMediaReferenceClosure({
      semanticRole: 'main-image', planNode: mainNode, sourceBytesByArtifact: sourceBytes,
      runtimeByPlanNode: runtime, runBindings: ['lock:run'],
    })
    expect(main.acceptedReferenceArtifactIds).toEqual(sourceIds)
    expect(main.referenceBytes.map((bytes) => bytes[0])).toEqual([1, 2, 3])
    expect(main.lockIds).toEqual(['lock:run'])

    const mainArtifact: CommerceRunnerReferenceArtifact = {
      semanticRole: 'main-image',
      planNodeId: mainNode.id,
      publicationArtifactId: `artifact:sha256:${hash(10)}`,
      bytes: new Uint8Array([10]),
    }
    runtime.set(mainNode.id, mainArtifact)
    const detailNode = planByRole.get('detail-image:1')!
    const detail = await createCommerceRunnerMediaReferenceClosure({
      semanticRole: 'detail-image:1', planNode: detailNode, sourceBytesByArtifact: sourceBytes,
      runtimeByPlanNode: runtime, runBindings: ['lock:run'],
    })
    expect(detail.acceptedReferenceArtifactIds).toEqual([sourceIds[0], mainArtifact.publicationArtifactId])
    expect(detail.referenceBytes.map((bytes) => bytes[0])).toEqual([1, 10])
    expect(detail.lockIds).toHaveLength(2)
    expect(detail.lockIds[1]).toMatch(/^commerce-dag-reference:sha256:/)

    const videoNode = planByRole.get('product-video')!
    const video = await createCommerceRunnerMediaReferenceClosure({
      semanticRole: 'product-video', planNode: videoNode, sourceBytesByArtifact: sourceBytes,
      runtimeByPlanNode: runtime, runBindings: ['lock:run'],
    })
    expect(video.acceptedReferenceArtifactIds).toEqual([mainArtifact.publicationArtifactId])
    expect(video.referenceBytes).toEqual([mainArtifact.bytes])
    expect(video.lockIds[1]).toMatch(/^commerce-dag-reference:sha256:/)
  })

  it('uses publication artifact ids for the exact ten strategy dependencies', async () => {
    const evidenceGraph = createCommerceEvidenceGraph({ facts })
    const outcomeGraph = createCommerceOutcomeGraph({ facts })
    const { plan } = await compileCommerceProduction({
      evidenceGraph,
      outcomeGraph,
      sourceImageArtifactIds: [`artifact:sha256:${hash(1)}`],
    })
    const strategy = plan.body.nodes.find((node) => node.outcomeNodeId === 'outcome:commerce:strategy-document')!
    const runtime = new Map<string, CommerceRunnerReferenceArtifact>(strategy.dependencyNodeIds.map((nodeId, index) => [
      nodeId,
      {
        semanticRole: COMMERCE_SEMANTIC_ROLES[index]!,
        planNodeId: nodeId,
        publicationArtifactId: `artifact:sha256:${hash(index + 20)}`,
        bytes: new Uint8Array([index + 1]),
      },
    ]))
    expect(resolveCommerceRunnerStrategyReferences(strategy, runtime)).toEqual(
      strategy.dependencyNodeIds.map((nodeId) => runtime.get(nodeId)!.publicationArtifactId),
    )
  })

  it('fails media before paid QA when dimensions or promoted playback are absent', () => {
    const image = artifactEvidence('main-image', 1)
    expect(() => assertCommerceRunnerQaReadyArtifact(image, 'main-image')).not.toThrow()
    expect(() => assertCommerceRunnerQaReadyArtifact({ ...image, width: undefined }, 'main-image'))
      .toThrow(/decoded media metadata/)
    expect(() => assertCommerceRunnerQaReadyArtifact(
      artifactEvidence('product-video', 2, false),
      'product-video',
    )).toThrow(/decoded media metadata/)
    expect(() => assertCommerceRunnerQaReadyArtifact(
      artifactEvidence('product-video', 2, true),
      'product-video',
    )).not.toThrow()
  })

  it('closes exactly eleven Provider, seven QA, and one playback-promotion receipt slots', () => {
    const artifacts = retainedContractArtifacts()
    const closure = assertCommerceRunnerReceiptClosure(artifacts)
    expect(closure.providerReceiptIds).toHaveLength(11)
    expect(closure.semanticQaReceiptIds).toHaveLength(7)
    expect(closure.playbackPromotionReceiptIds).toEqual(['receipt:playback:product-video'])

    const missingQa = artifacts.map((artifact) => artifact.semanticRole === 'detail-image:5'
      ? { ...artifact, semanticQa: undefined }
      : artifact) as CommerceProductionRehearsalBundle['artifacts']
    expect(() => assertCommerceRunnerReceiptClosure(missingQa)).toThrow(/delivery\/QA evidence shape/)

    const qaReceiptId = artifacts.find((artifact) => artifact.semanticRole === 'main-image')!
      .semanticQa!.receipt.receiptId
    const reusedAcrossSlots = artifacts.map((artifact) => artifact.semanticRole === 'product-video'
      ? { ...artifact, receipt: { ...artifact.receipt, receiptId: qaReceiptId } }
      : artifact) as CommerceProductionRehearsalBundle['artifacts']
    expect(() => assertCommerceRunnerReceiptClosure(reusedAcrossSlots)).toThrow(/ledger closure/)
  })
})

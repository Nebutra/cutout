import { fingerprint } from '@/design-ir/fingerprint'
import { pngDimensionFixture } from '@/lib/raster-dimensions.test-fixture'
import type { MultimodalHostReceipt, MultimodalArtifactEvidence } from '@/multimodal-host/contracts'
import type { CapabilityReceipt, CommerceMediaArtifact, StrategyDocument } from './contracts'
import type { CommerceMaterialPublication } from './evaluation'
import {
  fixtureAttributeCatalog,
  fixtureCategoryCatalog,
  fixtureLocalizedDescription,
  fixtureMediaArtifact,
  fixtureProductRecord,
} from './commerce-profile.test-fixture'
import { normalizeProductRecord } from './normalizer'
import {
  COMMERCE_CREATIVE_DIRECTION_ID,
  COMMERCE_IDENTITY_LOCK_ID,
  COMMERCE_SEMANTIC_ROLES,
  commerceOutcomePayloadSchema,
  createCommerceEvidenceGraph,
  createCommerceOutcomeGraph,
  type CommerceSemanticRole,
} from './profile'
import { compileCommerceProduction } from './recipes'
import {
  commerceProductionRehearsalBundleSchema,
  commerceSemanticMediaQaSchema,
  commerceDagReferenceLockId,
  createCommerceMediaDagReferenceBindings,
  renderCommerceStructuredDelivery,
  type CommerceProductionRehearsalBundle,
} from './rehearsal'
import { buildCommerceStrategyDocument } from './strategy'
import {
  COMMERCE_SOURCE_MAXIMUM_BYTES,
  COMMERCE_SOURCE_ORIGIN,
  COMMERCE_SOURCE_PATH_PREFIX,
  COMMERCE_SOURCE_TIMEOUT_MS,
  sha256CommerceSourceUrl,
  type CommerceSourceIngestReceipt,
} from './source-ingest'

const encoder = new TextEncoder()

function base64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function jsonBytes(value: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(value))
}

async function digest(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.length)
  copy.set(bytes)
  const hash = await globalThis.crypto.subtle.digest('SHA-256', copy.buffer)
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function textDigest(value: string): Promise<string> {
  return digest(encoder.encode(value))
}

async function artifactEvidence(input: {
  readonly bytes: Uint8Array
  readonly mediaType: MultimodalArtifactEvidence['mediaType']
  readonly width?: number
  readonly height?: number
  readonly video?: boolean
}): Promise<MultimodalArtifactEvidence> {
  const sha256 = await digest(input.bytes)
  return {
    artifactId: `artifact:sha256:${sha256}`,
    sha256,
    mediaType: input.mediaType,
    byteLength: input.bytes.byteLength,
    decoded: true,
    ...(input.width ? { width: input.width } : {}),
    ...(input.height ? { height: input.height } : {}),
    ...(input.video ? {
      durationMs: 5_000,
      frameRate: 30,
      videoCodec: 'h264' as const,
      audioCodec: 'aac' as const,
      sampleTablesReadable: true,
      playbackVerified: true,
    } : {}),
  }
}

async function receipt(input: {
  readonly id: string
  readonly runId: string
  readonly role: CommerceSemanticRole
  readonly nodeId: string
  readonly capabilityId: string
  readonly operation: MultimodalHostReceipt['operation']
  readonly model: string
  readonly artifact: MultimodalArtifactEvidence
  readonly references: readonly string[]
  readonly locks: readonly string[]
  readonly startedAt: number
  readonly completedAt: number
}): Promise<MultimodalHostReceipt> {
  const receiptHash = await textDigest(`receipt-hash:${input.id}`)
  return {
    protocol: 'cutout.multimodal-host-receipt.v1',
    receiptId: input.id,
    receiptHash,
    requestId: `request:${input.id}`,
    runId: input.runId,
    providerId: 'provider:fixture-dashscope',
    providerKind: 'dashscope',
    model: input.model,
    routeId: `route:dashscope:${input.model}:${input.operation}`,
    operation: input.operation,
    semanticRole: input.role,
    nodeId: input.nodeId,
    capabilityId: input.capabilityId,
    acceptedReferenceArtifactIds: [...input.references],
    lockIds: [...input.locks],
    status: 'succeeded',
    artifact: input.artifact,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    ...(input.operation === 'text-to-video' || input.operation === 'image-to-video' ? {
      playbackPromotion: {
        sourceReceiptHash: await textDigest(`source:${input.id}`),
        decoder: 'avfoundation-asset-image-generator-v1' as const,
        representativeFrames: 3 as const,
        nonBlankFrames: 3 as const,
        pixelEvidenceHash: await textDigest(`pixels:${input.id}`),
      },
    } : {}),
    signature: await textDigest(`signature:${input.id}`),
  }
}

async function sourceIngestReceipt(input: {
  readonly index: number
  readonly runId: string
  readonly factId: string
  readonly sourceFile: string
  readonly sourcePointer: string
  readonly sourceUrl: string
  readonly artifact: MultimodalArtifactEvidence
}): Promise<CommerceSourceIngestReceipt> {
  const parsed = new URL(input.sourceUrl)
  return {
    protocol: 'cutout.commerce-source-ingest-receipt.v1',
    receiptId: `receipt:source-ingest:${input.index}`,
    receiptHash: await textDigest(`source-ingest-receipt:${input.index}`),
    requestId: `request:source-ingest:${input.index}`,
    runId: input.runId,
    factId: input.factId,
    sourceFile: input.sourceFile,
    sourcePointer: input.sourcePointer,
    sourceOrigin: COMMERCE_SOURCE_ORIGIN,
    sourcePath: parsed.pathname,
    sourceUrlSha256: await sha256CommerceSourceUrl(input.sourceUrl),
    fetchPolicy: {
      policyId: 'qianwen-commerce-product-image-source.v1',
      origin: COMMERCE_SOURCE_ORIGIN,
      pathPrefix: COMMERCE_SOURCE_PATH_PREFIX,
      redirects: 'disabled',
      dnsBinding: 'public-resolved-and-pinned',
      maximumBytes: COMMERCE_SOURCE_MAXIMUM_BYTES,
      timeoutMs: COMMERCE_SOURCE_TIMEOUT_MS,
    },
    status: 'succeeded',
    artifact: input.artifact,
    startedAt: input.index * 10 + 1,
    completedAt: input.index * 10 + 2,
    signature: await textDigest(`source-ingest-signature:${input.index}`),
  }
}

function operation(role: CommerceSemanticRole): MultimodalHostReceipt['operation'] {
  if (role.startsWith('localized-description:') || role === 'strategy-document') return 'structured-text'
  if (role === 'product-video') return 'image-to-video'
  return 'image-edit'
}

function model(role: CommerceSemanticRole): string {
  if (role.startsWith('localized-description:') || role === 'strategy-document') return 'qwen3.8-max'
  if (role === 'product-video') return 'wan2.7-i2v-2026-04-25'
  return 'qwen-image-3.0'
}

export interface RehearsalFixture {
  readonly bundle: CommerceProductionRehearsalBundle
}

export async function createCommerceRehearsalFixture(): Promise<RehearsalFixture> {
  const runId = 'run:commerce:trusted-fixture'
  const sourceUrls = [
    `${COMMERCE_SOURCE_ORIGIN}/AI_Business/fixture/front.png?Expires=3362177706&Signature=one`,
    `${COMMERCE_SOURCE_ORIGIN}/AI_Business/fixture/side.png?Expires=3362177706&Signature=two`,
    `${COMMERCE_SOURCE_ORIGIN}/AI_Business/fixture/detail.png?Expires=3362177706&Signature=three`,
  ]
  const facts = normalizeProductRecord({
    file: 'product.json',
    contents: JSON.stringify({ ...fixtureProductRecord, images: sourceUrls }),
  })
  const sourceImageFacts = facts.facts.filter((fact) => (
    fact.value.type === 'media' && fact.value.mediaKind === 'image' && fact.confidence !== 'unknown'
  )).slice(0, 3)
  const sourceMaterials = await Promise.all(sourceImageFacts.map(async (fact, index) => {
    if (fact.value.type !== 'media') throw new Error('Fixture source fact is not media.')
    const bytes = pngDimensionFixture(1_000 + index, 1_000 + index, index + 1)
    const sha256 = await digest(bytes)
    const artifact = await artifactEvidence({
      bytes,
      mediaType: 'image/png',
      width: 1_000 + index,
      height: 1_000 + index,
    })
    return {
      factId: fact.id,
      source: {
        file: fact.source.file,
        pointer: fact.source.pointer,
        descriptor: fact.value.descriptor,
      },
      artifactId: `artifact:sha256:${sha256}`,
      sha256,
      mediaType: 'image/png' as const,
      byteLength: bytes.byteLength,
      width: 1_000 + index,
      height: 1_000 + index,
      ingestReceipt: await sourceIngestReceipt({
        index,
        runId,
        factId: fact.id,
        sourceFile: fact.source.file,
        sourcePointer: fact.source.pointer,
        sourceUrl: fact.value.descriptor,
        artifact,
      }),
      artifactBytesBase64: base64(bytes),
    }
  }))
  const evidenceGraph = createCommerceEvidenceGraph({ facts })
  const outcomeGraph = createCommerceOutcomeGraph({ facts })
  const { contract, plan } = await compileCommerceProduction({
    evidenceGraph,
    outcomeGraph,
    sourceImageArtifactIds: sourceMaterials.map((material) => material.artifactId),
  })
  const locks = [
    COMMERCE_IDENTITY_LOCK_ID,
    COMMERCE_CREATIVE_DIRECTION_ID,
    `evidence-graph:sha256:${await fingerprint(evidenceGraph)}`,
    `outcome-graph:sha256:${await fingerprint(outcomeGraph)}`,
    `outcome-contract:sha256:${await fingerprint(contract)}`,
    `execution-plan:sha256:${await fingerprint(plan)}`,
    `category-catalog:sha256:${await textDigest(fixtureCategoryCatalog)}`,
    `attribute-catalog:sha256:${await textDigest(fixtureAttributeCatalog)}`,
    `source-materials:sha256:${await fingerprint(sourceMaterials.map((material) => ({
      factId: material.factId,
      source: material.source,
      artifactId: material.artifactId,
      sha256: material.sha256,
      mediaType: material.mediaType,
      byteLength: material.byteLength,
      width: material.width,
      height: material.height,
      ingestReceiptId: material.ingestReceipt.receiptId,
      ingestReceiptHash: material.ingestReceipt.receiptHash,
    })))}`,
    `rehearsal-identity:sha256:${await fingerprint({
      id: 'benchmark-run:trusted-fixture',
      revision: 'benchmark-run:trusted-fixture:revision:1',
    })}`,
  ]
  const nodeByRole = new Map(outcomeGraph.body.nodes.map((node) => [
    commerceOutcomePayloadSchema.parse(node.payload).semanticRole,
    node,
  ]))
  const planByRole = new Map(COMMERCE_SEMANTIC_ROLES.map((role) => {
    const node = nodeByRole.get(role)!
    return [role, plan.body.nodes.find((candidate) => candidate.outcomeNodeId === node.id)!]
  }))
  const materialRoles = COMMERCE_SEMANTIC_ROLES.filter((role) => role !== 'strategy-document')
  const retainedByRole = new Map<CommerceSemanticRole, CommerceProductionRehearsalBundle['artifacts'][number]>()
  const publicationByPlanNode = new Map<string, CommerceMaterialPublication>()
  const roleByPlanNode = new Map([...planByRole].map(([role, node]) => [node.id, role]))
  const capabilityReceipts: CapabilityReceipt[] = []
  const qaReceiptIds: string[] = []
  const qaRouteIds: string[] = []

  for (const [index, role] of materialRoles.entries()) {
    const node = nodeByRole.get(role)!
    const planNode = planByRole.get(role)!
    const payload = commerceOutcomePayloadSchema.parse(node.payload)
    const document = payload.kind === 'localized-description'
      ? fixtureLocalizedDescription(facts, payload.locale)
      : undefined
    const media = payload.kind === 'media'
      ? fixtureMediaArtifact({ role, facts })
      : undefined
    const sourceBytes = document
      ? jsonBytes(document)
      : Uint8Array.from({ length: role === 'product-video' ? 2_048 : 1_024 }, (_, byteIndex) => (
          (index + byteIndex + 1) % 251
        ))
    const sourceArtifact = await artifactEvidence({
      bytes: sourceBytes,
      mediaType: document ? 'application/json' : role === 'product-video' ? 'video/mp4' : 'image/png',
      ...(media ? { width: media.width, height: media.height } : {}),
      video: role === 'product-video',
    })
    const deliveryBytes = document ? encoder.encode(renderCommerceStructuredDelivery(document)) : undefined
    const publicationArtifactId = deliveryBytes
      ? `artifact:sha256:${await digest(deliveryBytes)}`
      : sourceArtifact.artifactId
    const primaryReceiptId = `receipt:primary:${role}`
    const dependencies = planNode.dependencyNodeIds.map((dependency) => ({
      planNodeId: dependency,
      semanticRole: roleByPlanNode.get(dependency)!,
      artifactId: publicationByPlanNode.get(dependency)!.artifactId,
    }))
    const dagReferenceBindings = await createCommerceMediaDagReferenceBindings({
      semanticRole: role,
      dependencies,
    })
    const primary = await receipt({
      id: primaryReceiptId,
      runId,
      role,
      nodeId: planNode.id,
      capabilityId: planNode.capabilityId,
      operation: operation(role),
      model: model(role),
      artifact: sourceArtifact,
      references: [
        ...planNode.inputArtifactIds,
        ...dependencies.map((dependency) => dependency.artifactId),
      ],
      locks: [...locks, ...dagReferenceBindings.map(commerceDagReferenceLockId)],
      startedAt: index * 10 + 1,
      completedAt: index * 10 + 2,
    })
    const publication: CommerceMaterialPublication = document ? {
      artifactId: publicationArtifactId,
      outcomeNodeId: node.id,
      mediaType: 'text/markdown',
      byteLength: deliveryBytes!.byteLength,
      payload: document,
    } : {
      artifactId: publicationArtifactId,
      outcomeNodeId: node.id,
      mediaType: sourceArtifact.mediaType,
      byteLength: sourceArtifact.byteLength,
      payload: {
        ...media!,
        mediaType: sourceArtifact.mediaType,
        byteLength: sourceArtifact.byteLength,
        width: sourceArtifact.width!,
        height: sourceArtifact.height!,
        ...(role === 'product-video' ? { playable: true } : {}),
      },
    }
    publicationByPlanNode.set(planNode.id, publication)
    capabilityReceipts.push({
      id: primary.receiptId,
      nodeId: planNode.id,
      capabilityId: planNode.capabilityId,
      routeId: primary.routeId,
      attempt: 1,
      artifactId: publication.artifactId,
      status: 'accepted',
    })
    let semanticQa: CommerceProductionRehearsalBundle['artifacts'][number]['semanticQa']
    if (media) {
      const qaPayload: CommerceMediaArtifact = publication.payload as CommerceMediaArtifact
      const signedQa = commerceSemanticMediaQaSchema.parse({
        schema: 'commerce.semantic-media-qa.v1',
        artifactId: sourceArtifact.artifactId,
        artifactSha256: sourceArtifact.sha256,
        artifact: qaPayload,
        productIdentityVerified: true,
        creativeDirectionVerified: true,
        overlayTextVerified: true,
        sensitiveVisualPolicyPassed: true,
        usable: true,
      })
      const qaBytes = jsonBytes(signedQa)
      const qaArtifact = await artifactEvidence({ bytes: qaBytes, mediaType: 'application/json' })
      const qaReceipt = await receipt({
        id: `receipt:semantic-qa:${role}`,
        runId,
        role,
        nodeId: `${planNode.id}:semantic-qa`,
        capabilityId: 'capability:commerce-semantic-media-qa',
        operation: 'vision-ocr',
        model: 'qwen3-vl-plus',
        artifact: qaArtifact,
        references: [sourceArtifact.artifactId],
        locks,
        startedAt: index * 10 + 3,
        completedAt: index * 10 + 4,
      })
      qaReceiptIds.push(qaReceipt.receiptId)
      qaRouteIds.push(qaReceipt.routeId)
      semanticQa = { receipt: qaReceipt, artifactBytesBase64: base64(qaBytes) }
    }
    retainedByRole.set(role, {
      semanticRole: role,
      receipt: primary,
      artifactBytesBase64: base64(sourceBytes),
      ...(deliveryBytes ? { deliveryBytesBase64: base64(deliveryBytes) } : {}),
      ...(semanticQa ? { semanticQa } : {}),
    })
  }

  const strategyRole = 'strategy-document' as const
  const strategyPlanNode = planByRole.get(strategyRole)!
  const strategyBase = buildCommerceStrategyDocument({
    facts,
    plan,
    receipts: capabilityReceipts,
    findings: [],
  })
  const strategy: StrategyDocument = {
    ...strategyBase,
    routeIds: [...new Set([...strategyBase.routeIds, ...qaRouteIds])].sort(),
    receiptIds: [...strategyBase.receiptIds, ...qaReceiptIds].sort(),
  }
  const strategySource = jsonBytes(strategy)
  const strategyDelivery = encoder.encode(renderCommerceStructuredDelivery(strategy))
  const strategyArtifact = await artifactEvidence({ bytes: strategySource, mediaType: 'application/json' })
  const strategyReceipt = await receipt({
    id: 'receipt:primary:strategy-document',
    runId,
    role: strategyRole,
    nodeId: strategyPlanNode.id,
    capabilityId: strategyPlanNode.capabilityId,
    operation: 'structured-text',
    model: 'qwen3.8-max',
    artifact: strategyArtifact,
    references: strategyPlanNode.dependencyNodeIds.map((dependency) => publicationByPlanNode.get(dependency)!.artifactId),
    locks,
    startedAt: 1_000,
    completedAt: 1_001,
  })
  retainedByRole.set(strategyRole, {
    semanticRole: strategyRole,
    receipt: strategyReceipt,
    artifactBytesBase64: base64(strategySource),
    deliveryBytesBase64: base64(strategyDelivery),
  })

  const bundle = commerceProductionRehearsalBundleSchema.parse({
    schema: 'commerce.production-rehearsal.v1',
    identity: { id: 'benchmark-run:trusted-fixture', revision: 'benchmark-run:trusted-fixture:revision:1' },
    runId,
    facts,
    categoryCatalog: fixtureCategoryCatalog,
    attributeCatalog: fixtureAttributeCatalog,
    sourceMaterials,
    evidenceGraph,
    outcomeGraph,
    contract,
    plan,
    artifacts: COMMERCE_SEMANTIC_ROLES.map((role) => retainedByRole.get(role)!),
  })
  return { bundle }
}

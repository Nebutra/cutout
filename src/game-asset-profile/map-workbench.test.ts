import { describe, expect, it } from 'vitest'
import { sha256Bytes } from '@/asset-production/hash'
import { canonicalJson } from '@/design-ir/fingerprint'
import { base64ToBytes } from '@/lib/image'
import type { BundleRepository, BundleToSave } from '@/services/types'
import { compileGameMapProductionPlan } from './map-authoring'
import {
  applyPreparedGameMapManagedBundle,
  gameMapManagedBundleInputSchema,
  prepareGameMapManagedBundle,
} from './map-bundle'
import {
  GAME_MAP_OCCLUSION_TOLERANT_SPATIAL_BOARD_RASTER_PROCESSOR,
  GAME_ASSET_SPATIAL_BOARD_SCALE_POLICY,
} from './generation'
import {
  assertGameMapLiveArtifactBytes,
  gameMapLiveArtifactSchema,
  gameMapSemanticAcceptanceInputSchema,
  gameMapSemanticAcceptanceSchema,
  verifyGameMapSemanticAcceptance,
  type GameMapLiveArtifact,
  type GameMapLiveNativeRunner,
  type GameMapSemanticAcceptance,
  type GameMapSemanticReviewDecision,
} from './map-live-production'
import {
  fingerprintGameMapObjectLibrary,
  fingerprintGameMapBundle,
  fingerprintGameMapPreviewReceipt,
  fingerprintGameMapProductionPlan,
  fingerprintGameMapRuntimeManifest,
  gameMapBundleSchema,
  gameMapObjectLibrarySchema,
  gameMapPreviewReceiptSchema,
  gameMapRuntimeManifestSchema,
  type GameMapAcceptedArtifact,
} from './map'
import {
  gameMapRuntimeProcessingInputSchema,
  nativeGameMapPreviewSchema,
  type GameMapRasterInput,
} from './map-production'
import { applyGameMapRepairPreview, previewGameMapRepair } from './map-repair'
import { projectGameMapWorkbench } from './map-workbench'

function base64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

async function accepted(bytes: Uint8Array, name: string): Promise<GameMapAcceptedArtifact> {
  const contentHash = await sha256Bytes(bytes)
  return {
    artifact: {
      id: `artifact:sha256:${contentHash}`,
      revision: `revision:${name}:1`,
      contentHash,
    },
    acceptance: {
      receiptId: `acceptance:${name}`,
      receiptRevision: `acceptance:${name}:revision:1`,
      receiptHash: await sha256Bytes(new TextEncoder().encode(`accepted:${name}`)),
    },
  }
}

async function sceneClosure() {
  const plan = await compileGameMapProductionPlan({
    sourceText: 'Create a playable scene map with collision, reusable props, a spawn, and an exit.',
    mapName: 'Repair Path',
    canvas: { width: 128, height: 128 },
  })
  const planHash = await fingerprintGameMapProductionPlan(plan)
  const baseBytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3])
  const lanternBytes = new Uint8Array([137, 80, 78, 71, 4, 5, 6])
  const treeBytes = new Uint8Array([137, 80, 78, 71, 7, 8, 9])
  const previewBytes = new Uint8Array([137, 80, 78, 71, 10, 11])
  const debugBytes = new Uint8Array([137, 80, 78, 71, 12, 13])
  const [base, lantern, tree] = await Promise.all([
    accepted(baseBytes, 'base'),
    accepted(lanternBytes, 'lantern'),
    accepted(treeBytes, 'tree'),
  ])
  const library = gameMapObjectLibrarySchema.parse({
    version: 'game-map.object-library.v1',
    id: 'object-library:repair-path',
    revision: 'object-library:repair-path:revision:1',
    mapId: plan.mapId,
    plan: { id: plan.id, contentHash: planHash },
    objects: [{
      id: 'object:lantern',
      revision: 'object:lantern:revision:1',
      name: 'Lantern',
      visual: lantern,
      decodedSize: { width: 16, height: 24 },
      anchor: { x: 8, y: 24 },
      occlusionClass: 'actor-height',
      placementSafeArea: { x: 1, y: 1, width: 14, height: 22 },
      collisionPolicy: { kind: 'authored-shape', geometryId: 'collision:lantern' },
    }, {
      id: 'object:tree',
      revision: 'object:tree:revision:1',
      name: 'Tree',
      visual: tree,
      decodedSize: { width: 24, height: 32 },
      anchor: { x: 12, y: 32 },
      occlusionClass: 'canopy',
      placementSafeArea: { x: 2, y: 2, width: 20, height: 28 },
      collisionPolicy: { kind: 'none' },
    }],
  })
  const libraryHash = await fingerprintGameMapObjectLibrary(library)
  const manifest = gameMapRuntimeManifestSchema.parse({
    version: 'game-map.runtime-manifest.v1',
    id: 'runtime-manifest:repair-path',
    revision: 'runtime-manifest:repair-path:revision:1',
    mapId: plan.mapId,
    plan: { id: plan.id, contentHash: planHash },
    mode: plan.mode,
    playable: true,
    world: plan.world,
    coordinateSystem: plan.coordinateSystem,
    camera: plan.camera,
    objectLibrary: { id: library.id, revision: library.revision, contentHash: libraryHash },
    visuals: [{ role: 'base', source: base }],
    layers: [
      { id: 'layer:base', kind: 'base', order: 0, sourceId: base.artifact.id },
      { id: 'layer:objects', kind: 'objects', order: 10, sourceId: library.id },
    ],
    placements: [{
      id: 'placement:lantern',
      layerId: 'layer:objects',
      objectId: 'object:lantern',
      objectRevision: 'object:lantern:revision:1',
      position: { x: 24, y: 48 },
      scale: { x: 1, y: 1 },
      rotationDegrees: 0,
      sortOffset: 0,
    }, {
      id: 'placement:tree',
      layerId: 'layer:objects',
      objectId: 'object:tree',
      objectRevision: 'object:tree:revision:1',
      position: { x: 80, y: 72 },
      scale: { x: 1, y: 1 },
      rotationDegrees: 0,
      sortOffset: 0,
    }],
    collision: [{
      id: 'collision:ground',
      behavior: 'solid',
      shape: { kind: 'rectangle', bounds: { x: 0, y: 120, width: 128, height: 8 } },
    }, {
      id: 'collision:lantern',
      behavior: 'solid',
      shape: { kind: 'rectangle', bounds: { x: 20, y: 44, width: 8, height: 8 } },
    }],
    zones: [{
      id: 'zone:checkpoint',
      purpose: 'checkpoint',
      shape: { kind: 'rectangle', bounds: { x: 56, y: 56, width: 16, height: 16 } },
    }],
    spawns: [{ id: 'spawn:player', kind: 'player', position: { x: 8, y: 112 } }],
    exits: [{
      id: 'exit:east',
      area: { kind: 'rectangle', bounds: { x: 120, y: 96, width: 8, height: 24 } },
      destination: { kind: 'map', mapId: 'map:east', spawnId: 'spawn:west' },
    }],
    navigation: { kind: 'unavailable', reason: 'no-explicit-navigation-data' },
  })
  const manifestHash = await fingerprintGameMapRuntimeManifest(manifest)
  const artifacts = [{
    binding: { kind: 'runtime-visual' as const, role: 'base' as const },
    acceptedArtifact: base,
    mediaType: 'image/png' as const,
    bytesBase64: base64(baseBytes),
  }, {
    binding: {
      kind: 'object-visual' as const,
      objectId: 'object:lantern',
      objectRevision: 'object:lantern:revision:1',
    },
    acceptedArtifact: lantern,
    mediaType: 'image/png' as const,
    bytesBase64: base64(lanternBytes),
  }, {
    binding: {
      kind: 'object-visual' as const,
      objectId: 'object:tree',
      objectRevision: 'object:tree:revision:1',
    },
    acceptedArtifact: tree,
    mediaType: 'image/png' as const,
    bytesBase64: base64(treeBytes),
  }]
  const runtime = gameMapRuntimeProcessingInputSchema.parse({
    plan: { id: plan.id, contentHash: planHash },
    runtimeManifest: manifest,
    runtimeManifestHash: manifestHash,
    objectLibrary: library,
    objectLibraryHash: libraryHash,
    artifacts,
  })
  const inputs = artifacts.map(({ acceptedArtifact }) => acceptedArtifact)
    .sort((left, right) => `${left.artifact.id}@${left.artifact.revision}`
      .localeCompare(`${right.artifact.id}@${right.artifact.revision}`))
  const previewHash = await sha256Bytes(previewBytes)
  const debugHash = await sha256Bytes(debugBytes)
  const previewReceipt = gameMapPreviewReceiptSchema.parse({
    version: 'game-map.preview-receipt.v1',
    id: 'preview-receipt:repair-path',
    mapId: plan.mapId,
    plan: { id: plan.id, contentHash: planHash },
    runtimeManifest: { id: manifest.id, revision: manifest.revision, contentHash: manifestHash },
    objectLibrary: { id: library.id, revision: library.revision, contentHash: libraryHash },
    compositor: {
      id: 'cutout-game-map-compositor-rust-image-0.23-v1',
      implementationHash: await sha256Bytes(new TextEncoder().encode('compositor')),
    },
    inputs,
    preview: {
      id: `artifact:sha256:${previewHash}`,
      revision: `revision:sha256:${previewHash}`,
      contentHash: previewHash,
    },
    debugOverlay: {
      id: `artifact:sha256:${debugHash}`,
      revision: `revision:sha256:${debugHash}`,
      contentHash: debugHash,
    },
    validationStatus: 'passed',
    reachability: { status: 'unavailable', reason: 'no-explicit-navigation-data' },
    findings: [],
  })
  const preview = nativeGameMapPreviewSchema.parse({
    protocol: 'cutout.game-map-native-preview.v1',
    receipt: previewReceipt,
    previewBytesBase64: base64(previewBytes),
    debugOverlayBytesBase64: base64(debugBytes),
    width: plan.world.width,
    height: plan.world.height,
  })
  const validation = {
    protocol: 'cutout.game-map-runtime-validation.v1' as const,
    validator: 'cutout-game-map-runtime-validator-rust-v1' as const,
    runtimeManifestHash: manifestHash,
    status: 'passed' as const,
    findings: [],
    reachability: { status: 'unavailable' as const, reason: 'no-explicit-navigation-data' as const },
  }
  return { plan, planHash, base, lantern, tree, library, libraryHash, manifest, manifestHash, runtime, preview, validation }
}

type SceneClosure = Awaited<ReturnType<typeof sceneClosure>>

function rasterBindingKey(binding: GameMapRasterInput['binding']): string {
  switch (binding.kind) {
    case 'runtime-visual': return `runtime:${binding.role}`
    case 'object-visual': return `object:${binding.objectId}@${binding.objectRevision}`
    case 'extraction-source': return `extraction:${binding.role}`
  }
}

async function liveArtifactForRaster(
  closure: SceneClosure,
  raster: GameMapRasterInput,
  index: number,
): Promise<GameMapLiveArtifact> {
  const bytes = base64ToBytes(raster.bytesBase64)
  const sourceHash = await sha256Bytes(bytes)
  const receiptHash = await sha256Bytes(new TextEncoder().encode(`source-receipt:${index}`))
  const processingEvidenceHash = await sha256Bytes(new TextEncoder().encode(`processing:${index}`))
  const signature = await sha256Bytes(new TextEncoder().encode(`signature:${index}`))
  const objectBinding = raster.binding.kind === 'object-visual' ? raster.binding : undefined
  const object = objectBinding
    ? closure.library.objects.find(({ id, revision }) => (
        id === objectBinding.objectId && revision === objectBinding.objectRevision
      ))
    : undefined
  const decodedSize = object?.decodedSize ?? closure.plan.world
  const anchor = object?.anchor ?? { x: decodedSize.width / 2, y: decodedSize.height / 2 }
  const runtime = raster.binding.kind === 'runtime-visual'
  const processing = runtime
    ? { kind: 'runtime-png' as const }
    : {
        kind: 'object-cutout' as const,
        frameSize: decodedSize,
        alphaTarget: decodedSize,
        expectedAnchor: anchor,
        anchorPolicy: 'bottom' as const,
      }
  const processingEvidence = runtime
    ? {
        protocol: 'cutout.game-map-runtime-png-processing.v1' as const,
        implementation: 'cutout-game-map-runtime-png-rust-image-0.23-v1' as const,
        sourceArtifactId: `artifact:sha256:${sourceHash}`,
        sourceArtifactSha256: sourceHash,
        outputArtifactId: raster.acceptedArtifact.artifact.id,
        outputArtifactSha256: raster.acceptedArtifact.artifact.contentHash,
        outputByteLength: bytes.byteLength,
        decodedSize,
      }
    : {
        protocol: 'cutout.game-asset-raster-processing.v1' as const,
        implementation: GAME_MAP_OCCLUSION_TOLERANT_SPATIAL_BOARD_RASTER_PROCESSOR,
        backgroundAlphaMax: 8 as const,
        sourceArtifactId: `artifact:sha256:${sourceHash}`,
        sourceArtifactSha256: sourceHash,
        outputArtifactId: raster.acceptedArtifact.artifact.id,
        outputArtifactSha256: raster.acceptedArtifact.artifact.contentHash,
        outputByteLength: bytes.byteLength,
        backgroundColor: [255, 0, 255] as const,
        colorDistanceThreshold: 64,
        mattingRoute: 'spatial-high-chroma-board-field-occlusion-interpolation-safe-margin-seed-trimap-pymatting-ml-foreground' as const,
        spatialBoardModel: {
          implementation: 'cutout-local-high-chroma-board-field-grid-median-occlusion-interpolation-bilinear-safe-margin-seed-v4' as const,
          columns: 17 as const,
          rows: 17 as const,
          initialSampleRadius: 8 as const,
          maximumSampleRadius: 96 as const,
          minimumSamplesPerNode: 24 as const,
          nodeCount: 289 as const,
          nodeBytesSha256: 'a'.repeat(64),
          perimeterSampleCount: 64,
          maximumPerimeterChromaResidualSquared: 0,
          edgeSeedStripWidth: 32 as const,
          edgeSeedPixelCount: 64,
          interpolatedNodeCount: 0,
        },
        sourceAlphaBounds: { x: 0, y: 0, ...decodedSize },
        sourceSize: decodedSize,
        frameSize: decodedSize,
        alphaTarget: decodedSize,
        expectedAnchor: anchor,
        anchorPolicy: 'bottom' as const,
        resizedSubjectSize: decodedSize,
        placement: { x: 0, y: 0, ...decodedSize },
        outputAlphaBounds: { x: 0, y: 0, ...decodedSize },
        scalePolicy: GAME_ASSET_SPATIAL_BOARD_SCALE_POLICY,
      }
  return gameMapLiveArtifactSchema.parse({
    protocol: 'cutout.game-map-live-artifact.v1',
    binding: raster.binding,
    sourceReceipt: {
      protocol: 'cutout.multimodal-host-receipt.v1',
      receiptId: `receipt:qwen-map-source:${index}`,
      receiptHash,
      requestId: `request:qwen-map-source:${index}`,
      runId: 'run:game-map:contract-only',
      providerId: 'dashscope-qwen-image3',
      providerKind: 'dashscope',
      model: 'qwen-image-3.0',
      routeId: 'route:dashscope:qwen-image-3.0:image-generation',
      operation: 'image-generation',
      acceptedReferenceArtifactIds: [],
      lockIds: ['lock:game-map:contract-only'],
      status: 'succeeded',
      artifact: {
        artifactId: `artifact:sha256:${sourceHash}`,
        sha256: sourceHash,
        mediaType: 'image/png',
        byteLength: bytes.byteLength,
        decoded: true,
        ...decodedSize,
      },
      startedAt: index + 1,
      completedAt: index + 2,
      signature,
    },
    sourceArtifactBytesBase64: raster.bytesBase64,
    processing,
    processingEvidence,
    ...(runtime ? {} : {
      pixelEvidence: {
        implementation: 'rgba-alpha-bounds-v1',
        alphaThreshold: 8,
        decodedWidth: decodedSize.width,
        decodedHeight: decodedSize.height,
        alphaBounds: { x: 0, y: 0, ...decodedSize },
        edgeContact: false,
        anchor,
      },
    }),
    acceptedArtifact: raster.acceptedArtifact,
    mediaType: 'image/png',
    bytesBase64: raster.bytesBase64,
    decodedSize,
    admission: {
      protocol: 'cutout.game-map-artifact-admission.v1',
      receiptId: raster.acceptedArtifact.acceptance.receiptId,
      receiptHash: raster.acceptedArtifact.acceptance.receiptHash,
      binding: raster.binding,
      sourceReceiptId: `receipt:qwen-map-source:${index}`,
      sourceReceiptHash: receiptHash,
      sourceArtifactId: `artifact:sha256:${sourceHash}`,
      sourceArtifactSha256: sourceHash,
      outputArtifactId: raster.acceptedArtifact.artifact.id,
      outputArtifactSha256: raster.acceptedArtifact.artifact.contentHash,
      outputByteLength: bytes.byteLength,
      decodedSize,
      processing,
      processingEvidenceHash,
      admittedAt: index + 2,
      signature,
    },
  })
}

async function liveSemanticClosure(closure: SceneClosure): Promise<{
  artifacts: readonly GameMapLiveArtifact[]
  decisions: readonly GameMapSemanticReviewDecision[]
  acceptance: GameMapSemanticAcceptance
}> {
  const artifacts = await Promise.all(closure.runtime.artifacts.map((raster, index) => (
    liveArtifactForRaster(closure, raster, index)
  )))
  const reviewer = {
    reviewerKind: 'local-human-visual-review' as const,
    reviewerId: 'reviewer:game-map:contract-only',
  }
  const decisions = [
    {
      subjectId: closure.base.artifact.id,
      criterion: 'visual-role-fidelity' as const,
      evidenceArtifactIds: [closure.base.artifact.id],
    },
    ...closure.library.objects.map(({ visual }) => ({
      subjectId: visual.artifact.id,
      criterion: 'object-cutout-quality' as const,
      evidenceArtifactIds: [visual.artifact.id],
    })),
    {
      subjectId: closure.preview.receipt.preview.id,
      criterion: 'runtime-composition' as const,
      evidenceArtifactIds: [closure.preview.receipt.preview.id],
    },
    {
      subjectId: closure.preview.receipt.debugOverlay.id,
      criterion: 'authored-geometry' as const,
      evidenceArtifactIds: [closure.preview.receipt.debugOverlay.id],
    },
  ].map((decision) => ({
    ...decision,
    status: 'accepted' as const,
    ...reviewer,
    notes: `Contract-only review for ${decision.criterion}.`,
  }))
  const previewReceiptHash = await fingerprintGameMapPreviewReceipt(closure.preview.receipt)
  const receiptHash = await sha256Bytes(new TextEncoder().encode('semantic-acceptance:contract-only'))
  const acceptance = gameMapSemanticAcceptanceSchema.parse({
    version: 'game-map.semantic-acceptance.v1',
    receiptId: 'receipt:game-map-semantic-acceptance:contract-only',
    receiptHash,
    mapId: closure.manifest.mapId,
    mode: 'scene',
    plan: closure.runtime.plan,
    runtimeManifest: {
      id: closure.manifest.id,
      revision: closure.manifest.revision,
      contentHash: closure.manifestHash,
    },
    objectLibrary: {
      id: closure.library.id,
      revision: closure.library.revision,
      contentHash: closure.libraryHash,
    },
    previewReceiptId: closure.preview.receipt.id,
    previewReceiptHash,
    previewArtifactId: closure.preview.receipt.preview.id,
    debugOverlayArtifactId: closure.preview.receipt.debugOverlay.id,
    acceptedArtifacts: artifacts.map((artifact) => ({
      bindingKey: rasterBindingKey(artifact.binding),
      admissionReceiptId: artifact.admission.receiptId,
      admissionReceiptHash: artifact.admission.receiptHash,
      sourceReceiptId: artifact.sourceReceipt.receiptId,
      sourceReceiptHash: artifact.sourceReceipt.receiptHash,
      sourceArtifactId: artifact.sourceReceipt.artifact.artifactId,
      sourceArtifactSha256: artifact.sourceReceipt.artifact.sha256,
      outputArtifactId: artifact.acceptedArtifact.artifact.id,
      outputArtifactSha256: artifact.acceptedArtifact.artifact.contentHash,
    })).sort((left, right) => left.bindingKey.localeCompare(right.bindingKey)),
    decisions,
    verifierImplementationHash: await sha256Bytes(new TextEncoder().encode('native-map-verifier')),
    ...reviewer,
    acceptedAt: Math.max(...artifacts.map(({ sourceReceipt }) => sourceReceipt.completedAt)),
    signature: await sha256Bytes(new TextEncoder().encode('native-map-signature')),
  })
  return { artifacts, decisions, acceptance }
}

function acceptingBundleRepository(onSave?: (bundle: BundleToSave) => void): BundleRepository {
  return {
    async save(bundle) {
      onSave?.(bundle)
      const files = await Promise.all(bundle.files.map(async (file) => {
        const bytes = typeof file.content === 'string'
          ? new TextEncoder().encode(file.content)
          : file.content instanceof Blob
            ? new Uint8Array(await file.content.arrayBuffer())
            : new Uint8Array(file.content)
        return { path: file.path, size: bytes.byteLength, sha256: await sha256Bytes(bytes) }
      }))
      return {
        ok: true,
        data: {
          canceled: false,
          outputDir: '/retained',
          bundleDir: `/retained/${bundle.name}`,
          fileCount: files.length,
          totalBytes: files.reduce((sum, file) => sum + file.size, 0),
          files,
        },
      }
    },
  }
}

function semanticAcceptanceRunner(
  acceptance: GameMapSemanticAcceptance,
  verificationError?: Error,
): GameMapLiveNativeRunner {
  return {
    async admit() {
      throw new Error('Contract-only acceptance runner does not admit artifacts.')
    },
    async verifyArtifact(artifact) {
      return artifact
    },
    async accept() {
      return acceptance
    },
    async verifyAcceptance() {
      if (verificationError) throw verificationError
      return acceptance
    },
  }
}

describe('Game Map Workbench, repair, and managed delivery (contract-only)', () => {
  it('projects planning references separately from the exact runtime closure', async () => {
    const closure = await sceneClosure()
    const projection = await projectGameMapWorkbench({
      plan: closure.plan,
      planningReferences: [{ role: 'dressed-reference', reference: closure.base.artifact }],
      runtime: closure.runtime,
      validation: closure.validation,
      preview: closure.preview,
    })
    expect(projection.planningReferences).toEqual([expect.objectContaining({
      role: 'dressed-reference',
      status: 'ready',
    })])
    expect(projection.runtimeLayers.map(({ id, status }) => ({ id, status }))).toEqual([
      { id: 'layer:base', status: 'ready' },
      { id: 'layer:objects', status: 'ready' },
    ])
    expect(projection.objectLibrary.objects.map(({ id, placementCount }) => ({ id, placementCount }))).toEqual([
      { id: 'object:lantern', placementCount: 1 },
      { id: 'object:tree', placementCount: 1 },
    ])
    expect(projection.geometry).toMatchObject({
      collisionCount: 2,
      zoneCount: 1,
      spawnCount: 1,
      exitCount: 1,
      status: 'ready',
    })
    expect(projection.preview).toMatchObject({ status: 'ready', reachability: { status: 'unavailable' } })
    expect(projection.delivery.status).toBe('blocked')
    expect(projection.blockers).toEqual([])
  })

  it('rejects drifted source receipts, admission bindings, and retained live bytes', async () => {
    const closure = await sceneClosure()
    const live = await liveSemanticClosure(closure)
    const runtimeArtifact = live.artifacts[0]!
    const objectArtifact = live.artifacts[1]!

    expect(() => gameMapLiveArtifactSchema.parse({
      ...runtimeArtifact,
      admission: { ...runtimeArtifact.admission, sourceReceiptHash: '0'.repeat(64) },
    })).toThrow(/does not close its source/i)
    expect(() => gameMapLiveArtifactSchema.parse({
      ...objectArtifact,
      admission: {
        ...objectArtifact.admission,
        binding: { ...objectArtifact.binding, objectId: 'object:drifted' },
      },
    })).toThrow(/does not close its source/i)

    const tamperedBytes = base64(Uint8Array.of(1, 2, 3, 4, 5, 6, 7))
    const byteDrift = gameMapLiveArtifactSchema.parse({
      ...runtimeArtifact,
      sourceArtifactBytesBase64: tamperedBytes,
    })
    await expect(assertGameMapLiveArtifactBytes(byteDrift)).rejects.toThrow(/retained source or output bytes/i)
  })

  it('rejects incomplete, duplicate, rejected, and stale semantic review closure', async () => {
    const closure = await sceneClosure()
    const live = await liveSemanticClosure(closure)
    const input = {
      runtime: closure.runtime,
      preview: closure.preview,
      artifacts: live.artifacts,
      decisions: live.decisions,
    }
    expect(gameMapSemanticAcceptanceInputSchema.parse(input).decisions).toHaveLength(5)
    expect(() => gameMapSemanticAcceptanceInputSchema.parse({
      ...input,
      decisions: live.decisions.slice(0, -1),
    })).toThrow(/must accept the exact visual/i)
    expect(() => gameMapSemanticAcceptanceInputSchema.parse({
      ...input,
      decisions: [...live.decisions.slice(0, -1), live.decisions[0]],
    })).toThrow(/must accept the exact visual/i)
    expect(() => gameMapSemanticAcceptanceInputSchema.parse({
      ...input,
      decisions: live.decisions.map((decision, index) => (
        index === 0 ? { ...decision, status: 'rejected' as const } : decision
      )),
    })).toThrow(/must accept the exact visual/i)
    expect(() => gameMapSemanticAcceptanceInputSchema.parse({
      ...input,
      preview: {
        ...closure.preview,
        receipt: {
          ...closure.preview.receipt,
          runtimeManifest: {
            ...closure.preview.receipt.runtimeManifest,
            contentHash: '0'.repeat(64),
          },
        },
      },
    })).toThrow(/preview is stale/i)
    expect(() => gameMapSemanticAcceptanceInputSchema.parse({
      ...input,
      runtime: {
        ...closure.runtime,
        artifacts: closure.runtime.artifacts.map((artifact, index) => (
          index === 0 ? { ...artifact, bytesBase64: 'AQID' } : artifact
        )),
      },
    })).toThrow(/differs from the runtime closure/i)
    expect(() => gameMapSemanticAcceptanceInputSchema.parse({
      ...input,
      artifacts: live.artifacts.map((artifact, index) => index === 0
        ? {
            ...artifact,
            admission: { ...artifact.admission, outputArtifactSha256: '0'.repeat(64) },
          }
        : artifact),
    })).toThrow(/does not close its source/i)
  })

  it('propagates native cutout replay rejection during semantic reverification', async () => {
    const closure = await sceneClosure()
    const live = await liveSemanticClosure(closure)
    await expect(verifyGameMapSemanticAcceptance({
      acceptance: live.acceptance,
      runtime: closure.runtime,
      preview: closure.preview,
      artifacts: live.artifacts,
    }, semanticAcceptanceRunner(
      live.acceptance,
      new Error('Native object cutout replay drifted from retained source bytes.'),
    ))).rejects.toThrow(/cutout replay drifted/i)
  })

  it('repairs one object while preserving unrelated accepted identities and staling exact dependents', async () => {
    const closure = await sceneClosure()
    const replacement = await accepted(new Uint8Array([137, 80, 78, 71, 90]), 'lantern-repair')
    const nextLibrary = gameMapObjectLibrarySchema.parse({
      ...closure.library,
      revision: 'object-library:repair-path:revision:2',
      objects: closure.library.objects.map((object) => object.id === 'object:lantern'
        ? { ...object, revision: 'object:lantern:revision:2', visual: replacement }
        : object),
    })
    const preview = await previewGameMapRepair({
      plan: closure.plan,
      objectLibrary: closure.library,
      runtimeManifest: closure.manifest,
    }, {
      target: { kind: 'object', objectId: 'object:lantern', expectedRevision: 'object:lantern:revision:1' },
      nextObjectLibrary: nextLibrary,
    })
    expect(preview.changedPaths).toEqual(['objectLibrary.objects[object:lantern]'])
    expect(preview.staleDependencyPaths).toEqual([
      'runtimeManifest.objectLibrary',
      'runtimeManifest.placements[placement:lantern]',
      'preview',
      'bundle',
    ])
    expect(preview.preservedAcceptedIdentities).toContain(
      `${closure.tree.artifact.id}@${closure.tree.artifact.revision}#${closure.tree.artifact.contentHash}`,
    )
    const staleProjection = await projectGameMapWorkbench({
      plan: closure.plan,
      runtime: closure.runtime,
      validation: closure.validation,
      preview: closure.preview,
      staleDependencyPaths: preview.staleDependencyPaths,
    })
    expect(staleProjection.placements).toMatchObject({
      staleIds: ['placement:lantern'],
      status: 'stale',
    })
    expect(staleProjection.nodes.find(({ role }) => role === 'runtime-manifest')?.status).toBe('stale')
    expect(staleProjection.preview.status).toBe('stale')
    expect(staleProjection.delivery.status).toBe('blocked')
    const applied = await applyGameMapRepairPreview({
      plan: closure.plan,
      objectLibrary: closure.library,
      runtimeManifest: closure.manifest,
    }, preview)
    expect(applied.objectLibrary?.objects[1]).toEqual(closure.library.objects[1])
    expect(applied.runtimeManifest).toEqual(closure.manifest)

    const changedSibling = {
      ...nextLibrary,
      objects: nextLibrary.objects.map((object) => object.id === 'object:tree'
        ? { ...object, name: 'Changed tree' }
        : object),
    }
    await expect(previewGameMapRepair({
      plan: closure.plan,
      objectLibrary: closure.library,
      runtimeManifest: closure.manifest,
    }, {
      target: { kind: 'object', objectId: 'object:lantern', expectedRevision: 'object:lantern:revision:1' },
      nextObjectLibrary: changedSibling,
    })).rejects.toThrow(/unrelated record object:tree/)

    const metadataOnlyLibrary = gameMapObjectLibrarySchema.parse({
      ...closure.library,
      revision: 'object-library:repair-path:revision:metadata',
      objects: closure.library.objects.map((object) => object.id === 'object:lantern'
        ? { ...object, revision: 'object:lantern:revision:metadata', name: 'Lantern revised' }
        : object),
    })
    const metadataRepair = await previewGameMapRepair({
      plan: closure.plan,
      objectLibrary: closure.library,
      runtimeManifest: closure.manifest,
    }, {
      target: { kind: 'object', objectId: 'object:lantern', expectedRevision: 'object:lantern:revision:1' },
      nextObjectLibrary: metadataOnlyLibrary,
    })
    expect(metadataRepair.preservedAcceptedIdentities).toContain(
      `${closure.lantern.artifact.id}@${closure.lantern.artifact.revision}#${closure.lantern.artifact.contentHash}`,
    )
  })

  it('isolates runtime visual, layer, and placement repairs to their dependency paths', async () => {
    const closure = await sceneClosure()
    const repairedBase = await accepted(new Uint8Array([137, 80, 78, 71, 91]), 'base-repair')
    const visualManifest = gameMapRuntimeManifestSchema.parse({
      ...closure.manifest,
      revision: 'runtime-manifest:repair-path:revision:2',
      visuals: [{ role: 'base', source: repairedBase }],
      layers: closure.manifest.layers.map((layer) => layer.id === 'layer:base'
        ? { ...layer, sourceId: repairedBase.artifact.id }
        : layer),
    })
    const visualRepair = await previewGameMapRepair({
      plan: closure.plan,
      objectLibrary: closure.library,
      runtimeManifest: closure.manifest,
    }, {
      target: {
        kind: 'runtime-visual',
        role: 'base',
        expectedArtifactId: closure.base.artifact.id,
        expectedArtifactRevision: closure.base.artifact.revision,
      },
      nextRuntimeManifest: visualManifest,
    })
    expect(visualRepair.changedPaths).toEqual([
      'runtimeManifest.visuals[base]',
      'runtimeManifest.layers[layer:base]',
    ])
    expect(visualRepair.preservedAcceptedIdentities).toEqual(expect.arrayContaining([
      `${closure.lantern.artifact.id}@${closure.lantern.artifact.revision}#${closure.lantern.artifact.contentHash}`,
      `${closure.tree.artifact.id}@${closure.tree.artifact.revision}#${closure.tree.artifact.contentHash}`,
    ]))

    const layerManifest = gameMapRuntimeManifestSchema.parse({
      ...closure.manifest,
      revision: 'runtime-manifest:repair-path:revision:3',
      layers: closure.manifest.layers.map((layer) => layer.id === 'layer:objects'
        ? { ...layer, order: 11 }
        : layer),
    })
    const layerRepair = await previewGameMapRepair({
      plan: closure.plan,
      objectLibrary: closure.library,
      runtimeManifest: closure.manifest,
    }, {
      target: { kind: 'layer', layerId: 'layer:objects' },
      nextRuntimeManifest: layerManifest,
    })
    expect(layerRepair.changedPaths).toEqual(['runtimeManifest.layers[layer:objects]'])
    expect(layerRepair.staleDependencyPaths).toEqual(['preview', 'bundle'])

    const placementManifest = gameMapRuntimeManifestSchema.parse({
      ...closure.manifest,
      revision: 'runtime-manifest:repair-path:revision:4',
      placements: closure.manifest.placements.map((placement) => placement.id === 'placement:lantern'
        ? { ...placement, position: { x: 32, y: 48 } }
        : placement),
    })
    const placementRepair = await previewGameMapRepair({
      plan: closure.plan,
      objectLibrary: closure.library,
      runtimeManifest: closure.manifest,
    }, {
      target: { kind: 'manifest-record', section: 'placements', recordId: 'placement:lantern' },
      nextRuntimeManifest: placementManifest,
    })
    expect(placementRepair.changedPaths).toEqual([
      'runtimeManifest.placements[placement:lantern]',
    ])
    expect(placementRepair.preservedAcceptedIdentities).toHaveLength(3)

    const staleManifest = gameMapRuntimeManifestSchema.parse({
      ...closure.manifest,
      objectLibrary: { ...closure.manifest.objectLibrary!, contentHash: '0'.repeat(64) },
    })
    await expect(previewGameMapRepair({
      plan: closure.plan,
      objectLibrary: closure.library,
      runtimeManifest: staleManifest,
    }, {
      target: { kind: 'layer', layerId: 'layer:objects' },
      nextRuntimeManifest: gameMapRuntimeManifestSchema.parse({
        ...staleManifest,
        revision: 'runtime-manifest:repair-path:revision:stale',
        layers: staleManifest.layers.map((layer) => layer.id === 'layer:objects'
          ? { ...layer, order: 12 }
          : layer),
      }),
    })).rejects.toThrow(/exact current object-library closure/)
  })

  it('previews and applies only fixed, content-addressed neutral bundle files', async () => {
    const closure = await sceneClosure()
    const prepared = await prepareGameMapManagedBundle({ runtime: closure.runtime, preview: closure.preview })
    const reordered = await prepareGameMapManagedBundle({
      runtime: gameMapRuntimeProcessingInputSchema.parse({
        ...closure.runtime,
        artifacts: [...closure.runtime.artifacts].reverse(),
      }),
      preview: closure.preview,
    })
    expect(prepared.bundle.deliveryStatus).toBe('candidate')
    expect((await projectGameMapWorkbench({
      plan: closure.plan,
      runtime: closure.runtime,
      validation: closure.validation,
      preview: closure.preview,
      bundle: prepared,
    })).delivery.status).toBe('candidate')
    expect(reordered.bundleHash).toBe(prepared.bundleHash)
    expect(reordered.files.map(({ logicalPath }) => logicalPath))
      .toEqual(prepared.files.map(({ logicalPath }) => logicalPath))
    expect(prepared.files.map(({ logicalPath }) => logicalPath)).toEqual([
      'assets/runtime/base.png',
      expect.stringMatching(/^assets\/objects\/0000-[a-f0-9]{64}\.png$/),
      expect.stringMatching(/^assets\/objects\/0001-[a-f0-9]{64}\.png$/),
      'manifests/map.json',
      'manifests/objects.json',
      'previews/map.png',
      'previews/debug.png',
      'manifests/bundle.json',
    ])
    expect(prepared.files.every(({ artifactId, contentHash }) => artifactId === `artifact:sha256:${contentHash}`)).toBe(true)
    expect(await fingerprintGameMapPreviewReceipt(closure.preview.receipt)).toBe(prepared.bundle.previewReceipt.contentHash)

    let exported: BundleToSave | undefined
    const repository: BundleRepository = {
      async save(bundle) {
        exported = bundle
        const files = await Promise.all(bundle.files.map(async (file) => {
          const bytes = typeof file.content === 'string'
            ? new TextEncoder().encode(file.content)
            : file.content instanceof Blob
              ? new Uint8Array(await file.content.arrayBuffer())
              : new Uint8Array(file.content)
          return { path: file.path, size: bytes.byteLength, sha256: await sha256Bytes(bytes) }
        }))
        return {
          ok: true,
          data: {
            canceled: false,
            outputDir: '/retained',
            bundleDir: `/retained/${bundle.name}`,
            fileCount: files.length,
            totalBytes: files.reduce((sum, file) => sum + file.size, 0),
            files,
          },
        }
      },
    }
    const applied = await applyPreparedGameMapManagedBundle(prepared, repository)
    expect(applied.status).toBe('candidate-exported')
    expect(exported?.files.map(({ path }) => path)).toEqual(prepared.files.map(({ logicalPath }) => logicalPath))

    const extraReceiptRepository: BundleRepository = {
      async save(bundle) {
        const files = await Promise.all(bundle.files.map(async (file) => {
          const bytes = file.content instanceof Uint8Array
            ? file.content
            : new Uint8Array(await new Blob([file.content]).arrayBuffer())
          return { path: file.path, size: bytes.byteLength, sha256: await sha256Bytes(bytes) }
        }))
        return {
          ok: true,
          data: {
            canceled: false,
            outputDir: '/retained',
            bundleDir: `/retained/${bundle.name}`,
            fileCount: files.length,
            totalBytes: files.reduce((sum, file) => sum + file.size, 0),
            files: [...files, { ...files[0]!, path: 'unexpected.txt' }],
          },
        }
      },
    }
    await expect(applyPreparedGameMapManagedBundle(prepared, extraReceiptRepository))
      .rejects.toThrow(/does not match the previewed file closure/)

    const incompleteRuntime = gameMapRuntimeProcessingInputSchema.parse({
      ...closure.runtime,
      artifacts: closure.runtime.artifacts.slice(0, -1),
    })
    const incompletePreview = nativeGameMapPreviewSchema.parse({
      ...closure.preview,
      receipt: {
        ...closure.preview.receipt,
        inputs: incompleteRuntime.artifacts.map(({ acceptedArtifact }) => acceptedArtifact)
          .sort((left, right) => `${left.artifact.id}@${left.artifact.revision}`
            .localeCompare(`${right.artifact.id}@${right.artifact.revision}`)),
      },
    })
    await expect(prepareGameMapManagedBundle({ runtime: incompleteRuntime, preview: incompletePreview }))
      .rejects.toThrow(/exact runtime artifact closure/)

    await expect(projectGameMapWorkbench({
      plan: closure.plan,
      runtime: gameMapRuntimeProcessingInputSchema.parse({
        ...closure.runtime,
        runtimeManifestHash: '0'.repeat(64),
      }),
    })).rejects.toThrow(/does not belong to the projected plan/)

    const acceptedBundle = gameMapBundleSchema.parse({
      ...prepared.bundle,
      deliveryStatus: 'accepted',
      semanticAcceptance: {
        receiptId: 'acceptance:map',
        receiptRevision: 'acceptance:map:revision:1',
        receiptHash: await sha256Bytes(new TextEncoder().encode('map accepted')),
      },
    })
    await expect(projectGameMapWorkbench({
      plan: closure.plan,
      runtime: closure.runtime,
      validation: closure.validation,
      preview: closure.preview,
      bundle: {
        ...prepared,
        bundle: acceptedBundle,
        bundleHash: await fingerprintGameMapBundle(acceptedBundle),
      },
    })).rejects.toThrow(/bundle is stale/)

    expect(gameMapManagedBundleInputSchema.safeParse({
      runtime: closure.runtime,
      preview: closure.preview,
      semanticAcceptance: {
        receiptId: 'acceptance:map',
        receiptRevision: 'acceptance:map:revision:1',
        receiptHash: await sha256Bytes(new TextEncoder().encode('map accepted')),
      },
    }).success).toBe(false)
    expect(canonicalJson(JSON.parse(new TextDecoder().decode(
      prepared.files.find(({ logicalPath }) => logicalPath === 'manifests/bundle.json')!.bytes,
    )))).toBe(canonicalJson(prepared.bundle))
  })

  it('admits accepted bundle and export states only after native semantic reverification', async () => {
    const closure = await sceneClosure()
    const live = await liveSemanticClosure(closure)
    const input = {
      runtime: closure.runtime,
      preview: closure.preview,
      semanticAcceptance: {
        receipt: live.acceptance,
        artifacts: [...live.artifacts],
      },
    }
    await expect(prepareGameMapManagedBundle(
      input,
      semanticAcceptanceRunner(live.acceptance, new Error('Native acceptance replay failed.')),
    )).rejects.toThrow(/native acceptance replay failed/i)

    const runner = semanticAcceptanceRunner(live.acceptance)
    const prepared = await prepareGameMapManagedBundle(input, runner)
    expect(prepared.bundle.deliveryStatus).toBe('accepted')
    expect(prepared.bundle.semanticAcceptance).toEqual({
      receiptId: live.acceptance.receiptId,
      receiptRevision: `revision:sha256:${live.acceptance.receiptHash}`,
      receiptHash: live.acceptance.receiptHash,
    })
    expect(prepared.files.map(({ logicalPath }) => logicalPath)).toContain('evidence/semantic-acceptance.json')
    expect((await projectGameMapWorkbench({
      plan: closure.plan,
      runtime: closure.runtime,
      validation: closure.validation,
      preview: closure.preview,
      bundle: prepared,
    })).delivery.status).toBe('accepted')

    const applied = await applyPreparedGameMapManagedBundle(
      prepared,
      acceptingBundleRepository(),
      runner,
    )
    expect(applied).toMatchObject({
      deliveryStatus: 'accepted',
      status: 'accepted-exported',
    })
    expect((await projectGameMapWorkbench({
      plan: closure.plan,
      runtime: closure.runtime,
      validation: closure.validation,
      preview: closure.preview,
      bundle: prepared,
      exportResult: applied,
    })).delivery.status).toBe('accepted-exported')
    await expect(projectGameMapWorkbench({
      plan: closure.plan,
      runtime: closure.runtime,
      validation: closure.validation,
      preview: closure.preview,
      bundle: prepared,
      exportResult: { ...applied, status: 'candidate-exported' },
    })).rejects.toThrow(/export receipt is stale/i)
  })
})

import { describe, expect, it } from 'vitest'
import { layeredGameMapManifestSchema } from './contracts'
import { compileGameMapProductionPlan } from './map-authoring'
import {
  GAME_MAP_BUNDLE_PROTOCOL,
  GAME_MAP_OBJECT_LIBRARY_PROTOCOL,
  GAME_MAP_PREVIEW_RECEIPT_PROTOCOL,
  GAME_MAP_RUNTIME_MANIFEST_PROTOCOL,
  fingerprintGameMapBundle,
  fingerprintGameMapObjectLibrary,
  fingerprintGameMapPreviewReceipt,
  fingerprintGameMapProductionPlan,
  fingerprintGameMapRuntimeManifest,
  gameMapBundleSchema,
  gameMapObjectLibrarySchema,
  gameMapPreviewReceiptSchema,
  gameMapProductionPlanSchema,
  gameMapRuntimeManifestSchema,
  type GameMapAcceptedArtifact,
  type GameMapBundle,
  type GameMapObjectLibrary,
  type GameMapPreviewReceipt,
  type GameMapRuntimeManifest,
} from './map'

const digest = (character: string) => character.repeat(64)

function acceptedArtifact(id: string, character: string): GameMapAcceptedArtifact {
  return {
    artifact: {
      id,
      revision: `${id}:revision:1`,
      contentHash: digest(character),
    },
    acceptance: {
      receiptId: `acceptance:${id}`,
      receiptRevision: `acceptance:${id}:revision:1`,
      receiptHash: digest(character === 'f' ? 'e' : 'f'),
    },
  }
}

async function acceptedSceneClosure() {
  const plan = await compileGameMapProductionPlan({
    sourceText: 'Create a playable hand-painted scene map with collision, a spawn, and an exit.',
    mapName: 'Shrine Path',
  })
  const planHash = await fingerprintGameMapProductionPlan(plan)
  const base = acceptedArtifact('artifact:base', 'a')
  const prop = acceptedArtifact('artifact:lantern', 'b')
  const library: GameMapObjectLibrary = gameMapObjectLibrarySchema.parse({
    version: GAME_MAP_OBJECT_LIBRARY_PROTOCOL,
    id: 'object-library:shrine-path',
    revision: 'object-library:shrine-path:revision:1',
    mapId: plan.mapId,
    plan: { id: plan.id, contentHash: planHash },
    objects: [{
      id: 'object:lantern',
      revision: 'object:lantern:revision:1',
      name: 'Lantern',
      visual: prop,
      decodedSize: { width: 96, height: 160 },
      anchor: { x: 48, y: 160 },
      occlusionClass: 'actor-height',
      placementSafeArea: { x: 8, y: 8, width: 80, height: 144 },
      collisionPolicy: { kind: 'authored-shape', geometryId: 'collision:lantern' },
    }],
  })
  const libraryHash = await fingerprintGameMapObjectLibrary(library)
  const manifest: GameMapRuntimeManifest = gameMapRuntimeManifestSchema.parse({
    version: GAME_MAP_RUNTIME_MANIFEST_PROTOCOL,
    id: 'runtime-manifest:shrine-path',
    revision: 'runtime-manifest:shrine-path:revision:1',
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
      id: 'placement:lantern:1',
      layerId: 'layer:objects',
      objectId: 'object:lantern',
      objectRevision: 'object:lantern:revision:1',
      position: { x: 480, y: 720 },
      scale: { x: 1, y: 1 },
      rotationDegrees: 0,
      sortOffset: 0,
    }],
    collision: [{
      id: 'collision:ground',
      behavior: 'solid',
      shape: { kind: 'rectangle', bounds: { x: 0, y: 1_900, width: 2_048, height: 148 } },
    }],
    zones: [{
      id: 'zone:shrine',
      purpose: 'trigger',
      shape: { kind: 'rectangle', bounds: { x: 800, y: 640, width: 256, height: 256 } },
    }],
    spawns: [{ id: 'spawn:player', kind: 'player', position: { x: 128, y: 1_800 } }],
    exits: [{
      id: 'exit:east',
      area: { kind: 'rectangle', bounds: { x: 1_984, y: 1_664, width: 64, height: 256 } },
      destination: { kind: 'map', mapId: 'map:east-gate', spawnId: 'spawn:west' },
    }],
    navigation: { kind: 'unavailable', reason: 'no-explicit-navigation-data' },
  })
  const manifestHash = await fingerprintGameMapRuntimeManifest(manifest)
  const preview: GameMapPreviewReceipt = gameMapPreviewReceiptSchema.parse({
    version: GAME_MAP_PREVIEW_RECEIPT_PROTOCOL,
    id: 'preview-receipt:shrine-path',
    mapId: plan.mapId,
    plan: { id: plan.id, contentHash: planHash },
    runtimeManifest: { id: manifest.id, revision: manifest.revision, contentHash: manifestHash },
    objectLibrary: { id: library.id, revision: library.revision, contentHash: libraryHash },
    compositor: { id: 'compositor:game-map-v1', implementationHash: digest('c') },
    inputs: [base, prop],
    preview: { id: 'artifact:preview', revision: 'artifact:preview:revision:1', contentHash: digest('d') },
    debugOverlay: { id: 'artifact:debug', revision: 'artifact:debug:revision:1', contentHash: digest('e') },
    validationStatus: 'passed',
    reachability: { status: 'unavailable', reason: 'no-explicit-navigation-data' },
    findings: [],
  })
  const previewHash = await fingerprintGameMapPreviewReceipt(preview)
  const files: GameMapBundle['files'] = [
    {
      logicalPath: 'manifests/map.json',
      artifactId: `artifact:sha256:${manifestHash}`,
      contentHash: manifestHash,
      byteLength: 4_096,
      mediaType: 'application/json',
    },
    {
      logicalPath: 'previews/map.png',
      artifactId: `artifact:sha256:${digest('d')}`,
      contentHash: digest('d'),
      byteLength: 65_536,
      mediaType: 'image/png',
    },
    {
      logicalPath: 'previews/debug.png',
      artifactId: `artifact:sha256:${digest('e')}`,
      contentHash: digest('e'),
      byteLength: 65_536,
      mediaType: 'image/png',
    },
    {
      logicalPath: 'assets/base.png',
      artifactId: `artifact:sha256:${base.artifact.contentHash}`,
      contentHash: base.artifact.contentHash,
      byteLength: 262_144,
      mediaType: 'image/png',
    },
  ]
  const bundle: GameMapBundle = gameMapBundleSchema.parse({
    version: GAME_MAP_BUNDLE_PROTOCOL,
    id: 'bundle:shrine-path',
    mapId: plan.mapId,
    deliveryStatus: 'candidate',
    plan: { id: plan.id, contentHash: planHash },
    objectLibrary: { id: library.id, revision: library.revision, contentHash: libraryHash },
    runtimeManifest: { id: manifest.id, revision: manifest.revision, contentHash: manifestHash },
    previewReceipt: { id: preview.id, contentHash: previewHash },
    files,
    provenance: [base.artifact, prop.artifact],
  })
  return { plan, base, library, manifest, preview, bundle }
}

describe('Game Map production schemas (contract-only)', () => {
  it('strictly decodes and canonically hashes the complete five-contract closure', async () => {
    const closure = await acceptedSceneClosure()
    const hashes = await Promise.all([
      fingerprintGameMapProductionPlan(closure.plan),
      fingerprintGameMapObjectLibrary(closure.library),
      fingerprintGameMapRuntimeManifest(closure.manifest),
      fingerprintGameMapPreviewReceipt(closure.preview),
      fingerprintGameMapBundle(closure.bundle),
    ])
    expect(hashes.every((hash) => /^[a-f0-9]{64}$/.test(hash))).toBe(true)
    expect(new Set(hashes).size).toBe(5)
  })

  it('keeps the legacy shallow map readable without reinterpreting it as runtime authority', async () => {
    const legacy = layeredGameMapManifestSchema.parse({
      version: 'game-asset.layered-map.v1',
      id: 'map:legacy-shrine',
      width: 1_024,
      height: 1_024,
      layers: [
        { kind: 'base', artifactId: 'artifact:base', authoritative: true },
        { kind: 'collision', artifactId: 'artifact:collision-json', authoritative: true },
        { kind: 'zones', artifactId: 'artifact:zones-json', authoritative: true },
        { kind: 'preview', artifactId: 'artifact:preview', authoritative: false },
      ],
    })
    const { plan } = await acceptedSceneClosure()
    expect(gameMapProductionPlanSchema.safeParse(legacy).success).toBe(false)
    expect(layeredGameMapManifestSchema.safeParse(plan).success).toBe(false)
  })

  it('rejects flattened or incomplete gameplay authority and unsafe bundle claims', async () => {
    const { plan, library, manifest, preview, bundle } = await acceptedSceneClosure()
    expect(() => gameMapProductionPlanSchema.parse({
      ...plan,
      mode: 'baked-scene',
      playable: true,
      runtimeSemantics: 'visual-only',
    })).toThrow(/playable map|exact required node closure/)
    expect(() => gameMapRuntimeManifestSchema.parse({
      ...manifest,
      collision: [],
    })).toThrow(/require an object library, collision, spawn, and exit/)
    expect(() => gameMapObjectLibrarySchema.parse({
      ...library,
      objects: library.objects.map((object) => ({
        ...object,
        placementSafeArea: { x: 80, y: 80, width: 80, height: 144 },
      })),
    })).toThrow(/placement-safe area exceeds/)
    expect(() => gameMapPreviewReceiptSchema.parse({
      ...preview,
      validationStatus: 'passed',
      findings: [{
        code: 'out-of-bounds',
        subjectId: manifest.id,
        severity: 'blocking',
        message: 'Out of bounds.',
      }],
    })).toThrow(/status must match/)
    expect(() => gameMapBundleSchema.parse({
      ...bundle,
      deliveryStatus: 'accepted',
    })).toThrow(/require exact semantic acceptance/)
    expect(() => gameMapBundleSchema.parse({
      ...bundle,
      files: bundle.files.map((file, index) => index === 0
        ? { ...file, logicalPath: '../map.json' }
        : file),
    })).toThrow(/normalized relative paths/)
  })
})

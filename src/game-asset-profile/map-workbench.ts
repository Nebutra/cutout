import { sha256Bytes } from '@/asset-production/hash'
import { canonicalJson } from '@/design-ir/fingerprint'
import { base64ToBytes } from '@/lib/image'
import { gameAssetEvidenceReferenceSchema, type GameAssetEvidenceReference } from './contracts'
import {
  fingerprintGameMapBundle,
  fingerprintGameMapObjectLibrary,
  fingerprintGameMapProductionPlan,
  fingerprintGameMapRuntimeManifest,
  gameMapBundleSchema,
  gameMapProductionPlanSchema,
  type GameMapAcceptedArtifact,
  type GameMapPlanNodeRole,
  type GameMapProductionPlan,
  type GameMapRuntimeManifest,
} from './map'
import {
  gameMapRuntimeProcessingInputSchema,
  gameMapRuntimeValidationSchema,
  nativeGameMapPreviewSchema,
  type GameMapRuntimeProcessingInput,
  type GameMapRuntimeValidation,
  type NativeGameMapPreview,
} from './map-production'
import {
  GAME_MAP_MANAGED_BUNDLE_PREVIEW_PROTOCOL,
  GAME_MAP_BUNDLE_MANIFEST_PATH,
  type AppliedGameMapManagedBundle,
  type PreparedGameMapManagedBundle,
} from './map-bundle'

export type GameMapWorkbenchStatus = 'pending' | 'ready' | 'blocked' | 'stale'

export interface GameMapPlanningReferenceInput {
  readonly role: 'dressed-reference'
  readonly reference: GameAssetEvidenceReference
}

export interface GameMapWorkbenchInput {
  readonly plan: GameMapProductionPlan
  readonly planningReferences?: readonly GameMapPlanningReferenceInput[]
  readonly runtime?: GameMapRuntimeProcessingInput
  readonly validation?: GameMapRuntimeValidation
  readonly preview?: NativeGameMapPreview
  readonly bundle?: PreparedGameMapManagedBundle
  readonly exportResult?: AppliedGameMapManagedBundle
  readonly staleDependencyPaths?: readonly string[]
}

export interface GameMapWorkbenchProjection {
  readonly mapId: string
  readonly title: string
  readonly mode: GameMapProductionPlan['mode']
  readonly playable: boolean
  readonly world: GameMapProductionPlan['world']
  readonly nodes: readonly {
    readonly id: string
    readonly role: GameMapPlanNodeRole
    readonly authority: GameMapProductionPlan['nodes'][number]['authority']
    readonly status: GameMapWorkbenchStatus
  }[]
  readonly planningReferences: readonly {
    readonly role: 'dressed-reference'
    readonly status: GameMapWorkbenchStatus
    readonly artifactId?: string
    readonly revision?: string
  }[]
  readonly runtimeLayers: readonly {
    readonly id: string
    readonly kind: string
    readonly order: number
    readonly sourceId: string
    readonly status: GameMapWorkbenchStatus
  }[]
  readonly objectLibrary: {
    readonly status: GameMapWorkbenchStatus
    readonly revision?: string
    readonly objects: readonly {
      readonly id: string
      readonly revision: string
      readonly name: string
      readonly artifactId: string
      readonly occlusionClass: string
      readonly placementCount: number
      readonly status: GameMapWorkbenchStatus
    }[]
  }
  readonly terrain: {
    readonly layerCount: number
    readonly tileCount: number
    readonly status: GameMapWorkbenchStatus
  }
  readonly placements: {
    readonly count: number
    readonly staleIds: readonly string[]
    readonly status: GameMapWorkbenchStatus
  }
  readonly geometry: {
    readonly collisionCount: number
    readonly zoneCount: number
    readonly spawnCount: number
    readonly exitCount: number
    readonly status: GameMapWorkbenchStatus
  }
  readonly preview: {
    readonly status: GameMapWorkbenchStatus
    readonly previewArtifactId?: string
    readonly debugArtifactId?: string
    readonly reachability?: GameMapRuntimeValidation['reachability']
  }
  readonly delivery: {
    readonly status: 'blocked' | 'candidate' | 'accepted' | 'candidate-exported' | 'accepted-exported'
    readonly bundleHash?: string
    readonly bundleDir?: string
  }
  readonly blockers: readonly {
    readonly path: string
    readonly message: string
    readonly source: 'missing' | 'validation' | 'stale'
  }[]
}

function acceptedIdentity(accepted: GameMapAcceptedArtifact): string {
  return `${accepted.artifact.id}@${accepted.artifact.revision}`
}

function exactAcceptedInputs(runtime: GameMapRuntimeProcessingInput): readonly GameMapAcceptedArtifact[] {
  return [
    ...runtime.runtimeManifest.visuals.map(({ source }) => source),
    ...(runtime.objectLibrary?.objects.map(({ visual }) => visual) ?? []),
  ].sort((left, right) => acceptedIdentity(left).localeCompare(acceptedIdentity(right)))
}

function nodeReady(
  role: GameMapPlanNodeRole,
  input: {
    readonly planningRoles: ReadonlySet<string>
    readonly runtime?: GameMapRuntimeProcessingInput
    readonly preview?: NativeGameMapPreview
    readonly bundle?: PreparedGameMapManagedBundle
  },
): boolean {
  if (role === 'dressed-reference') return input.planningRoles.has(role)
  if (role === 'runtime-manifest') return Boolean(input.runtime)
  if (role === 'object-library') return Boolean(input.runtime?.objectLibrary)
  if (role === 'preview' || role === 'debug-overlay') return Boolean(input.preview)
  if (role === 'bundle') return Boolean(input.bundle)
  const manifest = input.runtime?.runtimeManifest
  if (!manifest) return false
  switch (role) {
    case 'base': return manifest.visuals.some(({ role: visualRole }) => visualRole === 'base')
    case 'terrain-atlas': return manifest.visuals.some(({ role: visualRole }) => visualRole === 'terrain-atlas')
    case 'parallax-plates': return manifest.visuals.some(({ role: visualRole }) => visualRole === 'parallax-plates')
    case 'room-chunks': return manifest.visuals.some(({ role: visualRole }) => visualRole === 'room-chunks')
    case 'baked-scene': return manifest.visuals.some(({ role: visualRole }) => visualRole === 'baked-scene')
    case 'tile-layers': return manifest.layers.some(({ kind }) => kind === 'terrain')
    case 'platform-segments': return manifest.collision.length > 0
    case 'cell-semantics': return manifest.coordinateSystem.kind === 'orthogonal-grid'
    case 'chunk-sockets': return manifest.exits.some(({ destination }) => destination.kind === 'socket')
    case 'placements': return manifest.layers.length > 0
    case 'collision': return manifest.collision.length > 0
    case 'zones': return manifest.zones.length > 0
    case 'spawns': return manifest.spawns.length > 0
    case 'exits': return manifest.exits.length > 0
    case 'hazards': return manifest.collision.some(({ behavior }) => behavior === 'hazard')
      || manifest.zones.some(({ purpose }) => purpose === 'hazard')
    case 'checkpoints': return manifest.zones.some(({ purpose }) => purpose === 'checkpoint')
    case 'camera': return true
  }
}

export async function projectGameMapWorkbench(
  value: GameMapWorkbenchInput,
): Promise<GameMapWorkbenchProjection> {
  const plan = gameMapProductionPlanSchema.parse(value.plan)
  const planHash = await fingerprintGameMapProductionPlan(plan)
  const planningReferences = (value.planningReferences ?? []).map((item) => ({
    role: item.role,
    reference: gameAssetEvidenceReferenceSchema.parse(item.reference),
  }))
  const runtime = value.runtime ? gameMapRuntimeProcessingInputSchema.parse(value.runtime) : undefined
  const validation = value.validation ? gameMapRuntimeValidationSchema.parse(value.validation) : undefined
  const preview = value.preview ? nativeGameMapPreviewSchema.parse(value.preview) : undefined
  const bundle = value.bundle ? {
    ...value.bundle,
    bundle: gameMapBundleSchema.parse(value.bundle.bundle),
  } : undefined
  const [runtimeManifestHash, objectLibraryHash, projectedBundleHash, previewHash, debugHash] = await Promise.all([
    runtime ? fingerprintGameMapRuntimeManifest(runtime.runtimeManifest) : undefined,
    runtime?.objectLibrary ? fingerprintGameMapObjectLibrary(runtime.objectLibrary) : undefined,
    bundle ? fingerprintGameMapBundle(bundle.bundle) : undefined,
    preview ? sha256Bytes(base64ToBytes(preview.previewBytesBase64)) : undefined,
    preview ? sha256Bytes(base64ToBytes(preview.debugOverlayBytesBase64)) : undefined,
  ])
  if (runtime && (runtime.plan.id !== plan.id || runtime.plan.contentHash !== planHash
    || runtime.runtimeManifest.mapId !== plan.mapId
    || runtime.runtimeManifest.plan.id !== plan.id
    || runtime.runtimeManifest.plan.contentHash !== planHash
    || runtime.runtimeManifestHash !== runtimeManifestHash
    || runtime.runtimeManifest.mode !== plan.mode
    || runtime.runtimeManifest.playable !== plan.playable
    || canonicalJson(runtime.runtimeManifest.world) !== canonicalJson(plan.world)
    || canonicalJson(runtime.runtimeManifest.coordinateSystem) !== canonicalJson(plan.coordinateSystem)
    || canonicalJson(runtime.runtimeManifest.camera) !== canonicalJson(plan.camera))) {
    throw new Error('Game Map Workbench runtime does not belong to the projected plan.')
  }
  if (runtime?.objectLibrary) {
    if (!objectLibraryHash || runtime.objectLibraryHash !== objectLibraryHash
      || runtime.objectLibrary.mapId !== plan.mapId
      || runtime.objectLibrary.plan.id !== plan.id
      || runtime.objectLibrary.plan.contentHash !== planHash
      || !runtime.runtimeManifest.objectLibrary
      || runtime.runtimeManifest.objectLibrary.id !== runtime.objectLibrary.id
      || runtime.runtimeManifest.objectLibrary.revision !== runtime.objectLibrary.revision
      || runtime.runtimeManifest.objectLibrary.contentHash !== objectLibraryHash) {
      throw new Error('Game Map Workbench object library is stale for the projected runtime manifest.')
    }
  } else if (runtime && (runtime.objectLibraryHash || runtime.runtimeManifest.objectLibrary)) {
    throw new Error('Game Map Workbench runtime has an incomplete object-library closure.')
  }
  if (validation && (!runtime || validation.runtimeManifestHash !== runtime.runtimeManifestHash)) {
    throw new Error('Game Map Workbench validation is stale for the projected runtime manifest.')
  }
  if (preview && (!runtime
    || preview.receipt.runtimeManifest.contentHash !== runtime.runtimeManifestHash
    || preview.receipt.plan.id !== plan.id
    || preview.receipt.plan.contentHash !== planHash
    || preview.width !== runtime.runtimeManifest.world.width
    || preview.height !== runtime.runtimeManifest.world.height
    || previewHash !== preview.receipt.preview.contentHash
    || debugHash !== preview.receipt.debugOverlay.contentHash
    || preview.receipt.preview.id !== `artifact:sha256:${previewHash}`
    || preview.receipt.debugOverlay.id !== `artifact:sha256:${debugHash}`
    || canonicalJson(exactAcceptedInputs(runtime)) !== canonicalJson(preview.receipt.inputs))) {
    throw new Error('Game Map Workbench preview is stale for the projected runtime manifest.')
  }
  const bundledAcceptance = bundle?.bundle.semanticAcceptance
  const inputAcceptance = bundle?.input.semanticAcceptance?.receipt
  const expectedBundleDeliveryStatus = inputAcceptance ? 'accepted' : 'candidate'
  const bundlePayloadFiles = bundle?.files.filter(({ logicalPath }) => logicalPath !== GAME_MAP_BUNDLE_MANIFEST_PATH)
  const bundleManifestFile = bundle?.files.find(({ logicalPath }) => logicalPath === GAME_MAP_BUNDLE_MANIFEST_PATH)
  if (bundle && (bundle.protocol !== GAME_MAP_MANAGED_BUNDLE_PREVIEW_PROTOCOL
    || bundle.bundle.deliveryStatus !== expectedBundleDeliveryStatus
    || Boolean(bundledAcceptance) !== Boolean(inputAcceptance)
    || (bundledAcceptance && inputAcceptance
      && (bundledAcceptance.receiptId !== inputAcceptance.receiptId
        || bundledAcceptance.receiptHash !== inputAcceptance.receiptHash
        || bundledAcceptance.receiptRevision !== `revision:sha256:${inputAcceptance.receiptHash}`))
    || projectedBundleHash !== bundle.bundleHash
    || !preview || bundle.bundle.previewReceipt.id !== preview.receipt.id
    || bundle.bundle.runtimeManifest.contentHash !== runtime?.runtimeManifestHash
    || canonicalJson(bundle.input.runtime) !== canonicalJson(runtime)
    || canonicalJson(bundle.input.preview) !== canonicalJson(preview)
    || canonicalJson(bundlePayloadFiles?.map(({ bytes: _bytes, ...file }) => file)) !== canonicalJson(bundle.bundle.files)
    || bundleManifestFile?.contentHash !== projectedBundleHash)) {
    throw new Error('Game Map Workbench bundle is stale for the projected preview closure.')
  }
  const expectedExportStatus = bundle?.bundle.deliveryStatus === 'accepted'
    ? 'accepted-exported'
    : 'candidate-exported'
  if (value.exportResult && (!bundle
    || value.exportResult.deliveryStatus !== bundle.bundle.deliveryStatus
    || (value.exportResult.status !== 'canceled' && value.exportResult.status !== expectedExportStatus)
    || value.exportResult.previewId !== bundle.previewId
    || value.exportResult.bundleHash !== bundle.bundleHash)) {
    throw new Error('Game Map Workbench export receipt is stale for the projected bundle preview.')
  }

  const stalePaths = new Set(value.staleDependencyPaths ?? [])
  const planningRoles = new Set(planningReferences.map(({ role }) => role))
  const blockers: GameMapWorkbenchProjection['blockers'][number][] = []
  if (!runtime) {
    blockers.push({
      path: 'runtimeManifest',
      message: 'Accepted runtime layers and authored geometry are not assembled yet.',
      source: 'missing',
    })
  } else if (!validation && !preview) {
    blockers.push({
      path: 'runtimeValidation',
      message: 'The exact runtime closure has not completed deterministic validation.',
      source: 'missing',
    })
  }
  for (const finding of validation?.findings ?? []) {
    if (finding.severity === 'blocking') {
      blockers.push({ path: finding.subjectId, message: finding.message, source: 'validation' })
    }
  }
  for (const path of stalePaths) {
    blockers.push({ path, message: `Dependent Game Map artifact is stale: ${path}.`, source: 'stale' })
  }
  const stalePlacementIds = runtime?.runtimeManifest.placements
    .filter(({ id }) => stalePaths.has(`runtimeManifest.placements[${id}]`))
    .map(({ id }) => id) ?? []
  const blocked = blockers.length > 0
  const runtimeLayers = runtime?.runtimeManifest.layers.map((layer) => ({
    id: layer.id,
    kind: layer.kind,
    order: layer.order,
    sourceId: layer.sourceId,
    status: stalePaths.has(`runtimeManifest.layers[${layer.id}]`)
      ? 'stale' as const
      : validation?.findings.some(({ severity, subjectId }) => severity === 'blocking' && subjectId === layer.id)
        ? 'blocked' as const
        : 'ready' as const,
  })) ?? []
  const objects = runtime?.objectLibrary?.objects.map((object) => ({
    id: object.id,
    revision: object.revision,
    name: object.name,
    artifactId: object.visual.artifact.id,
    occlusionClass: object.occlusionClass,
    placementCount: runtime.runtimeManifest.placements.filter(({ objectId }) => objectId === object.id).length,
    status: stalePaths.has(`objectLibrary.objects[${object.id}]`)
      ? 'stale' as const
      : validation?.findings.some(({ severity, subjectId }) => severity === 'blocking' && subjectId === object.id)
        ? 'blocked' as const
        : 'ready' as const,
  })) ?? []
  type TerrainLayer = Extract<GameMapRuntimeManifest['layers'][number], { kind: 'terrain' }>
  const terrainLayers = runtime?.runtimeManifest.layers.filter(
    (layer): layer is TerrainLayer => layer.kind === 'terrain',
  ) ?? []
  const geometryBlocked = Boolean(validation?.findings.some(({ severity, subjectId }) => (
    severity === 'blocking'
    && Boolean(subjectId === runtime?.runtimeManifest.id
      || runtime?.runtimeManifest.collision.some(({ id }) => id === subjectId)
      || runtime?.runtimeManifest.zones.some(({ id }) => id === subjectId)
      || runtime?.runtimeManifest.spawns.some(({ id }) => id === subjectId)
      || runtime?.runtimeManifest.exits.some(({ id }) => id === subjectId))
  )))
  const placementsBlocked = Boolean(validation?.findings.some(({ severity, subjectId }) => (
    severity === 'blocking'
    && runtime?.runtimeManifest.placements.some(({ id }) => id === subjectId)
  )))
  const nodeContext = { planningRoles, runtime, preview, bundle }
  const nodes = plan.nodes.map((node) => {
    const stale = stalePaths.has(node.role)
      || (node.role === 'preview' && stalePaths.has('preview'))
      || (node.role === 'bundle' && stalePaths.has('bundle'))
      || (node.role === 'placements' && [...stalePaths].some((path) => path.startsWith('runtimeManifest.placements[')))
      || (node.role === 'runtime-manifest' && [...stalePaths].some((path) => path.startsWith('runtimeManifest.')))
    const ready = nodeReady(node.role, nodeContext)
    const dependencyBlocked = blocked && (
      node.role === 'runtime-manifest'
      || node.role === 'preview'
      || node.role === 'debug-overlay'
      || node.role === 'bundle'
    )
    return {
      id: node.id,
      role: node.role,
      authority: node.authority,
      status: stale
        ? 'stale' as const
        : dependencyBlocked
          ? 'blocked' as const
          : ready
            ? 'ready' as const
            : node.authority === 'derived-preview' || node.authority === 'delivery'
              ? 'blocked' as const
              : 'pending' as const,
    }
  })
  const deliveryStatus = blocked
    ? 'blocked' as const
    : value.exportResult && value.exportResult.status !== 'canceled'
      ? value.exportResult.status
      : bundle
        ? bundle.bundle.deliveryStatus
        : 'blocked' as const
  return {
    mapId: plan.mapId,
    title: plan.title,
    mode: plan.mode,
    playable: plan.playable,
    world: plan.world,
    nodes,
    planningReferences: plan.nodes
      .filter(({ role }) => role === 'dressed-reference')
      .map(() => {
        const reference = planningReferences.find(({ role }) => role === 'dressed-reference')?.reference
        return {
          role: 'dressed-reference' as const,
          status: reference ? 'ready' as const : 'pending' as const,
          ...(reference ? { artifactId: reference.id, revision: reference.revision } : {}),
        }
      }),
    runtimeLayers,
    objectLibrary: {
      status: runtime?.objectLibrary
        ? objects.some(({ status }) => status === 'stale')
          ? 'stale'
          : objects.some(({ status }) => status === 'blocked') ? 'blocked' : 'ready'
        : plan.playable ? 'pending' : 'ready',
      ...(runtime?.objectLibrary ? { revision: runtime.objectLibrary.revision } : {}),
      objects,
    },
    terrain: {
      layerCount: terrainLayers.length,
      tileCount: terrainLayers.reduce((count, layer) => count + layer.tiles.length, 0),
      status: runtime
        ? terrainLayers.some(({ id }) => stalePaths.has(`runtimeManifest.layers[${id}]`))
          ? 'stale'
          : runtimeLayers.some(({ kind, status }) => kind === 'terrain' && status === 'blocked')
            ? 'blocked'
            : 'ready'
        : 'pending',
    },
    placements: {
      count: runtime?.runtimeManifest.placements.length ?? 0,
      staleIds: stalePlacementIds,
      status: stalePlacementIds.length ? 'stale' : placementsBlocked ? 'blocked' : runtime ? 'ready' : 'pending',
    },
    geometry: {
      collisionCount: runtime?.runtimeManifest.collision.length ?? 0,
      zoneCount: runtime?.runtimeManifest.zones.length ?? 0,
      spawnCount: runtime?.runtimeManifest.spawns.length ?? 0,
      exitCount: runtime?.runtimeManifest.exits.length ?? 0,
      status: geometryBlocked ? 'blocked' : runtime ? 'ready' : 'pending',
    },
    preview: {
      status: stalePaths.has('preview')
        ? 'stale'
        : blocked ? 'blocked' : preview ? preview.receipt.validationStatus === 'passed' ? 'ready' : 'blocked' : 'pending',
      ...(preview ? {
        previewArtifactId: preview.receipt.preview.id,
        debugArtifactId: preview.receipt.debugOverlay.id,
        reachability: preview.receipt.reachability,
      } : validation ? { reachability: validation.reachability } : {}),
    },
    delivery: {
      status: deliveryStatus,
      ...(bundle ? { bundleHash: bundle.bundleHash } : {}),
      ...(value.exportResult?.receipt.bundleDir
        ? { bundleDir: value.exportResult.receipt.bundleDir }
        : {}),
    },
    blockers,
  }
}

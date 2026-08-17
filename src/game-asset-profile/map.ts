import { z } from 'zod'
import { fingerprint } from '@/design-ir/fingerprint'
import { recordIdSchema, sha256Schema } from '@/design-os-kernel/contracts'
import { gameAssetEvidenceReferenceSchema } from './contracts'

export const GAME_MAP_PRODUCTION_PLAN_PROTOCOL = 'game-map.production-plan.v1' as const
export const GAME_MAP_OBJECT_LIBRARY_PROTOCOL = 'game-map.object-library.v1' as const
export const GAME_MAP_RUNTIME_MANIFEST_PROTOCOL = 'game-map.runtime-manifest.v1' as const
export const GAME_MAP_PREVIEW_RECEIPT_PROTOCOL = 'game-map.preview-receipt.v1' as const
export const GAME_MAP_BUNDLE_PROTOCOL = 'game-map.bundle.v1' as const

const boundedPixelSchema = z.number().int().nonnegative().max(131_072)
const positivePixelSchema = z.number().int().positive().max(131_072)

export const gameMapModeSchema = z.enum([
  'tile', 'scene', 'side-scroll', 'grid', 'room-chunk', 'baked-scene',
])
export type GameMapMode = z.infer<typeof gameMapModeSchema>

export const gameMapPointSchema = z.object({
  x: boundedPixelSchema,
  y: boundedPixelSchema,
}).strict()

export const gameMapRectangleSchema = z.object({
  x: boundedPixelSchema,
  y: boundedPixelSchema,
  width: positivePixelSchema,
  height: positivePixelSchema,
}).strict()

export const gameMapWorldSchema = z.object({
  width: positivePixelSchema,
  height: positivePixelSchema,
}).strict()

export const gameMapCoordinateSystemSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('pixel-2d'),
    origin: z.literal('top-left'),
    unit: z.literal('pixel'),
  }).strict(),
  z.object({
    kind: z.literal('orthogonal-grid'),
    origin: z.literal('top-left'),
    columns: z.number().int().positive().max(4_096),
    rows: z.number().int().positive().max(4_096),
    cellWidth: positivePixelSchema,
    cellHeight: positivePixelSchema,
  }).strict(),
  z.object({
    kind: z.literal('chunk-grid'),
    origin: z.literal('top-left'),
    columns: z.number().int().positive().max(1_024),
    rows: z.number().int().positive().max(1_024),
    chunkWidth: positivePixelSchema,
    chunkHeight: positivePixelSchema,
  }).strict(),
])
export type GameMapCoordinateSystem = z.infer<typeof gameMapCoordinateSystemSchema>

export const gameMapCameraSchema = z.object({
  behavior: z.enum(['fixed', 'bounded', 'horizontal-follow', 'grid-bounded', 'chunk-bounded']),
  viewport: gameMapWorldSchema,
  bounds: gameMapRectangleSchema,
}).strict()

export const gameMapPlanNodeRoleSchema = z.enum([
  'base',
  'terrain-atlas',
  'dressed-reference',
  'parallax-plates',
  'room-chunks',
  'baked-scene',
  'object-library',
  'tile-layers',
  'platform-segments',
  'cell-semantics',
  'chunk-sockets',
  'placements',
  'collision',
  'zones',
  'hazards',
  'spawns',
  'checkpoints',
  'exits',
  'camera',
  'runtime-manifest',
  'preview',
  'debug-overlay',
  'bundle',
])
export type GameMapPlanNodeRole = z.infer<typeof gameMapPlanNodeRoleSchema>

export const gameMapPlanNodeSchema = z.object({
  id: recordIdSchema,
  role: gameMapPlanNodeRoleSchema,
  kind: z.enum([
    'visual-source',
    'object-library',
    'runtime-placement',
    'runtime-geometry',
    'runtime-semantics',
    'runtime-manifest',
    'deterministic-preview',
    'delivery',
  ]),
  authority: z.enum([
    'planning-reference',
    'runtime-input',
    'runtime-manifest',
    'derived-preview',
    'delivery',
  ]),
  dependencies: z.array(recordIdSchema).max(64),
}).strict()
export type GameMapPlanNode = z.infer<typeof gameMapPlanNodeSchema>

export const GAME_MAP_PLAN_NODE_POLICY: Readonly<
  Record<GameMapPlanNodeRole, Pick<GameMapPlanNode, 'kind' | 'authority'>>
> = {
  base: { kind: 'visual-source', authority: 'runtime-input' },
  'terrain-atlas': { kind: 'visual-source', authority: 'runtime-input' },
  'dressed-reference': { kind: 'visual-source', authority: 'planning-reference' },
  'parallax-plates': { kind: 'visual-source', authority: 'runtime-input' },
  'room-chunks': { kind: 'visual-source', authority: 'runtime-input' },
  'baked-scene': { kind: 'visual-source', authority: 'runtime-input' },
  'object-library': { kind: 'object-library', authority: 'runtime-input' },
  'tile-layers': { kind: 'runtime-placement', authority: 'runtime-input' },
  'platform-segments': { kind: 'runtime-geometry', authority: 'runtime-input' },
  'cell-semantics': { kind: 'runtime-semantics', authority: 'runtime-input' },
  'chunk-sockets': { kind: 'runtime-semantics', authority: 'runtime-input' },
  placements: { kind: 'runtime-placement', authority: 'runtime-input' },
  collision: { kind: 'runtime-geometry', authority: 'runtime-input' },
  zones: { kind: 'runtime-geometry', authority: 'runtime-input' },
  hazards: { kind: 'runtime-geometry', authority: 'runtime-input' },
  spawns: { kind: 'runtime-semantics', authority: 'runtime-input' },
  checkpoints: { kind: 'runtime-semantics', authority: 'runtime-input' },
  exits: { kind: 'runtime-semantics', authority: 'runtime-input' },
  camera: { kind: 'runtime-semantics', authority: 'runtime-input' },
  'runtime-manifest': { kind: 'runtime-manifest', authority: 'runtime-manifest' },
  preview: { kind: 'deterministic-preview', authority: 'derived-preview' },
  'debug-overlay': { kind: 'deterministic-preview', authority: 'derived-preview' },
  bundle: { kind: 'delivery', authority: 'delivery' },
}

export const GAME_MAP_MODE_NODE_ROLES = {
  tile: [
    'terrain-atlas', 'object-library', 'tile-layers', 'placements', 'collision',
    'zones', 'spawns', 'exits', 'camera', 'runtime-manifest', 'preview',
    'debug-overlay', 'bundle',
  ],
  scene: [
    'base', 'dressed-reference', 'object-library', 'placements', 'collision',
    'zones', 'spawns', 'exits', 'camera', 'runtime-manifest', 'preview',
    'debug-overlay', 'bundle',
  ],
  'side-scroll': [
    'parallax-plates', 'platform-segments', 'object-library', 'placements',
    'collision', 'hazards', 'spawns', 'checkpoints', 'exits', 'camera',
    'runtime-manifest', 'preview', 'debug-overlay', 'bundle',
  ],
  grid: [
    'terrain-atlas', 'cell-semantics', 'object-library', 'placements', 'collision',
    'zones', 'spawns', 'exits', 'camera', 'runtime-manifest', 'preview',
    'debug-overlay', 'bundle',
  ],
  'room-chunk': [
    'room-chunks', 'chunk-sockets', 'object-library', 'placements', 'collision',
    'zones', 'spawns', 'exits', 'camera', 'runtime-manifest', 'preview',
    'debug-overlay', 'bundle',
  ],
  'baked-scene': [
    'baked-scene', 'camera', 'runtime-manifest', 'preview', 'debug-overlay', 'bundle',
  ],
} as const satisfies Readonly<Record<GameMapMode, readonly GameMapPlanNodeRole[]>>

function addIssue(context: z.RefinementCtx, message: string, path?: PropertyKey[]): void {
  context.addIssue({ code: 'custom', message, ...(path ? { path } : {}) })
}

function validateRectangleBounds(
  rectangle: z.infer<typeof gameMapRectangleSchema>,
  world: z.infer<typeof gameMapWorldSchema>,
  context: z.RefinementCtx,
  label: string,
): void {
  if (rectangle.x + rectangle.width > world.width || rectangle.y + rectangle.height > world.height) {
    addIssue(context, `${label} exceeds the map world bounds.`)
  }
}

function expectedCoordinateKind(mode: GameMapMode): GameMapCoordinateSystem['kind'] {
  if (mode === 'tile' || mode === 'grid') return 'orthogonal-grid'
  if (mode === 'room-chunk') return 'chunk-grid'
  return 'pixel-2d'
}

function expectedCameraBehavior(mode: GameMapMode): z.infer<typeof gameMapCameraSchema>['behavior'] {
  if (mode === 'baked-scene') return 'fixed'
  if (mode === 'side-scroll') return 'horizontal-follow'
  if (mode === 'tile' || mode === 'grid') return 'grid-bounded'
  if (mode === 'room-chunk') return 'chunk-bounded'
  return 'bounded'
}

function validateCoordinateDimensions(
  coordinateSystem: GameMapCoordinateSystem,
  world: z.infer<typeof gameMapWorldSchema>,
  context: z.RefinementCtx,
): void {
  if (coordinateSystem.kind === 'orthogonal-grid'
    && (coordinateSystem.columns * coordinateSystem.cellWidth !== world.width
      || coordinateSystem.rows * coordinateSystem.cellHeight !== world.height)) {
    addIssue(context, 'Orthogonal grid dimensions must exactly cover the map world.')
  }
  if (coordinateSystem.kind === 'chunk-grid'
    && (coordinateSystem.columns * coordinateSystem.chunkWidth !== world.width
      || coordinateSystem.rows * coordinateSystem.chunkHeight !== world.height)) {
    addIssue(context, 'Chunk grid dimensions must exactly cover the map world.')
  }
}

export function expectedGameMapPlanNodeDependencies(
  nodes: readonly GameMapPlanNode[],
  role: GameMapPlanNodeRole,
): readonly string[] {
  const idFor = (candidateRole: GameMapPlanNodeRole) => (
    nodes.find((node) => node.role === candidateRole)?.id
  )
  const requiredId = (candidateRole: GameMapPlanNodeRole): string => {
    const id = idFor(candidateRole)
    if (!id) throw new Error(`Game Map plan is missing ${candidateRole}.`)
    return id
  }
  const runtimeInputs = nodes.filter(({ authority }) => authority === 'runtime-input')
  const previewInputs = runtimeInputs.filter(({ kind, role: inputRole }) => (
    kind === 'visual-source' || inputRole === 'object-library'
  ))
  if (role === 'placements' && idFor('object-library')) return [requiredId('object-library')]
  if (role === 'runtime-manifest') return runtimeInputs.map(({ id }) => id)
  if (role === 'preview') {
    return [requiredId('runtime-manifest'), ...previewInputs.map(({ id }) => id)]
  }
  if (role === 'debug-overlay') return [requiredId('runtime-manifest')]
  if (role === 'bundle') {
    return [
      requiredId('runtime-manifest'),
      requiredId('preview'),
      requiredId('debug-overlay'),
      ...previewInputs.map(({ id }) => id),
    ]
  }
  return []
}

function hasDependencyCycle(nodes: readonly GameMapPlanNode[]): boolean {
  const dependencies = new Map(nodes.map((node) => [node.id, node.dependencies]))
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true
    if (visited.has(id)) return false
    visiting.add(id)
    for (const dependency of dependencies.get(id) ?? []) {
      if (visit(dependency)) return true
    }
    visiting.delete(id)
    visited.add(id)
    return false
  }
  return nodes.some(({ id }) => visit(id))
}

export const gameMapProductionPlanSchema = z.object({
  version: z.literal(GAME_MAP_PRODUCTION_PLAN_PROTOCOL),
  id: recordIdSchema,
  mapId: recordIdSchema,
  intentDigest: sha256Schema,
  title: z.string().trim().min(1).max(240),
  mode: gameMapModeSchema,
  playable: z.boolean(),
  runtimeSemantics: z.enum(['full', 'visual-only']),
  world: gameMapWorldSchema,
  coordinateSystem: gameMapCoordinateSystemSchema,
  camera: gameMapCameraSchema,
  nodes: z.array(gameMapPlanNodeSchema).min(1).max(64),
  delivery: z.object({
    runtimeManifest: z.object({ id: z.literal('game-map.runtime-manifest'), version: z.literal(1) }).strict(),
    previewReceipt: z.object({ id: z.literal('game-map.preview-receipt'), version: z.literal(1) }).strict(),
    bundle: z.object({ id: z.literal('game-map.bundle'), version: z.literal(1) }).strict(),
  }).strict(),
}).strict().superRefine((plan, context) => {
  if (plan.playable !== (plan.mode !== 'baked-scene')
    || plan.runtimeSemantics !== (plan.mode === 'baked-scene' ? 'visual-only' : 'full')) {
    addIssue(context, 'Baked scenes are visual-only; every playable map requires full runtime semantics.')
  }
  if (plan.coordinateSystem.kind !== expectedCoordinateKind(plan.mode)) {
    addIssue(context, `Map mode ${plan.mode} requires ${expectedCoordinateKind(plan.mode)} coordinates.`)
  }
  validateCoordinateDimensions(plan.coordinateSystem, plan.world, context)
  if (plan.camera.behavior !== expectedCameraBehavior(plan.mode)) {
    addIssue(context, `Map mode ${plan.mode} requires ${expectedCameraBehavior(plan.mode)} camera behavior.`)
  }
  validateRectangleBounds(plan.camera.bounds, plan.world, context, 'Camera bounds')
  if (plan.camera.viewport.width > plan.camera.bounds.width
    || plan.camera.viewport.height > plan.camera.bounds.height) {
    addIssue(context, 'Camera viewport must fit inside its bounds.')
  }
  const nodeIds = plan.nodes.map(({ id }) => id)
  const roles = plan.nodes.map(({ role }) => role)
  if (new Set(nodeIds).size !== nodeIds.length) addIssue(context, 'Game Map plan node ids must be unique.')
  if (new Set(roles).size !== roles.length) addIssue(context, 'Game Map plan node roles must be unique.')
  const expectedRoles = GAME_MAP_MODE_NODE_ROLES[plan.mode]
  if (roles.length !== expectedRoles.length
    || roles.some((role, index) => role !== expectedRoles[index])) {
    addIssue(context, `Game Map ${plan.mode} plan does not contain its exact required node closure.`)
  }
  const knownIds = new Set(nodeIds)
  for (const node of plan.nodes) {
    const policy = GAME_MAP_PLAN_NODE_POLICY[node.role]
    if (node.kind !== policy.kind || node.authority !== policy.authority) {
      addIssue(context, `Game Map node ${node.role} has invalid kind or authority.`)
    }
    if (new Set(node.dependencies).size !== node.dependencies.length) {
      addIssue(context, `Game Map node ${node.id} has duplicate dependencies.`)
    }
    for (const dependency of node.dependencies) {
      if (!knownIds.has(dependency) || dependency === node.id) {
        addIssue(context, `Game Map node ${node.id} has an invalid dependency: ${dependency}.`)
      }
    }
    const expectedDependencies = expectedGameMapPlanNodeDependencies(plan.nodes, node.role)
    if (node.dependencies.length !== expectedDependencies.length
      || node.dependencies.some((dependency, index) => dependency !== expectedDependencies[index])) {
      addIssue(context, `Game Map node ${node.role} does not bind its exact dependency closure.`)
    }
  }
  if (hasDependencyCycle(plan.nodes)) addIssue(context, 'Game Map plan dependencies must be acyclic.')
  const planningIds = new Set(plan.nodes
    .filter(({ authority }) => authority === 'planning-reference')
    .map(({ id }) => id))
  for (const role of ['runtime-manifest', 'preview', 'debug-overlay', 'bundle'] as const) {
    const node = plan.nodes.find((candidate) => candidate.role === role)
    if (node?.dependencies.some((dependency) => planningIds.has(dependency))) {
      addIssue(context, `Game Map ${role} cannot consume a planning-reference artifact.`)
    }
  }
})
export type GameMapProductionPlan = z.infer<typeof gameMapProductionPlanSchema>

export const gameMapAcceptedArtifactSchema = z.object({
  artifact: gameAssetEvidenceReferenceSchema,
  acceptance: z.object({
    receiptId: recordIdSchema,
    receiptRevision: recordIdSchema,
    receiptHash: sha256Schema,
  }).strict(),
}).strict()
export type GameMapAcceptedArtifact = z.infer<typeof gameMapAcceptedArtifactSchema>

const gameMapCollisionPolicySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }).strict(),
  z.object({ kind: z.literal('authored-shape'), geometryId: recordIdSchema }).strict(),
])

export const gameMapObjectLibrarySchema = z.object({
  version: z.literal(GAME_MAP_OBJECT_LIBRARY_PROTOCOL),
  id: recordIdSchema,
  revision: recordIdSchema,
  mapId: recordIdSchema,
  plan: z.object({ id: recordIdSchema, contentHash: sha256Schema }).strict(),
  objects: z.array(z.object({
    id: recordIdSchema,
    revision: recordIdSchema,
    name: z.string().trim().min(1).max(240),
    visual: gameMapAcceptedArtifactSchema,
    decodedSize: gameMapWorldSchema,
    anchor: gameMapPointSchema,
    occlusionClass: z.enum(['ground', 'actor-height', 'canopy', 'overlay']),
    placementSafeArea: gameMapRectangleSchema,
    collisionPolicy: gameMapCollisionPolicySchema,
  }).strict()).min(1).max(2_000),
}).strict().superRefine((library, context) => {
  const objectIds = library.objects.map(({ id }) => id)
  const visualIdentities = library.objects.map(({ visual }) => (
    `${visual.artifact.id}@${visual.artifact.revision}`
  ))
  if (new Set(objectIds).size !== objectIds.length) addIssue(context, 'Game Map object ids must be unique.')
  if (new Set(visualIdentities).size !== visualIdentities.length) {
    addIssue(context, 'Game Map object visuals must have unique accepted artifact revisions.')
  }
  for (const object of library.objects) {
    if (object.anchor.x > object.decodedSize.width || object.anchor.y > object.decodedSize.height) {
      addIssue(context, `Game Map object ${object.id} anchor exceeds its decoded visual.`)
    }
    validateRectangleBounds(object.placementSafeArea, object.decodedSize, context, `Object ${object.id} placement-safe area`)
  }
})
export type GameMapObjectLibrary = z.infer<typeof gameMapObjectLibrarySchema>

export const gameMapShapeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('rectangle'), bounds: gameMapRectangleSchema }).strict(),
  z.object({
    kind: z.literal('polygon'),
    points: z.array(gameMapPointSchema).min(3).max(256),
  }).strict(),
])
export type GameMapShape = z.infer<typeof gameMapShapeSchema>

const runtimeVisualRoleSchema = z.enum([
  'base', 'terrain-atlas', 'parallax-plates', 'room-chunks', 'baked-scene', 'foreground',
])

export const gameMapAtlasGridSchema = z.object({
  columns: z.number().int().positive().max(256),
  rows: z.number().int().positive().max(256),
  cellWidth: positivePixelSchema,
  cellHeight: positivePixelSchema,
}).strict()
export type GameMapAtlasGrid = z.infer<typeof gameMapAtlasGridSchema>

const gameMapTilePlacementSchema = z.object({
  column: z.number().int().nonnegative().max(4_095),
  row: z.number().int().nonnegative().max(4_095),
  atlasColumn: z.number().int().nonnegative().max(255),
  atlasRow: z.number().int().nonnegative().max(255),
}).strict()

const visualLayerSchema = (kind: 'base' | 'foreground' | 'parallax') => z.object({
  id: recordIdSchema,
  kind: z.literal(kind),
  order: z.number().int().min(-10_000).max(10_000),
  sourceId: recordIdSchema,
}).strict()

export const gameMapRuntimeLayerSchema = z.discriminatedUnion('kind', [
  visualLayerSchema('base'),
  visualLayerSchema('foreground'),
  visualLayerSchema('parallax'),
  z.object({
    id: recordIdSchema,
    kind: z.literal('terrain'),
    order: z.number().int().min(-10_000).max(10_000),
    sourceId: recordIdSchema,
    atlas: gameMapAtlasGridSchema,
    tiles: z.array(gameMapTilePlacementSchema).max(262_144),
  }).strict(),
  z.object({
    id: recordIdSchema,
    kind: z.literal('objects'),
    order: z.number().int().min(-10_000).max(10_000),
    sourceId: recordIdSchema,
  }).strict(),
  z.object({
    id: recordIdSchema,
    kind: z.literal('actors'),
    order: z.number().int().min(-10_000).max(10_000),
    sourceId: recordIdSchema,
  }).strict(),
])
export type GameMapRuntimeLayer = z.infer<typeof gameMapRuntimeLayerSchema>

export const gameMapNavigationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('unavailable'),
    reason: z.literal('no-explicit-navigation-data'),
  }).strict(),
  z.object({
    kind: z.literal('orthogonal-grid'),
    movement: z.literal('cardinal-4'),
    blockedCells: z.array(z.object({
      column: z.number().int().nonnegative().max(4_095),
      row: z.number().int().nonnegative().max(4_095),
    }).strict()).max(262_144),
  }).strict(),
])
export type GameMapNavigation = z.infer<typeof gameMapNavigationSchema>

export const gameMapRuntimeManifestSchema = z.object({
  version: z.literal(GAME_MAP_RUNTIME_MANIFEST_PROTOCOL),
  id: recordIdSchema,
  revision: recordIdSchema,
  mapId: recordIdSchema,
  plan: z.object({ id: recordIdSchema, contentHash: sha256Schema }).strict(),
  mode: gameMapModeSchema,
  playable: z.boolean(),
  world: gameMapWorldSchema,
  coordinateSystem: gameMapCoordinateSystemSchema,
  camera: gameMapCameraSchema,
  objectLibrary: z.object({
    id: recordIdSchema,
    revision: recordIdSchema,
    contentHash: sha256Schema,
  }).strict().optional(),
  visuals: z.array(z.object({
    role: runtimeVisualRoleSchema,
    source: gameMapAcceptedArtifactSchema,
  }).strict()).min(1).max(64),
  layers: z.array(gameMapRuntimeLayerSchema).min(1).max(256),
  placements: z.array(z.object({
    id: recordIdSchema,
    layerId: recordIdSchema,
    objectId: recordIdSchema,
    objectRevision: recordIdSchema,
    position: gameMapPointSchema,
    scale: z.object({
      x: z.number().positive().finite().max(100),
      y: z.number().positive().finite().max(100),
    }).strict(),
    rotationDegrees: z.number().finite().min(-360).max(360),
    sortOffset: z.number().int().min(-10_000).max(10_000),
  }).strict()).max(20_000),
  collision: z.array(z.object({
    id: recordIdSchema,
    behavior: z.enum(['solid', 'one-way', 'hazard']),
    shape: gameMapShapeSchema,
  }).strict()).max(20_000),
  zones: z.array(z.object({
    id: recordIdSchema,
    purpose: z.enum(['trigger', 'hazard', 'buildable', 'resource', 'checkpoint']),
    shape: gameMapShapeSchema,
  }).strict()).max(20_000),
  spawns: z.array(z.object({
    id: recordIdSchema,
    kind: z.enum(['player', 'npc', 'enemy', 'object']),
    position: gameMapPointSchema,
  }).strict()).max(2_000),
  exits: z.array(z.object({
    id: recordIdSchema,
    area: gameMapShapeSchema,
    destination: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('map'), mapId: recordIdSchema, spawnId: recordIdSchema }).strict(),
      z.object({ kind: z.literal('socket'), socketId: recordIdSchema }).strict(),
    ]),
  }).strict()).max(2_000),
  navigation: gameMapNavigationSchema,
}).strict().superRefine((manifest, context) => {
  if (manifest.playable !== (manifest.mode !== 'baked-scene')) {
    addIssue(context, 'Baked runtime manifests are visual-only; playable manifests require a structured mode.')
  }
  if (manifest.coordinateSystem.kind !== expectedCoordinateKind(manifest.mode)) {
    addIssue(context, `Map mode ${manifest.mode} requires ${expectedCoordinateKind(manifest.mode)} coordinates.`)
  }
  validateCoordinateDimensions(manifest.coordinateSystem, manifest.world, context)
  if (manifest.camera.behavior !== expectedCameraBehavior(manifest.mode)) {
    addIssue(context, `Map mode ${manifest.mode} requires ${expectedCameraBehavior(manifest.mode)} camera behavior.`)
  }
  validateRectangleBounds(manifest.camera.bounds, manifest.world, context, 'Camera bounds')
  const visualRoles = manifest.visuals.map(({ role }) => role)
  const expectedVisualRole: z.infer<typeof runtimeVisualRoleSchema> = manifest.mode === 'tile' || manifest.mode === 'grid'
    ? 'terrain-atlas'
    : manifest.mode === 'side-scroll'
      ? 'parallax-plates'
      : manifest.mode === 'room-chunk'
        ? 'room-chunks'
        : manifest.mode === 'baked-scene'
          ? 'baked-scene'
          : 'base'
  if (!visualRoles.includes(expectedVisualRole)) {
    addIssue(context, `Game Map ${manifest.mode} manifest is missing ${expectedVisualRole} runtime visuals.`)
  }
  if (visualRoles.some((role) => role !== expectedVisualRole && role !== 'foreground')) {
    addIssue(context, `Game Map ${manifest.mode} manifest contains an incompatible runtime visual role.`)
  }
  if (new Set(visualRoles).size !== visualRoles.length) addIssue(context, 'Game Map runtime visual roles must be unique.')
  const visualArtifactIds = manifest.visuals.map(({ source }) => source.artifact.id)
  if (new Set(visualArtifactIds).size !== visualArtifactIds.length) {
    addIssue(context, 'Game Map runtime visual artifact ids must be unique and unambiguous.')
  }
  const layerIds = manifest.layers.map(({ id }) => id)
  const layerOrders = manifest.layers.map(({ order }) => order)
  if (new Set(layerIds).size !== layerIds.length || new Set(layerOrders).size !== layerOrders.length) {
    addIssue(context, 'Game Map runtime layer ids and orders must be unique.')
  }
  const visualIds = new Set(manifest.visuals.map(({ source }) => source.artifact.id))
  const knownLayerSources = new Set([
    ...visualIds,
    ...(manifest.objectLibrary ? [manifest.objectLibrary.id] : []),
  ])
  if (manifest.layers.some(({ sourceId }) => !knownLayerSources.has(sourceId))) {
    addIssue(context, 'Game Map layers must reference exact runtime visuals or the declared object library.')
  }
  if (manifest.layers.some((layer) => (
    (layer.kind === 'objects' || layer.kind === 'actors')
      ? layer.sourceId !== manifest.objectLibrary?.id
      : !visualIds.has(layer.sourceId)
  ))) {
    addIssue(context, 'Game Map layer kinds must match visual versus object-library sources.')
  }
  const visualRoleById = new Map(manifest.visuals.map(({ role, source }) => [source.artifact.id, role]))
  if (manifest.layers.some((layer) => {
    const role = visualRoleById.get(layer.sourceId)
    if (layer.kind === 'objects' || layer.kind === 'actors' || layer.kind === 'terrain') return false
    if (layer.kind === 'foreground') return role !== 'foreground'
    if (layer.kind === 'parallax') return role !== 'parallax-plates'
    return role !== 'base' && role !== 'room-chunks' && role !== 'baked-scene'
  })) {
    addIssue(context, 'Game Map visual layer kinds must match their exact runtime visual roles.')
  }
  const terrainLayers = manifest.layers.filter((layer) => layer.kind === 'terrain')
  for (const layer of terrainLayers) {
    if (visualRoleById.get(layer.sourceId) !== 'terrain-atlas') {
      addIssue(context, `Terrain layer ${layer.id} must reference the terrain-atlas runtime role.`)
    }
    if (manifest.coordinateSystem.kind !== 'orthogonal-grid') {
      addIssue(context, `Terrain layer ${layer.id} requires an orthogonal map grid.`)
      continue
    }
    const coordinateSystem = manifest.coordinateSystem
    if (layer.atlas.cellWidth !== coordinateSystem.cellWidth
      || layer.atlas.cellHeight !== coordinateSystem.cellHeight) {
      addIssue(context, `Terrain layer ${layer.id} cells must match the map coordinate grid.`)
    }
    const destinations = layer.tiles.map(({ column, row }) => `${column}:${row}`)
    if (new Set(destinations).size !== destinations.length) {
      addIssue(context, `Terrain layer ${layer.id} tile destinations must be unique.`)
    }
    if (layer.tiles.some(({ column, row, atlasColumn, atlasRow }) => (
      column >= coordinateSystem.columns
      || row >= coordinateSystem.rows
      || atlasColumn >= layer.atlas.columns
      || atlasRow >= layer.atlas.rows
    ))) {
      addIssue(context, `Terrain layer ${layer.id} contains an out-of-bounds tile cell.`)
    }
  }
  const objectLayerIds = new Set(manifest.layers
    .filter(({ kind }) => kind === 'objects' || kind === 'actors')
    .map(({ id }) => id))
  if (manifest.placements.some(({ layerId }) => !objectLayerIds.has(layerId))) {
    addIssue(context, 'Game Map placements must reference an object or actor layer.')
  }
  const runtimeRecordIds = [
    ...layerIds,
    ...manifest.placements.map(({ id }) => id),
    ...manifest.collision.map(({ id }) => id),
    ...manifest.zones.map(({ id }) => id),
    ...manifest.spawns.map(({ id }) => id),
    ...manifest.exits.map(({ id }) => id),
  ]
  if (new Set(runtimeRecordIds).size !== runtimeRecordIds.length) {
    addIssue(context, 'Game Map runtime layer, placement, geometry, spawn, and exit ids must be globally unique.')
  }
  for (const placement of manifest.placements) {
    if (placement.position.x >= manifest.world.width || placement.position.y >= manifest.world.height) {
      addIssue(context, `Game Map placement ${placement.id} exceeds the map world bounds.`)
    }
  }
  for (const spawn of manifest.spawns) {
    if (spawn.position.x >= manifest.world.width || spawn.position.y >= manifest.world.height) {
      addIssue(context, `Game Map spawn ${spawn.id} exceeds the map world bounds.`)
    }
  }
  const validateShape = (shape: GameMapShape, label: string) => {
    if (shape.kind === 'rectangle') {
      validateRectangleBounds(shape.bounds, manifest.world, context, label)
      return
    }
    if (shape.points.some(({ x, y }) => x >= manifest.world.width || y >= manifest.world.height)) {
      addIssue(context, `${label} exceeds the map world bounds.`)
    }
  }
  manifest.collision.forEach((entry) => validateShape(entry.shape, `Collision ${entry.id}`))
  manifest.zones.forEach((entry) => validateShape(entry.shape, `Zone ${entry.id}`))
  manifest.exits.forEach((entry) => validateShape(entry.area, `Exit ${entry.id}`))
  if (manifest.navigation.kind === 'orthogonal-grid') {
    if (manifest.coordinateSystem.kind !== 'orthogonal-grid') {
      addIssue(context, 'Explicit orthogonal navigation requires an orthogonal map coordinate system.')
    } else {
      const coordinateSystem = manifest.coordinateSystem
      const blocked = manifest.navigation.blockedCells.map(({ column, row }) => `${column}:${row}`)
      if (new Set(blocked).size !== blocked.length) {
        addIssue(context, 'Explicit navigation blocked cells must be unique.')
      }
      if (manifest.navigation.blockedCells.some(({ column, row }) => (
        column >= coordinateSystem.columns || row >= coordinateSystem.rows
      ))) {
        addIssue(context, 'Explicit navigation contains an out-of-bounds blocked cell.')
      }
    }
  }
  if (manifest.mode === 'baked-scene') {
    if (manifest.objectLibrary || manifest.placements.length > 0 || manifest.collision.length > 0
      || manifest.zones.length > 0 || manifest.spawns.length > 0 || manifest.exits.length > 0
      || manifest.visuals.some(({ role }) => role !== 'baked-scene')) {
      addIssue(context, 'Baked scene manifests cannot claim editable runtime objects or gameplay geometry.')
    }
  } else if (!manifest.objectLibrary || manifest.collision.length === 0
    || !manifest.spawns.some(({ kind }) => kind === 'player') || manifest.exits.length === 0) {
    addIssue(context, 'Playable Game Map manifests require an object library, collision, spawn, and exit data.')
  }
})
export type GameMapRuntimeManifest = z.infer<typeof gameMapRuntimeManifestSchema>

export const gameMapReachabilitySchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('unavailable'),
    reason: z.literal('no-explicit-navigation-data'),
  }).strict(),
  z.object({
    status: z.literal('verified'),
    movement: z.literal('cardinal-4'),
    visitedCellCount: z.number().int().positive().max(16_777_216),
    reachableExitIds: z.array(recordIdSchema).min(1).max(2_000),
  }).strict(),
  z.object({
    status: z.literal('blocked'),
    movement: z.literal('cardinal-4'),
    visitedCellCount: z.number().int().nonnegative().max(16_777_216),
    unreachableExitIds: z.array(recordIdSchema).min(1).max(2_000),
  }).strict(),
])
export type GameMapReachability = z.infer<typeof gameMapReachabilitySchema>

export const gameMapPreviewReceiptSchema = z.object({
  version: z.literal(GAME_MAP_PREVIEW_RECEIPT_PROTOCOL),
  id: recordIdSchema,
  mapId: recordIdSchema,
  plan: z.object({ id: recordIdSchema, contentHash: sha256Schema }).strict(),
  runtimeManifest: z.object({ id: recordIdSchema, revision: recordIdSchema, contentHash: sha256Schema }).strict(),
  objectLibrary: z.object({ id: recordIdSchema, revision: recordIdSchema, contentHash: sha256Schema }).strict().optional(),
  compositor: z.object({ id: recordIdSchema, implementationHash: sha256Schema }).strict(),
  inputs: z.array(gameMapAcceptedArtifactSchema).min(1).max(2_000),
  preview: gameAssetEvidenceReferenceSchema,
  debugOverlay: gameAssetEvidenceReferenceSchema,
  validationStatus: z.enum(['passed', 'blocked']),
  reachability: gameMapReachabilitySchema,
  findings: z.array(z.object({
    code: recordIdSchema,
    subjectId: recordIdSchema,
    severity: z.enum(['informational', 'blocking']),
    message: z.string().trim().min(1).max(2_000),
  }).strict()).max(20_000),
}).strict().superRefine((receipt, context) => {
  const inputIdentities = receipt.inputs.map(({ artifact }) => `${artifact.id}@${artifact.revision}`)
  if (new Set(inputIdentities).size !== inputIdentities.length) {
    addIssue(context, 'Game Map preview inputs must have unique accepted artifact revisions.')
  }
  const hasBlockingFindings = receipt.findings.some(({ severity }) => severity === 'blocking')
  if ((receipt.validationStatus === 'blocked') !== hasBlockingFindings
    || (receipt.reachability.status === 'blocked' && !hasBlockingFindings)) {
    addIssue(context, 'Game Map preview validation status must match its deterministic blocking findings.')
  }
  if (receipt.preview.id === receipt.debugOverlay.id
    || receipt.preview.contentHash === receipt.debugOverlay.contentHash) {
    addIssue(context, 'Game Map preview and debug overlay must retain distinct artifact identities and bytes.')
  }
})
export type GameMapPreviewReceipt = z.infer<typeof gameMapPreviewReceiptSchema>

const safeMapBundlePathSchema = z.string().min(1).max(512).refine((path) => {
  if (path.includes('\\') || path.startsWith('/') || /^[A-Za-z]:/.test(path)) return false
  const segments = path.split('/')
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
}, 'Game Map bundle paths must be normalized relative paths without traversal.')

export const gameMapBundleSchema = z.object({
  version: z.literal(GAME_MAP_BUNDLE_PROTOCOL),
  id: recordIdSchema,
  mapId: recordIdSchema,
  deliveryStatus: z.enum(['candidate', 'accepted']),
  plan: z.object({ id: recordIdSchema, contentHash: sha256Schema }).strict(),
  objectLibrary: z.object({ id: recordIdSchema, revision: recordIdSchema, contentHash: sha256Schema }).strict().optional(),
  runtimeManifest: z.object({ id: recordIdSchema, revision: recordIdSchema, contentHash: sha256Schema }).strict(),
  previewReceipt: z.object({ id: recordIdSchema, contentHash: sha256Schema }).strict(),
  semanticAcceptance: z.object({
    receiptId: recordIdSchema,
    receiptRevision: recordIdSchema,
    receiptHash: sha256Schema,
  }).strict().optional(),
  files: z.array(z.object({
    logicalPath: safeMapBundlePathSchema,
    artifactId: z.string().regex(/^artifact:sha256:[a-f0-9]{64}$/),
    contentHash: sha256Schema,
    byteLength: z.number().int().positive().max(512 * 1024 * 1024),
    mediaType: z.enum(['application/json', 'image/png', 'image/webp']),
  }).strict()).min(3).max(4_096),
  provenance: z.array(gameAssetEvidenceReferenceSchema).min(1).max(4_096),
}).strict().superRefine((bundle, context) => {
  if ((bundle.deliveryStatus === 'accepted') !== Boolean(bundle.semanticAcceptance)) {
    addIssue(context, 'Accepted Game Map bundles require exact semantic acceptance; candidates cannot carry it.')
  }
  const paths = bundle.files.map(({ logicalPath }) => logicalPath)
  if (new Set(paths).size !== paths.length) addIssue(context, 'Game Map bundle paths must be unique.')
  for (const required of ['manifests/map.json', 'previews/map.png', 'previews/debug.png']) {
    if (!paths.includes(required)) addIssue(context, `Game Map bundle is missing ${required}.`)
  }
  if (bundle.files.some(({ artifactId, contentHash }) => artifactId !== `artifact:sha256:${contentHash}`)) {
    addIssue(context, 'Game Map bundle artifact ids must content-address their exact file hashes.')
  }
  const provenanceIdentities = bundle.provenance.map(({ id, revision }) => `${id}@${revision}`)
  if (new Set(provenanceIdentities).size !== provenanceIdentities.length) {
    addIssue(context, 'Game Map bundle provenance references must be unique.')
  }
})
export type GameMapBundle = z.infer<typeof gameMapBundleSchema>

export async function fingerprintGameMapProductionPlan(input: unknown): Promise<string> {
  return fingerprint(gameMapProductionPlanSchema.parse(input))
}

export async function fingerprintGameMapObjectLibrary(input: unknown): Promise<string> {
  return fingerprint(gameMapObjectLibrarySchema.parse(input))
}

export async function fingerprintGameMapRuntimeManifest(input: unknown): Promise<string> {
  return fingerprint(gameMapRuntimeManifestSchema.parse(input))
}

export async function fingerprintGameMapPreviewReceipt(input: unknown): Promise<string> {
  return fingerprint(gameMapPreviewReceiptSchema.parse(input))
}

export async function fingerprintGameMapBundle(input: unknown): Promise<string> {
  return fingerprint(gameMapBundleSchema.parse(input))
}

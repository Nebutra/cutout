import { canonicalJson, fingerprint } from '@/design-ir/fingerprint'
import { recordIdSchema } from '@/design-os-kernel/contracts'
import { z } from 'zod'
import {
  fingerprintGameMapObjectLibrary,
  fingerprintGameMapProductionPlan,
  fingerprintGameMapRuntimeManifest,
  gameMapObjectLibrarySchema,
  gameMapProductionPlanSchema,
  gameMapRuntimeManifestSchema,
  type GameMapObjectLibrary,
  type GameMapProductionPlan,
  type GameMapRuntimeManifest,
} from './map'

export const GAME_MAP_REPAIR_PREVIEW_PROTOCOL = 'cutout.game-map-repair-preview.v1' as const

export const gameMapRepairTargetSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('object'),
    objectId: recordIdSchema,
    expectedRevision: recordIdSchema,
  }).strict(),
  z.object({
    kind: z.literal('runtime-visual'),
    role: z.enum(['base', 'foreground', 'baked-scene', 'terrain-atlas', 'parallax-plates', 'room-chunks']),
    expectedArtifactId: recordIdSchema,
    expectedArtifactRevision: recordIdSchema,
  }).strict(),
  z.object({
    kind: z.literal('layer'),
    layerId: recordIdSchema,
  }).strict(),
  z.object({
    kind: z.literal('manifest-record'),
    section: z.enum(['placements', 'collision', 'zones', 'spawns', 'exits']),
    recordId: recordIdSchema,
  }).strict(),
])
export type GameMapRepairTarget = z.infer<typeof gameMapRepairTargetSchema>

export interface GameMapRepairClosure {
  readonly plan: GameMapProductionPlan
  readonly objectLibrary?: GameMapObjectLibrary
  readonly runtimeManifest: GameMapRuntimeManifest
}

export const gameMapRepairRequestSchema = z.object({
  target: gameMapRepairTargetSchema,
  nextObjectLibrary: gameMapObjectLibrarySchema.optional(),
  nextRuntimeManifest: gameMapRuntimeManifestSchema.optional(),
}).strict()
export type GameMapRepairRequest = z.infer<typeof gameMapRepairRequestSchema>

export interface GameMapRepairPreview {
  readonly protocol: typeof GAME_MAP_REPAIR_PREVIEW_PROTOCOL
  readonly id: string
  readonly previewHash: string
  readonly target: GameMapRepairTarget
  readonly current: {
    readonly objectLibraryHash?: string
    readonly runtimeManifestHash: string
  }
  readonly next: {
    readonly objectLibrary?: GameMapObjectLibrary
    readonly objectLibraryHash?: string
    readonly runtimeManifest: GameMapRuntimeManifest
    readonly runtimeManifestHash: string
  }
  readonly changedPaths: readonly string[]
  readonly staleDependencyPaths: readonly string[]
  readonly preservedAcceptedIdentities: readonly string[]
  readonly request: GameMapRepairRequest
}

function same(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right)
}

function assertSame(left: unknown, right: unknown, message: string): void {
  if (!same(left, right)) throw new Error(message)
}

function assertTopLevelIsolation(
  current: Readonly<Record<string, unknown>>,
  next: Readonly<Record<string, unknown>>,
  allowed: ReadonlySet<string>,
): void {
  for (const key of new Set([...Object.keys(current), ...Object.keys(next)])) {
    if (!allowed.has(key) && !same(current[key], next[key])) {
      throw new Error(`Game Map repair changed unrelated manifest field: ${key}.`)
    }
  }
}

function artifactIdentity(reference: GameMapObjectLibrary['objects'][number]['visual']['artifact']): string {
  return `${reference.id}@${reference.revision}#${reference.contentHash}`
}

function acceptedIdentities(closure: GameMapRepairClosure): readonly string[] {
  return [
    ...closure.runtimeManifest.visuals.map(({ source }) => artifactIdentity(source.artifact)),
    ...(closure.objectLibrary?.objects.map(({ visual }) => artifactIdentity(visual.artifact)) ?? []),
  ]
}

function assertStablePlan(
  plan: GameMapProductionPlan,
  library: GameMapObjectLibrary | undefined,
  manifest: GameMapRuntimeManifest,
): void {
  if (manifest.mapId !== plan.mapId || manifest.plan.id !== plan.id) {
    throw new Error('Game Map repair cannot move the runtime manifest to another plan or map.')
  }
  if (library && (library.mapId !== plan.mapId || library.plan.id !== plan.id)) {
    throw new Error('Game Map repair cannot move the object library to another plan or map.')
  }
}

function assertCurrentClosure(
  closure: GameMapRepairClosure,
  planHash: string,
  libraryHash: string | undefined,
): void {
  const { plan, objectLibrary: library, runtimeManifest: manifest } = closure
  assertStablePlan(plan, library, manifest)
  if (manifest.plan.id !== plan.id || manifest.plan.contentHash !== planHash
    || manifest.mode !== plan.mode || manifest.playable !== plan.playable
    || !same(manifest.world, plan.world)
    || !same(manifest.coordinateSystem, plan.coordinateSystem)
    || !same(manifest.camera, plan.camera)) {
    throw new Error('Game Map repair requires the exact current production-plan closure.')
  }
  if (library) {
    if (!libraryHash || library.plan.id !== plan.id || library.plan.contentHash !== planHash
      || library.mapId !== plan.mapId || !manifest.objectLibrary
      || manifest.objectLibrary.id !== library.id
      || manifest.objectLibrary.revision !== library.revision
      || manifest.objectLibrary.contentHash !== libraryHash) {
      throw new Error('Game Map repair requires the exact current object-library closure.')
    }
  } else if (manifest.objectLibrary) {
    throw new Error('Game Map repair cannot omit the current object library.')
  }
}

function replaceOneById(
  current: readonly { readonly id: string }[],
  next: readonly { readonly id: string }[],
  targetId: string,
  label: string,
): void {
  if (current.length !== next.length
    || current.some((value, index) => value.id !== next[index]?.id)) {
    throw new Error(`Game Map ${label} repair must preserve record order and identity closure.`)
  }
  let changes = 0
  current.forEach((value, index) => {
    const candidate = next[index]!
    if (value.id === targetId) {
      if (!same(value, candidate)) changes += 1
    } else {
      assertSame(value, candidate, `Game Map ${label} repair changed unrelated record ${value.id}.`)
    }
  })
  if (changes !== 1) throw new Error(`Game Map ${label} repair must change exactly ${targetId}.`)
}

function projectRepair(
  closure: GameMapRepairClosure,
  request: GameMapRepairRequest,
): {
  readonly objectLibrary?: GameMapObjectLibrary
  readonly runtimeManifest: GameMapRuntimeManifest
  readonly changedPaths: readonly string[]
  readonly staleDependencyPaths: readonly string[]
  readonly preservedAcceptedIdentities: readonly string[]
} {
  const currentLibrary = closure.objectLibrary
  const currentManifest = closure.runtimeManifest
  const preserved = new Set(acceptedIdentities(closure))
  const target = request.target

  switch (target.kind) {
    case 'object': {
      if (!currentLibrary || !request.nextObjectLibrary || request.nextRuntimeManifest) {
        throw new Error('Object repair requires one successor object library and no manifest replacement.')
      }
      const nextLibrary = gameMapObjectLibrarySchema.parse(request.nextObjectLibrary)
      assertTopLevelIsolation(currentLibrary, nextLibrary, new Set(['revision', 'objects']))
      if (nextLibrary.revision === currentLibrary.revision) {
        throw new Error('Object repair requires a new object-library revision.')
      }
      replaceOneById(currentLibrary.objects, nextLibrary.objects, target.objectId, 'object')
      const currentObject = currentLibrary.objects.find(({ id }) => id === target.objectId)
      const nextObject = nextLibrary.objects.find(({ id }) => id === target.objectId)
      if (!currentObject || !nextObject || currentObject.revision !== target.expectedRevision
        || nextObject.revision === currentObject.revision) {
        throw new Error('Object repair target revision is stale or unchanged.')
      }
      if (!same(currentObject.visual.artifact, nextObject.visual.artifact)) {
        preserved.delete(artifactIdentity(currentObject.visual.artifact))
      }
      const dependentPlacements = currentManifest.placements
        .filter(({ objectId }) => objectId === target.objectId)
        .map(({ id }) => `runtimeManifest.placements[${id}]`)
      return {
        objectLibrary: nextLibrary,
        runtimeManifest: currentManifest,
        changedPaths: [`objectLibrary.objects[${target.objectId}]`],
        staleDependencyPaths: [
          'runtimeManifest.objectLibrary',
          ...dependentPlacements,
          'preview',
          'bundle',
        ],
        preservedAcceptedIdentities: [...preserved],
      }
    }
    case 'runtime-visual': {
      if (!request.nextRuntimeManifest || request.nextObjectLibrary) {
        throw new Error('Runtime visual repair requires one successor manifest and no object-library replacement.')
      }
      const nextManifest = gameMapRuntimeManifestSchema.parse(request.nextRuntimeManifest)
      assertTopLevelIsolation(currentManifest, nextManifest, new Set(['revision', 'visuals', 'layers']))
      if (nextManifest.revision === currentManifest.revision
        || currentManifest.visuals.length !== nextManifest.visuals.length) {
        throw new Error('Runtime visual repair requires a new manifest revision and stable visual closure.')
      }
      const index = currentManifest.visuals.findIndex(({ role }) => role === target.role)
      if (index < 0 || currentManifest.visuals.some(({ role }, candidate) => role !== nextManifest.visuals[candidate]?.role)) {
        throw new Error('Runtime visual repair must preserve visual role order.')
      }
      currentManifest.visuals.forEach((visual, candidate) => {
        if (candidate !== index) {
          assertSame(visual, nextManifest.visuals[candidate], `Runtime visual repair changed unrelated role ${visual.role}.`)
        }
      })
      const currentVisual = currentManifest.visuals[index]!
      const nextVisual = nextManifest.visuals[index]!
      if (currentVisual.source.artifact.id !== target.expectedArtifactId
        || currentVisual.source.artifact.revision !== target.expectedArtifactRevision
        || same(currentVisual, nextVisual)) {
        throw new Error('Runtime visual repair target is stale or unchanged.')
      }
      if (nextVisual.source.artifact.id !== `artifact:sha256:${nextVisual.source.artifact.contentHash}`
        || nextVisual.source.artifact.id === currentVisual.source.artifact.id
        || nextVisual.source.artifact.revision === currentVisual.source.artifact.revision
        || nextVisual.source.artifact.contentHash === currentVisual.source.artifact.contentHash
        || same(nextVisual.source.acceptance, currentVisual.source.acceptance)) {
        throw new Error('Runtime visual repair requires a newly accepted content-addressed artifact revision.')
      }
      const dependentLayerPaths: string[] = []
      currentManifest.layers.forEach((layer, layerIndex) => {
        const nextLayer = nextManifest.layers[layerIndex]
        if (!nextLayer || nextLayer.id !== layer.id || nextLayer.kind !== layer.kind) {
          throw new Error('Runtime visual repair must preserve layer order, identity, and kind.')
        }
        if (layer.sourceId === currentVisual.source.artifact.id) {
          assertSame(
            { ...layer, sourceId: nextVisual.source.artifact.id },
            nextLayer,
            `Runtime visual repair changed dependent layer ${layer.id} beyond its source identity.`,
          )
          dependentLayerPaths.push(`runtimeManifest.layers[${layer.id}]`)
        } else {
          assertSame(layer, nextLayer, `Runtime visual repair changed unrelated layer ${layer.id}.`)
        }
      })
      if (!dependentLayerPaths.length) {
        throw new Error('Runtime visual repair has no exact dependent layer.')
      }
      preserved.delete(artifactIdentity(currentVisual.source.artifact))
      return {
        objectLibrary: currentLibrary,
        runtimeManifest: nextManifest,
        changedPaths: [`runtimeManifest.visuals[${target.role}]`, ...dependentLayerPaths],
        staleDependencyPaths: ['preview', 'bundle'],
        preservedAcceptedIdentities: [...preserved],
      }
    }
    case 'layer': {
      if (!request.nextRuntimeManifest || request.nextObjectLibrary) {
        throw new Error('Layer repair requires one successor manifest and no object-library replacement.')
      }
      const nextManifest = gameMapRuntimeManifestSchema.parse(request.nextRuntimeManifest)
      assertTopLevelIsolation(currentManifest, nextManifest, new Set(['revision', 'layers']))
      if (nextManifest.revision === currentManifest.revision) {
        throw new Error('Layer repair requires a new runtime-manifest revision.')
      }
      replaceOneById(currentManifest.layers, nextManifest.layers, target.layerId, 'layer')
      return {
        objectLibrary: currentLibrary,
        runtimeManifest: nextManifest,
        changedPaths: [`runtimeManifest.layers[${target.layerId}]`],
        staleDependencyPaths: ['preview', 'bundle'],
        preservedAcceptedIdentities: [...preserved],
      }
    }
    case 'manifest-record': {
      if (!request.nextRuntimeManifest || request.nextObjectLibrary) {
        throw new Error('Manifest record repair requires one successor manifest and no object-library replacement.')
      }
      const nextManifest = gameMapRuntimeManifestSchema.parse(request.nextRuntimeManifest)
      assertTopLevelIsolation(currentManifest, nextManifest, new Set(['revision', target.section]))
      if (nextManifest.revision === currentManifest.revision) {
        throw new Error('Manifest record repair requires a new runtime-manifest revision.')
      }
      replaceOneById(
        currentManifest[target.section],
        nextManifest[target.section],
        target.recordId,
        target.section,
      )
      return {
        objectLibrary: currentLibrary,
        runtimeManifest: nextManifest,
        changedPaths: [`runtimeManifest.${target.section}[${target.recordId}]`],
        staleDependencyPaths: ['preview', 'bundle'],
        preservedAcceptedIdentities: [...preserved],
      }
    }
  }
}

export async function previewGameMapRepair(
  value: GameMapRepairClosure,
  request: GameMapRepairRequest,
): Promise<GameMapRepairPreview> {
  const decodedRequest = gameMapRepairRequestSchema.parse(request)
  const closure = {
    plan: gameMapProductionPlanSchema.parse(value.plan),
    objectLibrary: value.objectLibrary
      ? gameMapObjectLibrarySchema.parse(value.objectLibrary)
      : undefined,
    runtimeManifest: gameMapRuntimeManifestSchema.parse(value.runtimeManifest),
  }
  const [planHash, currentLibraryHash, currentManifestHash] = await Promise.all([
    fingerprintGameMapProductionPlan(closure.plan),
    closure.objectLibrary ? fingerprintGameMapObjectLibrary(closure.objectLibrary) : undefined,
    fingerprintGameMapRuntimeManifest(closure.runtimeManifest),
  ])
  assertCurrentClosure(closure, planHash, currentLibraryHash)
  const projected = projectRepair(closure, decodedRequest)
  assertStablePlan(closure.plan, projected.objectLibrary, projected.runtimeManifest)
  const [nextLibraryHash, nextManifestHash] = await Promise.all([
    projected.objectLibrary ? fingerprintGameMapObjectLibrary(projected.objectLibrary) : undefined,
    fingerprintGameMapRuntimeManifest(projected.runtimeManifest),
  ])
  const body = {
    protocol: GAME_MAP_REPAIR_PREVIEW_PROTOCOL,
    target: decodedRequest.target,
    current: {
      ...(currentLibraryHash ? { objectLibraryHash: currentLibraryHash } : {}),
      runtimeManifestHash: currentManifestHash,
    },
    next: {
      ...(projected.objectLibrary
        ? { objectLibrary: projected.objectLibrary, objectLibraryHash: nextLibraryHash }
        : {}),
      runtimeManifest: projected.runtimeManifest,
      runtimeManifestHash: nextManifestHash,
    },
    changedPaths: projected.changedPaths,
    staleDependencyPaths: projected.staleDependencyPaths,
    preservedAcceptedIdentities: projected.preservedAcceptedIdentities,
    request: decodedRequest,
  }
  const previewHash = await fingerprint(body)
  return {
    ...body,
    id: `game-map-repair-preview:sha256:${previewHash}`,
    previewHash,
  }
}

export async function applyGameMapRepairPreview(
  current: GameMapRepairClosure,
  preview: GameMapRepairPreview,
): Promise<GameMapRepairClosure> {
  const replay = await previewGameMapRepair(current, preview.request)
  if (!same(replay, preview)) {
    throw new Error('Game Map repair preview is stale or has been changed since review.')
  }
  return {
    plan: gameMapProductionPlanSchema.parse(current.plan),
    ...(preview.next.objectLibrary
      ? { objectLibrary: gameMapObjectLibrarySchema.parse(preview.next.objectLibrary) }
      : {}),
    runtimeManifest: gameMapRuntimeManifestSchema.parse(preview.next.runtimeManifest),
  }
}

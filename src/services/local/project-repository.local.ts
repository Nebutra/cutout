import type { Box } from '@/algorithm/types'
import type {
  DesignMarkdownAsset,
  Params,
  ProjectRestoreInput,
  SliceInput,
  Store,
} from '@/store/types'
import {
  isWorkspaceSnapshotEmpty,
  type WorkspaceSnapshot,
} from '@/workspace/workspace-snapshot'
import { DEFAULT_PARAMS } from '@/store/slices/params'
import {
  emptyAssetProductionSnapshot,
  migrateLegacySlicesToAssetProduction,
  type AssetProductionSnapshot,
} from '@/asset-production'
import { bytesToBlob, decodeImage } from '@/lib/image'
import { resolveSourceMaterial } from '@/store/source-material'
import { err, ok, type Result } from '@/services/types'
import { ContentAddressedDesktopArtifactStore } from '@/services/content-addressed-desktop-artifacts'
import {
  designDocumentToWorkspaceSnapshot,
  fingerprint,
  migrateWorkspaceV1,
  projectRecordToDesignDocument,
  validateDesignDocument,
  type ContentReference,
  type ContentResolver,
  type DesignDocument,
} from '@/design-ir'
import { openDb, promisify, txDone } from './idb'

const DB_NAME = 'cutout-projects'
const DB_VERSION = 1
const STORE = 'projects'

export type LocalProjectStatus = 'Empty' | 'Draft' | 'Running' | 'Ready'

export interface LocalProjectSummary {
  readonly id: string
  readonly name: string
  readonly brief: string
  readonly assetCount: number
  readonly hasDesignMarkdown: boolean
  readonly status: LocalProjectStatus
  readonly createdAt: number
  readonly updatedAt: number
  readonly archivedAt?: number
  readonly pinnedAt?: number
  readonly metadataUpdatedAt?: number
  readonly customName?: string
  readonly thumbnail?: Blob
}

interface StoredImage {
  readonly name: string
  readonly blob: Blob
  readonly width: number
  readonly height: number
}

interface StoredSlice {
  readonly id: string
  readonly index: number
  readonly name: string
  readonly box: Box
  readonly blob: Blob
  readonly width: number
  readonly height: number
  readonly included?: boolean
  readonly confidence?: number | null
  readonly reviewIssues?: readonly string[]
  /** page⊃region⊃slice linkage from the per-region breakdown; null for legacy/flat slices. */
  readonly regionId?: string | null
  readonly pageId?: string | null
  readonly assetManifestItemId?: string | null
  readonly productionTaskId?: string | null
  readonly productionRunId?: string | null
  readonly outputArtifactId?: string | null
  readonly readiness?: SliceInput['readiness']
}

export interface LocalProjectRecord extends LocalProjectSummary {
  readonly params: Params
  readonly sourceImageId?: string
  readonly source?: StoredImage
  readonly mockup?: StoredImage
  readonly designMarkdown: DesignMarkdownAsset | null
  readonly workspace: WorkspaceSnapshot | null
  readonly slices: readonly StoredSlice[]
  /** Versioned slicing authority. Older records omit it and migrate additively. */
  readonly assetProduction?: AssetProductionSnapshot
  /** Optional canonical IR. Old IndexedDB records omit it safely. */
  readonly designDocument?: DesignDocument
  /** Stable IR content hash, excluding projection timestamps. */
  readonly designDocumentContentHash?: string
}

export interface LocalProjectRepository {
  list(): Promise<Result<LocalProjectSummary[]>>
  load(id: string): Promise<Result<LocalProjectRecord>>
  save(record: LocalProjectRecord): Promise<Result<void>>
  archive(id: string, archivedAt: number | null): Promise<Result<LocalProjectRecord>>
  updateMetadata(
    id: string,
    patch: {
      readonly expectedMetadataUpdatedAt: number
      readonly name?: string
      readonly pinnedAt?: number | null
    },
  ): Promise<Result<LocalProjectRecord>>
  remove(id: string): Promise<Result<void>>
}

export interface LocalProjectRepositoryOptions {
  readonly idb?: IDBFactory
}

function openProjectsDb(factory: IDBFactory): Promise<IDBDatabase> {
  return openDb(factory, DB_NAME, DB_VERSION, (db) => {
    if (!db.objectStoreNames.contains(STORE)) {
      const store = db.createObjectStore(STORE, { keyPath: 'id' })
      store.createIndex('updatedAt', 'updatedAt')
    }
  })
}

export function createLocalProjectRepository(
  options: LocalProjectRepositoryOptions = {},
): LocalProjectRepository {
  const idb = options.idb ?? globalThis.indexedDB

  async function list(): Promise<Result<LocalProjectSummary[]>> {
    if (!idb) return ok([])
    try {
      const db = await openProjectsDb(idb)
      try {
        const tx = db.transaction(STORE, 'readonly')
        const records = await promisify(
          tx.objectStore(STORE).getAll() as IDBRequest<LocalProjectRecord[]>,
        )
        return ok(
          records
            .map(toSummary)
            .sort((a, b) => b.updatedAt - a.updatedAt),
        )
      } finally {
        db.close()
      }
    } catch (error) {
      return err(errorMessage(error))
    }
  }

  async function load(id: string): Promise<Result<LocalProjectRecord>> {
    if (!idb) return err(`Project storage is unavailable.`)
    try {
      const db = await openProjectsDb(idb)
      try {
        const tx = db.transaction(STORE, 'readonly')
        const record = await promisify(
          tx.objectStore(STORE).get(id) as IDBRequest<
            LocalProjectRecord | undefined
          >,
        )
        if (!record) return err(`Project "${id}" was not found.`)
        const normalized = await normalizeProjectRecord(record, idb)
        if (normalized.didChange) await writeRecord(idb, normalized.record)
        return ok(normalized.record)
      } finally {
        db.close()
      }
    } catch (error) {
      return err(errorMessage(error))
    }
  }

  async function save(record: LocalProjectRecord): Promise<Result<void>> {
    if (!idb) return err(`Project storage is unavailable.`)
    try {
      const normalized = await normalizeProjectRecord(record, idb)
      await writeRecord(idb, normalized.record)
      return ok(undefined)
    } catch (error) {
      return err(errorMessage(error))
    }
  }

  async function archive(
    id: string,
    archivedAt: number | null,
  ): Promise<Result<LocalProjectRecord>> {
    if (!idb) return err(`Project storage is unavailable.`)
    try {
      const db = await openProjectsDb(idb)
      try {
        const tx = db.transaction(STORE, 'readwrite')
        const store = tx.objectStore(STORE)
        const record = await promisify(
          store.get(id) as IDBRequest<LocalProjectRecord | undefined>,
        )
        if (!record) return err(`Project "${id}" was not found.`)
        const updated: LocalProjectRecord = {
          ...record,
          archivedAt: archivedAt ?? undefined,
          pinnedAt: archivedAt === null ? record.pinnedAt : undefined,
        }
        store.put(updated)
        await txDone(tx)
        return ok(updated)
      } finally {
        db.close()
      }
    } catch (error) {
      return err(errorMessage(error))
    }
  }

  async function remove(id: string): Promise<Result<void>> {
    if (!idb) return err(`Project storage is unavailable.`)
    try {
      const db = await openProjectsDb(idb)
      try {
        const tx = db.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).delete(id)
        await txDone(tx)
      } finally {
        db.close()
      }
      return ok(undefined)
    } catch (error) {
      return err(errorMessage(error))
    }
  }

  async function updateMetadata(
    id: string,
    patch: {
      readonly expectedMetadataUpdatedAt: number
      readonly name?: string
      readonly pinnedAt?: number | null
    },
  ): Promise<Result<LocalProjectRecord>> {
    if (!idb) return err(`Project storage is unavailable.`)
    try {
      const db = await openProjectsDb(idb)
      try {
        const tx = db.transaction(STORE, 'readwrite')
        const store = tx.objectStore(STORE)
        const record = await promisify(
          store.get(id) as IDBRequest<LocalProjectRecord | undefined>,
        )
        if (!record) return err(`Project "${id}" was not found.`)
        if ((record.metadataUpdatedAt ?? 0) !== patch.expectedMetadataUpdatedAt) {
          return err('Project changed since this menu was opened. Reload and try again.')
        }
        const name = patch.name === undefined ? record.name : patch.name.trim()
        if (!name) return err('Project name cannot be empty.')
        const updated: LocalProjectRecord = {
          ...record,
          name,
          customName: patch.name === undefined ? record.customName : name,
          pinnedAt: patch.pinnedAt === undefined
            ? record.pinnedAt
            : patch.pinnedAt ?? undefined,
          metadataUpdatedAt: Date.now(),
        }
        store.put(updated)
        await txDone(tx)
        return ok(updated)
      } finally {
        db.close()
      }
    } catch (error) {
      return err(errorMessage(error))
    }
  }

  return { list, load, save, archive, updateMetadata, remove }
}

export function createEmptyProjectRecord(now = Date.now()): LocalProjectRecord {
  return {
    id: crypto.randomUUID(),
    name: 'Untitled project',
    brief: '',
    assetCount: 0,
    hasDesignMarkdown: false,
    status: 'Empty',
    createdAt: now,
    updatedAt: now,
    archivedAt: undefined,
    params: DEFAULT_PARAMS,
    designMarkdown: null,
    workspace: null,
    slices: [],
    assetProduction: emptyAssetProductionSnapshot(),
  }
}

export async function createProjectRecordFromStore(input: {
  readonly id: string
  readonly createdAt: number
  readonly state: Store
  readonly previous?: LocalProjectRecord
  readonly now?: number
}): Promise<LocalProjectRecord> {
  const now = input.now ?? Date.now()
  const state = input.state
  const workspace = state.workspaceSnapshot && !isWorkspaceSnapshotEmpty(state.workspaceSnapshot)
    ? state.workspaceSnapshot
    : null
  const source = state.source.bitmap
    ? input.previous?.source && input.previous.sourceImageId === state.source.imageId
      ? input.previous.source
      : await storedSourceFromState(state.source)
    : undefined
  const mockup = state.mockup
    ? {
        name: 'mockup',
        blob: state.mockup.blob,
        width: state.mockup.width,
        height: state.mockup.height,
      }
    : undefined
  const slices = state.analysis.slices.map((slice) => ({
    id: slice.id,
    index: slice.index,
    name: slice.name,
    box: slice.box,
    blob: slice.blob,
    width: slice.width,
    height: slice.height,
    included: slice.included,
    confidence: slice.confidence,
    reviewIssues: slice.reviewIssues,
    regionId: slice.regionId,
    pageId: slice.pageId,
    assetManifestItemId: slice.assetManifestItemId,
    productionTaskId: slice.productionTaskId,
    productionRunId: slice.productionRunId,
    outputArtifactId: slice.outputArtifactId,
    readiness: slice.readiness,
  }))
  const brief = state.brief.trim()
  const assetProduction = Object.keys(state.assetProduction.runs).length > 0
    ? state.assetProduction
    : await migrateLegacySlicesToAssetProduction({
        projectId: input.id,
        projectRevisionId:
          state.workspaceSnapshot?.designDocument?.revision.id
          ?? input.previous?.designDocument?.revision.id
          ?? `project-revision:${input.id}`,
        slices,
        createdAt: input.createdAt,
      })
  const thumbnail =
    slices[0]?.blob ??
    mockup?.blob ??
    source?.blob ??
    workspaceThumbnail(workspace)

  const record: LocalProjectRecord = {
    id: input.id,
    name: input.previous?.customName ?? projectNameFromSources(
        workspace?.prototypePlan?.product.projectName,
        workspace?.prototypePlan?.product.name,
        brief,
      ),
    brief,
    assetCount: slices.length,
    hasDesignMarkdown: Boolean(state.designMarkdown || workspace?.prototypeDesignSystem),
    status: projectStatusFromStore(state, workspace),
    createdAt: input.createdAt,
    updatedAt: now,
    archivedAt: input.previous?.archivedAt,
    pinnedAt: input.previous?.pinnedAt,
    metadataUpdatedAt: input.previous?.metadataUpdatedAt,
    customName: input.previous?.customName,
    thumbnail,
    params: state.params,
    sourceImageId: state.source.imageId || undefined,
    source,
    mockup,
    designMarkdown: state.designMarkdown,
    workspace,
    slices,
    assetProduction,
  }
  const designDocument = await projectRecordToDesignDocument(record)
  const workspaceWithDesignDocument = workspace
    ? { ...workspace, designDocument }
    : null
  return {
    ...record,
    workspace: workspaceWithDesignDocument,
    designDocument,
    designDocumentContentHash: await designDocumentContentFingerprint(designDocument),
  }
}

export async function createRestoreInputFromProject(
  record: LocalProjectRecord,
): Promise<ProjectRestoreInput> {
  // Non-repository callers still receive the canonical IR projection first.
  record = (await normalizeProjectRecord(record)).record
  // A stale or partially-written image must not prevent the project shell from
  // opening. The project state and every other persisted artifact remain
  // useful, and the next autosave removes the missing visual reference.
  const source = await restoreStoredSource(record.source)
  const mockup = await restoreStoredMockup(record.mockup)

  return {
    brief: record.brief,
    params: record.params,
    source,
    mockup,
    designMarkdown: record.designMarkdown,
    workspace: record.workspace ?? null,
    assetProduction: record.assetProduction ?? emptyAssetProductionSnapshot(),
    slices: record.slices,
  }
}

async function restoreStoredSource(
  source: StoredImage | undefined,
): Promise<ProjectRestoreInput['source']> {
  if (!source) return undefined
  try {
    return {
      name: source.name,
      bitmap: await decodeImage(source.blob),
      encodedImage: source.blob,
    }
  } catch {
    return undefined
  }
}

async function storedSourceFromState(source: Store['source']): Promise<StoredImage> {
  const material = await resolveSourceMaterial(source)
  return {
    name: source.name || 'source',
    blob: bytesToBlob(material.bytes, material.mediaType),
    width: source.width,
    height: source.height,
  }
}

async function restoreStoredMockup(
  mockup: StoredImage | undefined,
): Promise<ProjectRestoreInput['mockup']> {
  if (!mockup) return null
  try {
    return {
      blob: mockup.blob,
      bitmap: await decodeImage(mockup.blob),
      width: mockup.width,
      height: mockup.height,
    }
  } catch {
    return null
  }
}

/**
 * Stable identity for meaningful Design IR content. Projection/import timestamps
 * are deliberately excluded, so a hash change always represents a real project
 * change rather than an autosave tick.
 */
export async function designDocumentContentFingerprint(
  document: DesignDocument,
): Promise<string> {
  const content = {
    ...document,
    meta: { ...document.meta, createdAt: '', updatedAt: '' },
    revision: { ...document.revision, createdAt: '' },
    provenance: document.provenance.map((entry) => ({ ...entry, recordedAt: '' })),
    materials: document.materials.map((material) => ({
      ...material,
      revisions: material.revisions.map((revision) => ({
        ...revision,
        createdAt: '',
      })),
    })),
  }
  // Zod's optional fields can be represented as explicit `undefined` by an
  // adapter. Canonical JSON correctly rejects that transport-only shape, so
  // strip it before hashing while preserving every serializable IR field.
  return fingerprint(JSON.parse(JSON.stringify(content)))
}

interface NormalizedProjectRecord {
  readonly record: LocalProjectRecord
  readonly didChange: boolean
}

/**
 * Adds optional IR data to a schemaless IndexedDB record without changing its
 * object-store version. The migration is idempotent: after a successful write,
 * the next load returns the same document, content hash, and workspace.
 */
async function normalizeProjectRecord(
  input: LocalProjectRecord,
  idb: IDBFactory | undefined = globalThis.indexedDB,
): Promise<NormalizedProjectRecord> {
  const materialized = await materializeProjectSliceBlobs(input, idb)
  const migratedWorkspace = materialized.workspace
    ? migrateWorkspaceV1(materialized.workspace)
    : null
  let record: LocalProjectRecord = migratedWorkspace
    ? { ...materialized, workspace: migratedWorkspace }
    : materialized
  let didChange = materialized !== input || workspaceWasMigrated(input.workspace)
  if (!record.assetProduction) {
    record = {
      ...record,
      assetProduction: await migrateLegacySlicesToAssetProduction({
        projectId: record.id,
        projectRevisionId: record.designDocument?.revision.id ?? `project-revision:${record.id}`,
        slices: record.slices,
        createdAt: record.createdAt,
      }),
    }
    didChange = true
  }
  const validated = input.designDocument
    ? validateDesignDocument(input.designDocument)
    : null

  if (validated?.ok) {
    const projection = await designDocumentToWorkspaceSnapshot(
      validated.data.document,
      await createLegacyContentResolver(record),
    )
    if (projection.ok) {
      const workspace = mergeWorkspaceProjection(record.workspace, projection.data.snapshot)
      const projectedMarkdown = projection.data.designMarkdown
      // Design IR deliberately carries portable content, not the UI-only import
      // timestamp. Preserve it when the material did not change; otherwise use
      // the persisted record time as a deterministic migration timestamp.
      const designMarkdown = projectedMarkdown
        ? {
            ...projectedMarkdown,
            importedAt: sameDesignMarkdown(projectedMarkdown, record.designMarkdown)
              ? record.designMarkdown?.importedAt ?? record.updatedAt
              : record.updatedAt,
          }
        : record.designMarkdown
      if (
        !sameRepresentableWorkspace(workspace, record.workspace)
        || !sameDesignMarkdown(designMarkdown, record.designMarkdown)
      ) {
        record = { ...record, workspace, designMarkdown }
        didChange = true
      }
      const contentHash = await designDocumentContentFingerprint(validated.data.document)
      if (record.designDocumentContentHash !== contentHash) {
        record = {
          ...record,
          designDocument: validated.data.document,
          designDocumentContentHash: contentHash,
        }
        didChange = true
      }
      return { record, didChange }
    }

    // A valid portable IR may intentionally reference content that this local
    // IndexedDB adapter cannot resolve yet (for example a repo or cloud URI).
    // Preserve it rather than overwriting it with a lossy legacy projection.
    // Legacy URIs are different: their bytes are expected to live in this
    // record, so an unresolved one means the old fields changed and must be
    // reprojected to refresh their content hashes.
    if (!designDocumentUsesLegacyContent(validated.data.document, record.id)) {
      const contentHash = await designDocumentContentFingerprint(validated.data.document)
      if (record.designDocumentContentHash !== contentHash) {
        record = {
          ...record,
          designDocument: validated.data.document,
          designDocumentContentHash: contentHash,
        }
        didChange = true
      }
      return { record, didChange }
    }
  }

  // Invalid or unresolvable IR must never strand a legacy project. Its older
  // workspace/blob record is still recoverable, so re-project and backfill it.
  const designDocument = await projectRecordToDesignDocument(record)
  return {
    record: {
      ...record,
      designDocument,
      designDocumentContentHash: await designDocumentContentFingerprint(designDocument),
    },
    didChange: true,
  }
}

async function materializeProjectSliceBlobs(
  record: LocalProjectRecord,
  idb: IDBFactory | undefined,
): Promise<LocalProjectRecord> {
  const missing = record.slices.filter((slice) => !(slice.blob instanceof Blob))
  if (missing.length === 0) return record
  if (!idb) throw new Error('Artifact storage is unavailable for slice recovery.')
  const artifacts = new ContentAddressedDesktopArtifactStore(idb)
  const slices = await Promise.all(record.slices.map(async (slice) => {
    if (slice.blob instanceof Blob) return slice
    const artifactId = slice.outputArtifactId ?? productionArtifactIdForSlice(record, slice)
    if (!artifactId) {
      throw new Error(`Slice "${slice.id}" has no recoverable production artifact.`)
    }
    const artifact = await artifacts.read(artifactId)
    if (!artifact || artifact.bytes.byteLength === 0) {
      throw new Error(`Slice artifact is unavailable: ${artifactId}`)
    }
    return {
      ...slice,
      blob: bytesToBlob(artifact.bytes, artifact.mediaType),
    }
  }))
  return { ...record, slices }
}

function productionArtifactIdForSlice(
  record: LocalProjectRecord,
  slice: LocalProjectRecord['slices'][number],
): string | undefined {
  const snapshot = record.assetProduction
  if (!snapshot) return undefined
  for (const run of Object.values(snapshot.runs)) {
    if (slice.productionRunId && run.runId !== slice.productionRunId) continue
    const plan = snapshot.plans[run.planId]
    const task = plan?.tasks.find((candidate) =>
      slice.productionTaskId
        ? candidate.taskId === slice.productionTaskId
        : candidate.manifestItemId === (slice.assetManifestItemId ?? `legacy:${slice.id}`),
    )
    if (!task) continue
    const state = run.tasks[task.taskId]
    const artifact = state?.output ?? state?.candidate
    if (artifact) return artifact.artifactId
  }
  return undefined
}

function workspaceWasMigrated(workspace: WorkspaceSnapshot | null): boolean {
  if (!workspace) return false
  return (
    workspace.workflowPhase === undefined
    || workspace.prototypePlan === undefined
    || workspace.prototypeScope === undefined
    || workspace.humanLoopChoiceId === undefined
    || workspace.humanLoopCustomAnswer === undefined
    || workspace.prototypeDesignSystem === undefined
    || workspace.prototypePages === undefined
    || workspace.selectedPrototypePageId === undefined
    || workspace.runError === undefined
    || workspace.namingStatus === undefined
    || workspace.liveAgentOutput === undefined
    || workspace.attachments === undefined
    || workspace.webSearchEnabled === undefined
  )
}

function mergeWorkspaceProjection(
  legacy: WorkspaceSnapshot | null,
  projected: WorkspaceSnapshot,
): WorkspaceSnapshot {
  const base = legacy ?? projected
  return {
    ...base,
    prototypePlan: projected.prototypePlan,
    prototypeDesignSystem: projected.prototypeDesignSystem,
    prototypePages: projected.prototypePages,
    attachments: projected.attachments,
  }
}

/**
 * Content bytes are verified against IR SHA-256 references before this point;
 * compare their metadata here together with the complete representable plan so
 * a route/region/name-only change is still persisted on the first load.
 */
function sameRepresentableWorkspace(
  left: WorkspaceSnapshot,
  right: WorkspaceSnapshot | null,
): boolean {
  const describe = (workspace: WorkspaceSnapshot | null) => workspace
    ? {
        plan: workspace.prototypePlan,
        designSystem: workspace.prototypeDesignSystem
          ? {
              name: workspace.prototypeDesignSystem.name,
              designMarkdown: workspace.prototypeDesignSystem.designMarkdown,
              mediaType: workspace.prototypeDesignSystem.mediaType,
              width: workspace.prototypeDesignSystem.width,
              height: workspace.prototypeDesignSystem.height,
              bytes: workspace.prototypeDesignSystem.bytes.byteLength,
            }
          : null,
        pages: workspace.prototypePages.map((page) => ({
          page: page.page,
          mediaType: page.mediaType,
          width: page.width,
          height: page.height,
          bytes: page.bytes.byteLength,
        })),
        attachments: workspace.attachments.map((attachment) => ({
          id: attachment.id,
          name: attachment.name,
          mediaType: attachment.mediaType,
          bytes: attachment.bytes.byteLength,
        })),
      }
    : null
  return JSON.stringify(describe(left)) === JSON.stringify(describe(right))
}

function sameDesignMarkdown(
  left: Pick<DesignMarkdownAsset, 'name' | 'content'> | null,
  right: Pick<DesignMarkdownAsset, 'name' | 'content'> | null,
): boolean {
  return left?.name === right?.name && left?.content === right?.content
}

async function createLegacyContentResolver(
  record: LocalProjectRecord,
): Promise<ContentResolver> {
  const content = new Map<string, Uint8Array>()
  const add = (path: string, bytes: Uint8Array) => {
    content.set(legacyContentUri(record.id, path), bytes)
  }
  add('brief', new TextEncoder().encode(record.brief))

  const system = record.workspace?.prototypeDesignSystem
  if (system) {
    add('workspace/design-system/image', system.bytes)
    add(
      'workspace/DESIGN.md',
      new TextEncoder().encode(record.designMarkdown?.content ?? system.designMarkdown),
    )
  } else if (record.designMarkdown) {
    add('workspace/DESIGN.md', new TextEncoder().encode(record.designMarkdown.content))
  }
  for (const page of record.workspace?.prototypePages ?? []) {
    add(`workspace/pages/${page.page.id}`, page.bytes)
  }
  for (const attachment of record.workspace?.attachments ?? []) {
    add(`attachments/${attachment.id}`, attachment.bytes)
  }

  const blobs = await Promise.all(record.slices.map(async (slice) => ({
    path: `slices/${slice.id}`,
    bytes: new Uint8Array(await slice.blob.arrayBuffer()),
  })))
  for (const item of blobs) add(item.path, item.bytes)

  return {
    resolveContent(reference: ContentReference) {
      return content.get(reference.uri)
    },
  }
}

function legacyContentUri(projectId: string, path: string): string {
  return `cutout://legacy/${encodeURIComponent(projectId)}/${path
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`
}

function designDocumentUsesLegacyContent(
  document: DesignDocument,
  projectId: string,
): boolean {
  const prefix = `cutout://legacy/${encodeURIComponent(projectId)}/`
  return [
    ...document.sources.flatMap((source) => source.content),
    ...document.materials.flatMap((material) =>
      material.revisions.map((revision) => revision.content),
    ),
  ].some((reference) => reference.uri.startsWith(prefix))
}

async function writeRecord(idb: IDBFactory, record: LocalProjectRecord): Promise<void> {
  const db = await openProjectsDb(idb)
  try {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(record)
    await txDone(tx)
  } finally {
    db.close()
  }
}

function toSummary(record: LocalProjectRecord): LocalProjectSummary {
  return {
    id: record.id,
    name: record.name,
    brief: record.brief,
    assetCount: record.assetCount,
    hasDesignMarkdown: record.hasDesignMarkdown,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    archivedAt: record.archivedAt,
    pinnedAt: record.pinnedAt,
    metadataUpdatedAt: record.metadataUpdatedAt,
    customName: record.customName,
    thumbnail: record.thumbnail,
  }
}

function projectStatusFromStore(
  state: Store,
  workspace: WorkspaceSnapshot | null,
): LocalProjectStatus {
  if (
    state.genPhase !== 'idle' ||
    state.analysis.status === 'running' ||
    workspace?.workflowPhase === 'planning' ||
    workspace?.workflowPhase === 'design-system' ||
    workspace?.workflowPhase === 'generating-suite' ||
    workspace?.namingStatus === 'pending' ||
    workspace?.namingStatus === 'running'
  ) {
    return 'Running'
  }
  if (workspace?.outcome?.status === 'ready-to-deliver') {
    return 'Ready'
  }
  // Older snapshots have no outcome contract, so retain their artifact-based
  // readiness behavior. Once a contract exists, partial artifacts stay Draft.
  if (
    !workspace?.outcome &&
    (state.analysis.slices.length > 0 || (workspace?.prototypePages.length ?? 0) > 0)
  ) {
    return 'Ready'
  }
  if (
    state.brief.trim() ||
    state.source.bitmap ||
    state.mockup ||
    state.designMarkdown ||
    !isWorkspaceSnapshotEmpty(workspace)
  ) {
    return 'Draft'
  }
  return 'Empty'
}

function workspaceThumbnail(workspace: WorkspaceSnapshot | null): Blob | undefined {
  const artifact = workspace?.prototypePages[0] ?? workspace?.prototypeDesignSystem
  return artifact ? bytesToBlob(artifact.bytes, artifact.mediaType) : undefined
}

function projectNameFromSources(...sources: Array<string | null | undefined>): string {
  for (const source of sources) {
    const firstLine = source?.trim().split(/\n+/)[0]?.trim()
    if (firstLine) return firstLine.length > 42 ? `${firstLine.slice(0, 42)}...` : firstLine
  }
  return 'Untitled project'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

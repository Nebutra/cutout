import type { Box } from '@/algorithm/types'
import type {
  DesignMarkdownAsset,
  Params,
  ProjectRestoreInput,
  Store,
} from '@/store/types'
import {
  isWorkspaceSnapshotEmpty,
  type WorkspaceSnapshot,
} from '@/workspace/workspace-snapshot'
import { DEFAULT_PARAMS } from '@/store/slices/params'
import { bitmapToBytes, bytesToBlob, decodeImage } from '@/lib/image'
import { err, ok, type Result } from '@/services/types'
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
}

export interface LocalProjectRecord extends LocalProjectSummary {
  readonly params: Params
  readonly sourceImageId?: string
  readonly source?: StoredImage
  readonly mockup?: StoredImage
  readonly designMarkdown: DesignMarkdownAsset | null
  readonly workspace: WorkspaceSnapshot | null
  readonly slices: readonly StoredSlice[]
}

export interface LocalProjectRepository {
  list(): Promise<Result<LocalProjectSummary[]>>
  load(id: string): Promise<Result<LocalProjectRecord>>
  save(record: LocalProjectRecord): Promise<Result<void>>
  archive(id: string, archivedAt: number | null): Promise<Result<LocalProjectRecord>>
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
        return ok(record)
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
      const db = await openProjectsDb(idb)
      try {
        const tx = db.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).put(record)
        await txDone(tx)
      } finally {
        db.close()
      }
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
          updatedAt: Date.now(),
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

  return { list, load, save, archive, remove }
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
      : {
          name: state.source.name || 'source',
          blob: bytesToBlob(await bitmapToBytes(state.source.bitmap)),
          width: state.source.width,
          height: state.source.height,
        }
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
  }))
  const brief = state.brief.trim()
  const thumbnail =
    slices[0]?.blob ??
    mockup?.blob ??
    source?.blob ??
    workspaceThumbnail(workspace)

  return {
    id: input.id,
    name: projectNameFromSources(
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
    thumbnail,
    params: state.params,
    sourceImageId: state.source.imageId || undefined,
    source,
    mockup,
    designMarkdown: state.designMarkdown,
    workspace,
    slices,
  }
}

export async function createRestoreInputFromProject(
  record: LocalProjectRecord,
): Promise<ProjectRestoreInput> {
  const source = record.source
    ? {
        name: record.source.name,
        bitmap: await decodeImage(record.source.blob),
      }
    : undefined
  const mockup = record.mockup
    ? {
        blob: record.mockup.blob,
        bitmap: await decodeImage(record.mockup.blob),
        width: record.mockup.width,
        height: record.mockup.height,
      }
    : null

  return {
    brief: record.brief,
    params: record.params,
    source,
    mockup,
    designMarkdown: record.designMarkdown,
    workspace: record.workspace ?? null,
    slices: record.slices,
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
  if (state.analysis.slices.length > 0 || (workspace?.prototypePages.length ?? 0) > 0) {
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

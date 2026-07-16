import type { LocalProjectRecord, LocalProjectRepository } from '@/services/local/project-repository.local'
import type { RecoveryBackend, RecoverySnapshot } from './contracts'
import { createRecoverySnapshot, LocalRecoveryService, verifyRecoverySnapshot } from './service'

const BLOB_MARKER = '__cutoutRecoveryBlob'
const BYTES_MARKER = '__cutoutRecoveryBytes'

async function encodeValue(value: unknown): Promise<unknown> {
  if (value instanceof Uint8Array) {
    return { [BYTES_MARKER]: true, bytes: Array.from(value) }
  }
  if (value instanceof Blob) {
    return {
      [BLOB_MARKER]: true,
      type: value.type,
      bytes: Array.from(new Uint8Array(await value.arrayBuffer())),
    }
  }
  if (Array.isArray(value)) return Promise.all(value.map(encodeValue))
  if (value && typeof value === 'object') {
    const entries = await Promise.all(Object.entries(value as Record<string, unknown>).map(async ([key, item]) => [key, await encodeValue(item)] as const))
    return Object.fromEntries(entries)
  }
  return value
}

function decodeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decodeValue)
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (record[BYTES_MARKER] === true && Array.isArray(record.bytes)) {
      return Uint8Array.from(record.bytes as number[])
    }
    if (record[BLOB_MARKER] === true && Array.isArray(record.bytes)) {
      return new Blob([Uint8Array.from(record.bytes as number[])], { type: typeof record.type === 'string' ? record.type : '' })
    }
    return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, decodeValue(item)]))
  }
  return value
}

export async function createProjectRecoverySnapshot(record: LocalProjectRecord, createdAt = new Date().toISOString()) {
  return createRecoverySnapshot({
    projectId: record.id,
    revision: record.updatedAt,
    value: await encodeValue(record),
    createdAt,
  })
}

export async function checkpointProjectForRecovery(input: {
  readonly record: LocalProjectRecord
  readonly service: LocalRecoveryService
  readonly backend: RecoveryBackend
  readonly createdAt?: string
}): Promise<RecoverySnapshot> {
  const snapshot = await createProjectRecoverySnapshot(input.record, input.createdAt)
  await input.service.checkpoint(snapshot)
  const persisted = (await input.backend.listSnapshots(input.record.id)).find((item) => item.id === snapshot.id)
  if (!persisted || !await verifyRecoverySnapshot(persisted)) throw new Error('Recovery snapshot read-back verification failed.')
  return persisted
}

export function createProjectProjectionAdapter(repository: LocalProjectRepository) {
  return {
    async exists(projectId: string) {
      return (await repository.load(projectId)).ok
    },
    async rebuild(_projectId: string, bytes: Uint8Array) {
      const decoded = decodeValue(JSON.parse(new TextDecoder().decode(bytes))) as LocalProjectRecord
      const saved = await repository.save(decoded)
      if (!saved.ok) throw new Error(saved.error)
    },
  }
}

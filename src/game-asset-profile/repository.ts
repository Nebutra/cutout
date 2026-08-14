import { z } from 'zod'
import { openDb, promisify, txDone } from '@/services/local/idb'
import {
  gameAssetProductionRehearsalBundleSchema,
  verifyGameAssetProductionRehearsalBundle,
  type GameAssetProductionRehearsalBundle,
  type VerifiedGameAssetProductionRehearsal,
} from './rehearsal'

const DB_NAME = 'cutout-game-assets'
const DB_VERSION = 1
const STORE = 'rehearsals'

const storedGameAssetRehearsalSchema = z.object({
  id: z.string().min(1).max(240),
  name: z.string().min(1).max(120),
  updatedAt: z.number().int().nonnegative(),
  status: z.enum(['deterministic-evidence-verified', 'semantic-evidence-verified']),
  bundle: gameAssetProductionRehearsalBundleSchema,
}).strict()
type StoredGameAssetRehearsal = z.infer<typeof storedGameAssetRehearsalSchema>

export interface GameAssetRehearsalSummary {
  readonly id: string
  readonly name: string
  readonly updatedAt: number
  readonly status: StoredGameAssetRehearsal['status']
  readonly runId: string
  readonly roleCount: number
  readonly evaluationStatus: VerifiedGameAssetProductionRehearsal['evaluation']['status']
}

export interface LoadedGameAssetRehearsal {
  readonly name: string
  readonly bundle: GameAssetProductionRehearsalBundle
  readonly verified: VerifiedGameAssetProductionRehearsal
}

export interface GameAssetRehearsalRepository {
  save(name: string, bundle: GameAssetProductionRehearsalBundle): Promise<GameAssetRehearsalSummary>
  list(): Promise<readonly GameAssetRehearsalSummary[]>
  load(id: string): Promise<LoadedGameAssetRehearsal>
  remove(id: string): Promise<void>
}

function openGameAssetDb(factory: IDBFactory): Promise<IDBDatabase> {
  return openDb(factory, DB_NAME, DB_VERSION, (database) => {
    if (!database.objectStoreNames.contains(STORE)) {
      const store = database.createObjectStore(STORE, { keyPath: 'id' })
      store.createIndex('updatedAt', 'updatedAt')
    }
  })
}

function summary(
  stored: StoredGameAssetRehearsal,
  verified: VerifiedGameAssetProductionRehearsal,
): GameAssetRehearsalSummary {
  return {
    id: stored.id,
    name: stored.name,
    updatedAt: stored.updatedAt,
    status: stored.status,
    runId: stored.bundle.runId,
    roleCount: stored.bundle.frames.length,
    evaluationStatus: verified.evaluation.status,
  }
}

export function createGameAssetRehearsalRepository(
  factory: IDBFactory | undefined = globalThis.indexedDB,
): GameAssetRehearsalRepository {
  const requireFactory = (): IDBFactory => {
    if (!factory) throw new Error('Game Asset evidence storage is unavailable.')
    return factory
  }
  return {
    async save(nameValue, bundleValue) {
      const name = z.string().trim().min(1).max(120).parse(nameValue)
      const bundle = gameAssetProductionRehearsalBundleSchema.parse(bundleValue)
      const verified = await verifyGameAssetProductionRehearsalBundle(bundle)
      const stored = storedGameAssetRehearsalSchema.parse({
        id: bundle.authorization.receiptId,
        name,
        updatedAt: Date.now(),
        status: verified.semanticAcceptanceClosure.status === 'complete'
          ? 'semantic-evidence-verified'
          : 'deterministic-evidence-verified',
        bundle,
      })
      const database = await openGameAssetDb(requireFactory())
      try {
        const transaction = database.transaction(STORE, 'readwrite')
        transaction.objectStore(STORE).put(stored)
        await txDone(transaction)
      } finally {
        database.close()
      }
      return summary(stored, verified)
    },
    async list() {
      const database = await openGameAssetDb(requireFactory())
      let records: StoredGameAssetRehearsal[]
      try {
        const transaction = database.transaction(STORE, 'readonly')
        records = (await promisify(
          transaction.objectStore(STORE).getAll() as IDBRequest<unknown[]>,
        )).map((record) => storedGameAssetRehearsalSchema.parse(record))
      } finally {
        database.close()
      }
      const summaries = await Promise.all(records.map(async (stored) => {
        const verified = await verifyGameAssetProductionRehearsalBundle(stored.bundle)
        return summary(stored, verified)
      }))
      return summaries.sort((left, right) => right.updatedAt - left.updatedAt)
    },
    async load(idValue) {
      const id = z.string().min(1).max(240).parse(idValue)
      const database = await openGameAssetDb(requireFactory())
      let record: unknown
      try {
        const transaction = database.transaction(STORE, 'readonly')
        record = await promisify(transaction.objectStore(STORE).get(id))
      } finally {
        database.close()
      }
      if (!record) throw new Error(`Game Asset rehearsal was not found: ${id}`)
      const stored = storedGameAssetRehearsalSchema.parse(record)
      return {
        name: stored.name,
        bundle: stored.bundle,
        verified: await verifyGameAssetProductionRehearsalBundle(stored.bundle),
      }
    },
    async remove(idValue) {
      const id = z.string().min(1).max(240).parse(idValue)
      const database = await openGameAssetDb(requireFactory())
      try {
        const transaction = database.transaction(STORE, 'readwrite')
        transaction.objectStore(STORE).delete(id)
        await txDone(transaction)
      } finally {
        database.close()
      }
    },
  }
}

import { z } from 'zod'
import { controlResponseSchema, type ControlLedger, type SourceIngestOperation } from '@/control-protocol'
import type { EverythingInput } from '@/ingestion/everything-inbox'
import type { HeadlessProjectState } from './schema'

export const controlLedgerSchema = z.object({
  revision: z.number().int().nonnegative(),
  completed: z.record(z.string(), controlResponseSchema),
}).strict()

export interface RuntimeStore {
  load(): Promise<HeadlessProjectState>
  save(state: HeadlessProjectState): Promise<void>
}

export interface PreparedSourceIngestion {
  readonly input: EverythingInput
  /** Bytes are host-local and never returned in a control response. */
  readonly artifacts: readonly { readonly bytes: Uint8Array; readonly mediaType: string }[]
}

/** Optional capability: only a controlled Node host resolves scan descriptors. */
export interface SourceIngestionStore extends RuntimeStore {
  prepareSourceIngestion(operation: SourceIngestOperation): Promise<PreparedSourceIngestion>
}

/** Test/dev storage with cloning at every boundary, so previews cannot mutate it. */
export function createInMemoryRuntimeStore(initial: HeadlessProjectState): RuntimeStore {
  let state = clone(initial)
  return {
    async load() {
      return clone(state)
    },
    async save(next) {
      state = clone(next)
    },
  }
}

export function ledgerFromState(state: HeadlessProjectState): ControlLedger {
  return state.ledger ?? { revision: 0, completed: {} }
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

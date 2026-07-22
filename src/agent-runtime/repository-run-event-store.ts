import { z } from 'zod'
import type { NativeBridge, NativeRunEventStoreSnapshot } from '@/platform/native'
import {
  agentRunEventStoreSchema,
  replayRunEvents,
  type AgentRunEvent,
  type AgentRunEventStore,
} from './run-events'

const workspaceHandleSchema = z.string().min(1).max(200)
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const nativeSnapshotSchema = z.object({
  store: z.unknown(),
  sha256: sha256Schema.nullable(),
  exists: z.boolean(),
}).strict()

export interface RepositoryRunEventStoreSnapshot {
  readonly store: AgentRunEventStore
  readonly sha256: string | null
  readonly exists: boolean
}

export interface RepositoryRunEventStoreBridge {
  read(workspaceHandle: string): Promise<RepositoryRunEventStoreSnapshot>
  write(
    workspaceHandle: string,
    expectedSha256: string | null,
    store: AgentRunEventStore,
  ): Promise<RepositoryRunEventStoreSnapshot>
}

export interface RepositoryRunEventStoreLifecycle {
  persist(store: AgentRunEventStore): void
  dispose(): void
}

export interface RepositoryWorkspaceBinding {
  readonly handle: string
}

export interface RepositoryRunEventStoreLifecycleInput {
  readonly bridge: RepositoryRunEventStoreBridge
  readonly getWorkspace: () => RepositoryWorkspaceBinding | undefined
  readonly subscribe: (
    listener: (workspace: RepositoryWorkspaceBinding | undefined) => void,
  ) => () => void
  readonly getLocalStore: () => AgentRunEventStore
  readonly replaceLocalStore: (store: AgentRunEventStore) => void
  readonly onError?: (error: Error) => void
  readonly onSynchronized?: () => void
}

type RunEventStoreTransport = Pick<
  NativeBridge,
  'readRunEventStore' | 'writeRunEventStore'
>

function parseSnapshot(input: NativeRunEventStoreSnapshot): RepositoryRunEventStoreSnapshot {
  const snapshot = nativeSnapshotSchema.parse(input)
  if (snapshot.exists !== (snapshot.sha256 !== null)) {
    throw new Error('Native Agent run-event snapshot has inconsistent existence metadata.')
  }
  return {
    store: agentRunEventStoreSchema.parse(snapshot.store),
    sha256: snapshot.sha256,
    exists: snapshot.exists,
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item ?? null)).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

function sameStore(left: AgentRunEventStore, right: AgentRunEventStore): boolean {
  return canonicalJson(left) === canonicalJson(right)
}

/** Merge two append-only streams while preserving the relative order declared
 * by each source. Identical event IDs must carry identical payloads. */
export function reconcileAgentRunEventStores(
  localInput: AgentRunEventStore,
  repositoryInput: AgentRunEventStore,
): AgentRunEventStore {
  const local = agentRunEventStoreSchema.parse(localInput)
  const repository = agentRunEventStoreSchema.parse(repositoryInput)
  const byId = new Map<string, AgentRunEvent>()
  const localIndex = new Map<string, number>()
  const repositoryIndex = new Map<string, number>()

  const addEvents = (
    events: readonly AgentRunEvent[],
    indices: Map<string, number>,
  ) => {
    events.forEach((event, index) => {
      indices.set(event.eventId, index)
      const existing = byId.get(event.eventId)
      if (existing && canonicalJson(existing) !== canonicalJson(event)) {
        throw new Error(`Agent run-event ${event.eventId} has divergent durable payloads.`)
      }
      if (!existing) byId.set(event.eventId, event)
    })
  }
  addEvents(local.events, localIndex)
  addEvents(repository.events, repositoryIndex)

  const outgoing = new Map<string, Set<string>>()
  const indegree = new Map([...byId.keys()].map((id) => [id, 0]))
  const addOrder = (events: readonly AgentRunEvent[]) => {
    for (let index = 1; index < events.length; index += 1) {
      const before = events[index - 1]!.eventId
      const after = events[index]!.eventId
      if (before === after) continue
      const targets = outgoing.get(before) ?? new Set<string>()
      if (targets.has(after)) continue
      targets.add(after)
      outgoing.set(before, targets)
      indegree.set(after, (indegree.get(after) ?? 0) + 1)
    }
  }
  addOrder(local.events)
  addOrder(repository.events)

  const runStartedAt = new Map<string, number>()
  for (const event of byId.values()) {
    if (event.type === 'run-started') runStartedAt.set(event.runId, event.at)
  }
  const rank = (event: AgentRunEvent) => [
    runStartedAt.get(event.runId) ?? event.at,
    event.at,
    localIndex.get(event.eventId) ?? Number.MAX_SAFE_INTEGER,
    repositoryIndex.get(event.eventId) ?? Number.MAX_SAFE_INTEGER,
  ] as const
  const compare = (leftId: string, rightId: string) => {
    const left = rank(byId.get(leftId)!)
    const right = rank(byId.get(rightId)!)
    return left[0] - right[0]
      || left[1] - right[1]
      || left[2] - right[2]
      || left[3] - right[3]
      || leftId.localeCompare(rightId)
  }
  const ready = [...indegree].filter(([, degree]) => degree === 0).map(([id]) => id).sort(compare)
  const merged: AgentRunEvent[] = []
  while (ready.length > 0) {
    const id = ready.shift()!
    merged.push(byId.get(id)!)
    for (const target of outgoing.get(id) ?? []) {
      const nextDegree = (indegree.get(target) ?? 0) - 1
      indegree.set(target, nextDegree)
      if (nextDegree === 0) {
        ready.push(target)
        ready.sort(compare)
      }
    }
  }
  if (merged.length !== byId.size) {
    throw new Error('Agent run-event order diverged between local and repository history.')
  }
  const replayed = replayRunEvents(merged)
  if (replayed.events.length !== merged.length) {
    throw new Error('Agent run-event histories cannot be reconciled without dropping durable events.')
  }
  return replayed
}

export function createRepositoryRunEventStoreBridge(
  transport: RunEventStoreTransport,
): RepositoryRunEventStoreBridge {
  return {
    async read(workspaceHandle) {
      const handle = workspaceHandleSchema.parse(workspaceHandle)
      if (!transport.readRunEventStore) {
        throw new Error('Repository Agent run-event persistence is unavailable.')
      }
      return parseSnapshot(await transport.readRunEventStore(handle))
    },
    async write(workspaceHandle, expectedSha256, store) {
      const handle = workspaceHandleSchema.parse(workspaceHandle)
      const expected = expectedSha256 === null
        ? null
        : sha256Schema.parse(expectedSha256)
      const validated = agentRunEventStoreSchema.parse(store)
      if (!transport.writeRunEventStore) {
        throw new Error('Repository Agent run-event persistence is unavailable.')
      }
      return parseSnapshot(
        await transport.writeRunEventStore(handle, expected, validated),
      )
    },
  }
}

/** Bind repository history to a live local store. Repository failures block
 * only that binding; the caller-owned local/IndexedDB projection is preserved. */
export function bindRepositoryRunEventStoreLifecycle(
  input: RepositoryRunEventStoreLifecycleInput,
): RepositoryRunEventStoreLifecycle {
  let closed = false
  let generation = 0
  let binding: {
    readonly handle: string
    sha256: string | null
    blocked: boolean
    fingerprint: string
  } | null = null
  let pending: AgentRunEventStore | null = null
  let writing = false

  const report = (error: unknown) => {
    input.onError?.(error instanceof Error ? error : new Error(String(error)))
  }
  const flush = async () => {
    if (writing || closed) return
    writing = true
    try {
      while (pending && binding && !binding.blocked && !closed) {
        const store = pending
        pending = null
        const selected = binding
        try {
          const written = await input.bridge.write(selected.handle, selected.sha256, store)
          if (closed || binding !== selected) continue
          selected.sha256 = written.sha256
          selected.fingerprint = canonicalJson(written.store)
          const reconciled = reconcileAgentRunEventStores(store, written.store)
          if (!sameStore(reconciled, store)) input.replaceLocalStore(reconciled)
          input.onSynchronized?.()
        } catch (error) {
          if (binding === selected) selected.blocked = true
          report(error)
        }
      }
    } finally {
      writing = false
      if (pending && binding && !binding.blocked && !closed) void flush()
    }
  }
  const persist = (store: AgentRunEventStore) => {
    if (!binding || binding.blocked || closed) return
    const validated = agentRunEventStoreSchema.parse(store)
    if (canonicalJson(validated) === binding.fingerprint) return
    pending = validated
    void flush()
  }
  const select = (workspace: RepositoryWorkspaceBinding | undefined) => {
    generation += 1
    const selectedGeneration = generation
    binding = null
    pending = null
    if (!workspace || closed) return
    void input.bridge.read(workspace.handle).then((snapshot) => {
      if (closed || selectedGeneration !== generation) return
      const local = agentRunEventStoreSchema.parse(input.getLocalStore())
      let reconciled: AgentRunEventStore
      try {
        reconciled = reconcileAgentRunEventStores(local, snapshot.store)
      } catch (error) {
        binding = {
          handle: workspace.handle,
          sha256: snapshot.sha256,
          blocked: true,
          fingerprint: canonicalJson(snapshot.store),
        }
        report(error)
        return
      }
      binding = {
        handle: workspace.handle,
        sha256: snapshot.sha256,
        blocked: false,
        fingerprint: canonicalJson(snapshot.store),
      }
      if (!sameStore(reconciled, local)) input.replaceLocalStore(reconciled)
      input.onSynchronized?.()
      if (!sameStore(reconciled, snapshot.store)) persist(reconciled)
    }).catch(report)
  }

  select(input.getWorkspace())
  const unsubscribe = input.subscribe(select)
  return {
    persist,
    dispose() {
      closed = true
      generation += 1
      binding = null
      pending = null
      unsubscribe()
    },
  }
}
